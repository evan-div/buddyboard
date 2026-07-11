import { describe, it, expect } from 'vitest'
import { highestBadge, BADGE_DEFS, BADGE_MAP } from './badges'

describe('highestBadge', () => {
  it('returns null for no badges', () => {
    expect(highestBadge([])).toBeNull()
  })

  it('picks the highest-priority badge the member holds', () => {
    expect(highestBadge(['first_100', 'court_win'])?.id).toBe('court_win')
    expect(highestBadge(['first_100', 'streak_30'])?.id).toBe('streak_30')
    expect(highestBadge(['generous', 'first_1000', 'streak_7'])?.id).toBe('first_1000')
  })

  it('ignores unknown badge ids', () => {
    expect(highestBadge(['not_a_badge'])).toBeNull()
    expect(highestBadge(['not_a_badge', 'first_100'])?.id).toBe('first_100')
  })

  it('covers every defined badge in its priority order', () => {
    // If a new badge is added to BADGE_DEFS but not to the priority list,
    // members holding only that badge would show nothing.
    for (const def of BADGE_DEFS) {
      expect(highestBadge([def.id])?.id).toBe(def.id)
    }
  })

  it('BADGE_MAP indexes every def by id', () => {
    for (const def of BADGE_DEFS) {
      expect(BADGE_MAP[def.id]).toBe(def)
    }
  })
})
