/**
 * @file Firebase SDK initialization
 * @mobile-shareable ❌ - Platform-specific initialization required
 * @description Web-specific setup with IndexedDB persistent cache and client-side auth.
 * Mobile (React Native) needs separate initialization:
 * - Use `firebase/app`, `firebase/auth`, `firebase/firestore` same SDKs
 * - IndexedDB → Firestore local cache (different API)
 * - Remove SSR compatibility checks (RN doesn't have server-side rendering)
 *
 * Recommended: Create platform-specific versions
 * - src/lib/firebase.ts (this file, web)
 * - mobile/src/lib/firebase.ts (Firebase RN version)
 * Both export the same `auth` and `db` instances for compatibility
 */

import { initializeApp, getApps } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

// Auth is only ever used in the browser (effects and event handlers), but this
// module is evaluated on the server when pages are prerendered. getAuth()
// validates the API key immediately, so calling it during a build without
// Firebase env vars crashes prerendering. Initialize it client-side only.
export const auth: Auth = (typeof window !== 'undefined' ? getAuth(app) : null) as Auth

// Persistent (IndexedDB) cache lets listeners emit data instantly on repeat
// visits and keeps the app usable while the connection re-establishes — the
// SDK falls back to memory cache where IndexedDB isn't available. Server-side
// (prerendering) has no IndexedDB, so use the plain instance there.
export const db =
  typeof window !== 'undefined'
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      })
    : getFirestore(app)
export default app
