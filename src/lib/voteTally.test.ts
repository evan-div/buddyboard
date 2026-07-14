import { describe, it, expect } from 'vitest'
import { tallyVotes } from './voteTally'

// 5-member group: accuser A, defendant D, jurors J1..J3. Majority = 3.
const MEMBERS = ['A', 'D', 'J1', 'J2', 'J3']
const BASE = {
  memberUids: MEMBERS,
  memberCount: 5,
  accuserUid: 'A',
  defendantUid: 'D',
}

describe('tallyVotes', () => {
  it('stays open before a majority', () => {
    const r = tallyVotes({ ...BASE, votes: { J1: 'guilty', J2: 'guilty' } })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })

  it('resolves guilty on a plain majority', () => {
    const r = tallyVotes({ ...BASE, votes: { J1: 'guilty', J2: 'guilty', J3: 'guilty' } })
    expect(r).toEqual({ status: 'resolved_guilty', resolved: true })
  })

  it('resolves innocent on a plain majority', () => {
    const r = tallyVotes({ ...BASE, votes: { J1: 'innocent', J2: 'innocent', A: 'innocent' } })
    expect(r).toEqual({ status: 'resolved_innocent', resolved: true })
  })

  it('counts every vote equally — no chief double-weight', () => {
    // Two jurors innocent is only 2 of a 3-vote majority; stays open even if
    // one of them would formerly have been the double-weighted chief.
    const r = tallyVotes({ ...BASE, votes: { J1: 'innocent', J2: 'innocent' } })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })

  it('auto-resolves once every non-party member voted, ties to innocent', () => {
    // No majority (2 guilty of 3 needed) but all 3 jurors voted → auto-resolve
    const guilty = tallyVotes({
      ...BASE,
      votes: { J1: 'innocent', J2: 'guilty', J3: 'guilty' },
    })
    expect(guilty).toEqual({ status: 'resolved_guilty', resolved: true })

    // 4-member group, 1v1 tie among the two jurors → defendant wins
    const tie = tallyVotes({
      votes: { J1: 'innocent', J2: 'guilty' },
      memberUids: ['A', 'D', 'J1', 'J2'],
      memberCount: 4,
      accuserUid: 'A',
      defendantUid: 'D',
    })
    expect(tie).toEqual({ status: 'resolved_innocent', resolved: true })
  })

  it('ignores party votes for the all-voted check', () => {
    const r = tallyVotes({
      ...BASE,
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
    })
    expect(r).toEqual({ status: 'in_court', resolved: false })
  })
})
