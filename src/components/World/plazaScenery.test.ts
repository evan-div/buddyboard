import { describe, it, expect } from 'vitest'
import {
  themeFor,
  reservedTiles,
  deckBearing,
  clearOfDeck,
  clearOfTiles,
  scatterPlacements,
  ringPlacements,
  TILE_CLEARANCE,
} from './plazaScenery'
import { ISLANDS, HOME_ISLAND, isOnIsland, isOnBridge, unlockedIslands, ALL_UNLOCKED_POINTS } from './plazaIslands'
import { TILE, tilesOnIsland, edgeRadius } from './plazaMath'

const SATELLITES = ISLANDS.filter((i) => i.id !== HOME_ISLAND.id)
const grounds = unlockedIslands(ALL_UNLOCKED_POINTS)

// Local island coordinates → world, for the ground tests.
function world(island: typeof ISLANDS[number], p: { x: number; z: number }) {
  return { x: island.center.x + p.x, z: island.center.z + p.z }
}

describe('themes', () => {
  it('dresses every satellite and leaves the plaza bare', () => {
    expect(themeFor(HOME_ISLAND.id)).toBeNull()
    for (const island of SATELLITES) {
      expect(themeFor(island.id), `${island.id} has no scenery`).not.toBeNull()
    }
  })

  it('gives each satellite its own theme', () => {
    const themes = SATELLITES.map((i) => themeFor(i.id))
    expect(new Set(themes).size).toBe(SATELLITES.length)
  })

  it('reserves the centre tile only where something stands on it', () => {
    // A monument and a telescope occupy the middle of their island; a meadow
    // and an orchard leave every planting spot free.
    expect(reservedTiles(HOME_ISLAND)).toEqual([])
    for (const island of SATELLITES) {
      const reserved = reservedTiles(island)
      const theme = themeFor(island.id)
      if (theme === 'monument' || theme === 'observatory') {
        expect(reserved).toHaveLength(1)
        expect(reserved[0]).toEqual({ q: 0, r: 0, island: island.id })
      } else {
        expect(reserved).toEqual([])
      }
    }
  })
})

describe('the deck corridor', () => {
  it('points back toward home', () => {
    expect(deckBearing(HOME_ISLAND)).toBeNull()
    for (const island of SATELLITES) {
      const bearing = deckBearing(island)!
      // Following it from the island's centre gets you closer to the origin.
      const step = {
        x: island.center.x + Math.cos(bearing),
        z: island.center.z + Math.sin(bearing),
      }
      expect(Math.hypot(step.x, step.z)).toBeLessThan(Math.hypot(island.center.x, island.center.z))
    }
  })

  it('rejects the deck\'s own mouth', () => {
    for (const island of SATELLITES) {
      const bearing = deckBearing(island)!
      for (const r of [6, 9, 12]) {
        const lx = Math.cos(bearing) * r
        const lz = Math.sin(bearing) * r
        expect(clearOfDeck(lx, lz, island), `${island.id} allows scenery on its deck`).toBe(false)
      }
    }
  })

  it('allows the far side of the island', () => {
    for (const island of SATELLITES) {
      const away = deckBearing(island)! + Math.PI
      expect(clearOfDeck(Math.cos(away) * 10, Math.sin(away) * 10, island)).toBe(true)
    }
  })
})

describe('placements', () => {
  it('are deterministic per island', () => {
    for (const island of SATELLITES) {
      expect(scatterPlacements(island, 40)).toEqual(scatterPlacements(island, 40))
      expect(ringPlacements(island, 9)).toEqual(ringPlacements(island, 9))
    }
  })

  it('differ between islands', () => {
    const first = scatterPlacements(SATELLITES[0], 30)
    for (const other of SATELLITES.slice(1)) {
      expect(scatterPlacements(other, 30)).not.toEqual(first)
    }
  })

  it('stand on their own island, never over the void', () => {
    for (const island of SATELLITES) {
      for (const p of [...scatterPlacements(island, 120), ...ringPlacements(island, 12)]) {
        const w = world(island, p)
        expect(isOnIsland(w.x, w.z, island), `${island.id} scenery at ${p.x},${p.z} is off the rim`).toBe(true)
        // ...and specifically on *this* island, not a neighbour.
        expect(grounds.filter((g) => isOnIsland(w.x, w.z, g)).map((g) => g.id)).toEqual([island.id])
      }
    }
  })

  it('never block a planting tile', () => {
    for (const island of SATELLITES) {
      const frame = { id: island.id, center: island.center, scale: island.scale, edge: island.edge }
      const tiles = tilesOnIsland(frame)
      for (const p of ringPlacements(island, 12)) {
        for (const tile of tiles) {
          const d = Math.hypot(p.x - tile.q * TILE, p.z - tile.r * TILE)
          expect(d, `${island.id} scenery sits on tile ${tile.q},${tile.r}`)
            .toBeGreaterThanOrEqual(TILE_CLEARANCE)
        }
      }
    }
  })

  it('never block a bridge deck', () => {
    for (const island of SATELLITES) {
      for (const p of [...scatterPlacements(island, 120), ...ringPlacements(island, 12)]) {
        const w = world(island, p)
        expect(isOnBridge(w.x, w.z, island), `${island.id} scenery stands on its deck`).toBe(false)
      }
    }
  })

  it('actually produce scenery — the filters can\'t starve an island', () => {
    for (const island of SATELLITES) {
      // Flowers carpet the island; the ring holds most of what it asks for,
      // minus whatever the deck's corridor swallows.
      expect(scatterPlacements(island, 120).length).toBeGreaterThan(90)
      expect(ringPlacements(island, 12).length).toBeGreaterThanOrEqual(9)
    }
  })

  it('spread the ring around the whole island', () => {
    // A ring that clumped would read as a hedge rather than an orchard.
    for (const island of SATELLITES) {
      const angles = ringPlacements(island, 12).map((p) => Math.atan2(p.z, p.x))
      const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))))
      expect(quadrants.size, `${island.id} ring only covers ${quadrants.size} quadrants`).toBe(4)
    }
  })

  it('keep the ring in the band the planting grid cannot reach', () => {
    for (const island of SATELLITES) {
      for (const p of ringPlacements(island, 12)) {
        const r = Math.hypot(p.x, p.z)
        const rim = edgeRadius(Math.atan2(p.z, p.x), island.edge) * island.scale
        expect(r).toBeLessThan(rim)
        expect(r).toBeGreaterThan(rim - 4)
      }
    }
  })

  it('clearOfTiles agrees with the tile grid', () => {
    const island = SATELLITES[0]
    expect(clearOfTiles(0, 0, island)).toBe(false)          // the centre tile
    expect(clearOfTiles(TILE, 0, island)).toBe(false)        // its neighbour
    expect(clearOfTiles(TILE / 2, TILE / 2, island)).toBe(true)  // between them
  })
})
