# Mobile App: Files to Copy from Web Project

Quick reference checklist for copying reusable code to your React Native project.

---

## ✅ COPY THESE FILES (100% Reusable - No Changes Needed)

### Type Definitions & Core Types
```
src/lib/types.ts
```
- Complete type system: User, Group, Transaction, CourtCase, etc.
- Platform-independent, zero dependencies
- **Action:** Copy as-is, no modifications needed

### Pure Business Logic (Fully Tested)

```
src/lib/voteTally.ts + src/lib/voteTally.test.ts
```
- Court voting majority logic
- Auto-resolution rules
- Zero dependencies, 100% testable
- **Action:** Copy both files, run tests to verify

```
src/lib/rankings.ts + src/lib/rankings.test.ts
```
- Leaderboard computation (daily/weekly/monthly/alltime)
- Pure function: `computeRankings(members, transactions, period)`
- Zero dependencies, comprehensive tests
- **Action:** Copy both files

```
src/lib/badges.ts + src/lib/badges.test.ts
```
- Badge definitions (15 achievements)
- Lookup and priority logic
- **Action:** Copy both files

```
src/lib/utils.ts + src/lib/utils.test.ts
```
- `dayKey()`: Timezone-aware calendar day string
- `timeAgo()`: Human-readable time formatting
- **Action:** Copy both files

### Optional Pure Data Files (Lookup Tables)
```
src/lib/avatarDefaults.ts
src/lib/shopItems.ts
src/lib/beanDims.ts
src/lib/timezones.ts (if exists)
```
- Pure data structures, zero dependencies
- Used for UI lookups and defaults
- **Action:** Copy as-is

### 3D Physics Math (If Using 3D Plaza)
```
src/components/World/plazaMath.ts + plazaMath.test.ts
src/components/World/plazaSound.ts (reference for sound effects)
```
- Avatar physics calculations
- Collision and throw math
- **Action:** Copy plazaMath.ts; adapt plazaSound.ts for mobile audio

---

## 🟡 ADAPT THESE FILES (Layer Abstraction)

### Data Access Layer Interface
```
src/lib/data/dataLayer.ts
src/lib/data/README.md
```
- Abstract interface definition (100+ operations)
- **Action:** Copy both, create mobile implementation

### Firebase Integration
**DO NOT copy `src/lib/firebase.ts` directly** — it's web-specific:
- Uses IndexedDB cache (web only)
- Client-side auth checks for SSR (not applicable to mobile)

**Instead:** Create `mobile/src/lib/firebase.ts` with Firebase RN setup:
```typescript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
```

### Data Layer Implementation (Web Reference Only)
```
src/lib/firestore.ts (REFERENCE ONLY - don't copy directly)
src/lib/appeals.ts (REFERENCE ONLY - don't copy directly)
```
- Use these as **reference implementations** only
- Logic patterns can be reused, but adapt to Firebase RN SDK
- **Action:** Read and understand the pattern, implement similarly for mobile
- **Template to follow:**
  - Copy method signatures from `IDataLayer`
  - Use Firebase RN SDK instead of Firestore SDK
  - Return same types as web
  - Same error handling patterns

---

## ❌ DO NOT COPY (Web-Only)

### Server-Side
```
src/app/api/
src/server/
```
- Next.js server endpoints
- Mobile apps don't need a server (Firebase handles auth/DB)

### React Web Components
```
src/components/** (except plazaMath.ts)
src/pages/
src/hooks/ (check each - many are web-specific)
```
- Built with React web APIs
- Need rebuilding in React Native

### Styling
```
src/styles/
globals.css
tailwind.config.*
```
- Tailwind CSS (web only)
- Use React Native StyleSheet or other mobile styling

### Configuration
```
next.config.*
.eslintrc.*
tailwind.config.*
```
- Next.js specific
- Create mobile equivalents

---

## 📋 Copy Command (Bash)

Quick copy for Unix/Linux/macOS:

```bash
# Set up directories
mkdir -p mobile/src/lib/data mobile/src/lib/shared

# Copy core types and business logic
cp src/lib/types.ts mobile/src/lib/shared/
cp src/lib/voteTally.ts mobile/src/lib/shared/
cp src/lib/voteTally.test.ts mobile/src/lib/shared/
cp src/lib/rankings.ts mobile/src/lib/shared/
cp src/lib/rankings.test.ts mobile/src/lib/shared/
cp src/lib/badges.ts mobile/src/lib/shared/
cp src/lib/badges.test.ts mobile/src/lib/shared/
cp src/lib/utils.ts mobile/src/lib/shared/
cp src/lib/utils.test.ts mobile/src/lib/shared/
cp src/lib/avatarDefaults.ts mobile/src/lib/shared/
cp src/lib/shopItems.ts mobile/src/lib/shared/
cp src/lib/beanDims.ts mobile/src/lib/shared/

# Copy data layer
cp -r src/lib/data/ mobile/src/lib/

# Copy physics
cp src/components/World/plazaMath.ts mobile/src/lib/shared/
cp src/components/World/plazaMath.test.ts mobile/src/lib/shared/

echo "✅ Copied all reusable files to mobile/src/lib/"
```

