/**
 * @file Data Access Layer Interface
 * @description Abstract interface for data operations that both web (Firestore) and mobile
 * (Firebase RN) can implement. Separates business logic from database details.
 *
 * Usage:
 * - Web: Implement via Firestore (src/lib/firestore.ts)
 * - Mobile (React Native): Implement via Firebase RN SDK
 *
 * This allows business logic to be platform-agnostic:
 * ```typescript
 * // Shared business logic
 * const result = await dataLayer.giveOrTakePoints(groupId, fromUid, allocations)
 *
 * // Works on both web and mobile because both implement IDataLayer
 * ```
 */

import type {
  User,
  Group,
  GroupMember,
  Transaction,
  GroupNotification,
  CourtCase,
  WallPost,
  WallComment,
  PlazaEvent,
  PlazaVec,
  PointsAllocation,
  AvatarConfig,
  NotifCategory,
  NotifPrefs,
  PlazaPreset,
} from '../types'

// Subscription callbacks
export type UnsubscribeFn = () => void
export type NotificationCallback = (notifs: GroupNotification[]) => void
export type CasesCallback = (cases: CourtCase[]) => void
export type TransactionsCallback = (transactions: Transaction[]) => void
export type MembersCallback = (members: GroupMember[]) => void
export type GroupCallback = (group: Group | null) => void
export type WallPostsCallback = (posts: WallPost[]) => void
export type WallCommentsCallback = (comments: WallComment[]) => void
export type PlazaEventCallback = (event: PlazaEvent) => void
export type PlazaHoldChange = { uid: string; removed: true } | { uid: string; removed?: false; by: string; pos: PlazaVec }
export type PlazaHoldCallback = (change: PlazaHoldChange) => void

export interface IDataLayer {
  // ============ USER OPERATIONS ============
  getUser(uid: string): Promise<User | null>
  createOrUpdateUser(uid: string, data: Partial<User>): Promise<void>
  updateUserAvatar(uid: string, avatar: AvatarConfig): Promise<void>
  updateUserDisplayName(uid: string, displayName: string): Promise<void>
  updateNotifPrefs(uid: string, prefs: NotifPrefs): Promise<void>

  // ============ GROUP OPERATIONS ============
  createGroup(
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
  ): Promise<string>

  joinGroup(inviteCode: string, user: User): Promise<string>
  leaveGroup(groupId: string, uid: string): Promise<void>
  getGroup(groupId: string): Promise<Group | null>
  getGroupMembers(groupId: string): Promise<GroupMember[]>

  // Real-time subscriptions
  subscribeToGroup(
    groupId: string,
    callback: GroupCallback,
    onError?: (error: Error) => void
  ): UnsubscribeFn

  subscribeToGroupMembers(
    groupId: string,
    callback: MembersCallback,
    onError?: (error: Error) => void
  ): UnsubscribeFn

  subscribeToUserGroups(
    uid: string,
    callback: (groups: Group[]) => void,
    onError?: (error: Error) => void
  ): UnsubscribeFn

  updateGroupSettings(
    groupId: string,
    settings: Partial<{
      name: string
      emoji: string
      description: string
      dailyGiveLimit: number
      dailyTakeLimit: number
      timezone: string
      presets: PlazaPreset[]
    }>
  ): Promise<void>

  // ============ POINTS OPERATIONS ============
  giveOrTakePoints(groupId: string, fromUid: string, allocations: PointsAllocation[]): Promise<void>
  addReaction(groupId: string, txId: string, emoji: string, uid: string, reactorName: string): Promise<void>
  adminSetPoints(
    groupId: string,
    targetUid: string,
    newPoints: number,
    adminUid: string,
    adminName: string,
    targetName: string
  ): Promise<void>

  // ============ NOTIFICATIONS ============
  subscribeToNotifications(
    groupId: string,
    uid: string,
    callback: NotificationCallback
  ): UnsubscribeFn

