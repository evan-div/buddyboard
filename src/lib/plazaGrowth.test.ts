import { describe, it, expect } from 'vitest'
import {
  MAX_STAGE,
  TIME_DAYS,
  stageFromThresholds,
  growthStage,
  isDormant,
  seedsForCheckin,
  SEED_EVERY,
  growthStageFor,
  RARITY_GROWTH_FACTOR,
} from './plazaGrowth'
import { RARITY_ORDER } from './commitments'

const DAY = 86_400_000

describe('stageFromThresholds', () => {
  it('returns the highest stage whose threshold is met', () => {
    expect(stageFromThresholds(0, TIME_DAYS)).toBe(0)
    expect(stageFromThresholds(1, TIME_DAYS)).toBe(1)
    expect(stageFromThresholds(2.9, TIME_DAYS)).toBe(1)
    expect(stageFromThresholds(3, TIME_DAYS)).toBe(2)
    expect(stageFromThresholds(100, TIME_DAYS)).toBe(MAX_STAGE)
  })
})

describe('growthStage', () => {
  const planted = 1_000_000_000_000

  it('is stage 0 the moment it is planted', () => {
    expect(growthStage(planted, 0, planted, 0)).toBe(0)
  })

  it('is capped by nourishment even when plenty of time has passed (care > time)', () => {
    // 30 days elapsed (time alone would allow mature) but the group never gained
    // any vitality → still a seedling.
    const now = planted + 30 * DAY
    expect(growthStage(planted, 0, now, 0)).toBe(0)
  })

  it('is capped by time even when the group is very active', () => {
    // Massive vitality gain but only ~half a day elapsed → still stage 0.
    const now = planted + 0.5 * DAY
    expect(growthStage(planted, 0, now, 100)).toBe(0)
  })

  it('advances when both time and nourishment allow', () => {
    const now = planted + 7 * DAY
    // vitality rose by 4 since planting → nourish allows mature; 7 days → time allows mature
    expect(growthStage(planted, 10, now, 14)).toBe(MAX_STAGE)
  })

  it('takes the minimum of the time and nourishment stages', () => {
    const now = planted + 7 * DAY          // time allows stage 3
    // vitality rose by 1 → nourish allows stage 1
    expect(growthStage(planted, 5, now, 6)).toBe(1)
  })

  it('never returns a negative stage for clock skew or vitality regressions', () => {
    expect(growthStage(planted, 10, planted - DAY, 3)).toBe(0)
    expect(growthStage(planted, 10, planted + 10 * DAY, 2)).toBe(0)
  })

  it('growth is monotonic in both time and vitality (never shrinks as inputs grow)', () => {
    let prev = 0
    for (let d = 0; d <= 10; d++) {
      const s = growthStage(planted, 0, planted + d * DAY, d) // both climb together
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
})

describe('isDormant', () => {
  it('is dormant with no recorded activity', () => {
    expect(isDormant(undefined, ['2026-07-24', '2026-07-23'])).toBe(true)
  })

  it('is awake when the last active day is recent', () => {
    expect(isDormant('2026-07-23', ['2026-07-24', '2026-07-23'])).toBe(false)
  })

  it('is dormant when the last active day is not recent', () => {
    expect(isDormant('2026-07-01', ['2026-07-24', '2026-07-23'])).toBe(true)
  })
})

describe('seedsForCheckin', () => {
  it('grants a starter seed on the first check-in', () => {
    expect(seedsForCheckin(1)).toBe(1)
  })

  it('grants nothing for streaks that are not a starter or a multiple of SEED_EVERY', () => {
    expect(seedsForCheckin(2)).toBe(0)
    expect(seedsForCheckin(4)).toBe(0)
    expect(seedsForCheckin(5)).toBe(0)
  })

  it(`grants a seed every ${SEED_EVERY} days`, () => {
    expect(seedsForCheckin(3)).toBe(1)
    expect(seedsForCheckin(6)).toBe(1)
    expect(seedsForCheckin(9)).toBe(1)
  })

  it('grants nothing for a zero or negative streak', () => {
    expect(seedsForCheckin(0)).toBe(0)
    expect(seedsForCheckin(-1)).toBe(0)
  })
})

describe('growthStageFor', () => {
  const planted = 1_000_000_000_000
  // Enough vitality that nourishment never becomes the binding constraint.
  const plenty = 100

  it('is identical to growthStage for commons and for absent rarity', () => {
    for (const days of [0, 0.5, 1, 2, 3, 6, 7, 30]) {
      const now = planted + days * DAY
      const base = growthStage(planted, 0, now, plenty)
      expect(growthStageFor('common', planted, 0, now, plenty)).toBe(base)
      expect(growthStageFor(undefined, planted, 0, now, plenty)).toBe(base)
    }
  })

  it('lets a legendary reach maturity sooner than a common', () => {
    // A common needs 7 days to mature; a legendary needs 7 * 0.6 = 4.2.
    const atFiveDays = planted + 5 * DAY
    expect(growthStage(planted, 0, atFiveDays, plenty)).toBe(2)
    expect(growthStageFor('legendary', planted, 0, atFiveDays, plenty)).toBe(MAX_STAGE)
  })

  it('still caps rare growth by nourishment — care outranks rarity', () => {
    // Plenty of time, but the group gained no vitality at all.
    const later = planted + 30 * DAY
    expect(growthStageFor('legendary', planted, 0, later, 0)).toBe(0)
  })

  it('never starts above stage 0, however rare the seed', () => {
    expect(growthStageFor('legendary', planted, 0, planted, plenty)).toBe(0)
  })

  it('orders the tiers monotonically at a fixed moment', () => {
    const now = planted + 3 * DAY
    const stages = RARITY_ORDER.map((r) => growthStageFor(r, planted, 0, now, plenty))
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1])
    }
  })

  it('has a growth factor for every rarity, none of them faster than instant', () => {
    for (const r of RARITY_ORDER) {
      expect(RARITY_GROWTH_FACTOR[r]).toBeGreaterThan(0)
      expect(RARITY_GROWTH_FACTOR[r]).toBeLessThanOrEqual(1)
    }
  })
})
