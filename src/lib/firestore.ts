/**
 * @file Firestore data operations
 * @mobile-shareable 🟡 - Partial reuse via data-layer abstraction
 * @description Complete Firestore operations for all entities:
 * - Users, groups, members (CRUD + subscriptions)
 * - Points transactions and leaderboards
 * - Court cases and voting (appeals.ts handles business logic)
 * - Notifications and real-time listeners
 * - Wall posts and comments
 * - Plaza physics events and presence
 * - Shop and badge awarding
 *
 * For mobile reuse: Extract data operation interfaces and create Firebase RN adapter.
 * The business logic (validation, calculations) can be shared;
 * Firestore-specific calls (onSnapshot, transactions) are platform-specific.
 *
 * Recommended structure for mobile:
 * - Extract pure business logic (points allocation, badge logic) → shared lib
 * - Create IDataLayer interface for operations
 * - Implement in web via Firestore, mobile via Firebase RN
 * Both platforms use the same type definitions from types.ts
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  runTransaction,
  Timestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import { dayKey } from './utils'
import type { User, Group, GroupMember, Transaction, AvatarConfig, PointsAllocation, PlazaPreset, PlazaEvent, PlazaVec, WallPost, WallComment, NotifCategory, NotifPrefs } from './types'

// Helper to convert Firestore Timestamp to Date
function fromTimestamp(ts: Timestamp | Date | undefined): Date {
  if (!ts) return new Date()
  if (ts instanceof Timestamp) return ts.toDate()
  return ts
}

// Generate a random 6-char uppercase invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ============ USER OPERATIONS ============

export async function createOrUpdateUser(uid: string, data: Partial<User>): Promise<void> {
  const userRef = doc(db, 'users', uid)
  await setDoc(userRef, data, { merge: true })
}

export async function getUser(uid: string): Promise<User | null> {
  try {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      avatar: data.avatar,
      createdAt: fromTimestamp(data.createdAt),
      groups: data.groups ?? [],
      coins: data.coins ?? 0,
      unlockedItems: data.unlockedItems ?? [],
      notifPrefs: data.notifPrefs,
    } as User
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

export async function updateUserAvatar(uid: string, avatar: AvatarConfig): Promise<void> {
  const userRef = doc(db, 'users', uid)
  await updateDoc(userRef, { avatar })
}

export async function updateMemberAvatar(groupId: string, uid: string, avatar: AvatarConfig): Promise<void> {
  const memberRef = doc(db, 'groups', groupId, 'members', uid)
  await updateDoc(memberRef, { avatar })
}

export async function updateUserDisplayName(uid: string, displayName: string): Promise<void> {
  const userRef = doc(db, 'users', uid)
  await updateDoc(userRef, { displayName })
}

// ============ GROUP OPERATIONS ============

export async function createGroup(
  creatorUid: string,
  name: string,
  description: string,
  options?: {
    emoji?: string
    dailyGiveLimit?: number
    dailyTakeLimit?: number
    timezone?: string
    presets?: PlazaPreset[]
  }
): Promise<string> {
  const creator = await getUser(creatorUid)
  if (!creator) throw new Error('Creator user not found')

  const inviteCode = generateInviteCode()
  const today = dayKey(options?.timezone)

  const groupRef = doc(collection(db, 'groups'))
  const groupId = groupRef.id

  const batch = writeBatch(db)

  // Invite-code lookup doc: joining resolves the code with a direct get, so
  // security rules can forbid listing/enumerating groups
  batch.set(doc(db, 'invites', inviteCode), { groupId, createdAt: serverTimestamp() })

  batch.set(groupRef, {
    id: groupId,
    name,
    description,
    createdBy: creatorUid,
    inviteCode,
    createdAt: serverTimestamp(),
    memberCount: 1,
    emoji: options?.emoji ?? '🏠',
    dailyGiveLimit: options?.dailyGiveLimit ?? 100,
    dailyTakeLimit: options?.dailyTakeLimit ?? 20,
    timezone: options?.timezone ?? 'UTC',
    presets: options?.presets ?? [],
  })

  const memberRef = doc(db, 'groups', groupId, 'members', creatorUid)
  batch.set(memberRef, {
    uid: creatorUid,
    displayName: creator.displayName,
    avatar: creator.avatar,
    totalPoints: 0,
    dailyPointsGiven: 0,
    dailyPointsTaken: 0,
    lastResetDate: today,
    isAdmin: true,
    joinedAt: serverTimestamp(),
  })

  // Add groupId to user's groups array
  const userRef = doc(db, 'users', creatorUid)
  batch.update(userRef, { groups: arrayUnion(groupId) })

  await batch.commit()
  return groupId
}

export async function joinGroup(inviteCode: string, user: User): Promise<string> {
  const code = inviteCode.toUpperCase()

  // Resolve the code via the invites lookup doc (a direct get — security rules
  // forbid listing groups, so codes can't be harvested by enumeration)
  let groupId: string | null = null
  const inviteSnap = await getDoc(doc(db, 'invites', code)).catch(() => null)
  if (inviteSnap?.exists()) {
    groupId = inviteSnap.data().groupId as string
  } else {
    // Legacy fallback for groups created before the invites collection; this
    // query is denied once the security rules are deployed, at which point the
    // mayor opening the group backfills its invite doc (ensureInviteDoc).
    try {
      const q = query(collection(db, 'groups'), where('inviteCode', '==', code), limit(1))
      const snap = await getDocs(q)
      if (!snap.empty) groupId = snap.docs[0].id
    } catch {
      groupId = null
    }
  }
  if (!groupId) throw new Error('Invalid invite code')

  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  if (!groupSnap.exists() || groupSnap.data().inviteCode !== code) {
    throw new Error('Invalid invite code')
  }
  const groupData = groupSnap.data() as Group & { memberCount: number }

  if (groupData.memberCount >= 20) {
    throw new Error('This group is full (max 20 members)')
  }

  // Check if user is already a member
  const memberRef = doc(db, 'groups', groupId, 'members', user.uid)
  const memberSnap = await getDoc(memberRef)
  if (memberSnap.exists()) {
    throw new Error('You are already a member of this group')
  }

  // Fetch existing members to notify them
  const existingMembersSnap = await getDocs(collection(db, 'groups', groupId, 'members'))
  const existingMemberUids = existingMembersSnap.docs.map((d) => d.id).filter((uid) => uid !== user.uid)

  const today = dayKey(groupData.timezone)
  const batch = writeBatch(db)

  // Create member doc
  batch.set(memberRef, {
    uid: user.uid,
    displayName: user.displayName,
    avatar: user.avatar,
    totalPoints: 0,
    dailyPointsGiven: 0,
    dailyPointsTaken: 0,
    lastResetDate: today,
    joinedAt: serverTimestamp(),
  })

  // Increment memberCount
  const groupRef = doc(db, 'groups', groupId)
  batch.update(groupRef, { memberCount: increment(1) })

  // Add groupId to user's groups array
  const userRef = doc(db, 'users', user.uid)
  batch.update(userRef, { groups: arrayUnion(groupId) })

  // Notify all existing members that a new member joined
  for (const existingUid of existingMemberUids) {
    const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
    batch.set(notifRef, {
      id: notifRef.id,
      forUid: existingUid,
      type: 'member_joined',
      transactionId: user.uid,  // store new joiner's uid here for the welcome button
      fromUid: user.uid,
      fromName: user.displayName,
      toName: user.displayName,
      points: 0,
      read: false,
      cleared: false,
      createdAt: serverTimestamp(),
    })
  }

  await batch.commit()
  return groupId
}

function mapGroupDoc(id: string, data: Record<string, unknown>): Group {
  return {
    id: (data.id as string) ?? id,
    name: data.name,
    description: data.description,
    createdBy: data.createdBy,
    inviteCode: data.inviteCode,
    createdAt: fromTimestamp(data.createdAt as Timestamp | Date | undefined),
    memberCount: data.memberCount ?? 0,
    emoji: data.emoji ?? '🏠',
    dailyGiveLimit: data.dailyGiveLimit ?? 100,
    dailyTakeLimit: data.dailyTakeLimit ?? 20,
    timezone: data.timezone ?? 'UTC',
    presets: data.presets ?? [],
  } as Group
}

// Backfill the invite lookup doc for groups created before the invites
// collection existed. Rules only allow creation (by the group's mayor), so
// check existence first. Fire-and-forget.
export async function ensureInviteDoc(group: Group): Promise<void> {
  try {
    const ref = doc(db, 'invites', group.inviteCode)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, { groupId: group.id, createdAt: serverTimestamp() })
    }
  } catch {
    // Best-effort — retried on next load
  }
}

export async function getGroup(groupId: string): Promise<Group | null> {
  try {
    const groupRef = doc(db, 'groups', groupId)
    const snap = await getDoc(groupRef)
    if (!snap.exists()) return null
    return mapGroupDoc(snap.id, snap.data())
  } catch (error) {
    console.error('Error getting group:', error)
    return null
  }
}

function mapMemberDoc(data: Record<string, unknown>): GroupMember {
  return {
    uid: data.uid,
    displayName: data.displayName,
    avatar: data.avatar,
    totalPoints: data.totalPoints ?? 0,
    dailyPointsGiven: data.dailyPointsGiven ?? 0,
    dailyPointsTaken: data.dailyPointsTaken ?? 0,
    lastResetDate: data.lastResetDate ?? dayKey(),
    joinedAt: fromTimestamp(data.joinedAt as Timestamp | Date | undefined),
    isAdmin: data.isAdmin ?? false,
    currentStreak: data.currentStreak,
    longestStreak: data.longestStreak,
    lastActiveDate: data.lastActiveDate,
    badges: data.badges ?? [],
    lastSeen: data.lastSeen ? fromTimestamp(data.lastSeen as Timestamp) : undefined,
  } as GroupMember
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const membersRef = collection(db, 'groups', groupId, 'members')
    const q = query(membersRef, orderBy('totalPoints', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => mapMemberDoc(d.data()))
  } catch (error) {
    console.error('Error getting group members:', error)
    return []
  }
}

// Live variants used by the group screen — listeners emit from the local
// cache immediately and survive stale connections (one-shot reads hang)

export function subscribeToGroup(
  groupId: string,
  callback: (group: Group | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'groups', groupId),
    (snap) => callback(snap.exists() ? mapGroupDoc(snap.id, snap.data()) : null),
    (error) => onError?.(error),
  )
}

export function subscribeToGroupMembers(
  groupId: string,
  callback: (members: GroupMember[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(collection(db, 'groups', groupId, 'members'), orderBy('totalPoints', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapMemberDoc(d.data()))),
    (error) => onError?.(error),
  )
}

// Real-time subscription to the groups a user belongs to. Unlike one-shot
// getDoc reads — which hang indefinitely when the SDK's backend connection has
// gone stale (e.g. after the app was backgrounded on mobile) — listeners emit
// straight from the local cache and recover automatically when the connection
// re-establishes.
export function subscribeToUserGroups(
  uid: string,
  callback: (groups: Group[]) => void,
  onError?: (error: Error) => void,
): () => void {
  // One listener per group doc (direct gets) rather than a documentId() 'in'
  // query: security rules allow getting a group by id but forbid list queries,
  // which would otherwise permit enumerating every group.
  let groupUnsubs = new Map<string, () => void>()
  let results = new Map<string, Group | null>()
  let currentIds: string[] = []

  function emitIfComplete() {
    if (!currentIds.every((id) => results.has(id))) return
    callback(currentIds.map((id) => results.get(id)).filter((g): g is Group => !!g))
  }

  const userUnsub = onSnapshot(
    doc(db, 'users', uid),
    (userSnap) => {
      currentIds = (userSnap.data()?.groups ?? []) as string[]

      // Drop listeners for groups the user left; keep the rest
      for (const [id, unsub] of groupUnsubs) {
        if (!currentIds.includes(id)) {
          unsub()
          groupUnsubs.delete(id)
          results.delete(id)
        }
      }

      if (currentIds.length === 0) {
        callback([])
        return
      }

      for (const id of currentIds) {
        if (groupUnsubs.has(id)) continue
        const unsub = onSnapshot(
          doc(db, 'groups', id),
          (snap) => {
            results.set(id, snap.exists() ? mapGroupDoc(snap.id, snap.data()) : null)
            emitIfComplete()
          },
          (error) => {
            // Treat an unreadable group as absent rather than failing the list
            console.error('Error loading group', id, error)
            results.set(id, null)
            emitIfComplete()
          },
        )
        groupUnsubs.set(id, unsub)
      }
      emitIfComplete()
    },
    (error) => onError?.(error),
  )

  return () => {
    groupUnsubs.forEach((unsub) => unsub())
    groupUnsubs = new Map()
    results = new Map()
    userUnsub()
  }
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(db)

  // Remove member doc
  const memberRef = doc(db, 'groups', groupId, 'members', uid)
  batch.delete(memberRef)

  // Decrement memberCount
  const groupRef = doc(db, 'groups', groupId)
  batch.update(groupRef, { memberCount: increment(-1) })

  // Remove groupId from user's groups array
  const userRef = doc(db, 'users', uid)
  batch.update(userRef, { groups: arrayRemove(groupId) })

  await batch.commit()
}

// ============ POINTS OPERATIONS ============

export async function addReaction(
  groupId: string,
  txId: string,
  emoji: string,
  uid: string,
  reactorName: string
): Promise<void> {
  const txRef = doc(db, 'groups', groupId, 'transactions', txId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(txRef)
    if (!snap.exists()) return
    const data = snap.data()
    const existing: string[] = data?.reactions?.[emoji] ?? []
    if (existing.includes(uid)) {
      tx.update(txRef, { [`reactions.${emoji}`]: arrayRemove(uid) })
    } else {
      tx.update(txRef, { [`reactions.${emoji}`]: arrayUnion(uid) })
      // Notify the transaction author (skip self-reactions)
      const targetUid: string = data.fromUid
      if (uid !== targetUid) {
        const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
        tx.set(notifRef, {
          id: notifRef.id,
          forUid: targetUid,
          type: 'feed_reaction',
          transactionId: txId,
          fromUid: uid,
          fromName: reactorName,
          toName: data.fromName ?? '',
          points: 0,
          reason: emoji,  // store the emoji here
          read: false,
          cleared: false,
          createdAt: serverTimestamp(),
        })
      }
    }
  })
}

export async function giveOrTakePoints(
  groupId: string,
  fromUid: string,
  allocations: PointsAllocation[],
): Promise<void> {
  if (!allocations || allocations.length === 0) {
    throw new Error('No allocations provided')
  }

  for (const alloc of allocations) {
    if (alloc.toUid === fromUid) {
      throw new Error('You cannot give or take points from yourself')
    }
  }

  await runTransaction(db, async (transaction) => {
    // Read group for configured limits and timezone
    const groupRef = doc(db, 'groups', groupId)
    const groupSnap = await transaction.get(groupRef)
    const groupData = groupSnap.data()
    const giveLimit: number = groupData?.dailyGiveLimit ?? 100
    const takeLimit: number = groupData?.dailyTakeLimit ?? 20
    // Daily limits reset at midnight in the group's timezone
    const today = dayKey(groupData?.timezone)

    const giverRef = doc(db, 'groups', groupId, 'members', fromUid)
    const giverSnap = await transaction.get(giverRef)
    if (!giverSnap.exists()) {
      throw new Error('You are not a member of this group')
    }

    const giverData = giverSnap.data()
    let dailyPointsGiven: number = giverData.dailyPointsGiven ?? 0
    let dailyPointsTaken: number = giverData.dailyPointsTaken ?? 0

    if (giverData.lastResetDate !== today) {
      dailyPointsGiven = 0
      dailyPointsTaken = 0
    }

    const giveAllocations = allocations.filter((a) => a.points > 0)
    const takeAllocations = allocations.filter((a) => a.points < 0)

    const totalGiving = giveAllocations.reduce((sum, a) => sum + a.points, 0)
    const totalTaking = takeAllocations.reduce((sum, a) => sum + Math.abs(a.points), 0)

    if (dailyPointsGiven + totalGiving > giveLimit) {
      throw new Error(
        `Exceeds daily give limit. You have ${giveLimit - dailyPointsGiven} points left to give today.`
      )
    }
    if (dailyPointsTaken + totalTaking > takeLimit) {
      throw new Error(
        `Exceeds daily take limit. You have ${takeLimit - dailyPointsTaken} points left to take today.`
      )
    }

    // Get giver's display name for transaction records
    const giverName: string = giverData.displayName ?? fromUid

    // Read all recipient docs first (Firestore transactions require all reads before writes)
    const recipientRefs = allocations.map((a) => doc(db, 'groups', groupId, 'members', a.toUid))
    const recipientSnaps = await Promise.all(recipientRefs.map((ref) => transaction.get(ref)))

    // Validate all recipients exist
    for (let i = 0; i < recipientSnaps.length; i++) {
      if (!recipientSnaps[i].exists()) {
        throw new Error(`Recipient ${allocations[i].toUid} is not a member of this group`)
      }
    }

    // Apply writes for each allocation
    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i]
      const recipientRef = recipientRefs[i]
      const recipientData = recipientSnaps[i].data()!
      const currentPoints: number = recipientData.totalPoints ?? 0
      const recipientName: string = recipientData.displayName ?? alloc.toUid

      // Update recipient's totalPoints
      transaction.update(recipientRef, {
        totalPoints: currentPoints + alloc.points,
      })

      // Create transaction record
      const txRef = doc(collection(db, 'groups', groupId, 'transactions'))
      const txData: Record<string, unknown> = {
        id: txRef.id,
        fromUid,
        fromName: giverName,
        toUid: alloc.toUid,
        toName: recipientName,
        points: alloc.points,
        reason: alloc.reason,
        createdAt: serverTimestamp(),
      }
      if (alloc.caption) txData.caption = alloc.caption
      transaction.set(txRef, txData)

      // Create persistent notification for recipient
      const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
      transaction.set(notifRef, {
        id: notifRef.id,
        forUid: alloc.toUid,
        type: alloc.points > 0 ? 'points_received' : 'points_taken',
        transactionId: txRef.id,
        fromUid,
        fromName: giverName,
        toName: recipientName,
        points: alloc.points,
        reason: alloc.reason,
        read: false,
        cleared: false,
        createdAt: serverTimestamp(),
      })
    }

    // Update giver's daily counters, reset date, and streak
    const lastActive: string | undefined = giverData.lastActiveDate
    const yesterdayStr = dayKey(groupData?.timezone, -1)
    let currentStreak: number = giverData.currentStreak ?? 0
    let longestStreak: number = giverData.longestStreak ?? 0
    if (lastActive === yesterdayStr) {
      currentStreak++
    } else if (lastActive !== today) {
      currentStreak = 1
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak

    transaction.update(giverRef, {
      dailyPointsGiven: dailyPointsGiven + totalGiving,
      dailyPointsTaken: dailyPointsTaken + totalTaking,
      lastResetDate: today,
      currentStreak,
      longestStreak,
      lastActiveDate: today,
    })
  })

  // Push-notify each recipient (fire-and-forget — in-app notifications were
  // already written inside the transaction)
  for (const alloc of allocations) {
    const sign = alloc.points > 0 ? '+' : ''
    const title = alloc.points > 0 ? '🎉 Points received!' : '📉 Points taken'
    const body = `${sign}${alloc.points} pts${alloc.reason ? ` · ${alloc.reason}` : ''}`
    sendPushToUser(alloc.toUid, title, body, `/group/${groupId}`, 'points').catch(() => {})
  }

  // Award badges to giver (fire-and-forget — don't block the transaction)
  const giverMemberRef = doc(db, 'groups', groupId, 'members', fromUid)
  getDoc(giverMemberRef).then((snap) => {
    if (!snap.exists()) return
    const d = snap.data()
    checkAndAwardBadges(groupId, fromUid, {
      totalPoints: d.totalPoints as number,
      currentStreak: d.currentStreak as number,
      groupMemberUids: allocations.map((a) => a.toUid).concat([fromUid]),
      txFromUid: fromUid,
    }).catch(() => {})
  }).catch(() => {})
}

// ============ FEED OPERATIONS ============

function mapTransaction(d: { id: string; data: () => Record<string, unknown> }): Transaction {
  const data = d.data()
  return {
    id: (data.id as string) ?? d.id,
    fromUid: data.fromUid as string,
    fromName: data.fromName as string,
    toUid: data.toUid as string,
    toName: data.toName as string,
    points: data.points as number,
    reason: data.reason as string,
    caption: data.caption as string | undefined,
    reactions: data.reactions as Record<string, string[]> | undefined,
    createdAt: fromTimestamp(data.createdAt as Timestamp | Date | undefined),
  }
}

export async function getTransactionsSince(
  groupId: string,
  since: Date
): Promise<Transaction[]> {
  const txRef = collection(db, 'groups', groupId, 'transactions')
  const q = query(
    txRef,
    where('createdAt', '>=', Timestamp.fromDate(since)),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(mapTransaction)
}

export function subscribeToFeed(
  groupId: string,
  callback: (transactions: Transaction[]) => void,
  limitCount = 50
): () => void {
  const txRef = collection(db, 'groups', groupId, 'transactions')
  const q = query(txRef, orderBy('createdAt', 'desc'), limit(limitCount))

  const unsubscribe = onSnapshot(q, (snap) => {
    callback(snap.docs.map(mapTransaction))
  })

  return unsubscribe
}

// ============ ADMIN OPERATIONS ============

export async function banishMember(groupId: string, targetUid: string): Promise<void> {
  await leaveGroup(groupId, targetUid)
}

export async function adminSetPoints(
  groupId: string,
  targetUid: string,
  newPoints: number,
  adminUid: string,
  adminName: string,
  targetName: string
): Promise<void> {
  const memberRef = doc(db, 'groups', groupId, 'members', targetUid)
  const memberSnap = await getDoc(memberRef)
  const currentPoints: number = memberSnap.data()?.totalPoints ?? 0
  const delta = newPoints - currentPoints

  const batch = writeBatch(db)
  batch.update(memberRef, { totalPoints: newPoints })

  const txRef = doc(collection(db, 'groups', groupId, 'transactions'))
  batch.set(txRef, {
    id: txRef.id,
    fromUid: adminUid,
    fromName: `Mayor ${adminName}`,
    toUid: targetUid,
    toName: targetName,
    points: delta,
    reason: 'Mayor adjustment',
    createdAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function checkAndAwardBadges(
  groupId: string,
  uid: string,
  context: {
    totalPoints?: number
    currentStreak?: number
    courtWin?: boolean
    groupMemberUids?: string[]
    txFromUid?: string
  }
): Promise<void> {
  const memberRef = doc(db, 'groups', groupId, 'members', uid)
  const snap = await getDoc(memberRef)
  if (!snap.exists()) return
  const data = snap.data()
  const existing: string[] = data.badges ?? []
  const toAward: string[] = []

  function maybeAward(id: string) {
    if (!existing.includes(id) && !toAward.includes(id)) toAward.push(id)
  }

  const pts = context.totalPoints ?? (data.totalPoints as number ?? 0)
  if (pts >= 100)  maybeAward('first_100')
  if (pts >= 500)  maybeAward('first_500')
  if (pts >= 1000) maybeAward('first_1000')

  const streak = context.currentStreak ?? (data.currentStreak as number ?? 0)
  if (streak >= 7)  maybeAward('streak_7')
  if (streak >= 30) maybeAward('streak_30')

  if (context.courtWin) maybeAward('court_win')

  if (context.groupMemberUids && context.txFromUid) {
    const txRef = collection(db, 'groups', groupId, 'transactions')
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const q = query(txRef, where('fromUid', '==', context.txFromUid), where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo)))
    const txSnap = await getDocs(q)
    const recipientsSeen = new Set(txSnap.docs.map((d) => d.data().toUid as string))
    const otherMembers = context.groupMemberUids.filter((u) => u !== context.txFromUid)
    if (otherMembers.length > 0 && otherMembers.every((u) => recipientsSeen.has(u))) {
      maybeAward('generous')
    }
  }

  if (toAward.length > 0) {
    await updateDoc(memberRef, { badges: arrayUnion(...toAward) })
    const { BADGE_MAP } = await import('./badges')
    const coinTotal = toAward.reduce((sum, id) => sum + (BADGE_MAP[id]?.coinReward ?? 0), 0)
    if (coinTotal > 0) {
      await updateDoc(doc(db, 'users', uid), { coins: increment(coinTotal) })
    }
  }
}

// Badge check specifically for court wins — called from appeals module is too complex,
// so export a helper to be called from the court resolution UI layer if needed.
export async function awardCourtWinBadge(groupId: string, uid: string): Promise<void> {
  await checkAndAwardBadges(groupId, uid, { courtWin: true })
}

export async function updateGroupSettings(
  groupId: string,
  settings: Partial<{
    name: string
    emoji: string
    description: string
    dailyGiveLimit: number
    dailyTakeLimit: number
    timezone: string
    presets: import('./types').PlazaPreset[]
  }>
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), settings)
}

// ============ WALL OPERATIONS ============

function mapWallPost(d: { id: string; data: () => Record<string, unknown> }): WallPost {
  const data = d.data()
  return {
    id: d.id,
    uid: data.uid as string,
    displayName: data.displayName as string,
    avatarConfig: data.avatarConfig as AvatarConfig | undefined,
    text: data.text as string,
    reactions: data.reactions as Record<string, string[]> | undefined,
    commentCount: (data.commentCount as number | undefined) ?? 0,
    createdAt: fromTimestamp(data.createdAt as Timestamp | Date | undefined),
  }
}

export async function postToWall(
  groupId: string,
  uid: string,
  displayName: string,
  avatarConfig: AvatarConfig,
  text: string
): Promise<void> {
  const postRef = doc(collection(db, 'groups', groupId, 'wall'))
  await setDoc(postRef, {
    uid,
    displayName,
    avatarConfig,
    text,
    reactions: {},
    createdAt: serverTimestamp(),
  })
}

export function subscribeToWall(
  groupId: string,
  callback: (posts: WallPost[]) => void
): () => void {
  const ref = collection(db, 'groups', groupId, 'wall')
  const q = query(ref, orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapWallPost)))
}

export async function sendPushToUser(
  recipientUid: string,
  title: string,
  body: string,
  url?: string,
  category: NotifCategory = 'points',
): Promise<void> {
  // The API verifies this ID token and looks up the recipient's push tokens
  // (and notification preferences) server-side — clients can't read or spoof
  // pushes to other users' tokens, and can't override their mute settings.
  const idToken = await auth.currentUser?.getIdToken().catch(() => null)
  if (!idToken) return
  await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ toUid: recipientUid, title, body, url, category }),
  }).catch(() => {})
}

// Persist a user's notification preferences (merged into their user doc)
export async function updateNotifPrefs(uid: string, prefs: NotifPrefs): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { notifPrefs: prefs })
}

export async function reactToPost(
  groupId: string,
  postId: string,
  emoji: string,
  uid: string
): Promise<void> {
  const postRef = doc(db, 'groups', groupId, 'wall', postId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(postRef)
    if (!snap.exists()) return
    const existing: string[] = snap.data()?.reactions?.[emoji] ?? []
    if (existing.includes(uid)) {
      tx.update(postRef, { [`reactions.${emoji}`]: arrayRemove(uid) })
    } else {
      tx.update(postRef, { [`reactions.${emoji}`]: arrayUnion(uid) })
    }
  })
}

function mapWallComment(d: { id: string; data: () => Record<string, unknown> }): WallComment {
  const data = d.data()
  return {
    id: d.id,
    uid: data.uid as string,
    displayName: data.displayName as string,
    avatarConfig: data.avatarConfig as AvatarConfig | undefined,
    text: data.text as string,
    createdAt: fromTimestamp(data.createdAt as Timestamp | Date | undefined),
  }
}

export async function addWallComment(
  groupId: string,
  postId: string,
  uid: string,
  displayName: string,
  avatarConfig: AvatarConfig | undefined,
  text: string,
  postAuthorUid: string,
  postAuthorName: string
): Promise<void> {
  const postRef    = doc(db, 'groups', groupId, 'wall', postId)
  const commentRef = doc(collection(db, 'groups', groupId, 'wall', postId, 'comments'))
  const batch = writeBatch(db)
  batch.set(commentRef, { uid, displayName, avatarConfig: avatarConfig ?? null, text, createdAt: serverTimestamp() })
  batch.update(postRef, { commentCount: increment(1) })
  if (uid !== postAuthorUid) {
    const notifRef = doc(collection(db, 'groups', groupId, 'notifications'))
    batch.set(notifRef, {
      id: notifRef.id,
      forUid: postAuthorUid,
      type: 'wall_comment',
      transactionId: postId,
      fromUid: uid,
      fromName: displayName,
      toName: postAuthorName,
      points: 0,
      reason: text.length > 80 ? text.slice(0, 80) + '…' : text,
      read: false,
      cleared: false,
      createdAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

export function subscribeToWallComments(
  groupId: string,
  postId: string,
  callback: (comments: WallComment[]) => void
): () => void {
  const ref = collection(db, 'groups', groupId, 'wall', postId, 'comments')
  const q = query(ref, orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(mapWallComment)))
}

// ============ PLAZA EVENTS & PRESENCE ============

// Broadcast a physics interaction (pickup / drop / throw) so other members'
// plazas act it out too. Fire-and-forget.
export function sendPlazaEvent(groupId: string, event: Omit<PlazaEvent, 'id' | 'at'>): void {
  const ref = doc(collection(db, 'groups', groupId, 'plazaEvents'))
  setDoc(ref, { ...event, at: serverTimestamp() }).catch(() => {})
}

export function subscribeToPlazaEvents(
  groupId: string,
  callback: (event: PlazaEvent) => void,
): () => void {
  const q = query(collection(db, 'groups', groupId, 'plazaEvents'), orderBy('at', 'desc'), limit(12))
  let initial = true
  return onSnapshot(q, (snap) => {
    if (initial) {
      // Don't replay history on mount
      initial = false
      return
    }
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return
      if (change.doc.metadata.hasPendingWrites) return // local echo
      const data = change.doc.data()
      callback({
        id: change.doc.id,
        type: data.type,
        uid: data.uid,
        by: data.by,
        pos: data.pos,
        vel: data.vel,
        angVel: data.angVel,
        at: fromTimestamp(data.at),
      })
    })
  })
}

// Live drag position for a held character: streamed (throttled) by the
// member doing the holding into one doc per character, deleted on release.
// Other clients lerp the character toward it, so drags are visible live.
export function updatePlazaHold(groupId: string, uid: string, by: string, pos: PlazaVec): void {
  setDoc(doc(db, 'groups', groupId, 'plazaHolds', uid), { by, pos, at: serverTimestamp() }).catch(() => {})
}

export function clearPlazaHold(groupId: string, uid: string): void {
  deleteDoc(doc(db, 'groups', groupId, 'plazaHolds', uid)).catch(() => {})
}

export type PlazaHoldChange =
  | { uid: string; removed: true }
  | { uid: string; removed?: false; by: string; pos: PlazaVec }

export function subscribeToPlazaHolds(
  groupId: string,
  callback: (change: PlazaHoldChange) => void,
): () => void {
  const ref = collection(db, 'groups', groupId, 'plazaHolds')
  return onSnapshot(ref, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        callback({ uid: change.doc.id, removed: true })
        return
      }
      if (change.doc.metadata.hasPendingWrites) return // local echo
      const data = change.doc.data()
      callback({ uid: change.doc.id, by: data.by, pos: data.pos })
    })
  })
}

// Presence heartbeat: stamps lastSeen on the member doc while the group screen
// is open. Members subscriptions pick it up; "online" = seen recently.
export function touchPresence(groupId: string, uid: string): void {
  updateDoc(doc(db, 'groups', groupId, 'members', uid), { lastSeen: serverTimestamp() }).catch(() => {})
}

// ============ SHOP ============

export async function purchaseItem(uid: string, itemId: string, cost: number): Promise<void> {
  const userRef = doc(db, 'users', uid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists()) throw new Error('User not found')
    const coins: number = snap.data().coins ?? 0
    if (coins < cost) throw new Error('Not enough coins')
    const unlocked: string[] = snap.data().unlockedItems ?? []
    if (unlocked.includes(itemId)) throw new Error('Already owned')
    tx.update(userRef, { coins: increment(-cost), unlockedItems: arrayUnion(itemId) })
  })
}
