import {
  doc,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  runTransaction,
  increment,
  DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import { awardCourtWinBadge, sendPushToUser } from './firestore'
import { tallyVotes } from './voteTally'
import type { GroupNotification, CourtCase, CaseStatus } from './types'

function fromTs(ts: Timestamp | Date | undefined): Date {
  if (!ts) return new Date()
  if (ts instanceof Timestamp) return ts.toDate()
  return ts
}

function fromNotifDoc(id: string, data: DocumentData): GroupNotification {
  return {
    id,
    forUid: data.forUid,
    type: data.type,
    transactionId: data.transactionId,
    caseId: data.caseId,
    fromUid: data.fromUid,
    fromName: data.fromName,
    toName: data.toName ?? '',
    points: data.points,
    reason: data.reason,
    appealComment: data.appealComment,
    userComment: data.userComment,
    outcome: data.outcome,
    read: data.read ?? false,
    cleared: data.cleared ?? false,
    thanked: data.thanked ?? false,
    createdAt: fromTs(data.createdAt),
  }
}

function fromCaseDoc(id: string, data: DocumentData): CourtCase {
  return {
    id,
    transactionId: data.transactionId,
    defendantUid: data.defendantUid,
    defendantName: data.defendantName,
    accuserUid: data.accuserUid,
    accuserName: data.accuserName,
    points: data.points,
    reason: data.reason,
    appealComment: data.appealComment,
    status: data.status as CaseStatus,
    createdAt: fromTs(data.createdAt),
    courtDeadline: data.courtDeadline ? fromTs(data.courtDeadline) : undefined,
    votes: data.votes ?? {},
    resolvedAt: data.resolvedAt ? fromTs(data.resolvedAt) : undefined,
  }
}

// ─── Notification subscriptions ───────────────────────────────────────────────

export function subscribeToNotifications(
  groupId: string,
  uid: string,
  callback: (notifs: GroupNotification[]) => void
): () => void {
  const ref = collection(db, 'groups', groupId, 'notifications')
  // Single-field equality query — no composite index required.
  // cleared filtering and sorting are done client-side.
  const q = query(ref, where('forUid', '==', uid), limit(100))
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => fromNotifDoc(d.id, d.data()))
    const visible = all
      .filter((n) => !n.cleared)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    callback(visible)
  })
}

export async function markNotificationRead(groupId: string, notifId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'notifications', notifId), { read: true })
}

export async function clearNotification(groupId: string, notifId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'notifications', notifId), {
    cleared: true,
    read: true,
  })
}

export async function saveComment(
  groupId: string,
  notifId: string,
  comment: string
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'notifications', notifId), {
    userComment: comment,
    read: true,
  })
}

// One-tap "thank you" the recipient of positive points can send back to the
// giver — closes the emotional loop that raw scoring leaves open. Marks the
// original notification thanked (so the button doesn't reappear) and drops a
// lightweight thanks notification + push on the giver.
export async function sendThanks(
  groupId: string,
  notif: GroupNotification,
  thankerName: string
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'notifications', notif.id), { thanked: true })

  const ref = doc(collection(db, 'groups', groupId, 'notifications'))
  await setDoc(ref, {
    id: ref.id,
    forUid: notif.fromUid,          // the original giver
    type: 'thanks_received',
    transactionId: notif.transactionId,
    fromUid: notif.forUid,          // the recipient who is thanking
    fromName: thankerName,
    toName: notif.fromName,
    points: notif.points,
    read: false,
    cleared: false,
    createdAt: serverTimestamp(),
  })

  sendPushToUser(notif.fromUid, '🙏 Thanks!', `${thankerName} said thanks for the ${Math.abs(notif.points)} pts`, `/group/${groupId}`, 'social').catch(() => {})
}

// ─── Appeal filing ────────────────────────────────────────────────────────────

export async function fileAppeal(
  groupId: string,
  transactionId: string,
  defendantUid: string,
  defendantName: string,
  accuserUid: string,
  accuserName: string,
  points: number,         // absolute value of taken points
  appealComment: string,
  originalReason?: string
): Promise<string> {
  const caseRef = doc(collection(db, 'groups', groupId, 'cases'))
  const caseId = caseRef.id
  const accuserNotifRef = doc(collection(db, 'groups', groupId, 'notifications'))

  const batch = writeBatch(db)

  batch.set(caseRef, {
    id: caseId,
    transactionId,
    defendantUid,
    defendantName,
    accuserUid,
    accuserName,
    points,
    reason: originalReason ?? null,
    appealComment,
    status: 'pending_review',
    votes: {},
    createdAt: serverTimestamp(),
  })

  // Notify accuser that an appeal was filed
  batch.set(accuserNotifRef, {
    id: accuserNotifRef.id,
    forUid: accuserUid,
    type: 'appeal_filed',
    transactionId,
    caseId,
    fromUid: defendantUid,
    fromName: defendantName,
    toName: defendantName,
    points,
    reason: originalReason,
    appealComment,
    read: false,
    cleared: false,
    createdAt: serverTimestamp(),
  })

  // Link the caseId back to the defendant's points_taken notification
  const notifQ = query(
    collection(db, 'groups', groupId, 'notifications'),
    where('transactionId', '==', transactionId),
    where('forUid', '==', defendantUid),
    limit(1)
  )
  const notifSnap = await getDocs(notifQ)
  if (!notifSnap.empty) {
    batch.update(notifSnap.docs[0].ref, { caseId, read: true })
  }

  await batch.commit()
  return caseId
}

