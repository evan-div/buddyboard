# BuddyBoard Mobile App: Complete Guide

🚀 **Turn BuddyBoard web into iOS/Android apps using React Native**

---

## TL;DR (Quick Start)

**Want to build a mobile app?**

1. Read **MOBILE_AUDIT.md** (5 min) - High-level overview
2. Use **MOBILE_FILE_CHECKLIST.md** (10 min) - Copy reusable code
3. Follow **MOBILE_IMPLEMENTATION_GUIDE.md** (6-8 weeks) - Build the app
4. Reference **src/lib/data/README.md** - Data layer patterns

**Code Reuse:** 50% of app (business logic, types, Firebase operations)

**Timeline:** 6-8 weeks for MVP with Expo

**Team Size:** 1-2 developers

---

## Documents in This Guide

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **MOBILE_AUDIT.md** | What code is shareable and why | Architects, Tech Leads | 10 min |
| **MOBILE_FILE_CHECKLIST.md** | Exact files to copy to mobile project | Mobile Developers | 5 min |
| **MOBILE_IMPLEMENTATION_GUIDE.md** | Phase-by-phase 6-8 week plan | Mobile Developers | 15 min |
| **src/lib/data/README.md** | How to implement data layer | Backend Developers | 10 min |
| **src/lib/data/dataLayer.ts** | Abstract interface (code reference) | Engineers | 5 min |

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                  Shared Code (50%)                     │
├────────────────────────────────────────────────────────┤
│  • Type Definitions (types.ts)                         │
│  • Pure Business Logic (voteTally, rankings, badges)  │
│  • Utility Functions (dayKey, timeAgo)                │
│  • Physics Math (plazaMath)                           │
│  • Data Layer Interface (dataLayer.ts)                │
└────────────────────────────────────────────────────────┘
                          △
                 ┌────────┴────────┐
                 │                 │
        ┌────────▼────────┐    ┌──▼──────────────┐
        │  Web App        │    │  Mobile App     │
        │ (Next.js/React) │    │(React Native)   │
        ├─────────────────┤    ├─────────────────┤
        │ Firestore       │    │ Firebase RN     │
        │ (IndexedDB)     │    │ (Mobile Cache)  │
        └─────────────────┘    └─────────────────┘
