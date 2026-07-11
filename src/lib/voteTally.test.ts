import { describe, it, expect } from 'vitest'
import { effectiveChiefUid, tallyVotes } from './voteTally'

// 5-member group: accuser A, defendant D, jurors J1..J3 (J1 is chief)
const MEMBERS = ['A', 'D', 'J1', 'J2', 'J3']
const BASE = {
  memberUids: MEMBERS,
  memberCount: 5,
  accuserUid: 'A',
  defendantUid: 'D',
}

describe('effectiveChiefUid', () => {
  it('passes through a non-party chief', () => {
    expect(effectiveChiefUid('J1', 'D', 'A')).toBe('J1')
  })
  it('nullifies a chief who is the defendant or accuser', () => {
    expect(effectiveChiefUid('D', 'D', 'A')).toBeNull()
    expect(effectiveChiefUid('A', 'D', 'A')).toBeNull()
  })
  it('handles no chief', () => {
    expect(effectiveChiefUid(undefined, 'D', 'A')).toBeNull()
  })
})

describe('tallyVotes', () => {
  it('stays open before a majority', () => {
    // Total weight = 6 (chief J1 counts double) → majority = 4
    const r = tallyVotes({ ...BASE, effectiveChief: 'J1', votes: { J2: 'guilty' } })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })

  it('resolves guilty on weighted majority', () => {
    // J1 (weight 2) + J2 + J3 guilty = 4 of 6 → majority
    const r = tallyVotes({
      ...BASE,
      effectiveChief: 'J1',
      votes: { J1: 'guilty', J2: 'guilty', J3: 'guilty' },
    })
    expect(r).toEqual({ status: 'resolved_guilty', resolved: true })
  })

  it('weights the chief double', () => {
    // Without chief weighting J1+J2 innocent = 2 of 5... with J1 as chief the
    // pair reaches weight 3; add A's vote (innocent) → 4 of 6 = majority
    const r = tallyVotes({
      ...BASE,
      effectiveChief: 'J1',
      votes: { J1: 'innocent', J2: 'innocent', A: 'innocent' },
    })
    expect(r).toEqual({ status: 'resolved_innocent', resolved: true })
  })

  it('does not weight a party chief', () => {
    // Chief is the accuser → weight 1; same votes stay short of majority (3 of 5)
    const r = tallyVotes({
      ...BASE,
      effectiveChief: null,
      votes: { J1: 'innocent', J2: 'innocent' },
    })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })

  it('auto-resolves once every non-party member voted, ties to innocent', () => {
    // No chief. J1 innocent, J2 guilty, J3 guilty is 2v1 guilty but only
    // 3 of 5 weight — auto-resolve kicks in because all 3 jurors voted.
    const guilty = tallyVotes({
      ...BASE,
      effectiveChief: null,
      votes: { J1: 'innocent', J2: 'guilty', J3: 'guilty' },
    })
    expect(guilty).toEqual({ status: 'resolved_guilty', resolved: true })

    // 4-member group (one juror pair): 1v1 tie → defendant wins
    const tie = tallyVotes({
      votes: { J1: 'innocent', J2: 'guilty' },
      memberUids: ['A', 'D', 'J1', 'J2'],
      memberCount: 4,
      accuserUid: 'A',
      defendantUid: 'D',
      effectiveChief: null,
    })
    expect(tie).toEqual({ status: 'resolved_innocent', resolved: true })
  })

  it('ignores party votes for the all-voted check', () => {
    const r = tallyVotes({
      ...BASE,
      effectiveChief: null,
      votes: { A: 'guilty', D: 'innocent', J1: 'guilty' },
    })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })

  it('never auto-resolves a two-member group (no eligible jurors)', () => {
    const r = tallyVotes({
      votes: { A: 'guilty' },
      memberUids: ['A', 'D'],
      memberCount: 2,
      accuserUid: 'A',
      defendantUid: 'D',
      effectiveChief: null,
    })
    // A's guilty vote alone is 1 of 2 weight — short of majority (2)
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })
})