// ─── Accuser review ───────────────────────────────────────────────────────────

export async function reviewAppeal(
  groupId: string,
  caseId: string,
  accuserNotifId: string,
  decision: 'accept' | 'deny',
  memberUids: string[]
): Promise<void> {
  const caseRef = doc(db, 'groups', groupId, 'cases', caseId)
  let winnerUid: string | null = null

  await runTransaction(db, async (tx) => {
    winnerUid = null
    const caseSnap = await tx.get(caseRef)
    if (!caseSnap.exists()) throw new Error('Case not found')
    const c = caseSnap.data()

    // Clear the accuser's notification
    tx.update(doc(db, 'groups', groupId, 'notifications', accuserNotifId), {
      cleared: true,
      read: true,
    })

    if (decision === 'accept') {
      winnerUid = c.defendantUid
      // Restore defendant's points
      tx.update(doc(db, 'groups', groupId, 'members', c.defendantUid), {
        totalPoints: increment(c.points),
      })

      // Create a reversal transaction record in the feed
      const reversalRef = doc(collection(db, 'groups', groupId, 'transactions'))
      tx.set(reversalRef, {
        id: reversalRef.id,
        fromUid: c.accuserUid,
        fromName: c.accuserName,
        toUid: c.defendantUid,
        toName: c.defendantName,
        points: c.points,
        reason: 'Appeal accepted — points restored',
        createdAt: serverTimestamp(),
      })

      tx.update(caseRef, { status: 'accepted', resolvedAt: serverTimestamp() })

      // Notify defendant
      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      tx.set(notifRef, {
        id: notifRef.id,
        forUid: c.defendantUid,
        type: 'appeal_accepted',
        transactionId: c.transactionId,
        caseId,
        fromUid: c.accuserUid,
        fromName: c.accuserName,
        toName: c.defendantName,
        points: c.points,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    } else {
      // Deny → open court
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000)
      tx.update(caseRef, {
        status: 'in_court',
        courtDeadline: Timestamp.fromDate(deadline),
      })

      // Notify defendant the case is going to court
      const defNotifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      tx.set(defNotifRef, {
        id: defNotifRef.id,
        forUid: c.defendantUid,
        type: 'appeal_denied',
        transactionId: c.transactionId,
        caseId,
        fromUid: c.accuserUid,
        fromName: c.accuserName,
        toName: c.defendantName,
        points: c.points,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })

      // Notify every other member to vote
      for (const uid of memberUids) {
        if (uid === c.accuserUid || uid === c.defendantUid) continue
        const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
        tx.set(notifRef, {
          id: notifRef.id,
          forUid: uid,
          type: 'court_opened',
          transactionId: c.transactionId,
          caseId,
          fromUid: c.defendantUid,
          fromName: c.defendantName,
          toName: c.accuserName,
          points: c.points,
          read: false,
          cleared: false,
          createdAt: serverTimestamp(),
        })
      }
    }
  })

  // Winning an appeal outright counts as a court win for the badge
  if (winnerUid) awardCourtWinBadge(groupId, winnerUid).catch(() => {})
}

// ─── Voting ───────────────────────────────────────────────────────────────────

export async function castVote(
  groupId: string,
  caseId: string,
  voterUid: string,
  vote: 'innocent' | 'guilty',
  memberUids: string[],
): Promise<void> {
  const caseRef = doc(db, 'groups', groupId, 'cases', caseId)
  const groupRef = doc(db, 'groups', groupId)
  let winnerUid: string | null = null

  await runTransaction(db, async (tx) => {
    winnerUid = null
    // All reads must come before writes in a Firestore transaction
    const [caseSnap, groupSnap] = await Promise.all([tx.get(caseRef), tx.get(groupRef)])
    if (!caseSnap.exists()) throw new Error('Case not found')
    const c = caseSnap.data()
    const memberCount: number = groupSnap.data()?.memberCount ?? 0

    if (c.status !== 'in_court') throw new Error('Voting is closed')
    if (c.votes?.[voterUid]) throw new Error('You have already voted')

    const newVotes: Record<string, string> = { ...(c.votes ?? {}), [voterUid]: vote }
    const { status: newStatus, resolved } = tallyVotes({
      votes: newVotes,
      memberUids,
      memberCount,
      accuserUid: c.accuserUid,
      defendantUid: c.defendantUid,
    })

    const voteUpdate: Record<string, unknown> = { [`votes.${voterUid}`]: vote }
    if (resolved) {
      voteUpdate.status = newStatus
      voteUpdate.resolvedAt = serverTimestamp()
    }
    tx.update(caseRef, voteUpdate)

    if (resolved) {
      winnerUid = (newStatus === 'resolved_innocent' ? c.defendantUid : c.accuserUid) as string
      if (newStatus === 'resolved_innocent') {
        tx.update(doc(db, 'groups', groupId, 'members', c.defendantUid), {
          totalPoints: increment(c.points),
        })
        const reversalRef = doc(collection(db, 'groups', groupId, 'transactions'))
        tx.set(reversalRef, {
          id: reversalRef.id,
          fromUid: c.accuserUid,
          fromName: c.accuserName,
          toUid: c.defendantUid,
          toName: c.defendantName,
          points: c.points,
          reason: 'Court ruled innocent — points restored',
          createdAt: serverTimestamp(),
        })
      }

      // Notify defendant and accuser of the outcome
      const outcome = newStatus === 'resolved_innocent' ? 'innocent' : 'guilty'
      for (const uid of [c.defendantUid, c.accuserUid]) {
        const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
        const isDefendant = uid === c.defendantUid
        tx.set(notifRef, {
          id: notifRef.id,
          forUid: uid,
          type: 'court_resolved',
          transactionId: c.transactionId,
          caseId,
          fromUid: isDefendant ? c.accuserUid : c.defendantUid,
          fromName: isDefendant ? c.accuserName : c.defendantName,
          toName: c.defendantName,
          points: c.points,
          outcome,
          read: false,
          cleared: false,
          createdAt: serverTimestamp(),
        })
      }
    }
  })

  if (winnerUid) awardCourtWinBadge(groupId, winnerUid).catch(() => {})
}

// ─── Expired court cases ──────────────────────────────────────────────────────

export async function resolveExpiredCase(
  groupId: string,
  caseId: string
): Promise<void> {
  const caseRef = doc(db, 'groups', groupId, 'cases', caseId)
  let winnerUid: string | null = null

  await runTransaction(db, async (tx) => {
    winnerUid = null
    const caseSnap = await tx.get(caseRef)
    if (!caseSnap.exists()) return
    const c = caseSnap.data()
    if (c.status !== 'in_court') return

    const votes = c.votes ?? {}
    const innocentCount = Object.values(votes).filter((v) => v === 'innocent').length
    const guiltyCount = Object.values(votes).filter((v) => v === 'guilty').length
    // Ties go to the defendant (innocent)
    const newStatus: CaseStatus =
      innocentCount >= guiltyCount ? 'resolved_innocent' : 'resolved_guilty'
    winnerUid = (newStatus === 'resolved_innocent' ? c.defendantUid : c.accuserUid) as string

    tx.update(caseRef, { status: newStatus, resolvedAt: serverTimestamp() })

    if (newStatus === 'resolved_innocent') {
      tx.update(doc(db, 'groups', groupId, 'members', c.defendantUid), {
        totalPoints: increment(c.points),
      })
      const reversalRef = doc(collection(db, 'groups', groupId, 'transactions'))
      tx.set(reversalRef, {
        id: reversalRef.id,
        fromUid: c.accuserUid,
        fromName: c.accuserName,
        toUid: c.defendantUid,
        toName: c.defendantName,
        points: c.points,
        reason: 'Court deadline expired — majority ruled innocent',
        createdAt: serverTimestamp(),
      })
    }

    const outcome = newStatus === 'resolved_innocent' ? 'innocent' : 'guilty'
    for (const uid of [c.defendantUid, c.accuserUid]) {
      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      const isDefendant = uid === c.defendantUid
      tx.set(notifRef, {
        id: notifRef.id,
        forUid: uid,
        type: 'court_resolved',
        transactionId: c.transactionId,
        caseId,
        fromUid: isDefendant ? c.accuserUid : c.defendantUid,
        fromName: isDefendant ? c.accuserName : c.defendantName,
        toName: c.defendantName,
        points: c.points,
        outcome,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    }
  })

  if (winnerUid) awardCourtWinBadge(groupId, winnerUid).catch(() => {})
}

// ─── Cases subscription ───────────────────────────────────────────────────────

export function subscribeToCases(
  groupId: string,
  callback: (cases: CourtCase[]) => void
): () => void {
  const ref = collection(db, 'groups', groupId, 'cases')
  const q = query(ref, orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => fromCaseDoc(d.id, d.data())))
  )
}

// ─── Admin dismiss ────────────────────────────────────────────────────────────

export async function dismissCase(groupId: string, caseId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'cases', caseId), {
    status: 'dismissed',
    resolvedAt: serverTimestamp(),
  })
}
