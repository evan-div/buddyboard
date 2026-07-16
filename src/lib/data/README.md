# Data Access Layer

This folder contains the abstract data layer interface that separates business logic from database implementation details.

## Architecture

```
┌─────────────────────────────┐
│   Business Logic Layer      │
│  (voteTally, rankings, etc) │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│   IDataLayer Interface      │
│  (dataLayer.ts)             │
└──────────────┬──────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼──────┐      ┌──────▼─────┐
│Web Impl  │      │ Mobile Impl │
│Firestore │      │Firebase RN  │
└──────────┘      └─────────────┘
```

## Usage

### Web (Firestore)

```typescript
// src/lib/firestore.ts
import { setDataLayer } from './data/dataLayer'
import { FirestoreDataLayer } from './firestore-impl'

// During app initialization
setDataLayer(new FirestoreDataLayer(db, auth))
```

### Mobile (Firebase RN)

```typescript
// mobile/src/lib/firebase-impl.ts
import { setDataLayer } from '../shared/dataLayer'
import { FirebaseRNDataLayer } from './firebase-impl'

// During app initialization
setDataLayer(new FirebaseRNDataLayer(db, auth))
```

### Business Logic (Shared)

```typescript
// Works on both web and mobile!
const { dataLayer } = require('./dataLayer')

async function givePoints(groupId, fromUid, allocations) {
  await dataLayer.giveOrTakePoints(groupId, fromUid, allocations)
  // This calls Firestore on web, Firebase RN on mobile
  // Same API, different underlying implementation
}
```

## Files

- **`dataLayer.ts`** - Abstract interface definition
  - 100+ data operations
  - Callback types for subscriptions
  - Global singleton pattern for easy access
  - Type-safe across platforms

## Implementation Checklist

### For Mobile Developers

When building a React Native app, create a `firebase-impl.ts` that implements `IDataLayer`:

- [ ] User operations (getUser, createUser, etc.)
- [ ] Group operations (createGroup, joinGroup, subscriptions)
- [ ] Points transactions (giveOrTakePoints with validation)
- [ ] Notifications (real-time listeners)
- [ ] Court system (appeals, voting, case resolution)
- [ ] Wall posts and comments
- [ ] Plaza physics (events, presence, holds)
- [ ] Badges and shop

Each method should:
1. Use Firebase RN SDK (`@react-native-firebase/firestore`, etc.)
2. Handle offline state gracefully
3. Throw errors with meaningful messages
4. Return same types as web implementation

### Example Implementation Pattern

```typescript
// mobile/src/lib/firebase-impl.ts
import { IDataLayer, UnsubscribeFn, NotificationCallback } from '../shared/dataLayer'

export class FirebaseRNDataLayer implements IDataLayer {
  constructor(private db: FirebaseFirestore, private auth: FirebaseAuth) {}

  async getUser(uid: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(uid).get()
    if (!doc.exists) return null
    return { uid: doc.id, ...doc.data() } as User
  }

  subscribeToNotifications(
    groupId: string,
    uid: string,
    callback: NotificationCallback
  ): UnsubscribeFn {
    const unsubscribe = this.db
      .collection(`groups/${groupId}/notifications`)
      .where('forUid', '==', uid)
      .onSnapshot((snap) => {
        const notifs = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as GroupNotification[]
        callback(notifs)
      })
    return () => unsubscribe()
  }

  // ... implement remaining methods
}
```

## Key Differences Between Web & Mobile

| Aspect | Web (Firestore) | Mobile (Firebase RN) |
|--------|-----------------|---------------------|
| Init | `initializeFirestore()` with IndexedDB | Firebase RN SDK setup |
| Cache | Persistent IndexedDB cache | Firestore mobile cache |
| Transactions | `runTransaction()` same SDK | `runTransaction()` same SDK |
| Listeners | `onSnapshot()` same API | `onSnapshot()` same API |
| Offline | IndexedDB persistence | Mobile SDK persistence |
| Auth | `getAuth()` client-side | Firebase RN auth module |

Good news: The Firebase SDKs (`firebase/firestore`, `firebase/auth`) work identically on web and React Native, so only initialization differs.

## Testing

Each implementation should pass the same test suite:

```typescript
// tests/dataLayer.test.ts
import { describe, it, expect } from 'vitest'

describe('IDataLayer', () => {
  let dataLayer: IDataLayer

  beforeEach(() => {
    dataLayer = getImplementation() // Web or mobile version
  })

  it('should create and retrieve users', async () => {
    await dataLayer.createOrUpdateUser('user1', { displayName: 'Alice' })
    const user = await dataLayer.getUser('user1')
    expect(user?.displayName).toBe('Alice')
  })

  // ... test all operations
})
```

## Next Steps

1. Mobile developers: Copy `dataLayer.ts` to your project
2. Create platform-specific `firebase-impl.ts`
3. Call `setDataLayer()` during app startup
4. Use `getDataLayer()` or inject into screens/logic
5. Share types and business logic modules
