/**
 * @file Where each island's scenery stands
 * @description The Garden has flowers, the Orchard has apple trees, Monument
 * Hill has standing stones and a monument, the Observatory has a telescope. This
 * module decides *where* those things go; IslandScenery.tsx decides what they
 * look like.
 *
 * Placement is the part with rules, which is why it lives here as pure math:
 *
 * - Scenery must not stand on a planting tile. Members plant on a 4.6-unit grid
 *   and a decorative tree sharing a tile with somebody's oak would grow through
 *   it. The hero props (monument, telescope) do claim the centre tile, so they
 *   declare it and the plaza removes it from the plantable set.
 * - Scenery must not stand on a bridge deck. You can walk the archipelago now,
 *   and a standing stone in the middle of the only way across is a wall.
 * - Everything is seeded from the island's id, so every client draws the same
 *   island and it doesn't reshuffle on reload.
 */

import { edgeRadius, edgeMinRadius, TILE, tilesOnIsland, type Tile } from './plazaMath'
import { BRIDGE_WIDTH, bridgeFor, type IslandDef } from './plazaIslands'
import { hashUid, mix, makeRng } from './plazaWalk'

export type SceneryTheme = 'meadow' | 'orchard' | 'monument' | 'observatory'

// Named for what the group earned, not for what it holds — the island labels
// came first and the scenery is the payoff for them.
const THEMES: Record<string, SceneryTheme> = {
  garden: 'meadow',
  orchard: 'orchard',
  hill: 'monument',
  observatory: 'observatory',
}

/** The scenery an island wears, or null for the plaza itself. */
export function themeFor(islandId: string): SceneryTheme | null {
  return THEMES[islandId] ?? null
}

/**
 * Tiles a theme's centrepiece stands on. The plaza treats these as occupied, so
 * nobody plants a tree inside the monument.
 */
export function reservedTiles(island: IslandDef): Tile[] {
  const theme = themeFor(island.id)
  if (theme !== 'monument' && theme !== 'observatory') return []
  return [{ q: 0, r: 0, island: island.id }]
}

export type Placement = {
  x: number
  z: number
  /** Rotation about Y, so identical props don't read as stamped out. */
  yaw: number
  /** Size multiplier, ~0.8–1.2. */
  scale: number
}

// How close scenery may come to a planting tile's centre. A mature canopy is
// ~1.5 units of half-width and the soil mound ~1.25, so 2.1 keeps them apart.
export const TILE_CLEARANCE = 2.1

// Angular half-width of the no-build corridor over a bridge deck, measured at
// the rim. Generous: the deck is 2.6 wide, and a walker needs to see where they
// are going as well as fit.
const DECK_CLEARANCE = BRIDGE_WIDTH * 1.6

/** Local bearing from an island's centre toward the deck that joins it to home. */
export function deckBearing(island: IslandDef): number | null {
  if (!bridgeFor(island)) return null
  // The deck arrives on the side facing the origin.
  return Math.atan2(-island.center.z, -island.center.x)
}

