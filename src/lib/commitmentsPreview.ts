/**
 * @file Commitment preview fixtures — a whole lifecycle without the week
 * @mobile-shareable ✅ - Pure functions, no Firebase or rendering deps.
 * @description A commitment takes seven days at its shortest, ninety at its
 * longest, needs two people to start, and pays out from a cron. That makes the
 * feature almost impossible to look at while building it.
 *
 * This builds a deterministic set of fake commitments covering every state a
 * card can render, so preview mode can show the whole lifecycle at once. It
 * mirrors the plaza's own `?preview=1` mode (see readPlazaPreview in
 * MiiPlaza.tsx) — same URL flag, same render-only promise: nothing here is ever
 * written to Firestore.
 *
 * Fixtures are judged by the *real* rules. Progress, outcomes and deadlines all
 * come from commitments.ts, so a preview that looks right is evidence the real
 * logic is right — not a parallel implementation that could drift.
 */

import { dayKey } from './utils'
import { COMMITMENT_TIERS, deadlineFrom } from './commitments'
import type {
  Commitment,
  CommitmentCadence,
  CommitmentParticipant,
  CommitmentStatus,
  SeedRarity,
} from './types'

const DAY_MS = 86_400_000

export type CommitmentPreview = {
  on: boolean
  /** Days to shift "now" by, so a deadline can be walked past on demand. */
  dayOffset: number
}

export const COMMITMENT_PREVIEW_OFF: CommitmentPreview = { on: false, dayOffset: 0 }

/**
 * Reads the same `?preview=1` flag the plaza uses, so one URL turns preview on
 * across both surfaces. `?pactDays=N` seeds the day dial.
 */
export function readCommitmentPreview(): CommitmentPreview {
  if (typeof window === 'undefined') return COMMITMENT_PREVIEW_OFF
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('preview') !== '1') return COMMITMENT_PREVIEW_OFF
    const days = Number(p.get('pactDays'))
    return { on: true, dayOffset: Number.isFinite(days) && days > 0 ? days : 0 }
  } catch {
    return COMMITMENT_PREVIEW_OFF
  }
}

// The URL cannot change without a reload, so the parse is done once and the
// same object handed back forever. useSyncExternalStore demands a stable
// reference — returning a fresh object each call spins React forever.
let cached: CommitmentPreview | null = null

export function commitmentPreviewSnapshot(): CommitmentPreview {
  if (cached === null) cached = readCommitmentPreview()
  return cached
}

// Preview is a browser-only concept; the server always renders it off, which is
// what keeps the client and server markup agreeing on the first paint.
export function commitmentPreviewServerSnapshot(): CommitmentPreview {
  return COMMITMENT_PREVIEW_OFF
}

// Nothing to subscribe to — the value is fixed for the life of the page.
export function subscribeToCommitmentPreview(): () => void {
  return () => {}
}

/** Test seam: drop the memoised parse. */
export function resetCommitmentPreviewCache(): void {
  cached = null
}

export function durationForRarity(rarity: SeedRarity): number {
  return COMMITMENT_TIERS.find((t) => t.rarity === rarity)?.days ?? 7
}

/**
 * The `n` most recent day keys, newest first, optionally skipping today.
 * Uses the same `dayKey` the real mark path writes, so fixture marks and real
 * marks are indistinguishable.
 */
export function recentDayKeys(n: number, timezone?: string, includeToday = true): string[] {
  const start = includeToday ? 0 : 1
  const out: string[] = []
  for (let i = start; i < start + n; i++) out.push(dayKey(timezone, -i))
  return out
}

type Person = { uid: string; displayName: string }

const CAST: Person[] = [
  { uid: 'preview-riley', displayName: 'Riley' },
  { uid: 'preview-sam', displayName: 'Sam' },
  { uid: 'preview-jordan', displayName: 'Jordan' },
]

