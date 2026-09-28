/**
 * @file Commitment rules — durations, marks, thresholds, and seed rarity
 * @mobile-shareable ✅ - Pure functions, no Firebase or rendering deps.
 * @description The rules that turn a kept promise into a seed. Kept free of
 * Firestore and Three.js so it can be unit-tested, reused on mobile, and — the
 * reason that matters most here — imported by the server-side cron route that
 * resolves commitments at their deadline.
 *
 * Payout model — "the longer you hold, the rarer the seed":
 * a commitment names a goal, a window, and a bar to clear. Each participant is
 * judged on their own marks, so one person going quiet never costs anybody else
 * their seed. Failing costs nothing — you simply don't get the seed.
 */

import type {
  Commitment,
  CommitmentCadence,
  GroupMember,
  SeedRarity,
} from './types'

// Ordered weakest to strongest. Index doubles as a comparable rank.
export const RARITY_ORDER: SeedRarity[] = ['common', 'uncommon', 'rare', 'legendary']

// Wall-clock days a commitment must run to pay out each rarity. These line up
// with the existing streak_7 / streak_30 badges, and 90 days is deliberately
// reachable — a legendary nobody ever earns is just decoration.
export const COMMITMENT_TIERS: { days: number; rarity: SeedRarity }[] = [
  { days: 7, rarity: 'common' },
  { days: 14, rarity: 'uncommon' },
  { days: 30, rarity: 'rare' },
  { days: 90, rarity: 'legendary' },
]

// Creators set their own bar, so these floors are what stop a 90-day pact with
// a 1-mark-a-month target from minting legendaries for free.
export const MIN_THRESHOLD_PCT = 50
export const MAX_THRESHOLD_PCT = 100
export const MIN_TARGET_PER_PERIOD = 1
export const MAX_TITLE_LENGTH = 120

// How long after resolution a co-participant may contest someone's outcome.
export const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000

const DAY_MS = 86_400_000

// ── Rarity ───────────────────────────────────────────────────────────────────

// Rarity of the longest tier this duration has reached. Mirrors the threshold
// walk in plazaGrowth.stageFromThresholds — anything short of the first tier is
// still a common, never nothing.
export function rarityForDuration(days: number): SeedRarity {
  let rarity: SeedRarity = 'common'
  for (const tier of COMMITMENT_TIERS) {
    if (days >= tier.days) rarity = tier.rarity
  }
  return rarity
}

// True only for the exact tier lengths offered in the creation flow.
export function isValidDuration(days: number): boolean {
  return COMMITMENT_TIERS.some((t) => t.days === days)
}

export function rarityRank(r: SeedRarity): number {
  return RARITY_ORDER.indexOf(r)
}

// ── Periods ──────────────────────────────────────────────────────────────────

// The bucket a given day falls into. Daily commitments bucket per day; weekly
// ones bucket by ISO week, so a week that straddles New Year still counts once.
export function periodKeyFor(cadence: CommitmentCadence, dayKey: string): string {
  if (cadence === 'daily') return dayKey
  return isoWeekKey(dayKey)
}

// ISO-8601 week key (e.g. "2026-W01") for a YYYY-MM-DD day key. ISO weeks are
// Thursday-anchored: the week belongs to whichever year its Thursday lands in,
// which is why 2025-12-29 and 2026-01-01 are both 2026-W01.
export function isoWeekKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))

  // Shift to the Thursday of this week (Mon=0 … Sun=6).
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)

  const isoYear = date.getUTCFullYear()

  // Jan 4th is always in ISO week 1; find that week's Thursday.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7
  const week1Thursday = new Date(Date.UTC(isoYear, 0, 4 - jan4DayNum + 3))

  const week = 1 + Math.round((date.getTime() - week1Thursday.getTime()) / (7 * DAY_MS))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// How many periods the commitment's window contains. A 30-day weekly commitment
// spans 5 partial-or-full weeks; rounding up keeps the last stub week countable
// rather than silently unwinnable.
export function periodsInWindow(cadence: CommitmentCadence, durationDays: number): number {
  if (durationDays <= 0) return 0
  if (cadence === 'daily') return durationDays
  return Math.ceil(durationDays / 7)
}

