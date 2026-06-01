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
import type { User, Group, GroupMember, Transaction, AvatarConfig, PointsAllocation } from './types'

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
  description: string
): Promise<string> {
  // Fetch creator profile to get displayName and avatar
  const creator = await getUser(creatorUid)
  if (!creator) throw new Error('Creator user not found')

  const inviteCode = generateInviteCode()
  const today = todayString()

  const groupRef = doc(collection(db, 'groups'))
  const groupId = groupRef.id

  const batch = writeBatch(db)

  // Create group doc
  batch.set(groupRef, {
    id: groupId,
    name,
    description,
    createdBy: creatorUid,
    inviteCode,
    createdAt: serverTimestamp(),
    memberCount: 1,
  })

  // Create member doc for creator
  const memberRef = doc(db, 'groups', groupId, 'members', creatorUid)
  batch.set(memberRef, {
    uid: creatorUid,
    displayName: creator.displayName,
    avatar: creator.avatar,
    totalPoints: 0,
    dailyPointsGiven: 0,
    dailyPointsTaken: 0,
    lastResetDate: today,
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
      } as GroupMember
    })
  } catch (error) {
    console.error('Error getting group members:', error)
    return []
  }
}

export async function getUserGroups(uid: string): Promise<Group[]> {
  try {
    const user = await getUser(uid)
    if (!user || !user.groups || user.groups.length === 0) return []

    const groupPromises = user.groups.map((groupId) => getGroup(groupId))
    const groups = await Promise.all(groupPromises)
    return groups.filter((g): g is Group => g !== null)
  } catch (error) {
    console.error('Error getting user groups:', error)
    return []
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

export async function giveOrTakePoints(
  groupId: string,
  fromUid: string,
  allocations: PointsAllocation[]
): Promise<void> {
  if (!allocations || allocations.length === 0) {
    throw new Error('No allocations provided')
  }

  // Validate that no allocation targets the giver
  for (const alloc of allocations) {
    if (alloc.toUid === fromUid) {
      throw new Error('You cannot give or take points from yourself')
    }
  }

  const today = todayString()

  await runTransaction(db, async (transaction) => {
    // Get giver's member doc
    const giverRef = doc(db, 'groups', groupId, 'members', fromUid)
    const giverSnap = await transaction.get(giverRef)
    if (!giverSnap.exists()) {
      throw new Error('You are not a member of this group')
    }

    const giverData = giverSnap.data()
    let dailyPointsGiven: number = giverData.dailyPointsGiven ?? 0
    let dailyPointsTaken: number = giverData.dailyPointsTaken ?? 0

    // Reset daily counters if needed
    if (giverData.lastResetDate !== today) {
      dailyPointsGiven = 0
      dailyPointsTaken = 0
    }

    // Separate into give (positive) and take (negative)
    const giveAllocations = allocations.filter((a) => a.points > 0)
    const takeAllocations = allocations.filter((a) => a.points < 0)

    const totalGiving = giveAllocations.reduce((sum, a) => sum + a.points, 0)
    const totalTaking = takeAllocations.reduce((sum, a) => sum + Math.abs(a.points), 0)

    // Validate daily limits
    if (dailyPointsGiven + totalGiving > 100) {
      throw new Error(
        `Exceeds daily give limit. You have ${100 - dailyPointsGiven} points left to give today.`
      )
    }
    if (dailyPointsTaken + totalTaking > 20) {
      throw new Error(
        `Exceeds daily take limit. You have ${20 - dailyPointsTaken} points left to take today.`
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
      transaction.set(txRef, {
        id: txRef.id,
        fromUid,
        fromName: giverName,
        toUid: alloc.toUid,
        toName: recipientName,
        points: alloc.points,
        reason: alloc.reason,
        createdAt: serverTimestamp(),
      })

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

    // Update giver's daily counters and reset date
    transaction.update(giverRef, {
      dailyPointsGiven: dailyPointsGiven + totalGiving,
      dailyPointsTaken: dailyPointsTaken + totalTaking,
      lastResetDate: today,
    })
  })
}

// ============ FEED OPERATIONS ============

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
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: data.id ?? d.id,
      fromUid: data.fromUid,
      fromName: data.fromName,
      toUid: data.toUid,
      toName: data.toName,
      points: data.points,
      reason: data.reason,
      createdAt: fromTimestamp(data.createdAt),
    } as Transaction
  })
}

export function subscribeToFeed(
  groupId: string,
  callback: (transactions: Transaction[]) => void,
  limitCount = 50
): () => void {
  const txRef = collection(db, 'groups', groupId, 'transactions')
  const q = query(txRef, orderBy('createdAt', 'desc'), limit(limitCount))

  const unsubscribe = onSnapshot(q, (snap) => {
    const transactions: Transaction[] = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: data.id ?? d.id,
        fromUid: data.fromUid,
        fromName: data.fromName,
        toUid: data.toUid,
        toName: data.toName,
        points: data.points,
        reason: data.reason,
        createdAt: fromTimestamp(data.createdAt),
      } as Transaction
    })
    callback(transactions)
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
  const snap = await getDoc(memberRef)

  if (!snap.exists()) {
    return {
      dailyPointsGiven: 0,
      dailyPointsTaken: 0,
      remainingGive: 100,
      remainingTake: 20,
    }
  }

  const data = snap.data()

  // Reset if date has changed
  if (data.lastResetDate !== today) {
    return {
      dailyPointsGiven: 0,
      dailyPointsTaken: 0,
      remainingGive: 100,
      remainingTake: 20,
    }
  }

  const given: number = data.dailyPointsGiven ?? 0
  const taken: number = data.dailyPointsTaken ?? 0

  return {
    dailyPointsGiven: given,
    dailyPointsTaken: taken,
    remainingGive: Math.max(0, 100 - given),
    remainingTake: Math.max(0, 20 - taken),
  }
}