function participant(
  p: Person,
  joinedAtMs: number,
  markedDays: string[],
  extra: Partial<CommitmentParticipant> = {},
): CommitmentParticipant {
  return {
    uid: p.uid,
    displayName: p.displayName,
    // Derived from the fixture's own clock, never Date.now() — otherwise two
    // calls with identical inputs disagree, and the fixtures stop being fixtures.
    joinedAt: new Date(joinedAtMs),
    markedDays,
    ...extra,
  }
}

type FixtureSpec = {
  id: string
  title: string
  rarity: SeedRarity
  status: CommitmentStatus
  cadence?: CommitmentCadence
  targetPerPeriod?: number
  thresholdPct?: number
  /** Am I in this one, and did I open it? */
  meIn?: boolean
  iCreated?: boolean
  /** How many of the cast join alongside. */
  others?: number
  startedDaysAgo?: number
  /** Days I have marked, newest first. */
  myMarks?: number
  myMarkedToday?: boolean
  otherMarks?: number
  /** Deliberately push the deadline into the past. */
  deadlinePast?: boolean
  myOutcome?: 'kept' | 'missed'
  otherOutcome?: 'kept' | 'missed'
  disputedOther?: boolean
  resolvedHoursAgo?: number
}

// Every state a CommitmentCard can render, spread across all four tiers so each
// rarity's colour and label appears at least once.
const SPECS: FixtureSpec[] = [
  {
    id: 'pv-forming-mine',
    title: 'Read before bed',
    rarity: 'common',
    status: 'forming',
    meIn: true, iCreated: true, others: 1,
  },
  {
    id: 'pv-forming-alone',
    title: 'Cold shower every morning',
    rarity: 'uncommon',
    status: 'forming',
    meIn: true, iCreated: true, others: 0,
  },
  {
    id: 'pv-forming-open',
    title: 'Couch to 5K, together',
    rarity: 'rare',
    status: 'forming',
    meIn: false, others: 2,
  },
  {
    id: 'pv-active-ontrack',
    title: 'Gym three times a week',
    rarity: 'rare',
    status: 'active',
    cadence: 'weekly', targetPerPeriod: 3, thresholdPct: 80,
    meIn: true, iCreated: true, others: 1,
    startedDaysAgo: 12, myMarks: 11, otherMarks: 6,
  },
  {
    id: 'pv-active-behind',
    title: 'No phone after 10pm',
    rarity: 'legendary',
    status: 'active',
    meIn: true, others: 1,
    startedDaysAgo: 30, myMarks: 6, otherMarks: 27,
  },
  {
    id: 'pv-active-marked',
    title: 'Practice guitar',
    rarity: 'common',
    status: 'active',
    meIn: true, others: 1,
    startedDaysAgo: 4, myMarks: 4, myMarkedToday: true, otherMarks: 3,
  },
  {
    id: 'pv-active-due',
    title: 'Write morning pages',
    rarity: 'uncommon',
    status: 'active',
    meIn: true, iCreated: true, others: 1,
    // Marked all 14 days, so hitting "Resolve now" pays out rather than
    // quietly failing — this is the fixture the resolver button is for.
    startedDaysAgo: 14, myMarks: 14, otherMarks: 14,
    deadlinePast: true,
  },
  {
    id: 'pv-resolved-kept',
    title: 'Walk 10k steps',
    rarity: 'legendary',
    status: 'resolved',
    meIn: true, others: 1,
    startedDaysAgo: 90, myMarks: 84, otherMarks: 80,
    myOutcome: 'kept', otherOutcome: 'kept',
    resolvedHoursAgo: 3,
  },
  {
    id: 'pv-resolved-missed',
    title: 'Learn 20 words of Greek',
    rarity: 'rare',
    status: 'resolved',
    meIn: true, others: 1,
    startedDaysAgo: 30, myMarks: 4, otherMarks: 26,
    myOutcome: 'missed', otherOutcome: 'kept',
    resolvedHoursAgo: 6,
  },
  {
    id: 'pv-resolved-disputed',
    title: 'Meditate daily',
    rarity: 'uncommon',
    status: 'resolved',
    meIn: true, others: 1,
    startedDaysAgo: 14, myMarks: 13, otherMarks: 2,
    myOutcome: 'kept', otherOutcome: 'kept',
    disputedOther: true,
    resolvedHoursAgo: 10,
  },
  {
    id: 'pv-resolved-stale',
    title: 'Stretch after running',
    rarity: 'common',
    status: 'resolved',
    meIn: true, others: 1,
    startedDaysAgo: 7, myMarks: 7, otherMarks: 6,
    myOutcome: 'kept', otherOutcome: 'kept',
    // Past the 48h window, so the Dispute affordance should be gone.
    resolvedHoursAgo: 72,
  },
  {
    id: 'pv-cancelled',
    title: 'Dry January',
    rarity: 'legendary',
    status: 'cancelled',
    meIn: true, iCreated: true, others: 1,
  },
]

