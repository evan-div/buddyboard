/**
 * @file Archipelago layout — the group's islands and how they are earned
 * @description The plaza starts as a single island and grows outward: each
 * collective milestone raises a new chunk of land out of the clouds, joined to
 * home by a bridge. Land is unlocked by *cumulative points given* — the whole
 * group's generosity, not any one member's — so nobody expands the plaza alone.
 *
 * Deliberately separate from plant growth, which runs on daily check-ins. Two
 * tiers, two currencies: individual consistency grows life, collective effort
 * creates space.
 *
 * Pure data + math (no React/THREE) so it can be unit-tested and shared.
 */

import {
  HOME_EDGE,
  edgeRadius,
  edgeMaxRadius,
  makeEdgeShape,
  type EdgeShape,
} from './plazaMath'
import { hashUid, mix } from './plazaWalk'

export type IslandDef = {
  id: string
  label: string
  emoji: string
  blurb: string
  /** World-space centre of the island. */
  center: { x: number; z: number }
  /** Island size relative to the home island (1 = the full FSIZE plaza). */
  scale: number
  /** This island's own rim. Same size as home, different silhouette. */
  edge: EdgeShape
  /** Cumulative points given required to raise it. 0 = always present. */
  unlockAtPoints: number
  /**
   * The island this one is bridged to. Undefined only for home. Always an
   * island with a lower threshold, so the arm you walk out along is finished
   * behind you before its next link appears.
   */
  parentId?: string
}

/**
 * Each island's outline, derived from its id.
 *
 * ⚠️ SHARED WORLD: every client has to draw the same archipelago, so this
 * mapping is as much a wire format as plazaWalk's wander schedule. The shapes
 * are pinned in plazaIslands.test.ts — changing the salt reshapes islands that
 * people have already planted on.
 */
export function edgeForIsland(id: string): EdgeShape {
  if (id === 'home') return HOME_EDGE
  return makeEdgeShape(mix(hashUid(id), 0xed6e))
}

// Home is a hub with arms growing out of it. Each arm is a chain: the first
// island on it bridges to home, the next bridges to that one, and so on, so the
// archipelago extends *outward* as the group earns it rather than filling in a
// ring around home. Home stays central and the framing stays balanced however
// far the arms get.
//
// STEP is the centre-to-centre spacing along an arm, and it has to clear two
// *true* rims, not two nominal ones: a full-size island reaches ~15.9 at its
// diagonals, so the old 27 — chosen when satellites were half-size — would
// overlap by a couple of units. 38 leaves decks of 10-11 units for the shipped
// islands and at least 9 for any island the seeder can produce.
const STEP = 38

// Each arm leaves home on its own bearing and bends by BEND at every link, so
// an arm curves away instead of reading as a ruler-straight causeway. The two
// bearings are 120° apart, which keeps the empty quarter behind home rather
// than beside it.
const ARM_BEARINGS = [35, 155]
// Gentle. A big outward bend straightens the two arms into one long line
// through home — at BEND 20 they end up on bearings 15° and 175°, which is the
// causeway layout, not a hub.
const BEND = 8

function polar(from: { x: number; z: number }, bearingDeg: number, distance = STEP) {
  const a = (bearingDeg * Math.PI) / 180
  return { x: from.x + Math.cos(a) * distance, z: from.z + Math.sin(a) * distance }
}

const ORIGIN = { x: 0, z: 0 }

/**
 * The nth centre out along an arm (n = 0 is the island nearest home).
 *
 * Each arm bends *outward* — away from the bisector between the two bearings —
 * so the pair opens up as it extends. Bending them the other way (arm 0
 * anticlockwise, arm 1 clockwise, which is what the bearings suggest at a
 * glance) curls the two arms toward each other and the whole archipelago reads
 * as one horseshoe chain rather than as a hub with arms.
 */
function arm(index: number, step: number): { x: number; z: number } {
  const bearing = ARM_BEARINGS[index]
  const turn = index === 0 ? -BEND : BEND
  let at = ORIGIN
  for (let n = 0; n <= step; n++) at = polar(at, bearing + turn * n)
  return at
}

