import { describe, it, expect } from 'vitest'
import {
  ISLANDS,
  HOME_ISLAND,
  getIsland,
  unlockedIslands,
  isUnlocked,
  nextIsland,
  progressToNext,
  islandRadius,
  bridgeFor,
  archipelagoRadius,
  islandView,
  ALL_UNLOCKED_POINTS,
  VIEW_TARGET_Y,
  POLAR_MIN,
  POLAR_MAX,
  BRIDGE_WIDTH,
  isOnIsland,
  isOnGround,
  isOnBridge,
  islandAt,
  resolveArchipelagoGround,
} from './plazaIslands'
import { FSIZE, edgeRadius, edgeMaxRadius } from './plazaMath'

describe('island layout', () => {
  it('always includes home, unlocked from zero', () => {
    expect(HOME_ISLAND.unlockAtPoints).toBe(0)
    expect(unlockedIslands(0)).toEqual([HOME_ISLAND])
    expect(isUnlocked('home', 0)).toBe(true)
  })

  it('has strictly increasing unlock thresholds', () => {
    for (let i = 1; i < ISLANDS.length; i++) {
      expect(ISLANDS[i].unlockAtPoints).toBeGreaterThan(ISLANDS[i - 1].unlockAtPoints)
    }
  })

  it('has unique ids', () => {
    expect(new Set(ISLANDS.map((i) => i.id)).size).toBe(ISLANDS.length)
  })

  it('falls back to home for unknown or missing ids', () => {
    expect(getIsland(undefined)).toBe(HOME_ISLAND)
    expect(getIsland('nope')).toBe(HOME_ISLAND)
    expect(getIsland('garden').id).toBe('garden')
  })

  it('unlocks progressively as points accumulate', () => {
    expect(unlockedIslands(499)).toHaveLength(1)
    expect(unlockedIslands(500)).toHaveLength(2)
    expect(unlockedIslands(99999)).toHaveLength(ISLANDS.length)
  })
})

describe('nextIsland / progressToNext', () => {
  it('points at the first unearned island', () => {
    expect(nextIsland(0)?.id).toBe('garden')
    expect(nextIsland(500)?.id).toBe('orchard')
  })

  it('returns null once everything is earned', () => {
    expect(nextIsland(99999)).toBeNull()
    expect(progressToNext(99999).fraction).toBe(1)
  })

  it('fills across the span between thresholds, not from zero', () => {
    // Halfway between 500 (garden) and 1500 (orchard) is 1000
    const p = progressToNext(1000)
    expect(p.next?.id).toBe('orchard')
    expect(p.from).toBe(500)
    expect(p.to).toBe(1500)
    expect(p.fraction).toBeCloseTo(0.5, 6)
    expect(p.remaining).toBe(500)
  })

  it('starts a fresh leg at zero right after an unlock', () => {
    expect(progressToNext(500).fraction).toBeCloseTo(0, 6)
  })

  it('clamps the fraction into 0..1', () => {
    const p = progressToNext(0)
    expect(p.fraction).toBeGreaterThanOrEqual(0)
    expect(p.fraction).toBeLessThanOrEqual(1)
  })
})

