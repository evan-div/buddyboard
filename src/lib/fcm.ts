'use client'

import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import app, { db } from './firebase'

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export async function requestPushPermission(uid: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return null
  if (!VAPID_KEY) return null

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const reg = await navigator.serviceWorker.register('/sw.js')
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) })
    }
    return token
  } catch (e) {
    console.warn('Push permission failed:', e)
    return null
  }
}

export function subscribeToForegroundMessages(callback: (payload: { title: string; body: string }) => void) {
  if (typeof window === 'undefined') return () => {}
  try {
    const messaging = getMessaging(app)
    return onMessage(messaging, (payload) => {
      const n = payload.notification
      if (n?.title) callback({ title: n.title, body: n.body ?? '' })
    })
  } catch {
    return () => {}
  }
}
