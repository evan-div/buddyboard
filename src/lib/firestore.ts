import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
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
import { db } from './firebase'
import type { User, Group, GroupMember, Transaction, AvatarConfig, PointsAllocation, PlazaPreset, WallPost, WallComment } from './types'

// Helper to get today's date string YYYY-MM-DD
function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

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
  const today = todayString()

  const groupRef = doc(collection(db, 'groups'))
  const groupId = groupRef.id

  const batch = writeBatch(db)

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
  // Find group by inviteCode
  const groupsRef = collection(db, 'groups')
  const q = query(groupsRef, where('inviteCode', '==', inviteCode.toUpperCase()), limit(1))
  const snap = await getDocs(q)

  if (snap.empty) throw new Error('Invalid invite code')

  const groupDoc = snap.docs[0]
  const groupData = groupDoc.data() as Group & { memberCount: number }
  const groupId = groupDoc.id

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

  const today = todayString()
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

export async function getGroup(groupId: string): Promise<Group | null> {
  try {
    const groupRef = doc(db, 'groups', groupId)
    const snap = await getDoc(groupRef)
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      id: data.id ?? snap.id,
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      inviteCode: data.inviteCode,
      createdAt: fromTimestamp(data.createdAt),
      memberCount: data.memberCount ?? 0,
      emoji: data.emoji ?? '🏠',
      dailyGiveLimit: data.dailyGiveLimit ?? 100,
      dailyTakeLimit: data.dailyTakeLimit ?? 20,
      timezone: data.timezone ?? 'UTC',
      presets: data.presets ?? [],
    } as Group
  } catch (error) {
    console.error('Error getting group:', error)
    return null
  }
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const membersRef = collection(db, 'groups', groupId, 'members')
    const q = query(membersRef, orderBy('totalPoints', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        uid: data.uid,
        displayName: data.displayName,
        avatar: data.avatar,
        totalPoints: data.totalPoints ?? 0,
        dailyPointsGiven: data.dailyPointsGiven ?? 0,
        dailyPointsTaken: data.dailyPointsTaken ?? 0,
        lastResetDate: data.lastResetDate ?? todayString(),
        joinedAt: fromTimestamp(data.joinedAt),
        isAdmin: data.isAdmin ?? false,
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        lastActiveDate: data.lastActiveDate,
        badges: data.badges ?? [],
      } as GroupMember
    })
  } catch (error) {
    console.error('Error getting group members:', error)
    return []
  }
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  const user = await getUser(uid)
  if (!user || !user.groups || user.groups.length === 0) return []

  const groups = await Promise.all(user.groups.map((groupId) => getGroup(groupId)))
  return groups.filter((g): g is Group => g !== null)
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
  isChief = false
): Promise<void> {
  if (!allocations || allocations.length === 0) {
    throw new Error('No allocations provided')
  }

  for (const alloc of allocations) {
    if (alloc.toUid === fromUid) {
      throw new Error('You cannot give or take points from yourself')
    }
  }

  const today = todayString()

  await runTransaction(db, async (transaction) => {
    // Read group for configured limits
    const groupRef = doc(db, 'groups', groupId)
    const groupSnap = await transaction.get(groupRef)
    const groupData = groupSnap.data()
    const baseGiveLimit: number = groupData?.dailyGiveLimit ?? 100
    const takeLimit: number = groupData?.dailyTakeLimit ?? 20
    const giveLimit = baseGiveLimit + (isChief ? 25 : 0)

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
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
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
    sendPushToUser(alloc.toUid, title, body, `/group/${groupId}`).catch(() => {})
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

export async function getGroupDailyStats(
  groupId: string,
  uid: string
): Promise<{
  dailyPointsGiven: number
  dailyPointsTaken: number
  remainingGive: number
  remainingTake: number
}> {
  const today = todayString()
  const memberRef = doc(db, 'groups', groupId, 'members', uid)
  const groupRef = doc(db, 'groups', groupId)
  const [snap, groupSnap] = await Promise.all([getDoc(memberRef), getDoc(groupRef)])

  const giveLimit: number = groupSnap.data()?.dailyGiveLimit ?? 100
  const takeLimit: number = groupSnap.data()?.dailyTakeLimit ?? 20

  const data = snap.exists() ? snap.data() : null

  // Counters reset each day; a stale lastResetDate means nothing spent yet today
  if (!data || data.lastResetDate !== today) {
    return {
      dailyPointsGiven: 0,
      dailyPointsTaken: 0,
      remainingGive: giveLimit,
      remainingTake: takeLimit,
    }
  }

  const given: number = data.dailyPointsGiven ?? 0
  const taken: number = data.dailyPointsTaken ?? 0

  return {
    dailyPointsGiven: given,
    dailyPointsTaken: taken,
    remainingGive: Math.max(0, giveLimit - given),
    remainingTake: Math.max(0, takeLimit - taken),
  }
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
  url?: string
): Promise<void> {
  const userSnap = await getDoc(doc(db, 'users', recipientUid))
  if (!userSnap.exists()) return
  const tokens: string[] = userSnap.data()?.fcmTokens ?? []
  if (tokens.length === 0) return
  await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens, title, body, url }),
  }).catch(() => {})
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
