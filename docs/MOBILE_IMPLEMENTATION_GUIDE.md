# BuddyBoard Mobile App Implementation Guide

**Target:** React Native app using Expo or bare React Native  
**Timeline:** 6-8 weeks for MVP (Expo with simplified 3D or 2D plaza)  
**Code Reuse:** ~50% from web app (business logic + types)

---

## Phase 1: Setup (Week 1-2)

### 1.1 Create React Native Project

```bash
# Using Expo (recommended for MVP)
npx create-expo-app buddyboard-mobile
cd buddyboard-mobile

# Or using bare React Native
npx react-native init BuddyboardMobile

# Install Firebase
npm install firebase @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore @react-native-firebase/messaging
```

### 1.2 Project Structure

```
buddyboard-mobile/
├── src/
│   ├── lib/
│   │   ├── shared/              # ✅ Copy from web
│   │   │   ├── types.ts         # Copy as-is from web
│   │   │   ├── voteTally.ts     # Copy as-is from web
│   │   │   ├── rankings.ts      # Copy as-is from web
│   │   │   ├── badges.ts        # Copy as-is from web
│   │   │   ├── utils.ts         # Copy as-is from web
│   │   │   └── plazaMath.ts     # Copy as-is from web
│   │   ├── data/
│   │   │   ├── dataLayer.ts     # Copy from web/src/lib/data/
│   │   │   └── firebase-impl.ts # NEW: Firebase RN implementation
│   │   └── firebase.ts          # NEW: Firebase RN initialization
│   ├── screens/                 # NEW: React Native screens
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SignupScreen.tsx
│   │   ├── group/
│   │   │   ├── GroupListScreen.tsx
│   │   │   ├── GroupDetailScreen.tsx
│   │   │   └── PlazaScreen.tsx
│   │   └── ...
│   ├── navigation/              # NEW: React Navigation setup
│   │   └── RootNavigator.tsx
│   ├── components/              # NEW: Reusable UI components
│   │   └── ...
│   └── App.tsx                  # App entry point
├── app.json                      # Expo config
├── package.json
└── tsconfig.json
```

### 1.3 Copy Shared Code

```bash
# From your web project
cp -r src/lib/types.ts src/lib/
cp -r src/lib/voteTally.ts src/lib/
cp -r src/lib/rankings.ts src/lib/
cp -r src/lib/badges.ts src/lib/
cp -r src/lib/utils.ts src/lib/
cp -r src/components/World/plazaMath.ts src/lib/
cp -r src/lib/data/ src/lib/
```

---

## Phase 2: Firebase Setup (Week 1-2)

### 2.1 Firebase Initialization (Mobile)

Create `src/lib/firebase.ts`:

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { Platform } from 'react-native'

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// Enable offline persistence (default on mobile)
// Firestore RN handles this automatically

// Optional: Connect to emulator for development
if (__DEV__ && Platform.OS !== 'web') {
  // connectAuthEmulator(auth, 'http://localhost:9099')
  // connectFirestoreEmulator(db, 'localhost', 8080)
}

export default app
```

### 2.2 Data Layer Implementation (Mobile)

Create `src/lib/data/firebase-impl.ts`:

```typescript
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit,
  getDocs, onSnapshot, runTransaction, writeBatch, arrayUnion, arrayRemove,
  increment, serverTimestamp, Timestamp, DocumentData
} from 'firebase/firestore'

import type { IDataLayer, UnsubscribeFn, NotificationCallback, /* ... */ } from './dataLayer'
import type { User, Group, GroupMember, /* ... */ } from '../shared/types'
import { auth, db } from '../firebase'

export class FirebaseRNDataLayer implements IDataLayer {
  // Copy ALL methods from web's firestore.ts
  // They work identically on mobile because Firebase SDK is the same