describe('geometry', () => {
  it('builds every island at the same size', () => {
    // The satellites used to be half-size scale models. They are the plaza's
    // equals now; only their outlines differ.
    for (const i of ISLANDS) {
      expect(i.scale).toBe(1)
      expect(islandRadius(i)).toBeCloseTo(edgeMaxRadius(i.edge), 6)
    }
    const radii = ISLANDS.map(islandRadius)
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1.5)
  })

  it('reaches further than the nominal plaza half-width', () => {
    // The n=4 superellipse bulges toward its corners, so the true rim is ~22%
    // past FSIZE/2. Layout that assumed FSIZE/2 is what made the satellites
    // overlap home once they grew.
    expect(islandRadius(HOME_ISLAND)).toBeGreaterThan(FSIZE / 2)
  })

  it('has no bridge for home', () => {
    expect(bridgeFor(HOME_ISLAND)).toBeNull()
  })

  it('lands each bridge on both rims, square to them', () => {
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      const parent = getIsland(i.parentId)
      const angle = Math.atan2(i.center.z - parent.center.z, i.center.x - parent.center.x)
      expect(b.length).toBeGreaterThan(0)
      // The deck points from the parent island out toward this one...
      expect(angle).toBeCloseTo(b.angle, 6)
      // ...and each end sits inside the rim it actually meets — a different
      // radius at each end now that the outlines differ. The anchor tucks under
      // the grass by the bury plus however much the rim falls away across the
      // deck's width; a couple of units covers both, and the corner test below
      // is what actually pins the near edge.
      const fromR = Math.hypot(b.from.x - parent.center.x, b.from.z - parent.center.z)
      expect(fromR).toBeLessThan(edgeRadius(angle, parent.edge))
      expect(fromR).toBeGreaterThan(edgeRadius(angle, parent.edge) - 2)
      const toR = Math.hypot(b.to.x - i.center.x, b.to.z - i.center.z)
      expect(toR).toBeLessThan(edgeRadius(angle + Math.PI, i.edge))
      expect(toR).toBeGreaterThan(edgeRadius(angle + Math.PI, i.edge) - 2)
    }
  })

  it('puts all four corners of every deck on solid ground', () => {
    // The failure this catches is a plank hanging over the void: a wobbly rim
    // is not perpendicular to the radius, so anchoring on the centreline alone
    // leaves one corner of the deck short of the grass.
    const grounds = unlockedIslands(ALL_UNLOCKED_POINTS)
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      const nx = -Math.sin(b.angle)
      const nz = Math.cos(b.angle)
      for (const end of [b.from, b.to]) {
        for (const side of [-1, 1]) {
          const cx = end.x + nx * side * (BRIDGE_WIDTH / 2)
          const cz = end.z + nz * side * (BRIDGE_WIDTH / 2)
          expect(islandAt(cx, cz, grounds), `${i.id} deck corner is over open sky`).not.toBeNull()
        }
      }
    }
  })

  it('leaves a crossable gap between home and every satellite', () => {
    // Both a floor and a ceiling: too little and the islands intersect, too
    // much and the bridge is a hallway. This is what pins RING.
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      expect(b.length).toBeGreaterThan(6)
      expect(b.length).toBeLessThan(14)
    }
  })

  it('keeps every pair of islands clear of each other', () => {
    // Measured on the true rims, and pairwise — satellite-vs-satellite was
    // never checked before, and it is the second thing full-size islands break.
    for (let a = 0; a < ISLANDS.length; a++) {
      for (let b = a + 1; b < ISLANDS.length; b++) {
        const dist = Math.hypot(
          ISLANDS[a].center.x - ISLANDS[b].center.x,
          ISLANDS[a].center.z - ISLANDS[b].center.z,
        )
        expect(dist).toBeGreaterThan(islandRadius(ISLANDS[a]) + islandRadius(ISLANDS[b]))
      }
    }
  })

  it('grows the camera framing radius as islands unlock', () => {
    const solo = archipelagoRadius(0)
    const full = archipelagoRadius(99999)
    expect(solo).toBeCloseTo(edgeMaxRadius(HOME_ISLAND.edge), 6)
    expect(full).toBeGreaterThan(solo)
  })
})