---

## 📐 File Organization in Mobile Project

After copying, structure should be:

```
mobile/
├── src/
│   ├── lib/
│   │   ├── shared/                 # 📋 Copied from web
│   │   │   ├── types.ts            # ✅ Copy as-is
│   │   │   ├── voteTally.ts        # ✅ Copy as-is
│   │   │   ├── voteTally.test.ts   # ✅ Copy as-is
│   │   │   ├── rankings.ts         # ✅ Copy as-is
│   │   │   ├── rankings.test.ts    # ✅ Copy as-is
│   │   │   ├── badges.ts           # ✅ Copy as-is
│   │   │   ├── badges.test.ts      # ✅ Copy as-is
│   │   │   ├── utils.ts            # ✅ Copy as-is
│   │   │   ├── utils.test.ts       # ✅ Copy as-is
│   │   │   ├── avatarDefaults.ts   # ✅ Copy as-is
│   │   │   ├── shopItems.ts        # ✅ Copy as-is
│   │   │   ├── beanDims.ts         # ✅ Copy as-is
│   │   │   ├── plazaMath.ts        # ✅ Copy as-is
│   │   │   └── plazaMath.test.ts   # ✅ Copy as-is
│   │   ├── data/                   # 📋 Copied from web
│   │   │   ├── dataLayer.ts        # ✅ Copy as-is (interface)
│   │   │   ├── README.md           # ✅ Copy as-is (guide)
│   │   │   └── firebase-impl.ts    # 🆕 CREATE THIS (Firebase RN impl)
│   │   └── firebase.ts             # 🆕 CREATE THIS (Firebase RN setup)
│   ├── screens/                    # 🆕 CREATE (React Native screens)
│   ├── navigation/                 # 🆕 CREATE (React Navigation)
│   ├── components/                 # 🆕 CREATE (Reusable UI)
│   └── App.tsx                     # 🆕 CREATE (App entry)
├── app.json                        # Expo config
├── tsconfig.json
└── package.json
```

---

## 🧪 Verification Checklist

After copying, verify:

- [ ] All `.test.ts` files run successfully
  ```bash
  npm test
  ```
- [ ] Type definitions compile without errors
  ```bash
  npx tsc --noEmit
  ```
- [ ] Import paths resolve correctly in your mobile project
- [ ] No missing dependencies in `package.json`
- [ ] No `process.env` or `__DEV__` checks that assume Node.js
- [ ] All Firebase imports use `firebase/` packages (not `@react-native-firebase/`)

---

## Common Issues & Solutions

### Issue: "Cannot find module 'firebase/firestore'"
**Solution:** Ensure Firebase is installed:
```bash
npm install firebase @react-native-firebase/app @react-native-firebase/firestore
```

### Issue: Type errors in copied files
**Solution:** Make sure `types.ts` is copied first, then other files that depend on it

### Issue: Tests fail after copying
**Solution:** Ensure Vitest is installed and configured:
```bash
npm install -D vitest
```

### Issue: DateTimeFormat not working on mobile
**Solution:** `utils.ts` uses `Intl.DateTimeFormat` which works on modern React Native. If issues occur, add polyfill:
```bash
npm install intl
```

---

## Summary

| Category | Copy | Files | Time |
|----------|------|-------|------|
| Types & Logic | ✅ | 15+ files | <10 min |
| Data Layer | 🟡 | Interface + implement | 1-2 hours |
| Firebase Init | 🆕 | Create firebase.ts | 30 min |
| Business Logic | ✅ | No changes needed | Verified |

**Total Setup Time:** ~2-3 hours to copy and verify all files

**Development Time:** 6-8 weeks for full mobile app

---

## Next Steps

1. ✅ Copy all ✅ files using the checklist above
2. ✅ Create `firebase-impl.ts` based on `src/lib/firestore.ts` pattern
3. ✅ Create `firebase.ts` for Firebase RN initialization
4. ✅ Initialize data layer in `App.tsx`
5. ✅ Build screens using `getDataLayer()` for data access
6. See `MOBILE_IMPLEMENTATION_GUIDE.md` for detailed phase-by-phase plan