function angleGap(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

/** Is (lx, lz), in island-local space, clear of the deck's corridor? */
export function clearOfDeck(lx: number, lz: number, island: IslandDef): boolean {
  const bearing = deckBearing(island)
  if (bearing === null) return true
  const r = Math.hypot(lx, lz)
  if (r === 0) return true
  // The corridor is a wedge, so the angular tolerance widens as you approach
  // the centre — a fixed angle would leave the deck's mouth crowded.
  const tolerance = Math.min(Math.PI / 2, Math.atan2(DECK_CLEARANCE / 2, r))
  return angleGap(Math.atan2(lz, lx), bearing) > tolerance
}

/** Is (lx, lz) far enough from every planting tile on this island? */
export function clearOfTiles(lx: number, lz: number, island: IslandDef, clearance = TILE_CLEARANCE): boolean {
  const frame = { id: island.id, center: island.center, scale: island.scale, edge: island.edge }
  for (const tile of tilesOnIsland(frame)) {
    if (Math.hypot(lx - tile.q * TILE, lz - tile.r * TILE) < clearance) return false
  }
  return true
}

function usable(lx: number, lz: number, island: IslandDef, tileClearance: number, rimInset: number): boolean {
  const r = Math.hypot(lx, lz)
  if (r > edgeRadius(Math.atan2(lz, lx), island.edge) * island.scale - rimInset) return false
  if (!clearOfDeck(lx, lz, island)) return false
  return clearOfTiles(lx, lz, island, tileClearance)
}

/**
 * Pull a point back inside the island's rim, keeping its bearing from the
 * centre. For the small things that get placed *relative to* a prop rather than
 * by the samplers above — an apple falling from a tree that stands near the
 * edge, which would otherwise lie in mid-air off the side of the island.
 */
export function clampInsideRim(
  lx: number, lz: number, island: IslandDef, margin = 0.5,
): { x: number; z: number } {
  const r = Math.hypot(lx, lz)
  if (r === 0) return { x: lx, z: lz }
  const maxR = edgeRadius(Math.atan2(lz, lx), island.edge) * island.scale - margin
  if (r <= maxR) return { x: lx, z: lz }
  const k = maxR / r
  return { x: lx * k, z: lz * k }
}

/**
 * Scatter small things (flowers) across the whole island. Rejection sampling
 * over the bounding square: the island is most of that square, and the rejects
 * are the tile discs and the deck we want to skip anyway.
 */
export function scatterPlacements(island: IslandDef, count: number, opts?: {
  seed?: number
  tileClearance?: number
  rimInset?: number
}): Placement[] {
  const rng = makeRng(opts?.seed ?? mix(hashUid(island.id), 0x5ce7))
  const tileClearance = opts?.tileClearance ?? 1.7
  const rimInset = opts?.rimInset ?? 0.6
  const span = edgeMinRadius(island.edge) * island.scale
  const out: Placement[] = []
  // Bounded: a full island yields a placement most tries, and a hypothetical
  // island with no room at all must not spin forever.
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const lx = (rng() * 2 - 1) * span
    const lz = (rng() * 2 - 1) * span
    if (!usable(lx, lz, island, tileClearance, rimInset)) continue
    out.push({ x: lx, z: lz, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.45 })
  }
  return out
}

/**
 * Place big things (trees, standing stones) around the island's rim, in the band
 * the planting grid can't reach anyway. Walking the ring by angle rather than
 * scattering keeps them evenly spread — a rejection-sampled orchard clumps.
 */
export function ringPlacements(island: IslandDef, count: number, opts?: {
  seed?: number
  /** How far inside the rim the ring sits. */
  inset?: number
  jitter?: number
  tileClearance?: number
}): Placement[] {
  const rng = makeRng(opts?.seed ?? mix(hashUid(island.id), 0x21ee))
  // Hugging the rim is what makes the ring possible at all: the planting grid
  // reaches to rim − 3.2, and scenery has to keep TILE_CLEARANCE off every tile
  // centre, so anything further in than about rim − 1.5 gets rejected wholesale.
  // At rim − 1.2 all but the deck-corridor placement survives.
  const inset = opts?.inset ?? 1.2
  const jitter = opts?.jitter ?? 0.35
  const tileClearance = opts?.tileClearance ?? TILE_CLEARANCE
  const out: Placement[] = []
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / count)
    const rim = edgeRadius(theta, island.edge) * island.scale
    const r = rim - inset - rng() * jitter
    const lx = Math.cos(theta) * r
    const lz = Math.sin(theta) * r
    // Skip rather than nudge: a tree shoved sideways out of the deck's corridor
    // lands somewhere it wasn't spaced for, and the gap reads as a gateway.
    if (!usable(lx, lz, island, tileClearance, 0.8)) continue
    out.push({ x: lx, z: lz, yaw: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.3 })
  }
  return out
}
