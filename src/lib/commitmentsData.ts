/**
 * @file Commitment persistence: create, join, start, mark, resolve, dispute
 * @mobile-shareable 🟡 - Reusable with Firebase RN via data-layer abstraction
 * @description Firestore operations for `groups/{gid}/commitments/{cid}`. The
 * rules themselves live in commitments.ts (pure, unit-tested, also imported by
 * the server-side cron resolver); this file only moves documents around.
 *
 * Kept out of firestore.ts for the same reason appeals.ts is — that file is
 * already 1300 lines and this is a self-contained corner of the domain.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
  runTransaction,
  increment,
  arrayUnion,
  DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import { sendPushToUser } from './firestore'
import { dayKey } from './utils'
import {
  canJoinRarity,
  deadlineFrom,
  isValidDuration,
  metThreshold,
  rarityForDuration,
  validateDraft,
  type CommitmentDraft,
} from './commitments'
import type { Commitment, CommitmentParticipant, CommitmentStatus, SeedRarity } from './types'

const COURT_WINDOW_MS = 24 * 60 * 60 * 1000

function fromTs(ts: Timestamp | Date | undefined): Date {
  if (!ts) return new Date()
  if (ts instanceof Timestamp) return ts.toDate()
  return ts
}

function fromParticipant(data: DocumentData): CommitmentParticipant {
  return {
    uid: data.uid,
    displayName: data.displayName ?? data.uid,
    joinedAt: fromTs(data.joinedAt),
    markedDays: (data.markedDays as string[]) ?? [],
    outcome: data.outcome as CommitmentParticipant['outcome'],
    seedAwarded: data.seedAwarded as SeedRarity | undefined,
    caseId: data.caseId as string | undefined,
  }
}

export function fromCommitmentDoc(id: string, data: DocumentData): Commitment {
  const participants: Record<string, CommitmentParticipant> = {}
  for (const [uid, p] of Object.entries(data.participants ?? {})) {
    participants[uid] = fromParticipant(p as DocumentData)
  }
  return {
    id,
    title: data.title ?? '',
    createdBy: data.createdBy,
    createdByName: data.createdByName ?? data.createdBy,
    status: (data.status as CommitmentStatus) ?? 'forming',
    durationDays: (data.durationDays as number) ?? 7,
    rarity: (data.rarity as SeedRarity) ?? 'common',
    cadence: data.cadence ?? 'daily',
    targetPerPeriod: (data.targetPerPeriod as number) ?? 1,
    thresholdPct: (data.thresholdPct as number) ?? 80,
    createdAt: fromTs(data.createdAt),
    startedAt: data.startedAt ? fromTs(data.startedAt) : undefined,
    deadline: data.deadline ? fromTs(data.deadline) : undefined,
    resolvedAt: data.resolvedAt ? fromTs(data.resolvedAt) : undefined,
    participants,
  }
}

function participantSeed(uid: string, displayName: string) {
  return {
    uid,
    displayName,
    joinedAt: serverTimestamp(),
    markedDays: [] as string[],
  }
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

// Single-field ordering only — no composite index needed. Callers filter by
// status client-side, same approach as subscribeToNotifications.
export function subscribeToCommitments(
  groupId: string,
  callback: (commitments: Commitment[]) => void,
): () => void {
  const ref = collection(db, 'groups', groupId, 'commitments')
  const q = query(ref, orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => fromCommitmentDoc(d.id, d.data()))),
  )
}

export async function getCommitments(groupId: string): Promise<Commitment[]> {
  const snap = await getDocs(collection(db, 'groups', groupId, 'commitments'))
  return snap.docs.map((d) => fromCommitmentDoc(d.id, d.data()))
}

// ─── Creating and joining ─────────────────────────────────────────────────────

/**
 * Open a commitment for sign-up. The clock does not start here — the creator
 * hits Start once the roster looks right, which is what locks it.
 */