  async getUser(uid: string): Promise<User | null> {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) return null
    // Parse and return user
  }

  subscribeToNotifications(
    groupId: string,
    uid: string,
    callback: NotificationCallback
  ): UnsubscribeFn {
    const ref = collection(db, 'groups', groupId, 'notifications')
    const q = query(ref, where('forUid', '==', uid), limit(100))
    return onSnapshot(q, (snap) => {
      // Convert and call callback
    })
  }

  // ... implement remaining methods (copy from web/src/lib/firestore.ts)
}
```

### 2.3 Initialize Data Layer

In `src/App.tsx`:

```typescript
import { useEffect } from 'react'
import { setDataLayer } from './lib/data/dataLayer'
import { FirebaseRNDataLayer } from './lib/data/firebase-impl'
import { auth, db } from './lib/firebase'

export default function App() {
  useEffect(() => {
    // Initialize data layer once at app startup
    setDataLayer(new FirebaseRNDataLayer(db, auth))
  }, [])

  return (
    // Navigation stack
  )
}
```

---

## Phase 3: Authentication (Week 2)

### 3.1 Auth Flow

```typescript
// screens/auth/SignupScreen.tsx
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { getDataLayer } from '../../lib/data/dataLayer'
import { auth } from '../../lib/firebase'

export function SignupScreen() {
  async function handleSignup(email: string, password: string, displayName: string) {
    // Firebase auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const uid = userCredential.user.uid

    // Store user in Firestore
    const dataLayer = getDataLayer()
    await dataLayer.createOrUpdateUser(uid, {
      uid,
      email,
      displayName,
      avatar: defaultAvatar(),
      createdAt: new Date(),
      groups: [],
    })
  }

  return (
    // Your UI
  )
}
```

---

## Phase 4: Core Screens (Week 3-4)

### 4.1 Group List

```typescript
// screens/group/GroupListScreen.tsx
import { useFocusEffect } from '@react-navigation/native'
import { useState, useEffect } from 'react'
import { getDataLayer } from '../../lib/data/dataLayer'

