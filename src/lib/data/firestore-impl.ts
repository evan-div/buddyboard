/**
 * @file Web (Firestore) implementation of the data-access layer
 * @description Concrete {@link IDataLayer} for the web app. Every method delegates
 * to the existing Firestore operations in `../firestore` and the court workflow in
 * `../appeals`, both of which close over the shared `db`/`auth` from `../firebase`.
 *
 * This completes the "Next Steps" from `./README.md` for the web platform:
 * a single object that satisfies `IDataLayer`, registered via {@link setDataLayer}
 * so shared/business-logic code can reach the database through `getDataLayer()`
 * without importing Firestore directly. The React Native app provides its own
 * implementation of the same interface (`firebase-impl.ts`).
 */

import * as fs from '../firestore'
import * as court from '../appeals'
import { setDataLayer, type IDataLayer } from './dataLayer'

export class FirestoreDataLayer implements IDataLayer {
  // ============ USER OPERATIONS ============
  getUser = fs.getUser
  createOrUpdateUser = fs.createOrUpdateUser
  updateUserAvatar = fs.updateUserAvatar
  updateUserDisplayName = fs.updateUserDisplayName
  updateNotifPrefs = fs.updateNotifPrefs

  // ============ GROUP OPERATIONS ============
  createGroup = fs.createGroup
  joinGroup = fs.joinGroup
  leaveGroup = fs.leaveGroup
  getGroup = fs.getGroup
  getGroupMembers = fs.getGroupMembers
  subscribeToGroup = fs.subscribeToGroup
  subscribeToGroupMembers = fs.subscribeToGroupMembers
  subscribeToUserGroups = fs.subscribeToUserGroups
  updateGroupSettings = fs.updateGroupSettings

  // ============ POINTS OPERATIONS ============
  giveOrTakePoints = fs.giveOrTakePoints
  addReaction = fs.addReaction
  adminSetPoints = fs.adminSetPoints

  // ============ NOTIFICATIONS ============
  subscribeToNotifications = court.subscribeToNotifications
  markNotificationRead = court.markNotificationRead
  clearNotification = court.clearNotification
  saveComment = court.saveComment
  sendThanks = court.sendThanks
  sendPushToUser = fs.sendPushToUser

  // ============ FEED OPERATIONS ============
  getTransactionsSince = fs.getTransactionsSince
  subscribeToFeed = fs.subscribeToFeed

  // ============ COURT SYSTEM ============
  subscribeToCases = court.subscribeToCases
  fileAppeal = court.fileAppeal
  reviewAppeal = court.reviewAppeal
  castVote = court.castVote
  dismissCase = court.dismissCase
  resolveExpiredCase = court.resolveExpiredCase

  // ============ WALL OPERATIONS ============
  postToWall = fs.postToWall
  subscribeToWall = fs.subscribeToWall
  reactToPost = fs.reactToPost
  addWallComment = fs.addWallComment
  subscribeToWallComments = fs.subscribeToWallComments

  // ============ PLAZA PHYSICS & PRESENCE ============
  sendPlazaEvent = fs.sendPlazaEvent
  subscribeToPlazaEvents = fs.subscribeToPlazaEvents
  updatePlazaHold = fs.updatePlazaHold
  clearPlazaHold = fs.clearPlazaHold
  subscribeToPlazaHolds = fs.subscribeToPlazaHolds
  touchPresence = fs.touchPresence

  // ============ BADGES & SHOP ============
  awardCourtWinBadge = fs.awardCourtWinBadge
  purchaseItem = fs.purchaseItem

  // `context` is optional on the interface but required by the underlying
  // Firestore helper, so default it here to keep both call styles valid.
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
  ): Promise<void> {
    return fs.checkAndAwardBadges(groupId, uid, context ?? {})
  }

  // ============ ADMIN OPERATIONS ============
  banishMember = fs.banishMember
  updateMemberAvatar = fs.updateMemberAvatar
}

/** Shared singleton for the web app. */
export const firestoreDataLayer = new FirestoreDataLayer()

// Register on import so `getDataLayer()` is ready once any client module that
// pulls this file in has loaded (see AuthContext).
setDataLayer(firestoreDataLayer)