  markNotificationRead(groupId: string, notifId: string): Promise<void>
  clearNotification(groupId: string, notifId: string): Promise<void>
  saveComment(groupId: string, notifId: string, comment: string): Promise<void>
  sendThanks(groupId: string, notif: GroupNotification, thankerName: string): Promise<void>
  sendPushToUser(
    recipientUid: string,
    title: string,
    body: string,
    url?: string,
    category?: NotifCategory
  ): Promise<void>

  // ============ FEED OPERATIONS ============
  getTransactionsSince(groupId: string, since: Date): Promise<Transaction[]>

  subscribeToFeed(
    groupId: string,
    callback: TransactionsCallback,
    limitCount?: number
  ): UnsubscribeFn

  // ============ COURT SYSTEM ============
  subscribeToNotifications(
    groupId: string,
    uid: string,
    callback: NotificationCallback
  ): UnsubscribeFn

  subscribeToCases(groupId: string, callback: CasesCallback): UnsubscribeFn

  fileAppeal(
    groupId: string,
    transactionId: string,
    defendantUid: string,
    defendantName: string,
    accuserUid: string,
    accuserName: string,
    points: number,
    appealComment: string,
    originalReason?: string
  ): Promise<string>

  reviewAppeal(
    groupId: string,
    caseId: string,
    accuserNotifId: string,
    decision: 'accept' | 'deny',
    memberUids: string[]
  ): Promise<void>

  castVote(
    groupId: string,
    caseId: string,
    voterUid: string,
    vote: 'innocent' | 'guilty',
    memberUids: string[]
  ): Promise<void>

  dismissCase(groupId: string, caseId: string): Promise<void>
  resolveExpiredCase(groupId: string, caseId: string): Promise<void>

  // ============ WALL OPERATIONS ============
  postToWall(
    groupId: string,
    uid: string,
    displayName: string,
    avatarConfig: AvatarConfig,
    text: string
  ): Promise<void>

  subscribeToWall(groupId: string, callback: WallPostsCallback): UnsubscribeFn

  reactToPost(groupId: string, postId: string, emoji: string, uid: string): Promise<void>

  addWallComment(
    groupId: string,
    postId: string,
    uid: string,
    displayName: string,
    avatarConfig: AvatarConfig | undefined,
    text: string,
    postAuthorUid: string,
    postAuthorName: string
  ): Promise<void>

  subscribeToWallComments(
    groupId: string,
    postId: string,
    callback: WallCommentsCallback
  ): UnsubscribeFn

  // ============ PLAZA PHYSICS & PRESENCE ============
  sendPlazaEvent(groupId: string, event: Omit<PlazaEvent, 'id' | 'at'>): void

  subscribeToPlazaEvents(groupId: string, callback: PlazaEventCallback): UnsubscribeFn

  updatePlazaHold(groupId: string, uid: string, by: string, pos: PlazaVec): void
  clearPlazaHold(groupId: string, uid: string): void

  subscribeToPlazaHolds(groupId: string, callback: PlazaHoldCallback): UnsubscribeFn

  touchPresence(groupId: string, uid: string): void

  // ============ BADGES & SHOP ============
  checkAndAwardBadges(
    groupId: string,
    uid: string,
    context?: {
      totalPoints?: number
      currentStreak?: number
      courtWin?: boolean
      groupMemberUids?: string[]
      txFromUid?: string
    }
  ): Promise<void>

  awardCourtWinBadge(groupId: string, uid: string): Promise<void>

  purchaseItem(uid: string, itemId: string, cost: number): Promise<void>

  // ============ ADMIN OPERATIONS ============
  banishMember(groupId: string, targetUid: string): Promise<void>
  updateMemberAvatar(groupId: string, uid: string, avatar: AvatarConfig): Promise<void>
}

/**
 * Global instance: Set by platform-specific initialization
 * Web: src/lib/firestore.ts sets this to Firestore implementation
 * Mobile: mobile/src/lib/firebase-impl.ts sets this to Firebase RN implementation
 */
export let dataLayer: IDataLayer | null = null

export function setDataLayer(impl: IDataLayer): void {
  dataLayer = impl
}

export function getDataLayer(): IDataLayer {
  if (!dataLayer) {
    throw new Error('Data layer not initialized. Call setDataLayer() during app startup.')
  }
  return dataLayer
}
