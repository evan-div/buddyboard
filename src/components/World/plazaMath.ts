import * as THREE from 'three'

// Pure geometry/physics math for the plaza, kept free of React and rendering
// so it can be unit-tested directly.

// ─── Plaza outline ────────────────────────────────────────────────────────────
// A superellipse ("squircle") with a gentle sinusoidal wobble: the plaza keeps
// its square footprint but the corners are rounded and the edge reads organic.
// The floor, dirt base, grass blades, and physics bounds all follow this line.

export const FSIZE = 26

const EDGE_EXP = 4

export function plazaEdgeRadius(theta: number): number {
  const c = Math.abs(Math.cos(theta))
  const s = Math.abs(Math.sin(theta))
  const base = (FSIZE / 2) / Math.pow(c ** EDGE_EXP + s ** EDGE_EXP, 1 / EDGE_EXP)
  const wobble = 1 + 0.025 * Math.sin(theta * 5 + 1.7) + 0.015 * Math.sin(theta * 9 + 0.4)
  return base * wobble
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

// An island's placement frame: where it sits and how big it is relative to home.
export type IslandFrame = { id: string; center: { x: number; z: number }; scale: number }

export const HOME_FRAME: IslandFrame = { id: 'home', center: { x: 0, z: 0 }, scale: 1 }

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

// Is this tile's centre inside the plantable area of its island? Smaller
// islands get a proportionally smaller margin so they don't lose every tile.
export function isTileInside(tile: Tile, frame: IslandFrame = HOME_FRAME): boolean {
  const lx = tile.q * TILE
  const lz = tile.r * TILE
  const r = Math.hypot(lx, lz)
  if (r === 0) return true
  const maxR = plazaEdgeRadius(Math.atan2(lz, lx)) * frame.scale - TILE_MARGIN * Math.max(0.6, frame.scale)
  return r <= maxR
}

// All plantable tiles on one island, cached per island id.
const _tilesCache = new Map<string, Tile[]>()
export function tilesOnIsland(frame: IslandFrame = HOME_FRAME): Tile[] {
  const hit = _tilesCache.get(frame.id)
  if (hit) return hit
  const tiles: Tile[] = []
  const span = Math.ceil(((FSIZE / 2) * frame.scale) / TILE)
  for (let q = -span; q <= span; q++) {
    for (let r = -span; r <= span; r++) {
      const t: Tile = frame.id === HOME_FRAME.id ? { q, r } : { q, r, island: frame.id }
      if (isTileInside(t, frame)) tiles.push(t)
    }
  }
  _tilesCache.set(frame.id, tiles)
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