describe('ground', () => {
  const grounds = unlockedIslands(ALL_UNLOCKED_POINTS)

  it('stands you on every island, and drops you between them', () => {
    for (const i of ISLANDS) {
      expect(islandAt(i.center.x, i.center.z, grounds)?.id).toBe(i.id)
      // Just inside its own rim in every direction, and just outside it.
      for (let k = 0; k < 32; k++) {
        const theta = (k / 32) * Math.PI * 2
        const rim = edgeRadius(theta, i.edge)
        const inX = i.center.x + Math.cos(theta) * rim * 0.98
        const inZ = i.center.z + Math.sin(theta) * rim * 0.98
        expect(islandAt(inX, inZ, grounds)?.id).toBe(i.id)
      }
    }
    // The middle of the ring is open sky in every direction but the bridges.
    expect(islandAt(0, 0, grounds)?.id).toBe('home')
    expect(islandAt(1000, 1000, grounds)).toBeNull()
  })

  it('never lets two islands claim the same point', () => {
    // "First match wins" is only correct because they provably don't overlap.
    for (let x = -60; x <= 60; x += 2) {
      for (let z = -60; z <= 60; z += 2) {
        const hits = grounds.filter((i) => isOnIsland(x, z, i))
        expect(hits.length, `(${x}, ${z}) is on ${hits.map((h) => h.id).join(' and ')}`)
          .toBeLessThanOrEqual(1)
      }
    }
  })

  it('carries you along a deck but not off its side', () => {
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      const nx = -Math.sin(b.angle)
      const nz = Math.cos(b.angle)
      for (let t = 0.1; t < 1; t += 0.1) {
        const cx = b.from.x + (b.to.x - b.from.x) * t
        const cz = b.from.z + (b.to.z - b.from.z) * t
        expect(isOnGround(cx, cz, grounds), `${i.id} deck has a hole in it`).toBe(true)
        // A stride past the rails is open sky (except near the ends, where the
        // island itself is still underneath).
        const offX = cx + nx * BRIDGE_WIDTH
        const offZ = cz + nz * BRIDGE_WIDTH
        if (!islandAt(offX, offZ, grounds)) {
          expect(isOnGround(offX, offZ, grounds), `${i.id} deck is wider than its rails`).toBe(false)
        }
      }
    }
  })

  it('holds a walker between a bridge\'s rails', () => {
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      const nx = -Math.sin(b.angle)
      const nz = Math.cos(b.angle)
      // Aim at the middle of the deck, then a stride to the side of it.
      const midX = (b.from.x + b.to.x) / 2
      const midZ = (b.from.z + b.to.z) / 2
      const pos = { x: midX + nx * (BRIDGE_WIDTH * 0.9), z: midZ + nz * (BRIDGE_WIDTH * 0.9) }
      expect(resolveArchipelagoGround(pos, grounds)).toBe(true)
      // Pulled back inside the rails, and no further along the span.
      const across = -(pos.x - midX) * Math.sin(b.angle) + (pos.z - midZ) * Math.cos(b.angle)
      expect(Math.abs(across)).toBeLessThan(BRIDGE_WIDTH / 2)
      const along = (pos.x - midX) * Math.cos(b.angle) + (pos.z - midZ) * Math.sin(b.angle)
      expect(Math.abs(along)).toBeLessThan(0.001)
    }
  })

  it('leaves a walker alone on open grass', () => {
    for (const i of ISLANDS) {
      const pos = { x: i.center.x, z: i.center.z }
      expect(resolveArchipelagoGround(pos, grounds)).toBe(true)
      expect(pos.x).toBe(i.center.x)
      expect(pos.z).toBe(i.center.z)
    }
  })

  it('reports open sky between the islands, clear of the decks', () => {
    // Written against the layout rather than against specific bearings: the
    // islands used to sit exactly 90° apart so the gaps were always on the
    // bisectors, which stopped being true the moment they grew into arms. The
    // invariant that survives is the one that matters — in the band between
    // home's rim and the next island's, the only footing is a deck.
    let sky = 0
    for (let deg = 0; deg < 360; deg += 3) {
      const a = (deg * Math.PI) / 180
      for (const r of [22, 26, 30]) {
        const at = { x: Math.cos(a) * r, z: Math.sin(a) * r }
        // The resolver captures a full BRIDGE_WIDTH either side of the
        // centreline — wider than the planks — and pulls you back between the
        // rails, so that is the band to compare against.
        const onDeck = ISLANDS.some((i) => isOnBridge(at.x, at.z, i, BRIDGE_WIDTH))
        // An arm reaches into this band: the first island out is 38 away with a
        // rim of ~16, so it owns everything past ~22 on its own bearing.
        const solid = onDeck || islandAt(at.x, at.z, grounds) !== null
        const pos = { ...at }
        const grounded = resolveArchipelagoGround(pos, grounds)
        expect(grounded, `(${deg}°, ${r}) should be ${solid ? 'solid' : 'open sky'}`).toBe(solid)
        if (!grounded) sky++
      }
    }
    // Most of that band is sky — a layout that filled it would pass the check
    // above vacuously.
    expect(sky).toBeGreaterThan(300)
  })

  it('offers no footing on an island the group has not earned', () => {
    const homeOnly = unlockedIslands(0)
    const garden = ISLANDS.find((i) => i.id === 'garden')!
    expect(islandAt(garden.center.x, garden.center.z, homeOnly)).toBeNull()
    expect(isOnGround(garden.center.x, garden.center.z, homeOnly)).toBe(false)
  })
})