export async function createCommitment(
  groupId: string,
  uid: string,
  displayName: string,
  draft: CommitmentDraft,
): Promise<string> {
  const problem = validateDraft(draft)
  if (problem) throw new Error(problem)

  const rarity = rarityForDuration(draft.durationDays)

  // One live commitment per tier. Read the group's commitments rather than
  // trusting the caller — the tab filters the UI, but this is the actual guard.
  const existing = await getCommitments(groupId)
  if (!canJoinRarity(existing, uid, rarity)) {
    throw new Error(`You already have a ${rarity} commitment running`)
  }

  const ref = doc(collection(db, 'groups', groupId, 'commitments'))
  await runTransaction(db, async (tx) => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid)
    const memberSnap = await tx.get(memberRef)
    if (!memberSnap.exists()) throw new Error('You are not a member of this group')

    tx.set(ref, {
      id: ref.id,
      title: draft.title.trim(),
      createdBy: uid,
      createdByName: displayName,
      status: 'forming' as CommitmentStatus,
      durationDays: draft.durationDays,
      rarity,
      cadence: draft.cadence,
      targetPerPeriod: draft.targetPerPeriod,
      thresholdPct: draft.thresholdPct,
      createdAt: serverTimestamp(),
      participants: { [uid]: participantSeed(uid, displayName) },
    })
  })
  return ref.id
}

/** Join a commitment that is still forming. */
export async function joinCommitment(
  groupId: string,
  commitmentId: string,
  uid: string,
  displayName: string,
): Promise<void> {
  const existing = await getCommitments(groupId)
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Commitment not found')
    const c = snap.data()
    if (c.status !== 'forming') throw new Error('This commitment has already started')
    if (c.participants?.[uid]) throw new Error('You are already in this commitment')

    const rarity = (c.rarity as SeedRarity) ?? 'common'
    // Exclude this commitment from the guard — joining it is the whole point.
    const others = existing.filter((e) => e.id !== commitmentId)
    if (!canJoinRarity(others, uid, rarity)) {
      throw new Error(`You already have a ${rarity} commitment running`)
    }

    tx.update(ref, { [`participants.${uid}`]: participantSeed(uid, displayName) })
  })
}

/** Leave while forming. Once started, the roster is locked. */
export async function leaveCommitment(
  groupId: string,
  commitmentId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Commitment not found')
    const c = snap.data()
    if (c.status !== 'forming') throw new Error('This commitment has already started')
    if (c.createdBy === uid) throw new Error('Cancel the commitment instead of leaving it')

    const participants = { ...(c.participants ?? {}) }
    delete participants[uid]
    tx.update(ref, { participants })
  })
}

/** Creator-only. Locks the roster, starts the clock, sets the deadline. */
export async function startCommitment(
  groupId: string,
  commitmentId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  let notify: { uids: string[]; title: string } | null = null

  await runTransaction(db, async (tx) => {
    notify = null
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Commitment not found')
    const c = snap.data()
    if (c.createdBy !== uid) throw new Error('Only the creator can start this')
    if (c.status !== 'forming') throw new Error('This commitment has already started')

    const uids = Object.keys(c.participants ?? {})
    if (uids.length < 2) throw new Error('A commitment needs at least two people')

    const startedAt = new Date()
    const deadline = deadlineFrom(startedAt.getTime(), c.durationDays as number)

    tx.update(ref, {
      status: 'active' as CommitmentStatus,
      startedAt: Timestamp.fromDate(startedAt),
      deadline: Timestamp.fromDate(deadline),
    })

    for (const target of uids) {
      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      tx.set(notifRef, {
        id: notifRef.id,
        forUid: target,
        type: 'commitment_started',
        transactionId: commitmentId,
        commitmentId,
        fromUid: c.createdBy,
        fromName: c.createdByName,
        toName: c.title,
        points: 0,
        rarity: c.rarity,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    }
    notify = { uids: uids.filter((u) => u !== uid), title: c.title as string }
  })

  // Push after commit, fire-and-forget — a failed push must never fail the start.
  const pending = notify as { uids: string[]; title: string } | null
  if (pending) {
    for (const target of pending.uids) {
      sendPushToUser(target, 'Commitment started', pending.title, undefined, 'social')
        .catch(() => {})
    }
  }
}

/** Creator-only, and only while forming. */
export async function cancelCommitment(
  groupId: string,
  commitmentId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Commitment not found')
    const c = snap.data()
    if (c.createdBy !== uid) throw new Error('Only the creator can cancel this')
    if (c.status !== 'forming') throw new Error('A started commitment cannot be cancelled')
    tx.update(ref, { status: 'cancelled' as CommitmentStatus, resolvedAt: serverTimestamp() })
  })
}

