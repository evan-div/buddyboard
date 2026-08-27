import { describe, it, expect } from 'vitest'
import {
  COMMITMENT_TIERS,
  DISPUTE_WINDOW_MS,
  MIN_THRESHOLD_PCT,
  RARITY_ORDER,
  activeRarities,
  canJoinRarity,
  commitmentProgress,
  deadlineFrom,
  describeRules,
  disputeWindowOpen,
  hasSeed,
  isDue,
  isValidDuration,
  isoWeekKey,
  marksInWindow,
  maxTargetPerPeriod,
  metThreshold,
  periodKeyFor,
  periodsInWindow,
  qualifyingPeriods,
  rarityForDuration,
  rarityRank,
  seedInventory,
  seedSpendField,
  totalSeeds,
  validateDraft,
  type CommitmentDraft,
  type CommitmentRules,
} from './commitments'
import type { SeedRarity } from './types'

const DAY = 86_400_000

describe('rarityForDuration', () => {
  it('pays the tier the duration actually reached, at every boundary', () => {
    expect(rarityForDuration(6)).toBe('common')
    expect(rarityForDuration(7)).toBe('common')
    expect(rarityForDuration(13)).toBe('common')
    expect(rarityForDuration(14)).toBe('uncommon')
    expect(rarityForDuration(29)).toBe('uncommon')
    expect(rarityForDuration(30)).toBe('rare')
    expect(rarityForDuration(89)).toBe('rare')
    expect(rarityForDuration(90)).toBe('legendary')
  })

  it('never returns nothing for a short or nonsensical duration', () => {
    expect(rarityForDuration(0)).toBe('common')
    expect(rarityForDuration(-5)).toBe('common')
  })

  it('caps at legendary however long the commitment runs', () => {
    expect(rarityForDuration(365)).toBe('legendary')
  })

  it('agrees with the tier table it is derived from', () => {
    for (const tier of COMMITMENT_TIERS) {
      expect(rarityForDuration(tier.days)).toBe(tier.rarity)
    }
  })
})

describe('isValidDuration', () => {
  it('accepts only the exact offered tiers', () => {
    expect(isValidDuration(7)).toBe(true)
    expect(isValidDuration(90)).toBe(true)
    expect(isValidDuration(45)).toBe(false)
    expect(isValidDuration(0)).toBe(false)
  })
})

describe('rarityRank', () => {
  it('orders rarities weakest to strongest', () => {
    expect(rarityRank('common')).toBeLessThan(rarityRank('uncommon'))
    expect(rarityRank('uncommon')).toBeLessThan(rarityRank('rare'))
    expect(rarityRank('rare')).toBeLessThan(rarityRank('legendary'))
    expect(RARITY_ORDER).toHaveLength(4)
  })
})

