// Pure court-vote tally logic, extracted from the castVote transaction so it
// can be unit-tested. Every juror's vote counts equally — the Chief is a
// status role with no extra voting power. Behavior:
// - A majority of all eligible voters resolves immediately.
// - When every eligible (non-party) member has voted without a majority,
//   the case auto-resolves with ties going to the defendant (innocent).

export type TallyStatus = 'in_court' | 'resolved_innocent' | 'resolved_guilty'

export function tallyVotes(params: {
  votes: Record<string, string>   // all votes cast so far, including the new one
  memberUids: string[]            // eligible voter uids (client view)
  memberCount: number             // server-side member count (for auto-resolve)
  accuserUid: string
  defendantUid: string
}): { status: TallyStatus; resolved: boolean } {
  const { votes, memberUids, memberCount, accuserUid, defendantUid } = params

  const totalVoters = memberUids.length
  const innocent = Object.values(votes).filter((v) => v === 'innocent').length
  const guilty = Object.values(votes).filter((v) => v === 'guilty').length
  const majority = Math.floor(totalVoters / 2) + 1

  if (innocent >= majority) return { status: 'resolved_innocent', resolved: true }
  if (guilty >= majority) return { status: 'resolved_guilty', resolved: true }

  // Auto-resolve when every eligible voter has cast a vote (ties go to
  // defendant / innocent). Uses server-side memberCount so a stale client
  // list can't trigger premature resolution.
  const eligibleCount = Math.max(0, memberCount - 2) // all members minus the two parties
  const nonPartyVotes = Object.keys(votes).filter(
    (uid) => uid !== accuserUid && uid !== defendantUid
  ).length
  if (eligibleCount > 0 && nonPartyVotes >= eligibleCount) {
    return {
      status: innocent >= guilty ? 'resolved_innocent' : 'resolved_guilty',
      resolved: true,
    }
  }

  return { status: 'in_court', resolved: false }
}