export const ISLANDS: IslandDef[] = [
  {
    id: 'home',
    label: 'The Plaza',
    emoji: '🏝️',
    blurb: 'Where everyone gathers.',
    center: { x: 0, z: 0 },
    scale: 1,
    edge: edgeForIsland('home'),
    unlockAtPoints: 0,
  },
  {
    id: 'garden',
    label: 'The Garden',
    emoji: '🌷',
    blurb: 'The first chunk of land the group earned together.',
    center: arm(0, 0),
    scale: 1,
    edge: edgeForIsland('garden'),
    unlockAtPoints: 500,
    parentId: 'home',
  },
  {
    id: 'orchard',
    label: 'The Orchard',
    emoji: '🍎',
    blurb: 'Room for the long-lived things.',
    center: arm(1, 0),
    scale: 1,
    edge: edgeForIsland('orchard'),
    unlockAtPoints: 1500,
    parentId: 'home',
  },
  {
    id: 'hill',
    label: 'Monument Hill',
    emoji: '🗿',
    blurb: 'Raised for the milestones worth remembering.',
    center: arm(0, 1),
    scale: 1,
    edge: edgeForIsland('hill'),
    unlockAtPoints: 3000,
    parentId: 'garden',
  },
  {
    id: 'observatory',
    label: 'The Observatory',
    emoji: '🔭',
    blurb: 'The far island, for groups that went the distance.',
    center: arm(1, 1),
    scale: 1,
    edge: edgeForIsland('observatory'),
    unlockAtPoints: 5000,
    parentId: 'orchard',
  },
]

export const HOME_ISLAND = ISLANDS[0]

/** Points-given that raises every island — the last threshold. */
export const ALL_UNLOCKED_POINTS = ISLANDS[ISLANDS.length - 1].unlockAtPoints

export const ISLAND_MAP: Record<string, IslandDef> = Object.fromEntries(
  ISLANDS.map((i) => [i.id, i]),
)

export function getIsland(id: string | undefined): IslandDef {
  return (id && ISLAND_MAP[id]) || HOME_ISLAND
}

/** Islands the group has earned so far, in unlock order. */
export function unlockedIslands(pointsGiven: number): IslandDef[] {
  return ISLANDS.filter((i) => pointsGiven >= i.unlockAtPoints)
}

export function isUnlocked(id: string, pointsGiven: number): boolean {
  return pointsGiven >= getIsland(id).unlockAtPoints
}

/** The next island to be earned, or null once the archipelago is complete. */
export function nextIsland(pointsGiven: number): IslandDef | null {
  return ISLANDS.find((i) => pointsGiven < i.unlockAtPoints) ?? null
}

/**
 * Progress toward the next island: 0..1 across the span between the previous
 * threshold and the next, so the bar fills across each leg rather than
 * restarting from zero points every time.
 */