// ── Marks ────────────────────────────────────────────────────────────────────

// Day keys are YYYY-MM-DD, so lexicographic comparison is chronological.
// Both bounds inclusive.
export function marksInWindow(
  markedDays: string[],
  startDayKey: string,
  endDayKey: string,
): string[] {
  return markedDays.filter((d) => d >= startDayKey && d <= endDayKey)
}

// Periods in which the participant hit the target. Marks are deduped defensively
// — arrayUnion already guarantees it on the write side, but a period must never
// be satisfied twice by the same day.
export function qualifyingPeriods(
  markedDays: string[],
  cadence: CommitmentCadence,
  targetPerPeriod: number,
): number {
  const counts = new Map<string, number>()
  for (const day of new Set(markedDays)) {
    const key = periodKeyFor(cadence, day)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const target = Math.max(MIN_TARGET_PER_PERIOD, targetPerPeriod)
  let qualifying = 0
  for (const count of counts.values()) {
    if (count >= target) qualifying++
  }
  return qualifying
}

export type CommitmentRules = Pick<
  Commitment,
  'cadence' | 'targetPerPeriod' | 'thresholdPct' | 'durationDays'
>

export type Progress = { done: number; total: number; pct: number }

// Periods cleared vs periods available. `pct` is floored so a progress bar never
// reads 100% until the bar is genuinely met.
export function commitmentProgress(rules: CommitmentRules, markedDays: string[]): Progress {
  const total = periodsInWindow(rules.cadence, rules.durationDays)
  const done = Math.min(qualifyingPeriods(markedDays, rules.cadence, rules.targetPerPeriod), total)
  return { done, total, pct: total === 0 ? 0 : Math.floor((done / total) * 100) }
}

// Did this participant hold up their end? Integer comparison rather than
// comparing floating-point percentages, so 4/5 at an 80% bar is never a near miss.
export function metThreshold(rules: CommitmentRules, markedDays: string[]): boolean {
  const total = periodsInWindow(rules.cadence, rules.durationDays)
  if (total === 0) return false
  const done = qualifyingPeriods(markedDays, rules.cadence, rules.targetPerPeriod)
  return done * 100 >= rules.thresholdPct * total
}

// ── Seed inventory ───────────────────────────────────────────────────────────
// `GroupMember.seeds` predates rarity and is read in three places, so it is left
// alone and treated as the common bucket. New rarities accumulate in
// `seedsByRarity`. Nothing needs migrating and no existing read site changes.

export type SeedHolder = Pick<GroupMember, 'seeds' | 'seedsByRarity'>

export function seedInventory(m: SeedHolder | undefined | null): Record<SeedRarity, number> {
  const by = m?.seedsByRarity ?? {}
  return {
    common: (m?.seeds ?? 0) + (by.common ?? 0),
    uncommon: by.uncommon ?? 0,
    rare: by.rare ?? 0,
    legendary: by.legendary ?? 0,
  }
}

export function totalSeeds(m: SeedHolder | undefined | null): number {
  const inv = seedInventory(m)
  return RARITY_ORDER.reduce((sum, r) => sum + inv[r], 0)
}

export function hasSeed(m: SeedHolder | undefined | null, rarity: SeedRarity): boolean {
  return seedInventory(m)[rarity] > 0
}

// Which document field to decrement when spending a seed of this rarity.
// Commons drain the legacy counter first so old inventories are consumed before
// new ones. Returns null when the member has none of that rarity.
export function seedSpendField(
  m: SeedHolder | undefined | null,
  rarity: SeedRarity,
): string | null {
  if (rarity === 'common') {
    if ((m?.seeds ?? 0) > 0) return 'seeds'
    if ((m?.seedsByRarity?.common ?? 0) > 0) return 'seedsByRarity.common'
    return null
  }
  return (m?.seedsByRarity?.[rarity] ?? 0) > 0 ? `seedsByRarity.${rarity}` : null
}

// ── Concurrency ──────────────────────────────────────────────────────────────
// One live commitment per rarity tier per person. You can run a legendary, a
// rare, an uncommon and a common side by side, but never two of the same tier —
// which is exactly the shape that would let someone farm a rarity.

export function isLive(c: Pick<Commitment, 'status'>): boolean {
  return c.status === 'forming' || c.status === 'active'
}

export function activeRarities(
  commitments: Pick<Commitment, 'status' | 'rarity' | 'participants'>[],
  uid: string,
): Set<SeedRarity> {
  const held = new Set<SeedRarity>()
  for (const c of commitments) {
    if (isLive(c) && c.participants?.[uid]) held.add(c.rarity)
  }
  return held
}

export function canJoinRarity(
  commitments: Pick<Commitment, 'status' | 'rarity' | 'participants'>[],
  uid: string,
  rarity: SeedRarity,
): boolean {
  return !activeRarities(commitments, uid).has(rarity)
}

// ── Window helpers ───────────────────────────────────────────────────────────

export function deadlineFrom(startedAtMs: number, durationDays: number): Date {
  return new Date(startedAtMs + durationDays * DAY_MS)
}

export function isDue(
  c: Pick<Commitment, 'status' | 'deadline'>,
  nowMs: number,
): boolean {
  return c.status === 'active' && !!c.deadline && c.deadline.getTime() <= nowMs
}

export function disputeWindowOpen(
  c: Pick<Commitment, 'status' | 'resolvedAt'>,
  nowMs: number,
): boolean {
  if (c.status !== 'resolved' || !c.resolvedAt) return false
  return nowMs - c.resolvedAt.getTime() <= DISPUTE_WINDOW_MS
}

// ── Draft validation ─────────────────────────────────────────────────────────

export type CommitmentDraft = {
  title: string
  durationDays: number
  cadence: CommitmentCadence
  targetPerPeriod: number
  thresholdPct: number
}

// The most a period can be worth. A daily commitment buckets by day key and
// marks dedupe, so a day can only ever be marked once — a daily target above 1
// would be permanently unreachable.
export function maxTargetPerPeriod(cadence: CommitmentCadence): number {
  return cadence === 'daily' ? 1 : 7
}

// Returns a human-readable problem, or null when the draft is good to create.
export function validateDraft(d: CommitmentDraft): string | null {
  const title = d.title.trim()
  if (!title) return 'Give the commitment a goal'
  if (title.length > MAX_TITLE_LENGTH) return `Keep the goal under ${MAX_TITLE_LENGTH} characters`
  if (!isValidDuration(d.durationDays)) return 'Pick one of the offered durations'
  if (!Number.isInteger(d.targetPerPeriod)) return 'Target must be a whole number'
  if (d.targetPerPeriod < MIN_TARGET_PER_PERIOD) return 'Target must be at least 1'
  if (d.targetPerPeriod > maxTargetPerPeriod(d.cadence)) {
    return d.cadence === 'daily'
      ? 'A daily commitment is marked once a day'
      : 'A weekly target cannot exceed 7'
  }
  if (!Number.isInteger(d.thresholdPct)) return 'Threshold must be a whole number'
  if (d.thresholdPct < MIN_THRESHOLD_PCT) return `Threshold must be at least ${MIN_THRESHOLD_PCT}%`
  if (d.thresholdPct > MAX_THRESHOLD_PCT) return 'Threshold cannot exceed 100%'
  return null
}

// One-line plain-English statement of the bar, shown on the join card so nobody
// opts into a commitment without seeing what clearing it actually takes.
export function describeRules(rules: CommitmentRules): string {
  const periods = periodsInWindow(rules.cadence, rules.durationDays)
  const needed = Math.ceil((rules.thresholdPct * periods) / 100)
  if (rules.cadence === 'daily') {
    return `Check in on ${needed} of ${periods} days`
  }
  return `${rules.targetPerPeriod}× a week, in ${needed} of ${periods} weeks`
}