// ─── Marking ──────────────────────────────────────────────────────────────────

/**
 * Mark that you showed up for this commitment today. Gated on having checked in,
 * so the mark rides on the existing daily heartbeat rather than becoming a second
 * thing to remember. arrayUnion makes it naturally idempotent — tapping twice in
 * a day can never count twice.
 */
export async function markCommitment(
  groupId: string,
  commitmentId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  await runTransaction(db, async (tx) => {
    const groupRef = doc(db, 'groups', groupId)
    const memberRef = doc(db, 'groups', groupId, 'members', uid)
    const [snap, groupSnap, memberSnap] = await Promise.all([
      tx.get(ref),
      tx.get(groupRef),
      tx.get(memberRef),
    ])
    if (!snap.exists()) throw new Error('Commitment not found')
    if (!memberSnap.exists()) throw new Error('You are not a member of this group')

    const c = snap.data()
    if (c.status !== 'active') throw new Error('This commitment is not running')
    if (!c.participants?.[uid]) throw new Error('You are not in this commitment')

    const today = dayKey(groupSnap.data()?.timezone)
    if (memberSnap.data().lastCheckinDate !== today) {
      throw new Error('Check in first, then mark your commitments')
    }

    tx.update(ref, { [`participants.${uid}.markedDays`]: arrayUnion(today) })
  })
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Settle a commitment whose deadline has passed. Idempotent and status-guarded
 * exactly like resolveExpiredCase, so the cron, a client sweep, and two browsers
 * racing each other can all call it safely — only the first does anything.
 *
 * Each participant is judged alone: hold up your end and you get your seed even
 * if everybody else bailed. Failing costs nothing.
 */
export async function resolveCommitment(
  groupId: string,
  commitmentId: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  let awarded: { uid: string; rarity: SeedRarity; title: string }[] = []

  await runTransaction(db, async (tx) => {
    awarded = []
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const c = snap.data()
    if (c.status !== 'active') return

    const rarity = (c.rarity as SeedRarity) ?? 'common'
    const rules = {
      cadence: c.cadence,
      targetPerPeriod: c.targetPerPeriod as number,
      thresholdPct: c.thresholdPct as number,
      durationDays: c.durationDays as number,
    }

    const updates: Record<string, unknown> = {
      status: 'resolved' as CommitmentStatus,
      resolvedAt: serverTimestamp(),
    }

    for (const [uid, raw] of Object.entries(c.participants ?? {})) {
      const p = raw as DocumentData
      const kept = metThreshold(rules, (p.markedDays as string[]) ?? [])
      updates[`participants.${uid}.outcome`] = kept ? 'kept' : 'missed'
      if (kept) {
        updates[`participants.${uid}.seedAwarded`] = rarity
        tx.update(doc(db, 'groups', groupId, 'members', uid), {
          [`seedsByRarity.${rarity}`]: increment(1),
        })
        awarded.push({ uid, rarity, title: c.title as string })
      }

      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      tx.set(notifRef, {
        id: notifRef.id,
        forUid: uid,
        type: 'commitment_resolved',
        transactionId: commitmentId,
        commitmentId,
        fromUid: c.createdBy,
        fromName: c.createdByName,
        toName: c.title,
        points: 0,
        rarity,
        outcome: kept ? 'innocent' : 'guilty',
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    }

    tx.update(ref, updates)
  })

  for (const a of awarded) {
    sendPushToUser(a.uid, `You earned a ${a.rarity} seed 🌱`, a.title, undefined, 'social')
      .catch(() => {})
  }
}

/** Resolve every commitment in this group whose deadline has passed. */
export async function sweepDueCommitments(
  groupId: string,
  commitments: Commitment[],
  nowMs: number = Date.now(),
): Promise<void> {
  const due = commitments.filter(
    (c) => c.status === 'active' && c.deadline && c.deadline.getTime() <= nowMs,
  )
  for (const c of due) {
    await resolveCommitment(groupId, c.id).catch(() => {})
  }
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

/**
 * Contest a co-participant's claimed success. Opens a court case straight at
 * `in_court` — unlike a points appeal there is no accept/deny step, because the
 * dispute IS the accusation. The whole group votes on the existing 24h clock.
 */
export async function disputeCommitment(
  groupId: string,
  commitmentId: string,
  accuserUid: string,
  accuserName: string,
  defendantUid: string,
  comment: string,
  memberUids: string[],
): Promise<string> {
  if (accuserUid === defendantUid) throw new Error('You cannot dispute your own outcome')

  const commitmentRef = doc(db, 'groups', groupId, 'commitments', commitmentId)
  const caseRef = doc(collection(db, 'groups', groupId, 'cases'))

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(commitmentRef)
    if (!snap.exists()) throw new Error('Commitment not found')
    const c = snap.data()
    if (c.status !== 'resolved') throw new Error('This commitment has not resolved yet')

    const participants = c.participants ?? {}
    if (!participants[accuserUid]) throw new Error('Only participants can dispute')
    const defendant = participants[defendantUid]
    if (!defendant) throw new Error('That person is not in this commitment')
    if (defendant.outcome !== 'kept') throw new Error('That outcome is already a miss')
    if (defendant.caseId) throw new Error('That outcome is already being disputed')

    const deadline = new Date(Date.now() + COURT_WINDOW_MS)
    tx.set(caseRef, {
      id: caseRef.id,
      subject: 'commitment',
      commitmentId,
      // Carried for shape compatibility with points cases; unused for commitments.
      transactionId: commitmentId,
      defendantUid,
      defendantName: defendant.displayName ?? defendantUid,
      accuserUid,
      accuserName,
      points: 0,
      reason: c.title,
      appealComment: comment,
      status: 'in_court',
      createdAt: serverTimestamp(),
      courtDeadline: Timestamp.fromDate(deadline),
      votes: {},
    })

    tx.update(commitmentRef, { [`participants.${defendantUid}.caseId`]: caseRef.id })

    for (const uid of memberUids) {
      const isParty = uid === accuserUid || uid === defendantUid
      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      tx.set(notifRef, {
        id: notifRef.id,
        forUid: uid,
        type: isParty ? 'commitment_disputed' : 'court_opened',
        transactionId: commitmentId,
        commitmentId,
        caseId: caseRef.id,
        fromUid: accuserUid,
        fromName: accuserName,
        toName: defendant.displayName ?? defendantUid,
        points: 0,
        reason: c.title,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    }
  })

  return caseRef.id
}

/**
 * Apply a guilty verdict on a commitment dispute: the seed is revoked and the
 * outcome flips to a miss.
 *
 * A seed already planted stays in the ground. Deleting a shared-world object by
 * group vote would leave a hole in a garden other people are looking at, and the
 * public court record is punishment enough — so the clawback is best-effort
 * against unspent inventory, floored at zero rather than driven negative.
 */
export async function revokeCommitmentSeed(
  groupId: string,
  commitmentId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'commitments', commitmentId)
  await runTransaction(db, async (tx) => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid)
    const [snap, memberSnap] = await Promise.all([tx.get(ref), tx.get(memberRef)])
    if (!snap.exists()) return
    const c = snap.data()
    const p = c.participants?.[uid]
    if (!p || p.outcome !== 'kept') return

    const rarity = (p.seedAwarded as SeedRarity) ?? (c.rarity as SeedRarity) ?? 'common'
    const held: number = memberSnap.data()?.seedsByRarity?.[rarity] ?? 0

    tx.update(ref, {
      [`participants.${uid}.outcome`]: 'missed',
      [`participants.${uid}.seedAwarded`]: null,
    })
    // Only claw back what is still unspent; a planted seed is already a tree.
    if (held > 0 && memberSnap.exists()) {
      tx.update(memberRef, { [`seedsByRarity.${rarity}`]: increment(-1) })
    }
  })
}

/** Read one commitment (used by the court when a verdict lands). */
export async function getCommitment(
  groupId: string,
  commitmentId: string,
): Promise<Commitment | null> {
  const snap = await getDoc(doc(db, 'groups', groupId, 'commitments', commitmentId))
  return snap.exists() ? fromCommitmentDoc(snap.id, snap.data()) : null
}

// Re-exported so callers can validate a duration without reaching past this module.
export { isValidDuration }
