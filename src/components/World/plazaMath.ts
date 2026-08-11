import * as THREE from 'three'
import { mix } from './plazaWalk'

// Pure geometry/physics math for the plaza, kept free of React and rendering
// so it can be unit-tested directly.

// ─── Island outlines ──────────────────────────────────────────────────────────
// A superellipse ("squircle") with a gentle sinusoidal wobble: an island keeps
// its square footprint but the corners are rounded and the edge reads organic.
// The floor, dirt base, grass blades, and physics bounds all follow this line.
//
// Every island is the same size and shares this shape family; only the seven
// numbers below differ, so the archipelago reads as one world whose chunks were
// broken off the same rock rather than as one island stamped out five times.

export const FSIZE = 26

/**
 * One island's outline. Deliberately a flat record of numbers rather than a
 * closure or a list of points: it has to be cheap to hash into a cache key,
 * pinned in a snapshot test, and reasoned about analytically (see the budget
 * on `makeEdgeShape`).
 */
export type EdgeShape = {
  /** Superellipse exponent. 4 is the classic squircle; lower is rounder. */
  exp: number
  /** First harmonic: amplitude, whole cycles around the rim, phase. */
  a1: number; k1: number; p1: number
  /** Second, finer harmonic. */
  a2: number; k2: number; p2: number
}

/**
 * The home island. These are the original constants, and they must stay that
 * way: every rock, blade, tile and physics bound on the plaza is derived from
 * this curve, so changing it moves the world out from under saved plants.
 */
export const HOME_EDGE: EdgeShape = {
  exp: 4,
  a1: 0.025, k1: 5, p1: 1.7,
  a2: 0.015, k2: 9, p2: 0.4,
}

export function edgeRadius(theta: number, edge: EdgeShape = HOME_EDGE): number {
  const c = Math.abs(Math.cos(theta))
  const s = Math.abs(Math.sin(theta))
  // ⚠️ Keep this expression associated exactly as written. With HOME_EDGE it
  // has to reproduce the original plaza outline bit for bit — rewriting it as
  // `1 + (t1 + t2)` moves the home rim by an ulp. plazaEdges.test.ts checks it.
  const base = (FSIZE / 2) / Math.pow(c ** edge.exp + s ** edge.exp, 1 / edge.exp)
  const wobble = 1 + edge.a1 * Math.sin(theta * edge.k1 + edge.p1) + edge.a2 * Math.sin(theta * edge.k2 + edge.p2)
  return base * wobble
}

/** The home island's outline. Most of the plaza is home-only and should say so. */
export function plazaEdgeRadius(theta: number): number {
  return edgeRadius(theta, HOME_EDGE)
}

export function edgeKey(edge: EdgeShape): string {
  return `${edge.exp},${edge.a1},${edge.k1},${edge.p1},${edge.a2},${edge.k2},${edge.p2}`
}

// The extremes are wanted per-frame (camera framing, grass bounds, tile spans)
// and never change for a given shape, so scan once and remember. A closed form
// isn't worth chasing: `exp` varies and the harmonics move the argmax off π/4.
const _extremesCache = new Map<string, { min: number; max: number; extent: number }>()
const EDGE_SCAN = 1440

// A finite scan lands next to each extreme, never exactly on it, so it always
// under-states the true one. Every caller wants a bound it can trust — a camera
// that frames the whole island, a grass square that contains the rim — so widen
// the result past the sampling error rather than reporting the samples. 0.1% is
// ~0.016 units on a 16-unit rim: far more than the miss (~2e-5 relative at this
// step), far less than anything visible.
const EDGE_SCAN_SLACK = 1.001

function edgeExtremes(edge: EdgeShape): { min: number; max: number; extent: number } {
  const key = edgeKey(edge)
  const hit = _extremesCache.get(key)
  if (hit) return hit
  let min = Infinity, max = 0, extent = 0
  for (let i = 0; i < EDGE_SCAN; i++) {
    const theta = (i / EDGE_SCAN) * Math.PI * 2
    const r = edgeRadius(theta, edge)
    if (r < min) min = r
    if (r > max) max = r
    extent = Math.max(extent, Math.abs(Math.cos(theta) * r))
  }
  const out = {
    min: min / EDGE_SCAN_SLACK,
    max: max * EDGE_SCAN_SLACK,
    extent: extent * EDGE_SCAN_SLACK,
  }
  _extremesCache.set(key, out)
  return out
}

/** Closest the rim comes to the island's centre. */
export function edgeMinRadius(edge: EdgeShape = HOME_EDGE): number {
  return edgeExtremes(edge).min
}

/**
 * Furthest the rim gets from the centre — the island's true reach. Note this
 * is well past FSIZE/2: an n=4 superellipse bulges toward its corners, so home
 * reaches ≈15.86, not 13. Layout that assumes FSIZE/2 overlaps by ~20%.
 */
export function edgeMaxRadius(edge: EdgeShape = HOME_EDGE): number {
  return edgeExtremes(edge).max
}

/**
 * Half-width of the smallest axis-aligned box holding the outline. The grass
 * sampler scatters over a square and rejects what falls outside the rim, so its
 * square has to actually contain the rim.
 */