export function progressToNext(pointsGiven: number): {
  next: IslandDef | null
  from: number
  to: number
  fraction: number
  remaining: number
} {
  const next = nextIsland(pointsGiven)
  if (!next) return { next: null, from: 0, to: 0, fraction: 1, remaining: 0 }
  const earned = unlockedIslands(pointsGiven)
  const from = earned.length ? earned[earned.length - 1].unlockAtPoints : 0
  const to = next.unlockAtPoints
  const span = Math.max(1, to - from)
  return {
    next,
    from,
    to,
    fraction: Math.max(0, Math.min(1, (pointsGiven - from) / span)),
    remaining: Math.max(0, to - pointsGiven),
  }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * An island's true reach: how far its rim gets from its centre. Note this is
 * well past FSIZE/2 — the superellipse bulges toward its corners — which is
 * exactly what layout built on FSIZE/2 got wrong.
 */
export function islandRadius(island: IslandDef): number {
  return edgeMaxRadius(island.edge) * island.scale
}

/** Plank deck width, shared by the renderer and the walkable-ground test. */
export const BRIDGE_WIDTH = 2.6
/** How far each end of the deck sinks into the grass so it meets it visibly. */
const BRIDGE_BURY = 0.35

/**
 * The rim radius under a deck of BRIDGE_WIDTH pointing along `bearing`, taken
 * as the minimum across the deck's angular footprint.
 *
 * A wobbly rim isn't perpendicular to the radius, so anchoring on the deck's
 * centreline alone leaves one corner of the planks hanging over the void: dr/dθ
 * runs ~3.7 units per radian at these bearings and the deck subtends ~0.09 rad,
 * so a corner can miss by a third of a unit — most of the bury.
 */
function deckAnchorRadius(edge: EdgeShape, bearing: number): number {
  const spread = Math.atan2(BRIDGE_WIDTH / 2, edgeRadius(bearing, edge))
  return Math.min(
    edgeRadius(bearing, edge),
    edgeRadius(bearing + spread, edge),
    edgeRadius(bearing - spread, edge),
  ) - BRIDGE_BURY
}

/**
 * The bridge between an island and its parent: the two points where it meets
 * each island's rim, plus the direction and span between them. A bridge runs
 * straight down the line joining the two centres, so it always lands square on
 * both rims — which held when every bridge ran radially out of home, and still
 * holds now that they chain along an arm.
 */
export type Bridge = {
  from: { x: number; z: number }
  to: { x: number; z: number }
  angle: number
  length: number
}

// Fixed per island, and asked for every frame by the ground test.
const _bridgeCache = new Map<string, Bridge | null>()

export function bridgeFor(island: IslandDef): Bridge | null {
  const hit = _bridgeCache.get(island.id)
  if (hit !== undefined) return hit
  const built = buildBridge(island)
  _bridgeCache.set(island.id, built)
  return built
}

function buildBridge(island: IslandDef): Bridge | null {
  if (!island.parentId) return null
  const parent = getIsland(island.parentId)
  const dx = island.center.x - parent.center.x
  const dz = island.center.z - parent.center.z
  const angle = Math.atan2(dz, dx)
  const ux = Math.cos(angle)
  const uz = Math.sin(angle)
  // Each end sits on the rim it actually meets. The far island's near side is at
  // its own local bearing angle+π, which is a different radius from the
  // parent's — the two outlines differ.
  const nearR = deckAnchorRadius(parent.edge, angle)
  const farR = deckAnchorRadius(island.edge, angle + Math.PI)
  const from = { x: parent.center.x + ux * nearR, z: parent.center.z + uz * nearR }
  const to = { x: island.center.x - ux * farR, z: island.center.z - uz * farR }
  return {
    from,
    to,
    angle,
    length: Math.hypot(to.x - from.x, to.z - from.z),
  }
}

// ─── Ground ───────────────────────────────────────────────────────────────────
// What counts as solid footing anywhere in the archipelago. Pure, so the walk
// step, the throw physics and the blob shadows can all ask the same question
// and get the same answer.

/** Is (x, z) over this island's surface? */
export function isOnIsland(x: number, z: number, island: IslandDef): boolean {
  const lx = x - island.center.x
  const lz = z - island.center.z
  const r = Math.hypot(lx, lz)
  if (r === 0) return true
  return r <= edgeRadius(Math.atan2(lz, lx), island.edge) * island.scale
}

/**
 * Is (x, z) on the planks of this island's bridge? Inset to the rails, which
 * are what actually stops you walking off the side.
 */
export function isOnBridge(x: number, z: number, island: IslandDef, halfWidth = BRIDGE_WIDTH / 2): boolean {
  const bridge = bridgeFor(island)
  if (!bridge) return false
  const midX = (bridge.from.x + bridge.to.x) / 2
  const midZ = (bridge.from.z + bridge.to.z) / 2
  const cos = Math.cos(bridge.angle)
  const sin = Math.sin(bridge.angle)
  const dx = x - midX
  const dz = z - midZ
  // Into the deck's own frame: along the span, and across it.
  const along = dx * cos + dz * sin
  const across = -dx * sin + dz * cos
  return Math.abs(along) <= bridge.length / 2 && Math.abs(across) <= halfWidth
}

/** The island whose surface is under (x, z), or null over open sky. */
export function islandAt(x: number, z: number, unlocked: readonly IslandDef[]): IslandDef | null {
  for (const island of unlocked) if (isOnIsland(x, z, island)) return island
  return null
}

/**
 * Is there something to stand on at (x, z)? Islands and the decks that join
 * them. Bridge decks sit ~0.01 below the grass, close enough that ground is
 * flat at y = 0 everywhere and callers need no height model.
 */
export function isOnGround(x: number, z: number, unlocked: readonly IslandDef[]): boolean {
  if (islandAt(x, z, unlocked)) return true
  for (const island of unlocked) if (isOnBridge(x, z, island)) return true
  return false
}

/**
 * Hold a carried or sliding body on the island it is nearest to. Returns true
 * if it had to move.
 *
 * The plaza-only version of this pulled everything toward the origin, which
 * would drag a Mii standing on the observatory back across the sky the moment
 * somebody picked them up.
 */
export function clampToNearestIsland(
  pos: { x: number; z: number },
  unlocked: readonly IslandDef[],
  margin = 0.45,
): boolean {
  let nearest: IslandDef | null = null
  let bestD = Infinity
  for (const island of unlocked) {
    const d = (pos.x - island.center.x) ** 2 + (pos.z - island.center.z) ** 2
    if (d < bestD) { bestD = d; nearest = island }
  }
  if (!nearest) return false
  const lx = pos.x - nearest.center.x
  const lz = pos.z - nearest.center.z
  const r = Math.hypot(lx, lz)
  if (r === 0) return false
  const maxR = edgeRadius(Math.atan2(lz, lx), nearest.edge) * nearest.scale - margin
  if (r <= maxR) return false
  const scale = maxR / r
  pos.x = nearest.center.x + lx * scale
  pos.z = nearest.center.z + lz * scale
  return true
}

// A walker's shoulders, so the rails stop the body rather than its centreline.
const WALKER_HALF_WIDTH = 0.34
/** How close to the rail a walker may get. */
const RAIL_INSET = BRIDGE_WIDTH / 2 - WALKER_HALF_WIDTH

/**
 * Resolve a walker's position against the archipelago: slide them along a
 * bridge's rails if they're on one, and report whether there's ground beneath.
 *
 * The rails are the only walls in this world — everywhere else the rim is a
 * cliff you can walk off, which is the plaza's whole attitude to edges. A deck
 * two and a half units wide over a drop is the one place that reads as a trap
 * rather than as a choice.
 */
export function resolveArchipelagoGround(
  pos: { x: number; z: number },
  unlocked: readonly IslandDef[],
): boolean {
  if (islandAt(pos.x, pos.z, unlocked)) return true

  for (const island of unlocked) {
    const bridge = bridgeFor(island)
    if (!bridge) continue
    const midX = (bridge.from.x + bridge.to.x) / 2
    const midZ = (bridge.from.z + bridge.to.z) / 2
    const cos = Math.cos(bridge.angle)
    const sin = Math.sin(bridge.angle)
    const dx = pos.x - midX
    const dz = pos.z - midZ
    const along = dx * cos + dz * sin
    if (Math.abs(along) > bridge.length / 2) continue
    const across = -dx * sin + dz * cos
    if (Math.abs(across) > BRIDGE_WIDTH) continue   // not near this deck at all
    // On the deck: hold them between the rails.
    const held = Math.max(-RAIL_INSET, Math.min(RAIL_INSET, across))
    pos.x = midX + cos * along - sin * held
    pos.z = midZ + sin * along + cos * held
    return true
  }
  return false
}

// ─── Camera framing ───────────────────────────────────────────────────────────

// Vertical limits the plaza's orbit camera is clamped to (polar angle from +Y).
// A visit that sat outside them would be snapped back on the first drag, so the
// scene and the framing below share these numbers.
export const POLAR_MIN = Math.PI / 3.3
export const POLAR_MAX = Math.PI / 2.5

// Visits keep the plaza's 45° diagonal so the archipelago always reads as the
// same world from the same angle — only the position and distance change. The
// eye sits a little higher than the plaza's default camera: an island is
// something you look *at*, and the extra tilt shows its surface (and its
// planting tiles) rather than its rim.
const VIEW_DIR = { x: 1, y: 0.9, z: 1 }
const VIEW_LEN = Math.hypot(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z)

/** Eye height of the look-at point, matching the plaza's default target. */
export const VIEW_TARGET_Y = 0.6

// Enough pull-back that the smallest island still fills a comfortable part of
// the frame rather than sitting in the middle of a wall of clouds.
const VIEW_FIT = 2.8
const VIEW_MIN_DISTANCE = 18

/**
 * Where to park the camera to look at one island on its own: the eye position,
 * the point it looks at, and their separation (so callers can keep orbit
 * controls in range). Pure — the flight itself is animated by the renderer.
 */
export function islandView(island: IslandDef): {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  distance: number
} {
  const distance = Math.max(VIEW_MIN_DISTANCE, islandRadius(island) * VIEW_FIT)
  const k = distance / VIEW_LEN
  return {
    position: {
      x: island.center.x + VIEW_DIR.x * k,
      y: VIEW_TARGET_Y + VIEW_DIR.y * k,
      z: island.center.z + VIEW_DIR.z * k,
    },
    target: { x: island.center.x, y: VIEW_TARGET_Y, z: island.center.z },
    distance,
  }
}

/** How far the camera must pull back to frame every unlocked island. */
export function archipelagoRadius(pointsGiven: number): number {
  return unlockedIslands(pointsGiven).reduce((max, i) => {
    const reach = Math.hypot(i.center.x, i.center.z) + islandRadius(i)
    return Math.max(max, reach)
  }, edgeMaxRadius(HOME_EDGE))
}