/**
 * Build the fixture set. Deterministic — the same inputs always produce the
 * same commitments, matching this codebase's no-randomness-in-logic stance.
 */
export function previewCommitments(o: {
  uid: string
  displayName: string
  nowMs: number
  timezone?: string
}): Commitment[] {
  const me: Person = { uid: o.uid, displayName: o.displayName }

  return SPECS.map((s) => {
    const durationDays = durationForRarity(s.rarity)
    const cadence: CommitmentCadence = s.cadence ?? 'daily'
    const startedDaysAgo = s.startedDaysAgo ?? 0
    const startedAtMs = o.nowMs - startedDaysAgo * DAY_MS

    const participants: Record<string, CommitmentParticipant> = {}
    // Everyone signed up while it was forming, the day before it started.
    const joinedAtMs = startedAtMs - DAY_MS

    if (s.meIn !== false) {
      participants[me.uid] = participant(
        me,
        joinedAtMs,
        recentDayKeys(s.myMarks ?? 0, o.timezone, s.myMarkedToday ?? false),
        s.myOutcome
          ? { outcome: s.myOutcome, seedAwarded: s.myOutcome === 'kept' ? s.rarity : undefined }
          : {},
      )
    }

    for (let i = 0; i < (s.others ?? 0); i++) {
      const other = CAST[i % CAST.length]
      participants[other.uid] = participant(
        other,
        joinedAtMs,
        recentDayKeys(s.otherMarks ?? 0, o.timezone, true),
        {
          ...(s.otherOutcome
            ? {
                outcome: s.otherOutcome,
                seedAwarded: s.otherOutcome === 'kept' ? s.rarity : undefined,
              }
            : {}),
          ...(s.disputedOther && i === 0 ? { caseId: 'preview-case' } : {}),
        },
      )
    }

    const creator = s.iCreated ? me : CAST[0]
    const started = s.status === 'active' || s.status === 'resolved'

    // A due fixture is pushed just past its deadline; everything else is left
    // with whatever time its start date implies.
    const deadline = started
      ? s.deadlinePast
        ? new Date(o.nowMs - 2 * 3_600_000)
        : deadlineFrom(startedAtMs, durationDays)
      : undefined

    return {
      id: s.id,
      title: s.title,
      createdBy: creator.uid,
      createdByName: creator.displayName,
      status: s.status,
      durationDays,
      rarity: s.rarity,
      cadence,
      targetPerPeriod: s.targetPerPeriod ?? 1,
      thresholdPct: s.thresholdPct ?? 80,
      createdAt: new Date(startedAtMs - DAY_MS),
      startedAt: started ? new Date(startedAtMs) : undefined,
      deadline,
      resolvedAt:
        s.resolvedHoursAgo !== undefined
          ? new Date(o.nowMs - s.resolvedHoursAgo * 3_600_000)
          : s.status === 'cancelled'
            ? new Date(o.nowMs - DAY_MS)
            : undefined,
      participants,
    }
  })
}