export function edgeMaxExtent(edge: EdgeShape = HOME_EDGE): number {
  return edgeExtremes(edge).extent
}

// ── The amplitude budget ──────────────────────────────────────────────────────
// Two invariants bind what a generated island may look like, and the second is
// much tighter than it looks:
//
//   r(θ) > 0.9·(FSIZE/2)   →  A < 0.10   (r(0) = 13 exactly, whatever exp is)
//   r(π/4) > r(0)          →  A < (g−1)/(g+1),  g = 2^(1/exp)
//
// The second is what keeps every island reading as the same rounded square
// rather than as a blob, and it tightens as `exp` rises: 0.086 at exp 4, 0.072
// at exp 4.8. Capping exp at 4.8 and the summed amplitude at 0.06 leaves ~20%
// headroom for every seed. Widening these buys more dramatic silhouettes at the
// cost of that invariant — a deliberate trade, not a tweak, and the property
// tests in plazaEdges.test.ts are what make you notice you're making it.
export const EXP_RANGE = [3.6, 4.8] as const
export const EDGE_AMPLITUDE_MAX = 0.06

// Whole cycles only. A fractional frequency leaves r(0) ≠ r(2π) — a notch in
// the outline, the dirt column, the grass rejection and the tile test, all at
// the same bearing.
const K1_CHOICES = [3, 4, 5, 6]
const K2_CHOICES = [7, 8, 9, 10, 11]

/**
 * Build an island outline from a seed. Each parameter is drawn through its own
 * avalanche of the seed rather than from a stream: an LCG's consecutive outputs
 * are correlated enough that two islands came out with the same harmonics and
 * amplitudes within 0.001 of each other when this pulled a stream.
 */
export function makeEdgeShape(seed: number): EdgeShape {
  const draw = (salt: number) => mix(seed, salt) / 4294967296
  return {
    exp: EXP_RANGE[0] + draw(1) * (EXP_RANGE[1] - EXP_RANGE[0]),
    a1: 0.018 + draw(2) * 0.022,
    k1: K1_CHOICES[Math.floor(draw(3) * K1_CHOICES.length)],
    p1: draw(4) * Math.PI * 2,
    a2: 0.008 + draw(5) * 0.012,
    k2: K2_CHOICES[Math.floor(draw(6) * K2_CHOICES.length)],
    p2: draw(7) * Math.PI * 2,
  }
}

// ─── Placement grid (living plaza) ────────────────────────────────────────────
// Plants are placed on a square grid of tiles snapped to world XZ. Tile (q, r)
// centers at (q·TILE, r·TILE). A tile is plantable when its center sits inside
// the rounded plaza edge, inset by TILE_MARGIN so trees never poke off the rim.

// A tile is scoped to an island. `island` is optional and absent on plants made
// before the archipelago existed — those are all on 'home'.
export type Tile = { q: number; r: number; island?: string }

// Spacing is set by the mature canopies (~3 units of half-width). Trunks stand
// well clear; the crowns of neighbouring full-grown trees interleave slightly
// high up, which reads as a grove. The margin keeps them off the rounded rim.
export const TILE = 4.6
export const TILE_MARGIN = 3.2

// An island's placement frame: where it sits, how big it is relative to home,
// and the outline it was drawn with. `edge` is optional so a frame can still be
// written down as a literal; it falls back to home's shape.
export type IslandFrame = {
  id: string
  center: { x: number; z: number }
  scale: number
  edge?: EdgeShape
}

export const HOME_FRAME: IslandFrame = { id: 'home', center: { x: 0, z: 0 }, scale: 1, edge: HOME_EDGE }

export function tileIslandId(tile: Tile): string {
  return tile.island ?? HOME_FRAME.id
}

// Tile centre in world space. Tiles are laid out in the island's local frame
// then offset to its position, so every island reuses the same grid math.
export function tileToWorld(tile: Tile, frame: IslandFrame = HOME_FRAME): { x: number; z: number } {
  return {
    x: frame.center.x + tile.q * TILE,
    z: frame.center.z + tile.r * TILE,
  }
}

// Keys are island-scoped so the same (q,r) on two islands never collide.
export function tileKey(tile: Tile): string {
  return `${tileIslandId(tile)}:${tile.q},${tile.r}`
}

// Is this tile's centre inside the plantable area of its island, measured
// against that island's own rim?
export function isTileInside(tile: Tile, frame: IslandFrame = HOME_FRAME): boolean {
  const lx = tile.q * TILE
  const lz = tile.r * TILE
  const r = Math.hypot(lx, lz)
  if (r === 0) return true
  const maxR = edgeRadius(Math.atan2(lz, lx), frame.edge ?? HOME_EDGE) * frame.scale - TILE_MARGIN * frame.scale
  return r <= maxR
}