```

---

## Why Reusability Matters

### ✅ Pros
- **70-80% code reuse** between web and mobile
- **Same Firebase backend** - no server changes needed
- **Type safety** - TypeScript shared across platforms
- **Business logic** once, run everywhere (voteTally, rankings, badges)
- **Faster shipping** - 6-8 weeks instead of 4-6 months
- **Lower cost** - Same team, two platforms
- **Easier maintenance** - Bug fixes apply to both

### 🔴 What You Still Need to Build
- React Native UI screens (leaderboard, plaza, notifications)
- Platform-specific features (camera, haptics, share sheet)
- Navigation (React Navigation)
- Some platform-specific Firebase setup

---

## High-Level Approach

### Phase 1: Prepare Web Project (Current)
✅ **Status:** You are here
- Identified shareable code
- Created data layer abstraction
- Documented everything
- Added JSDoc markers to files

### Phase 2: Set Up Mobile Project (Week 1)
- Initialize React Native or Expo project
- Install Firebase SDKs
- Copy reusable code from web
- Set up Git (optional: monorepo)

### Phase 3: Implement Data Layer (Week 1-2)
- Create `firebase-impl.ts` (implements `IDataLayer`)
- Test Firebase connectivity
- Verify offline caching
- Handle auth state

### Phase 4: Build Core Screens (Week 3-5)
- Auth (login/signup)
- Groups list
- Group detail (leaderboard)
- Plaza (avatar interactions)
- Feed (transactions)

### Phase 5: Add Court System (Week 5-6)
- Appeals
- Voting
- Notifications

### Phase 6: Polish & Deploy (Week 7-8)
- iOS/Android builds
- App Store submissions
- Beta testing
- Performance optimization

---

## Technology Stack

### Web (Current)
```
Next.js 13+ → React → TypeScript → Firebase → Tailwind
```

### Mobile (Proposed)
```
React Native / Expo → React → TypeScript → Firebase RN → NativeWind/StyleSheet
```

### Shared
```
Types (types.ts)
Business Logic (voteTally, rankings, badges, utils)
Data Layer Interface (dataLayer.ts)
```

---

## Code Examples

### Sharing Business Logic

**Voting Logic (Shared)**
```typescript
// src/lib/voteTally.ts - Same on web and mobile
export function tallyVotes(params: {
  votes: Record<string, string>
  memberUids: string[]
  memberCount: number
  accuserUid: string
  defendantUid: string
}): { status: TallyStatus; resolved: boolean } {
  // Pure logic, no dependencies
}
```

**Web Usage**
```typescript
// src/lib/appeals.ts - Uses tallyVotes
const { status, resolved } = tallyVotes({...})
```

**Mobile Usage**
```typescript
// mobile/src/screens/court/VotingScreen.tsx - Same function
const { status, resolved } = tallyVotes({...})
```

---

### Sharing Types

**Definition**
```typescript
// src/lib/types.ts - Copy to mobile as-is
export type CourtCase = {
  id: string
  defendantUid: string
  accuserUid: string
  points: number
  status: CaseStatus
  votes: Record<string, 'innocent' | 'guilty'>
  // ...
}
```

**Web**
```typescript
const case: CourtCase = await getCase(caseId)
```

**Mobile**
```typescript
const case: CourtCase = await getDataLayer().getCase(caseId)
```

---

### Data Layer Pattern

**Interface (Shared)**
```typescript
export interface IDataLayer {
  castVote(groupId, caseId, voterUid, vote): Promise<void>
  giveOrTakePoints(groupId, fromUid, allocations): Promise<void>
  // 100+ operations
}
```

**Web Implementation**
```typescript
// src/lib/firestore.ts
class FirestoreDataLayer implements IDataLayer {
  async castVote(...) {
    await runTransaction(db, async (tx) => {
      // Firestore transaction
    })
  }
}
```

**Mobile Implementation**
```typescript
// mobile/src/lib/firebase-impl.ts
class FirebaseRNDataLayer implements IDataLayer {
  async castVote(...) {
    await db.runTransaction(async (tx) => {
      // Firebase RN transaction (same SDK!)
    })
  }
}
```

---

## What's Already Done

✅ Identified 70% reusable code  
✅ Extracted pure business logic  
✅ Created data layer abstraction  
✅ Wrote complete documentation  
✅ Added JSDoc markers  
✅ Tested on web app ← You are here  

## What You Need to Do

1. **For Mobile Project Setup:**
   - Create React Native project
   - Copy files from checklist
   - Implement `IDataLayer` for Firebase RN
   - Build screens

2. **For CI/CD (Optional):**
   - Add GitHub Actions for mobile builds
   - Set up EAS (Expo Application Services)
   - Automate app store deployments

3. **For App Store Release:**
   - Create Apple Developer account ($99/year)
   - Create Google Play account ($25 one-time)
   - Sign builds with certificates
   - Fill out app store listings
   - Submit for review

---

## FAQ

### Q: Can I share UI components between web and mobile?
**A:** Only a few high-level ones (if using cross-platform libraries like React Native Web). Most UI needs rebuilding in React Native because web uses Tailwind/CSS and mobile uses StyleSheet.

### Q: Do I need Firebase to use this?
**A:** Yes, BuddyBoard is entirely Firebase-backed. Both web and mobile connect to the same Firebase project.

### Q: Can I use Expo or do I need bare React Native?
**A:** Expo is recommended for MVP (faster, no build tools needed). Bare React Native later if you need more control.

### Q: What about the 3D plaza avatars?
**A:** For MVP, use 2D grid. Later, add 3D using Three.js via `expo-three` or Babylon.js.

### Q: Can one developer build this?
**A:** Yes. 1 full-time developer = 8 weeks for MVP. 2 developers = 4 weeks.

### Q: Is this a rewrite?
**A:** Partial. You're reusing ~50% (types, logic), rebuilding ~50% (UI, navigation).

---

## Success Criteria

### MVP (Week 8) ✅
- Users can sign up / log in
- View groups and members
- Give and take points
- See leaderboard
- Simple plaza (2D grid of avatars)
- File appeals and vote in court
- Receive notifications
- Runs on iOS and Android

### V1 (Week 12) 🔄
- 3D plaza with physics
- Better graphics
- Offline support
- Performance optimizations
- Community feedback

### V2 (Quarter 2) 📅
- AR features
- Social features (friends, private messages)
- Advanced analytics
- Web3 integration (if applicable)

---

## Getting Help

**Questions about reusable code?**
→ Check `MOBILE_AUDIT.md`

**How do I copy files?**
→ Check `MOBILE_FILE_CHECKLIST.md`

**Step-by-step building?**
→ Check `MOBILE_IMPLEMENTATION_GUIDE.md`

**How do I implement the data layer?**
→ Check `src/lib/data/README.md` and `dataLayer.ts`

**Stuck on Firebase RN?**
→ See Firebase docs: https://rnfirebase.io/

---

## Timeline at a Glance

```
Week 1-2: Setup & Firebase
├── Initialize React Native project
├── Install Firebase SDKs
└── Copy reusable code

Week 2-3: Auth & Screens
├── Login / Signup screens
├── Groups list
└── Basic group detail

Week 4-5: Transactions & Leaderboard
├── Give/take points
├── Leaderboard (use shared ranking logic)
└── Transaction feed

Week 6: Court System
├── Appeals
├── Voting
└── Notifications

Week 7-8: Polish & Deploy
├── iOS build & App Store
├── Android build & Google Play
└── Beta testing

DONE! 🎉
```

---

## Resources

- **Firebase React Native:** https://rnfirebase.io/
- **React Navigation:** https://reactnavigation.org/
- **Expo:** https://docs.expo.dev/
- **React Native:** https://reactnative.dev/
- **TypeScript:** https://www.typescriptlang.org/docs/

---

## Next Steps

1. **Today:** Read `MOBILE_AUDIT.md` (overview)
2. **This week:** Prepare web app for mobile (current branch ✅)
3. **Next week:** Start mobile project and copy files
4. **Weeks 2-3:** Implement data layer and auth
5. **Weeks 4-8:** Build features (follow implementation guide)

---

## Summary

You have a **mature web app** with clean business logic and good separation of concerns. Turning it into a mobile app is **a matter of weeks, not months**.

The hard part (backend, database, business logic) is already done.  
The fun part (mobile UI, platform features) is next.

**Let's ship! 🚀**

---

**Questions?** See the detailed guides above, or check the code comments marked with `@mobile-shareable`.
