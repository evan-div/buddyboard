# Deploying BuddyBoard

BuddyBoard's app code deploys however you host Next.js, but two things live in
Firebase and are **not** deployed by app hosting or CI — they must be pushed to
Firebase manually whenever they change:

- **Firestore security rules** — `firestore.rules`
- **Firestore indexes** — `firestore.indexes.json`

If you add a new collection, change a `match` block, or add a query that needs a
composite index, you have to deploy these or the app will hit `permission-denied`
(rules) or `failed-precondition` (missing index) at runtime.

> ⚠️ The rules changed again with the archipelago (members may now bump
> `plazaPointsGiven` on the group doc). **Redeploy `firestore.rules`** or giving
> points will fail with `permission-denied` and islands will never unlock.

> Heads up: deploying rules **replaces the entire live ruleset** with the file's
> contents. That's fine — `firestore.rules` is the source of truth and holds all
> rules, not a diff — just know it's a full replace, not a merge.

---

## Option A — Firebase Console (no tools, fastest for a one-off)

Best when you just need to push a rules change and don't want to install anything.

1. Open the [Firebase Console](https://console.firebase.google.com/) → your
   project (`BuddyboardPrototype`) → **Firestore Database** → **Rules** tab.
2. Select all in the editor (`Cmd/Ctrl+A`), delete, and paste the full contents
   of [`firestore.rules`](./firestore.rules).
3. Click **Publish**. A new entry appears in the version history on the left with
   the current timestamp — that's your confirmation.

Indexes can likewise be edited under the **Indexes** tab, but the CLI (below) is
easier for those since it reads `firestore.indexes.json` directly.

---

## Option B — Firebase CLI (repeatable, does rules + indexes together)

### Run it without installing anything (recommended)

`npx` runs the CLI from a per-user cache — no global install, no permission
issues. Run these from the **repo root**:

```bash
npx firebase-tools login        # opens a browser to authenticate (first time only)
npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
npx firebase-tools deploy --only firestore:indexes --project YOUR_PROJECT_ID
# …or both at once:
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

`YOUR_PROJECT_ID` is the value of `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in your
`.env` (or the project name shown in the Firebase console).

The first `npx` run prompts to fetch `firebase-tools` — answer `y`.

### Install the CLI permanently (if you deploy often)

On macOS, a plain `npm install -g firebase-tools` usually fails with
`EACCES: permission denied … /usr/local/lib/node_modules` because the global
package directory isn't user-writable. **Don't reach for `sudo`** — it leaves
root-owned files that cause more of the same later. Point npm's global prefix at
a directory you own instead:

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g firebase-tools
```

Then the commands drop the `npx firebase-tools` prefix and become plain
`firebase …`:

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

### Pin the project so you can skip `--project`

The repo has no `.firebaserc`, so the CLI doesn't know your default project.
Create one once and every future deploy targets it automatically:

```bash
npx firebase-tools use --add     # pick your project, alias it "default"
```

---

## After deploying rules

Verify the new collections work end-to-end:

- Open the app's **Plaza**, tap **Check in for today** — should succeed and
  (on your first check-in) hand you a seed.
- Tap **🌱 Plant**, place a seed, and reload — the plant should persist.

If either fails with a `permission-denied`, the rules didn't publish. The app
also logs a throttled `[plaza] … permission-denied` warning in the browser
console pointing back to this step.

## Previewing plaza growth without waiting days

Plants grow on `min(elapsed time, group activity)`, so watching a tree mature
normally takes a week of real check-ins. **Preview mode** fast-forwards the
*rendering* so you can see every stage immediately.

Add `?preview=1` to the plaza URL:

```
/group/YOUR_GROUP_ID?preview=1
```

An orange **⏩ preview** panel appears at the top-left. Tap it to expand, then:

- Tap **Seedling / Sprout / Young / Mature** to jump straight to that stage.
- Tap **🌿 One of each** to drop every species on the tiles nearest the middle —
  combined with the stage buttons, that shows all plant forms at any maturity.
- Tap an **island emoji** to jump the group's points-given to that island's
  unlock threshold and watch the archipelago rise (`reset` returns to the real
  number). Or pass `?preview=1&plazaPoints=1500` directly.
- Seeds are **unlimited** in preview (the Plant button reads `🌱 Plant · ∞`), and
  anything planted while previewing is **local to your device only** — it is
  never written to Firestore, so testing never litters the group's real island.
  The `✕ N` button clears them; exiting preview clears them too.
- Nudge **Days** and **Vitality** separately to watch the `min(time, care)` rule
  in action — raising Days alone will *not* grow anything, which is the whole
  point of the growth model.
- Tap **Exit preview** to return to real values.

This works on any build (including a deployed one), which matters when testing
on a phone — you type the short URL once and everything after that is tap-driven.
It is **render-only**: nothing is written to Firestore, no other member sees it,
and reloading without the param returns to reality.

Optional shortcuts if you prefer to start at a specific point:
`?preview=1&plazaDays=7&plazaVitality=4`.

Stage thresholds live in `src/lib/plazaGrowth.ts` (`TIME_DAYS` / `NOURISH_DAYS`)
and are unit-tested; the preset buttons derive from them, so they can't drift.

## What each Firebase config file is

| File | Purpose | Deploy command |
| --- | --- | --- |
| `firestore.rules` | Security rules (who can read/write what) | `--only firestore:rules` |
| `firestore.indexes.json` | Composite indexes for multi-field queries | `--only firestore:indexes` |
| `firebase.json` | Points the CLI at the two files above | (config only, not deployed) |