describe('isoWeekKey', () => {
  // ISO weeks are Thursday-anchored, so a week belongs to whichever year its
  // Thursday falls in. These cases are the ones that break naive week math.
  it('puts a straddling new-year week in the year of its Thursday', () => {
    // 2026-01-01 is a Thursday, so its whole week (starting Mon 2025-12-29) is 2026-W01.
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-01-04')).toBe('2026-W01')
  })

  it('keeps the preceding week in the old year', () => {
    expect(isoWeekKey('2025-12-28')).toBe('2025-W52')
  })

  it('advances on the following Monday', () => {
    expect(isoWeekKey('2026-01-05')).toBe('2026-W02')
  })

  it('zero-pads single-digit weeks so keys sort lexicographically', () => {
    expect(isoWeekKey('2026-01-05')).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('groups a Monday and the Sunday that ends its week together', () => {
    expect(isoWeekKey('2026-03-02')).toBe(isoWeekKey('2026-03-08'))
    expect(isoWeekKey('2026-03-02')).not.toBe(isoWeekKey('2026-03-09'))
  })
})

describe('periodKeyFor', () => {
  it('buckets daily commitments by the day itself', () => {
    expect(periodKeyFor('daily', '2026-05-04')).toBe('2026-05-04')
  })

  it('buckets weekly commitments by ISO week', () => {
    expect(periodKeyFor('weekly', '2026-05-04')).toBe(isoWeekKey('2026-05-04'))
  })
})

describe('periodsInWindow', () => {
  it('counts one period per day for daily commitments', () => {
    expect(periodsInWindow('daily', 7)).toBe(7)
    expect(periodsInWindow('daily', 90)).toBe(90)
  })

  it('rounds partial weeks up so the last stub week is still winnable', () => {
    expect(periodsInWindow('weekly', 7)).toBe(1)
    expect(periodsInWindow('weekly', 14)).toBe(2)
    expect(periodsInWindow('weekly', 30)).toBe(5)
    expect(periodsInWindow('weekly', 90)).toBe(13)
  })

  it('is zero for an empty window', () => {
    expect(periodsInWindow('daily', 0)).toBe(0)
    expect(periodsInWindow('weekly', -1)).toBe(0)
  })
})

describe('marksInWindow', () => {
  const marks = ['2026-01-01', '2026-01-05', '2026-01-10', '2026-02-01']

  it('drops marks outside the window at both ends, inclusive of the bounds', () => {
    expect(marksInWindow(marks, '2026-01-05', '2026-01-10')).toEqual([
      '2026-01-05',
      '2026-01-10',
    ])
  })

  it('keeps everything when the window spans them all', () => {
    expect(marksInWindow(marks, '2025-01-01', '2027-01-01')).toHaveLength(4)
  })

  it('returns nothing when the window misses entirely', () => {
    expect(marksInWindow(marks, '2026-03-01', '2026-03-31')).toEqual([])
  })
})

describe('qualifyingPeriods', () => {
  it('counts each marked day once for a daily commitment', () => {
    expect(qualifyingPeriods(['2026-01-01', '2026-01-02'], 'daily', 1)).toBe(2)
  })

  it('never lets a duplicate day satisfy a period twice', () => {
    expect(qualifyingPeriods(['2026-01-01', '2026-01-01'], 'daily', 1)).toBe(1)
    // Three marks but only two distinct days in one week, against a 3x target.
    expect(
      qualifyingPeriods(['2026-01-05', '2026-01-05', '2026-01-06'], 'weekly', 3),
    ).toBe(0)
  })

  it('only counts weeks that reach the target', () => {
    // Week of 2026-01-05: three marks → qualifies. Week of 2026-01-12: two → does not.
    const marks = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-12',
      '2026-01-13',
    ]
    expect(qualifyingPeriods(marks, 'weekly', 3)).toBe(1)
    expect(qualifyingPeriods(marks, 'weekly', 2)).toBe(2)
  })

  it('treats a target below 1 as 1 rather than qualifying empty periods', () => {
    expect(qualifyingPeriods(['2026-01-01'], 'daily', 0)).toBe(1)
    expect(qualifyingPeriods([], 'daily', 0)).toBe(0)
  })
})

describe('commitmentProgress', () => {
  const daily7: CommitmentRules = {
    cadence: 'daily',
    targetPerPeriod: 1,
    thresholdPct: 80,
    durationDays: 7,
  }

  it('reports cleared periods against the window', () => {
    const marks = ['2026-01-01', '2026-01-02', '2026-01-03']
    expect(commitmentProgress(daily7, marks)).toEqual({ done: 3, total: 7, pct: 42 })
  })

  it('floors the percentage so a bar never reads full before it is', () => {
    // 6/7 is 85.7% — must not round up to 86 and must not read 100.
    const marks = Array.from({ length: 6 }, (_, i) => `2026-01-0${i + 1}`)
    expect(commitmentProgress(daily7, marks).pct).toBe(85)
  })

  it('clamps done to the window so stray marks cannot exceed 100%', () => {
    const marks = Array.from({ length: 12 }, (_, i) =>
      `2026-01-${String(i + 1).padStart(2, '0')}`,
    )
    const p = commitmentProgress(daily7, marks)
    expect(p.done).toBe(7)
    expect(p.pct).toBe(100)
  })

  it('is zero-safe for an empty window', () => {
    expect(commitmentProgress({ ...daily7, durationDays: 0 }, [])).toEqual({
      done: 0,
      total: 0,
      pct: 0,
    })
  })
})

describe('metThreshold', () => {
  const daily7: CommitmentRules = {
    cadence: 'daily',
    targetPerPeriod: 1,
    thresholdPct: 80,
    durationDays: 7,
  }

  it('clears exactly at the bar without floating-point near misses', () => {
    // 4 of 5 weeks is exactly 80%.
    const weekly: CommitmentRules = {
      cadence: 'weekly',
      targetPerPeriod: 1,
      thresholdPct: 80,
      durationDays: 30,
    }
    const fourWeeks = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']
    expect(metThreshold(weekly, fourWeeks)).toBe(true)
    expect(metThreshold(weekly, fourWeeks.slice(0, 3))).toBe(false)
  })

  it('fails below the bar and passes above it', () => {
    const five = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']
    expect(metThreshold(daily7, five)).toBe(false) // 5/7 = 71%
    expect(metThreshold(daily7, [...five, '2026-01-06'])).toBe(true) // 6/7 = 85%
  })

  it('is false for an empty window rather than vacuously true', () => {
    expect(metThreshold({ ...daily7, durationDays: 0 }, [])).toBe(false)
  })

  it('is false with no marks at all', () => {
    expect(metThreshold(daily7, [])).toBe(false)
  })
})

describe('seedInventory', () => {
  it('reads a legacy member with only the old scalar as commons', () => {
    expect(seedInventory({ seeds: 3 })).toEqual({
      common: 3,
      uncommon: 0,
      rare: 0,
      legendary: 0,
    })
  })

  it('adds legacy seeds to new commons rather than shadowing either', () => {
    expect(seedInventory({ seeds: 2, seedsByRarity: { common: 1, rare: 4 } })).toEqual({
      common: 3,
      uncommon: 0,
      rare: 4,
      legendary: 0,
    })
  })

  it('handles a member with no seed fields at all', () => {
    expect(seedInventory({})).toEqual({ common: 0, uncommon: 0, rare: 0, legendary: 0 })
    expect(seedInventory(undefined)).toEqual({
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
    })
  })

  it('totals across every rarity', () => {
    expect(totalSeeds({ seeds: 1, seedsByRarity: { uncommon: 2, legendary: 1 } })).toBe(4)
    expect(totalSeeds(null)).toBe(0)
  })

  it('reports which rarities are actually holdable', () => {
    const m = { seeds: 1, seedsByRarity: { rare: 1 } }
    expect(hasSeed(m, 'common')).toBe(true)
    expect(hasSeed(m, 'rare')).toBe(true)
    expect(hasSeed(m, 'uncommon')).toBe(false)
  })
})

describe('seedSpendField', () => {
  it('drains the legacy counter before new commons', () => {
    expect(seedSpendField({ seeds: 1, seedsByRarity: { common: 5 } }, 'common')).toBe('seeds')
  })

  it('falls through to new commons once the legacy counter is empty', () => {
    expect(seedSpendField({ seeds: 0, seedsByRarity: { common: 5 } }, 'common')).toBe(
      'seedsByRarity.common',
    )
    expect(seedSpendField({ seedsByRarity: { common: 5 } }, 'common')).toBe(
      'seedsByRarity.common',
    )
  })

  it('targets the rarity bucket for everything above common', () => {
    expect(seedSpendField({ seedsByRarity: { legendary: 1 } }, 'legendary')).toBe(
      'seedsByRarity.legendary',
    )
  })

  it('returns null when the member cannot afford that rarity', () => {
    expect(seedSpendField({ seeds: 0 }, 'common')).toBeNull()
    expect(seedSpendField({ seeds: 10 }, 'rare')).toBeNull()
    expect(seedSpendField({ seedsByRarity: { rare: 0 } }, 'rare')).toBeNull()
  })
})

describe('concurrency guard', () => {
  const make = (status: string, rarity: SeedRarity, uids: string[]) => ({
    status: status as 'forming' | 'active' | 'resolved' | 'cancelled',
    rarity,
    participants: Object.fromEntries(
      uids.map((u) => [
        u,
        { uid: u, displayName: u, joinedAt: new Date(), markedDays: [] },
      ]),
    ),
  })

  it('counts both forming and active commitments as live', () => {
    const cs = [make('forming', 'common', ['a']), make('active', 'rare', ['a'])]
    expect(activeRarities(cs, 'a')).toEqual(new Set(['common', 'rare']))
  })

  it('ignores resolved and cancelled commitments', () => {
    const cs = [make('resolved', 'legendary', ['a']), make('cancelled', 'rare', ['a'])]
    expect(activeRarities(cs, 'a')).toEqual(new Set())
    expect(canJoinRarity(cs, 'a', 'legendary')).toBe(true)
  })

  it('only counts commitments the member is actually in', () => {
    const cs = [make('active', 'legendary', ['b'])]
    expect(activeRarities(cs, 'a')).toEqual(new Set())
    expect(canJoinRarity(cs, 'a', 'legendary')).toBe(true)
  })

  it('blocks a second commitment of the same tier but allows other tiers', () => {
    const cs = [make('active', 'legendary', ['a'])]
    expect(canJoinRarity(cs, 'a', 'legendary')).toBe(false)
    expect(canJoinRarity(cs, 'a', 'rare')).toBe(true)
    expect(canJoinRarity(cs, 'a', 'common')).toBe(true)
  })

  it('permits all four tiers running side by side', () => {
    const cs = RARITY_ORDER.map((r) => make('active', r, ['a']))
    expect(activeRarities(cs, 'a').size).toBe(4)
    for (const r of RARITY_ORDER) expect(canJoinRarity(cs, 'a', r)).toBe(false)
  })
})

describe('window helpers', () => {
  const start = 1_800_000_000_000

  it('sets the deadline a whole number of days out', () => {
    expect(deadlineFrom(start, 7).getTime()).toBe(start + 7 * DAY)
  })

  it('is due only once an active commitment is past its deadline', () => {
    const deadline = new Date(start + 7 * DAY)
    expect(isDue({ status: 'active', deadline }, start)).toBe(false)
    expect(isDue({ status: 'active', deadline }, deadline.getTime())).toBe(true)
    expect(isDue({ status: 'forming', deadline }, start + 99 * DAY)).toBe(false)
    expect(isDue({ status: 'resolved', deadline }, start + 99 * DAY)).toBe(false)
    expect(isDue({ status: 'active' }, start + 99 * DAY)).toBe(false)
  })

  it('opens the dispute window for 48h after resolution only', () => {
    const resolvedAt = new Date(start)
    expect(disputeWindowOpen({ status: 'resolved', resolvedAt }, start + DAY)).toBe(true)
    expect(
      disputeWindowOpen({ status: 'resolved', resolvedAt }, start + DISPUTE_WINDOW_MS),
    ).toBe(true)
    expect(
      disputeWindowOpen({ status: 'resolved', resolvedAt }, start + DISPUTE_WINDOW_MS + 1),
    ).toBe(false)
    expect(disputeWindowOpen({ status: 'active', resolvedAt }, start + DAY)).toBe(false)
    expect(disputeWindowOpen({ status: 'resolved' }, start + DAY)).toBe(false)
  })
})

describe('validateDraft', () => {
  const ok: CommitmentDraft = {
    title: 'Run three times a week',
    durationDays: 30,
    cadence: 'weekly',
    targetPerPeriod: 3,
    thresholdPct: 80,
  }

  it('accepts a well-formed draft', () => {
    expect(validateDraft(ok)).toBeNull()
  })

  it('requires a goal', () => {
    expect(validateDraft({ ...ok, title: '   ' })).toBe('Give the commitment a goal')
  })

  it('rejects durations that are not an offered tier', () => {
    expect(validateDraft({ ...ok, durationDays: 45 })).toBe(
      'Pick one of the offered durations',
    )
  })

  it('enforces the threshold floor that stops trivially easy legendaries', () => {
    expect(validateDraft({ ...ok, thresholdPct: MIN_THRESHOLD_PCT - 1 })).toMatch(
      /at least 50%/,
    )
    expect(validateDraft({ ...ok, thresholdPct: MIN_THRESHOLD_PCT })).toBeNull()
    expect(validateDraft({ ...ok, thresholdPct: 101 })).toBe('Threshold cannot exceed 100%')
  })

  it('rejects a daily target above 1, which could never be reached', () => {
    expect(validateDraft({ ...ok, cadence: 'daily', targetPerPeriod: 2 })).toBe(
      'A daily commitment is marked once a day',
    )
    expect(validateDraft({ ...ok, cadence: 'daily', targetPerPeriod: 1 })).toBeNull()
  })

  it('caps a weekly target at seven', () => {
    expect(validateDraft({ ...ok, targetPerPeriod: 8 })).toBe(
      'A weekly target cannot exceed 7',
    )
    expect(validateDraft({ ...ok, targetPerPeriod: 0 })).toBe('Target must be at least 1')
  })

  it('rejects fractional targets and thresholds', () => {
    expect(validateDraft({ ...ok, targetPerPeriod: 2.5 })).toBe(
      'Target must be a whole number',
    )
    expect(validateDraft({ ...ok, thresholdPct: 80.5 })).toBe(
      'Threshold must be a whole number',
    )
  })

  it('knows what a period can be worth', () => {
    expect(maxTargetPerPeriod('daily')).toBe(1)
    expect(maxTargetPerPeriod('weekly')).toBe(7)
  })
})

describe('describeRules', () => {
  it('states a daily bar in days', () => {
    expect(
      describeRules({
        cadence: 'daily',
        targetPerPeriod: 1,
        thresholdPct: 80,
        durationDays: 30,
      }),
    ).toBe('Check in on 24 of 30 days')
  })

  it('states a weekly bar in weeks, rounding the requirement up', () => {
    expect(
      describeRules({
        cadence: 'weekly',
        targetPerPeriod: 3,
        thresholdPct: 80,
        durationDays: 30,
      }),
    ).toBe('3× a week, in 4 of 5 weeks')
  })

  it('agrees with metThreshold about how many periods are needed', () => {
    const rules: CommitmentRules = {
      cadence: 'weekly',
      targetPerPeriod: 1,
      thresholdPct: 80,
      durationDays: 30,
    }
    // describeRules promises 4 of 5 weeks; metThreshold must accept exactly that.
    expect(describeRules(rules)).toContain('4 of 5')
    const fourWeeks = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']
    expect(metThreshold(rules, fourWeeks)).toBe(true)
  })
})
