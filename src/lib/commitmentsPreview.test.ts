import { describe, it, expect } from 'vitest'
import {
  COMMITMENT_PREVIEW_OFF,
  durationForRarity,
  previewCommitments,
  recentDayKeys,
} from './commitmentsPreview'
import {
  COMMITMENT_TIERS,
  RARITY_ORDER,
  commitmentProgress,
  disputeWindowOpen,
  isDue,
  metThreshold,
  rarityForDuration,
} from './commitments'
import { dayKey } from './utils'

const NOW = Date.parse('2026-06-15T12:00:00.000Z')
const ME = { uid: 'me-uid', displayName: 'You', nowMs: NOW }

const fixtures = () => previewCommitments(ME)
const byId = (id: string) => {
  const c = fixtures().find((x) => x.id === id)
  if (!c) throw new Error(`fixture ${id} missing`)
  return c
}

describe('readCommitmentPreview', () => {
  it('is off by default outside a browser', () => {
    expect(COMMITMENT_PREVIEW_OFF).toEqual({ on: false, dayOffset: 0 })
  })
})

describe('durationForRarity', () => {
  it('round-trips against the real tier table', () => {
    for (const tier of COMMITMENT_TIERS) {
      expect(durationForRarity(tier.rarity)).toBe(tier.days)
      expect(rarityForDuration(durationForRarity(tier.rarity))).toBe(tier.rarity)
    }
  })
})

describe('recentDayKeys', () => {
  it('returns newest first, starting today', () => {
    expect(recentDayKeys(3)).toEqual([dayKey(undefined, 0), dayKey(undefined, -1), dayKey(undefined, -2)])
  })

  it('can skip today, which is what an unmarked-today fixture needs', () => {
    expect(recentDayKeys(2, undefined, false)).toEqual([dayKey(undefined, -1), dayKey(undefined, -2)])
  })

  it('returns nothing for zero', () => {
    expect(recentDayKeys(0)).toEqual([])
  })

  it('produces no duplicates', () => {
    const keys = recentDayKeys(30)
    expect(new Set(keys).size).toBe(30)
  })
})

describe('previewCommitments', () => {
  it('is deterministic — same inputs, same output', () => {
    expect(previewCommitments(ME)).toEqual(previewCommitments(ME))
  })

  it('produces valid Commitments the real rules can read', () => {
    for (const c of fixtures()) {
      expect(c.id).toBeTruthy()
      expect(c.title).toBeTruthy()
      expect(c.durationDays).toBeGreaterThan(0)
      // The rarity must be the one the duration actually earns, or the preview
      // would advertise a payout the real resolver would not give.
      expect(rarityForDuration(c.durationDays)).toBe(c.rarity)
      expect(Object.keys(c.participants).length).toBeGreaterThan(0)
      expect(c.thresholdPct).toBeGreaterThanOrEqual(50)
    }
  })

  it('covers every status the card can render', () => {
    const statuses = new Set(fixtures().map((c) => c.status))
    expect(statuses).toEqual(new Set(['forming', 'active', 'resolved', 'cancelled']))
  })

  it('covers every rarity, so each tier colour appears', () => {
    const rarities = new Set(fixtures().map((c) => c.rarity))
    for (const r of RARITY_ORDER) expect(rarities).toContain(r)
  })

  it('gives started commitments a start and a deadline, and forming ones neither', () => {
    for (const c of fixtures()) {
      if (c.status === 'active' || c.status === 'resolved') {
        expect(c.startedAt).toBeInstanceOf(Date)
        expect(c.deadline).toBeInstanceOf(Date)
      } else {
        expect(c.startedAt).toBeUndefined()
        expect(c.deadline).toBeUndefined()
      }
    }
  })

  it('includes a forming commitment I created that can actually be started', () => {
    const c = byId('pv-forming-mine')
    expect(c.createdBy).toBe(ME.uid)
    expect(Object.keys(c.participants).length).toBeGreaterThanOrEqual(2)
  })

  it('includes a forming commitment too small to start', () => {
    const c = byId('pv-forming-alone')
    expect(Object.keys(c.participants)).toHaveLength(1)
  })

  it('includes one I have not joined, so the Join button is reachable', () => {
    const c = byId('pv-forming-open')
    expect(c.participants[ME.uid]).toBeUndefined()
    expect(c.createdBy).not.toBe(ME.uid)
  })

  it('marks today on exactly the fixture that is meant to look already marked', () => {
    const today = dayKey()
    expect(byId('pv-active-marked').participants[ME.uid].markedDays).toContain(today)
    expect(byId('pv-active-behind').participants[ME.uid].markedDays).not.toContain(today)
  })

  it('shows visible progress on the on-track fixture', () => {
    const c = byId('pv-active-ontrack')
    const p = commitmentProgress(c, c.participants[ME.uid].markedDays)
    expect(p.done).toBeGreaterThan(0)
    expect(p.pct).toBeGreaterThan(0)
    expect(p.done).toBeLessThanOrEqual(p.total)
  })

  it('shows the behind fixture as genuinely behind its bar', () => {
    const c = byId('pv-active-behind')
    expect(metThreshold(c, c.participants[ME.uid].markedDays)).toBe(false)
  })

  it('has exactly one commitment already past its deadline', () => {
    const due = fixtures().filter((c) => isDue(c, NOW))
    expect(due).toHaveLength(1)
    expect(due[0].id).toBe('pv-active-due')
  })

  it('makes the due fixture actually resolvable as kept — the point of Resolve now', () => {
    const c = byId('pv-active-due')
    // If this failed, tapping Resolve now would silently mark everyone as
    // having missed it, which is the opposite of the demo.
    for (const p of Object.values(c.participants)) {
      expect(metThreshold(c, p.markedDays)).toBe(true)
    }
  })

  it('awards a seed of the commitment rarity to whoever kept it', () => {
    for (const c of fixtures()) {
      for (const p of Object.values(c.participants)) {
        if (p.outcome === 'kept') expect(p.seedAwarded).toBe(c.rarity)
        if (p.outcome === 'missed') expect(p.seedAwarded).toBeUndefined()
      }
    }
  })

  it('puts one resolved fixture inside the dispute window and one outside', () => {
    expect(disputeWindowOpen(byId('pv-resolved-kept'), NOW)).toBe(true)
    expect(disputeWindowOpen(byId('pv-resolved-stale'), NOW)).toBe(false)
  })

  it('includes a co-participant whose outcome is already under dispute', () => {
    const c = byId('pv-resolved-disputed')
    const others = Object.values(c.participants).filter((p) => p.uid !== ME.uid)
    expect(others.some((p) => !!p.caseId)).toBe(true)
  })

  it('offers a disputable co-participant — kept, not me, not already disputed', () => {
    const c = byId('pv-resolved-kept')
    const target = Object.values(c.participants).find(
      (p) => p.uid !== ME.uid && p.outcome === 'kept' && !p.caseId,
    )
    expect(target).toBeDefined()
  })

  it('shifts with nowMs rather than pinning to real time', () => {
    const later = previewCommitments({ ...ME, nowMs: NOW + 5 * 86_400_000 })
    const a = byId('pv-active-ontrack').startedAt as Date
    const b = later.find((c) => c.id === 'pv-active-ontrack')?.startedAt as Date
    expect(b.getTime() - a.getTime()).toBe(5 * 86_400_000)
  })
})