describe('islandView', () => {
  it('looks at the island it is framing', () => {
    for (const i of ISLANDS) {
      const v = islandView(i)
      expect(v.target.x).toBeCloseTo(i.center.x, 6)
      expect(v.target.z).toBeCloseTo(i.center.z, 6)
      expect(v.target.y).toBeCloseTo(VIEW_TARGET_Y, 6)
    }
  })

  it('sits `distance` away from the target, above it', () => {
    for (const i of ISLANDS) {
      const v = islandView(i)
      const d = Math.hypot(v.position.x - v.target.x, v.position.y - v.target.y, v.position.z - v.target.z)
      expect(d).toBeCloseTo(v.distance, 6)
      expect(v.position.y).toBeGreaterThan(v.target.y)
    }
  })

  it('keeps the same isometric direction for every island', () => {
    const dir = (i: (typeof ISLANDS)[number]) => {
      const v = islandView(i)
      const d = v.distance
      return [
        (v.position.x - v.target.x) / d,
        (v.position.y - v.target.y) / d,
        (v.position.z - v.target.z) / d,
      ]
    }
    const home = dir(HOME_ISLAND)
    for (const i of ISLANDS.slice(1)) {
      dir(i).forEach((c, axis) => expect(c).toBeCloseTo(home[axis], 6))
    }
  })

  it('sits within the orbit camera\'s vertical limits', () => {
    // Outside them, OrbitControls would snap the view the moment it takes over.
    for (const i of ISLANDS) {
      const v = islandView(i)
      const polar = Math.atan2(
        Math.hypot(v.position.x - v.target.x, v.position.z - v.target.z),
        v.position.y - v.target.y,
      )
      expect(polar).toBeGreaterThanOrEqual(POLAR_MIN)
      expect(polar).toBeLessThanOrEqual(POLAR_MAX)
    }
  })

  it('pulls back far enough to hold the whole island in frame', () => {
    for (const i of ISLANDS) {
      expect(islandView(i).distance).toBeGreaterThan(islandRadius(i) * 2)
    }
  })

  it('stays inside the camera range the archipelago is framed with', () => {
    // Scene caps OrbitControls at max(40, archipelagoRadius * 2.1); a visit must
    // never ask for a distance beyond that or the controls would snap back.
    const maxDistance = Math.max(40, archipelagoRadius(ALL_UNLOCKED_POINTS) * 2.1)
    for (const i of ISLANDS) {
      expect(islandView(i).distance).toBeLessThanOrEqual(maxDistance)
    }
  })
})

describe('ALL_UNLOCKED_POINTS', () => {
  it('raises every island, and one point less does not', () => {
    expect(unlockedIslands(ALL_UNLOCKED_POINTS)).toHaveLength(ISLANDS.length)
    expect(unlockedIslands(ALL_UNLOCKED_POINTS - 1).length).toBeLessThan(ISLANDS.length)
    expect(nextIsland(ALL_UNLOCKED_POINTS)).toBeNull()
  })
})
