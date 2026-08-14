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

> ⚠️ Commitments need **both** files redeployed:
> - `firestore.rules` — adds the `commitments` collection, and widens `cases`
>   so a commitment dispute can be filed by the accuser rather than only by the
>   defendant. Without it, opening a commitment or disputing one fails with
>   `permission-denied`.
> - `firestore.indexes.json` — adds a **collection-group** index on
>   `commitments` (`status`, `deadline`). Without it the hourly resolver returns
>   500 and nothing ever pays out. The index takes a few minutes to build.

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

---

## Scheduled commitment resolution

`vercel.json` registers an hourly cron against `/api/commitments/resolve`. That
route settles every commitment whose deadline has passed — paying out seeds and
sending the finish-line push — and it is the only part of the app that does
anything on a clock.

It needs two environment variables set on the host:

| Variable | Purpose |
| --- | --- |
| `CRON_SECRET` | Shared secret Vercel sends as `Authorization: Bearer …`. The route **fails closed**: if this is unset, every request gets a 401 and nothing resolves. |
| `FIREBASE_SERVICE_ACCOUNT` | The same service-account JSON push already uses. Its token requests the `datastore` scope, which is what lets the route read and write Firestore over REST. |

To exercise it by hand against a local build:

```bash
npm run build
CRON_SECRET=dev-secret npx next start -p 3000 &
curl -H "Authorization: Bearer dev-secret" localhost:3000/api/commitments/resolve
```

It answers `{"due":N,"resolved":N,"skipped":N,"pushed":N}`. Calling it twice is
safe and the second call resolves nothing — each write batch carries an
`updateTime` precondition, so a commitment somebody else already settled fails
the batch instead of paying out again. That guard matters: Vercel Cron delivers
**at-least-once**, and the Commitments tab sweeps due commitments client-side
too, so more than one resolver genuinely does race here.

If the route returns 500 with a `Query failed` detail, the collection-group
index has not finished building — see the rules/index warning at the top.
