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

import { FSIZE } from './plazaMath'

export type IslandDef = {
  id: string
  label: string
  emoji: string
  blurb: string
  /** World-space centre of the island. */
  center: { x: number; z: number }
  /** Island size relative to the home island (1 = the full FSIZE plaza). */
  scale: number
  /** Cumulative points given required to raise it. 0 = always present. */
  unlockAtPoints: number
}

// Home sits at the origin at full size; satellites ring it, smaller, at a
// distance that leaves a clean gap for the bridge. Angles are spread so no two
// bridges run close to each other.
const RING = 27

function ring(angleDeg: number): { x: number; z: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: Math.cos(a) * RING, z: Math.sin(a) * RING }
}

export const ISLANDS: IslandDef[] = [
  {
    id: 'home',
    label: 'The Plaza',
    emoji: '🏝️',
    blurb: 'Where everyone gathers.',
    center: { x: 0, z: 0 },
    scale: 1,
    unlockAtPoints: 0,
  },
  {
    id: 'garden',
    label: 'The Garden',
    emoji: '🌷',
    blurb: 'The first chunk of land the group earned together.',
    center: ring(30),
    scale: 0.52,
    unlockAtPoints: 500,
  },
  {
    id: 'orchard',
    label: 'The Orchard',
    emoji: '🍎',
    blurb: 'Room for the long-lived things.',
    center: ring(120),
    scale: 0.56,
    unlockAtPoints: 1500,
  },
  {
    id: 'hill',
    label: 'Monument Hill',
    emoji: '🗿',
    blurb: 'Raised for the milestones worth remembering.',
    center: ring(210),
    scale: 0.5,
    unlockAtPoints: 3000,
  },
  {
    id: 'observatory',
    label: 'The Observatory',
    emoji: '🔭',
    blurb: 'The far island, for groups that went the distance.',
    center: ring(300),
    scale: 0.54,
    unlockAtPoints: 5000,
  },
]

export const HOME_ISLAND = ISLANDS[0]

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

/** Half-width of an island in world units (home is FSIZE/2). */
export function islandRadius(island: IslandDef): number {
  return (FSIZE / 2) * island.scale
}

/**
 * The bridge between an island and home: the two points where it meets each
 * island's rim, plus the direction and span between them. Bridges run radially,
 * so they always land square on both rims.
 */
export function bridgeFor(island: IslandDef): {
  from: { x: number; z: number }
  to: { x: number; z: number }
  angle: number
  length: number
} | null {
  if (island.id === HOME_ISLAND.id) return null
  const dx = island.center.x - HOME_ISLAND.center.x
  const dz = island.center.z - HOME_ISLAND.center.z
  const dist = Math.hypot(dx, dz)
  const ux = dx / dist
  const uz = dz / dist
  // Overlap the rims slightly so the deck visibly meets the grass.
  const homeEdge = (FSIZE / 2) * 0.95
  const farEdge = islandRadius(island) * 0.95
  const from = { x: ux * homeEdge, z: uz * homeEdge }
  const to = { x: island.center.x - ux * farEdge, z: island.center.z - uz * farEdge }
  return {
    from,
    to,
    angle: Math.atan2(dz, dx),
    length: Math.hypot(to.x - from.x, to.z - from.z),
  }
}

/** How far the camera must pull back to frame every unlocked island. */
export function archipelagoRadius(pointsGiven: number): number {
  return unlockedIslands(pointsGiven).reduce((max, i) => {
    const reach = Math.hypot(i.center.x, i.center.z) + islandRadius(i)
    return Math.max(max, reach)
  }, FSIZE / 2)
}
