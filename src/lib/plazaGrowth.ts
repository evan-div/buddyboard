/**
 * @file Living-plaza growth + seed logic
 * @mobile-shareable ✅ - Pure functions, no Firebase or rendering deps.
 * @description The rules that turn group activity into plant growth and seeds.
 * Kept free of Three.js/Firestore so it can be unit-tested and reused on mobile.
 *
 * Growth model — "care matters more than time, and plants never die":
 * a plant's stage is the MINIMUM of what wall-clock time allows and what the
 * group's accumulated activity ("vitality") allows. So a neglected plant is
 * capped by nourishment even as days pass, and a busy group's garden races
 * ahead. Stage is monotonic — it never decreases — so inactivity stalls growth
 * (rendered as a quiet, misty dormancy) but can never kill a plant.
 */

// Stage indices: 0 = seedling, 1 = sprout, 2 = young, 3 = mature.
export const MAX_STAGE = 3

// Wall-clock days needed to REACH each stage (index = stage).
export const TIME_DAYS = [0, 1, 3, 7]
// Active group-days (vitality gained since planting) needed to REACH each stage.
export const NOURISH_DAYS = [0, 1, 2, 4]

// Largest stage index whose threshold `value` has met or passed.
export function stageFromThresholds(value: number, thresholds: number[]): number {
  let stage = 0
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) stage = i
  }
  return stage
}

/**
 * Current growth stage of a plant, computed on read (no server writes needed).
 * @param plantedAtMs        epoch ms the plant was created
 * @param plantedAtVitality  group vitality counter at planting time
 * @param nowMs              epoch ms "now"
 * @param groupVitality      group's current vitality counter
 */
export function growthStage(
  plantedAtMs: number,
  plantedAtVitality: number,
  nowMs: number,
  groupVitality: number,
): number {
  const daysElapsed = Math.max(0, (nowMs - plantedAtMs) / 86_400_000)
  const nourishment = Math.max(0, groupVitality - plantedAtVitality)
  const timeStage = stageFromThresholds(daysElapsed, TIME_DAYS)
  const nourishStage = stageFromThresholds(nourishment, NOURISH_DAYS)
  return Math.min(timeStage, nourishStage)
}

// A plant is visually "dormant" (misty, muted) when the group has not been
// active recently. Purely cosmetic — growth stage is unaffected and never drops.
// `recentDayKeys` are the last few dayKeys that still count as "recent" (e.g.
// today and yesterday); dormant when the group's last active day isn't among them.
export function isDormant(lastActiveDay: string | undefined, recentDayKeys: string[]): boolean {
  if (!lastActiveDay) return true
  return !recentDayKeys.includes(lastActiveDay)
}

// ── Seeds ────────────────────────────────────────────────────────────────────
// Seeds are earned by checking in. The first check-in grants a starter seed so
// the plant loop is immediately satisfying; after that, one seed every
// SEED_EVERY consecutive days. Missing a day resets the streak (and thus the
// cadence), rewarding consistency — but you never lose seeds already earned.
export const SEED_EVERY = 3

// How many seeds a check-in that brings the streak to `streak` should grant.
export function seedsForCheckin(streak: number): number {
  if (streak <= 0) return 0
  if (streak === 1) return 1
  return streak % SEED_EVERY === 0 ? 1 : 0
}
