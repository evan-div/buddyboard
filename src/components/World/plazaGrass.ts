/**
 * @file Grass density across the archipelago
 * @description How thick each island's grass is drawn, given where the camera
 * is. Every island carries a full field of blade positions; what varies is how
 * many of them get rendered.
 *
 * The blades are by far the most expensive thing in the scene, and five islands
 * of them at full density is not affordable. But an island seen from across the
 * archipelago is a few dozen pixels tall — it needs a fraction of the blades to
 * read as grass, and the checkered ground texture underneath carries the rest.
 * So density follows how much of the screen the island actually covers.
 *
 * Pure math, no THREE or React, so the thresholds can be unit-tested.
 */

/** Never bald: every island keeps some grass, however far away it is. */
export const GRASS_MIN_FRACTION = 0.06

/**
 * Density is quantised into steps and only changes on a step boundary. Blades
 * appearing one at a time as you drift toward an island reads as flickering;
 * a step is a change you don't notice because it happens all at once.
 */
export const GRASS_STEPS = 8

/** Coverage at which an island is drawn at full density. */
const FULL_COVERAGE = 0.55

/**
 * Roughly how much of the viewport's height an island's diameter spans, from
 * its radius and the camera's distance and vertical field of view.
 */
export function screenCoverage(rimRadius: number, distance: number, fovDeg: number): number {
  if (distance <= 0) return 1
  const halfHeightAtDistance = Math.tan((fovDeg * Math.PI) / 360) * distance
  if (halfHeightAtDistance <= 0) return 1
  return Math.min(1, rimRadius / halfHeightAtDistance)
}

/** Fraction of an island's blades to draw at the given screen coverage. */
export function grassFraction(coverage: number): number {
  const t = Math.max(0, Math.min(1, coverage / FULL_COVERAGE))
  // Squared so the thinning is gentle where you can see it and aggressive
  // where you can't: an island at a third of full coverage keeps ~11%.
  return GRASS_MIN_FRACTION + (1 - GRASS_MIN_FRACTION) * t * t
}

/** The quantised density step for a coverage, 0..GRASS_STEPS. */
export function grassStep(coverage: number): number {
  return Math.round(grassFraction(coverage) * GRASS_STEPS)
}

/** How many of an island's `capacity` blades to render at a given step. */
export function grassCountFor(capacity: number, step: number): number {
  const clamped = Math.max(0, Math.min(GRASS_STEPS, step))
  const count = Math.round((capacity * clamped) / GRASS_STEPS)
  // Always at least one blade, so an island is never literally bald, and never
  // more than we generated.
  return Math.max(1, Math.min(capacity, count))
}