export function GroupListScreen() {
  const [groups, setGroups] = useState([])

  useEffect(() => {
    const dataLayer = getDataLayer()
    const uid = auth.currentUser?.uid
    if (!uid) return

    // Subscribe to user's groups
    const unsubscribe = dataLayer.subscribeToUserGroups(uid, setGroups)
    return unsubscribe
  }, [])

  return (
    // List groups with FlatList
  )
}
```

### 4.2 Group Details

```typescript
// screens/group/GroupDetailScreen.tsx
export function GroupDetailScreen({ route }) {
  const { groupId } = route.params
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    const dataLayer = getDataLayer()
    const unsubscribers = [
      dataLayer.subscribeToGroup(groupId, setGroup),
      dataLayer.subscribeToGroupMembers(groupId, setMembers),
      dataLayer.subscribeToFeed(groupId, setTransactions),
    ]
    return () => unsubscribers.forEach(u => u())
  }, [groupId])

  // Show group info, leaderboard, and transaction feed
}
```

### 4.3 Plaza Screen

```typescript
// screens/group/PlazaScreen.tsx
import { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { getDataLayer } from '../../lib/data/dataLayer'

export function PlazaScreen({ route }) {
  const { groupId } = route.params
  const [members, setMembers] = useState([])
  const dataLayer = getDataLayer()

  useEffect(() => {
    // Subscribe to members, plaza events, presence
    return dataLayer.subscribeToGroupMembers(groupId, setMembers)
  }, [])

  // Render avatars with physics
  // For MVP: Simplified 2D grid of avatars
  // Later: Three.js via expo-three for 3D
}
```

---

## Phase 5: Points & Transactions (Week 4-5)

### 5.1 Give/Take Points

```typescript
// screens/group/GivePointsScreen.tsx
async function handleGivePoints(toUid: string, points: number, reason: string) {
  const dataLayer = getDataLayer()
  await dataLayer.giveOrTakePoints(groupId, auth.currentUser!.uid, [
    { toUid, points, reason }
  ])
}
```

### 5.2 Leaderboard

```typescript
// Use shared ranking logic!
import { computeRankings, getPeriodStart, Period } from '../lib/shared/rankings'

function Leaderboard({ members, transactions, period }: Period) {
  const ranked = computeRankings(members, transactions, period)
  return <FlatList data={ranked} renderItem={renderMember} />
}
```

---

## Phase 6: Court System (Week 5-6)

### 6.1 Appeals

```typescript
// screens/court/AppealScreen.tsx
async function fileAppeal(transactionId: string, comment: string) {
  // Uses data layer but logic is identical to web
  // No need to rewrite courtcase.ts!
}
```

### 6.2 Voting

```typescript
// screens/court/VotingScreen.tsx
import { tallyVotes } from '../lib/shared/voteTally'

async function castVote(caseId: string, vote: 'innocent' | 'guilty') {
  const case_ = await getCase(caseId)
  const result = tallyVotes({
    votes: case_.votes,
    memberUids: memberUids,
    memberCount: group.memberCount,
    accuserUid: case_.accuserUid,
    defendantUid: case_.defendantUid,
  })
  // Verdict computed locally, then written to Firestore
}
```

---

## Phase 7: Notifications (Week 6)

### 7.1 Push Notifications

```typescript
// src/lib/messaging.ts
import messaging from '@react-native-firebase/messaging'

export async function requestNotificationPermission() {
  const authStatus = await messaging().requestPermission()
  return authStatus === messaging.AuthorizationStatus.AUTHORIZED
}

export function subscribeToMessages() {
  return messaging().onMessage(onMessageReceived)
}

function onMessageReceived(message) {
  // Parse notification and show alert or navigation
}
```

### 7.2 In-App Notifications

```typescript
// Use data layer subscriptions
subscribeToNotifications(groupId, uid, (notifs) => {
  // Update state, show badges
})
```

---

## Phase 8: Polish & Testing (Week 7-8)

### 8.1 Performance

- Lazy load screens
- Memoize components with `useMemo`, `useCallback`
- Paginate large lists
- Compress avatar images

### 8.2 Offline Support

Firestore mobile persistence is built-in:
```typescript
// Reads from cache if offline
const user = await dataLayer.getUser(uid)
```

### 8.3 Testing

```typescript
// tests/dataLayer.mobile.test.ts
import { FirebaseRNDataLayer } from '../src/lib/data/firebase-impl'

describe('FirebaseRNDataLayer', () => {
  it('should get users', async () => {
    // Test against emulator or mock
  })
})
```

---

## What NOT to Copy

❌ Don't copy:
- Next.js pages or server code
- Tailwind CSS
- React web components
- Web-specific dependencies

✅ Do copy:
- `/lib/shared/*` (types, business logic)
- `/lib/data/dataLayer.ts` (interface)
- Type definitions everywhere

---

## Building & Deploying

### Expo

```bash
# Develop locally
expo start

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### Bare React Native

```bash
# iOS
cd ios && pod install && cd ..
react-native run-ios

# Android
react-native run-android
```

---

## Troubleshooting

### Issue: Firestore offline cache not working
**Solution:** Ensure persistent cache is enabled (default on RN)

### Issue: Push notifications not received
**Solution:** Test FCM credentials in Firebase Console

### Issue: App freezes on large data
**Solution:** Paginate lists, use VirtualList for large feeds

---

## Estimated Effort Breakdown

| Task | Effort | Status |
|------|--------|--------|
| Setup & Firebase | 1 week | - |
| Auth screens | 3 days | - |
| Group/plaza screens | 1 week | - |
| Transactions | 4 days | - |
| Court system | 4 days | - |
| Notifications | 3 days | - |
| Testing & deploy | 1 week | - |
| **Total** | **6-8 weeks** | - |

---

## Next Steps

1. ✅ Copy this guide, shared code, and types
2. ✅ Set up Firebase RN and implement `firebase-impl.ts`
3. ✅ Build auth screens
4. ✅ Connect to data layer, test read/write
5. ✅ Build core screens (groups, plaza, feed)
6. ✅ Add court system and badges
7. ✅ Push notifications
8. ✅ Test on iOS and Android
9. ✅ Deploy to app stores

Good luck! 🚀