// All plantable tiles on one island. Keyed on everything that changes the
// answer — two frames sharing an id but not a shape must not share a result.
const _tilesCache = new Map<string, Tile[]>()
export function tilesOnIsland(frame: IslandFrame = HOME_FRAME): Tile[] {
  const edge = frame.edge ?? HOME_EDGE
  const key = `${frame.id}|${frame.scale}|${edgeKey(edge)}`
  const hit = _tilesCache.get(key)
  if (hit) return hit
  const tiles: Tile[] = []
  // Scan out to the island's true reach, not FSIZE/2: the squircle bulges to
  // ~15.9 on the diagonals, so a span derived from FSIZE/2 clips the corners.
  const span = Math.ceil((edgeMaxRadius(edge) * frame.scale) / TILE)
  for (let q = -span; q <= span; q++) {
    for (let r = -span; r <= span; r++) {
      const t: Tile = frame.id === HOME_FRAME.id ? { q, r } : { q, r, island: frame.id }
      if (isTileInside(t, frame)) tiles.push(t)
    }
  }
  _tilesCache.set(key, tiles)
  return tiles
}

// Back-compat alias — the home island's tiles.
export function tilesInsidePlaza(): Tile[] {
  return tilesOnIsland(HOME_FRAME)
}

// Nearest unoccupied plantable tile to a world point across the given islands;
// null if every tile is taken.
export function nearestFreeTile(
  point: { x: number; z: number },
  taken: Set<string>,
  frames: IslandFrame[] = [HOME_FRAME],
): Tile | null {
  let best: Tile | null = null
  let bestD = Infinity
  for (const frame of frames) {
    for (const t of tilesOnIsland(frame)) {
      if (taken.has(tileKey(t))) continue
      const { x, z } = tileToWorld(t, frame)
      const d = (x - point.x) ** 2 + (z - point.z) ** 2
      if (d < bestD) { bestD = d; best = t }
    }
  }
  return best
}

// Pull a position back inside the rounded edge; returns true if it was outside
export function clampToPlazaEdge(pos: THREE.Vector3, margin = 0.45): boolean {
  const r = Math.hypot(pos.x, pos.z)
  if (r === 0) return false
  const maxR = plazaEdgeRadius(Math.atan2(pos.z, pos.x)) - margin
  if (r <= maxR) return false
  const scale = maxR / r
  pos.x *= scale
  pos.z *= scale
  return true
}

// ─── Capsule ground support ───────────────────────────────────────────────────
// Approximate bean geometry constants for effective ground-floor calculation.
// These match the default dims from useBeanDims (bodyWidth=0.5, bodyHeight=0.5).

export const GROUND_Y_APPROX = 0.65   // body center height above group root
export const CAP_HALF_APPROX = 0.225  // capsule half-length (capLen/2)
export const RADIUS_APPROX   = 0.29   // capsule radius

// Ground height for the group origin so the body capsule rests on (never in)
// the floor, exact for any orientation: project the body's local up-axis into
// world space and support the capsule's lowest point.
const _capUp = new THREE.Vector3()
export function capsuleFloorY(q: THREE.Quaternion): number {
  const uY = _capUp.set(0, 1, 0).applyQuaternion(q).y
  return Math.max(0, RADIUS_APPROX + CAP_HALF_APPROX * Math.abs(uY) - GROUND_Y_APPROX * uY)
}

// ─── Lying-down orientation (quaternions) ─────────────────────────────────────
// A knocked-out bean lies with its long (local Y) axis horizontal. Two params
// describe the pose: `heading` (which way the head points, cosmetic) and `roll`
// about the long axis — 0 = face-down (prone), ±π/2 = on a side, π = on its back.
// Euler angles can't express "roll about the long axis" cleanly once the body is
// tipped over, so the grounded states use quaternions.

export const AXIS_X = new THREE.Vector3(1, 0, 0)
export const AXIS_Y = new THREE.Vector3(0, 1, 0)

// Scratch objects are module-private so callers can never alias `out` with
// one of them (which would corrupt the result mid-computation).
const _lq1 = new THREE.Quaternion()
const _lq2 = new THREE.Quaternion()
const _rq1 = new THREE.Quaternion()
const _rq2 = new THREE.Quaternion()
const _rq3 = new THREE.Quaternion()
const _rlong = new THREE.Vector3()

// Build the lying pose: roll about the long axis, tip 90° forward, then head.
export function lyingQuat(out: THREE.Quaternion, heading: number, roll: number): THREE.Quaternion {
  out.setFromAxisAngle(AXIS_Y, heading)
  out.multiply(_lq1.setFromAxisAngle(AXIS_X, Math.PI / 2))
  out.multiply(_lq2.setFromAxisAngle(AXIS_Y, roll))
  return out
}

// Read the (heading, roll) that best describe how a body is currently lying.
export function readLyingPose(q: THREE.Quaternion): { heading: number; roll: number } {
  const L = _rlong.set(0, 1, 0).applyQuaternion(q)          // long axis in world
  const heading = Math.atan2(L.x, L.z)
  // Strip heading and the 90° tip; the residual is the roll about the long axis
  _rq1.setFromAxisAngle(AXIS_X, -Math.PI / 2)
  _rq2.setFromAxisAngle(AXIS_Y, -heading)
  _rq3.copy(_rq1).multiply(_rq2).multiply(q)
  const roll = 2 * Math.atan2(_rq3.y, _rq3.w)
  return { heading, roll }
}
