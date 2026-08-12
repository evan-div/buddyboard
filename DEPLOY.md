# Deploying BuddyBoard

BuddyBoard's app code deploys however you host Next.js. Two more things live in
Firebase rather than in the app bundle, so a merge alone doesn't change what's
enforced in production:

- **Firestore security rules** — `firestore.rules`
- **Firestore indexes** — `firestore.indexes.json`

If you add a new collection, change a `match` block, or add a query that needs a
composite index, these have to reach Firebase or the app will hit
`permission-denied` (rules) or `failed-precondition` (missing index) at runtime.

## These now deploy themselves on merge

`.github/workflows/deploy-firestore-rules.yml` deploys both files whenever a
push to `main` changes either one. **In the normal case you don't have to do
anything** — merge the PR and the rules follow.

It needs one credential, set once, under **Settings → Secrets and variables →
Actions**:

| Secret | What it is |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | *Preferred.* Service-account JSON holding only the **Firebase Rules Admin** role, so a leak can't reach your data. |
| `FIREBASE_TOKEN` | Fallback. Output of `firebase login:ci`. Simpler, but carries your whole Google account's Firebase access. |

Set either one; the workflow prefers the service account. Without a credential
the run fails loudly with a pointer back here rather than passing silently. The
project ID defaults to `buddyboardprototype` — override it with a
`FIREBASE_PROJECT_ID` repository *variable* if that ever changes.

You still need the manual path below when: the credential isn't configured yet,
you want rules live **before** the code that needs them (safe, since rule
additions don't affect the running app), or you're pushing rules from a branch
that hasn't merged. The workflow can also be re-run by hand from the **Actions**
tab via **Run workflow**, with no commit needed.

> Heads up: deploying rules **replaces the entire live ruleset** with the file's
> contents. That's fine — `firestore.rules` is the source of truth and holds all
> rules, not a diff — just know it's a full replace, not a merge. Indexes are
> additive: deleting one needs an interactive confirmation CI can't give, so a
> workflow run only ever creates missing indexes.

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

## Previewing plaza growth and islands without earning them

Plants grow on `min(elapsed time, group activity)`, so watching a tree mature
normally takes a week of real check-ins — and the islands past home cost
thousands of points given. **Preview mode** fast-forwards the *rendering* so you
can see every stage, and every island, immediately.

Add `?preview=1` to the plaza URL:

```
/group/YOUR_GROUP_ID?preview=1
```

An orange **⏩ preview** panel appears at the top-left. Tap it to expand, then:

- Tap **Seedling / Sprout / Young / Mature** to jump straight to that stage.
- Tap **🌿 One of each** to drop every species on the tiles nearest the middle of
  the island you are standing on — combined with the stage buttons, that shows
  all plant forms at any maturity.
- **Raise land**: tap an **island emoji** to jump the group's points-given to that
  island's unlock threshold and watch the archipelago rise, **all** to raise every
  island at once, or `reset` to return to the real number. Or pass
  `?preview=1&plazaPoints=1500` directly.
- **Fly to**: tap an island's name to glide the camera out and park on it — orbit,
  zoom and plant there exactly as you can at home. Islands the group hasn't
  raised yet are greyed out; tap the one you're already on to re-centre after
  orbiting away. Lowering the points (or leaving preview) while you're standing
  on a satellite flies you home instead of stranding the camera in empty sky.
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
Island thresholds and the camera framing a visit uses live in
`src/components/World/plazaIslands.ts` (`ISLANDS`, `islandView`), also unit-tested.

## What each Firebase config file is

| File | Purpose | Deploy command |
| --- | --- | --- |
| `firestore.rules` | Security rules (who can read/write what) | `--only firestore:rules` |
| `firestore.indexes.json` | Composite indexes for multi-field queries | `--only firestore:indexes` |
| `firebase.json` | Points the CLI at the two files above | (config only, not deployed) |
