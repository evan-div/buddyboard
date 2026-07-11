// Pure court-vote tally logic, extracted from the castVote transaction so it
// can be unit-tested. Behavior notes:
// - The chief gets 2 votes, unless they're a party (accuser/defendant).
// - A weighted majority of ALL eligible weight resolves immediately.
// - When every eligible (non-party) member has voted without a majority,
//   the case auto-resolves with ties going to the defendant (innocent).

export type TallyStatus = 'in_court' | 'resolved_innocent' | 'resolved_guilty'

export function effectiveChiefUid(
  chiefUid: string | undefined,
  defendantUid: string,
  accuserUid: string
): string | null {
  return chiefUid && chiefUid !== defendantUid && chiefUid !== accuserUid ? chiefUid : null
}

export function tallyVotes(params: {
  votes: Record<string, string>   // all votes cast so far, including the new one
  memberUids: string[]            // eligible voter uids (client view, for weights)
  memberCount: number             // server-side member count (for auto-resolve)
  accuserUid: string
  defendantUid: string
  effectiveChief: string | null
}): { status: TallyStatus; resolved: boolean } {
  const { votes, memberUids, memberCount, accuserUid, defendantUid, effectiveChief } = params

  const voterWeight = (uid: string) => (uid === effectiveChief ? 2 : 1)
  const totalWeight = memberUids.reduce((s, uid) => s + voterWeight(uid), 0)

  const innocentWeight = Object.entries(votes)
    .filter(([, v]) => v === 'innocent')
    .reduce((s, [uid]) => s + voterWeight(uid), 0)
  const guiltyWeight = Object.entries(votes)
    .filter(([, v]) => v === 'guilty')
    .reduce((s, [uid]) => s + voterWeight(uid), 0)
  const majority = Math.floor(totalWeight / 2) + 1

  if (innocentWeight >= majority) return { status: 'resolved_innocent', resolved: true }
  if (guiltyWeight >= majority) return { status: 'resolved_guilty', resolved: true }

  // Auto-resolve when every eligible voter has cast a vote (ties go to
  // defendant / innocent). Uses server-side memberCount so a stale client
  // list can't trigger premature resolution.
  const eligibleCount = Math.max(0, memberCount - 2) // all members minus the two parties
  const nonPartyVotes = Object.keys(votes).filter(
    (uid) => uid !== accuserUid && uid !== defendantUid
  ).length
  if (eligibleCount > 0 && nonPartyVotes >= eligibleCount) {
    return {
      status: innocentWeight >= guiltyWeight ? 'resolved_innocent' : 'resolved_guilty',
      resolved: true,
    }
  }

  return { status: 'in_court', resolved: false }
}
