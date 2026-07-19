import { describe, it, expect } from 'vitest'
import {
  SLOT_MS,
  WANDER_MIN_R,
  WANDER_R_SCALE,
  hashUid,
  makeRng,
  phaseMs,
  slotIndex,
  waypoint,
  currentWaypoint,
  idleVariant,
  respawnYaw,
} from './plazaWalk'
import { plazaEdgeRadius } from './plazaMath'

// Firebase-style 28-char uids
const UIDS = [
  'AbCdEfGhIjKlMnOpQrStUvWxYz12',
  'zYxWvUtSrQpOnMlKjIhGfEdCbA34',
  'q1w2e3r4t5y6u7i8o9p0asdfghjk',
  'MNbvcxzLKJHGfdsaPOIuytREWQ56',
  '0000000000000000000000000001',
]
const BOUNDS = 3.0

describe('hashUid', () => {
  it('pins the hash of a known uid (wire format — changing the hash shuffles the shared world)', () => {
    // If this fails, you changed the schedule for every mixed-version client.
    expect(hashUid('AbCdEfGhIjKlMnOpQrStUvWxYz12')).toBe(256191022)
  })

  it('is distinct for realistic uids', () => {
    const hashes = new Set(UIDS.map(hashUid))
    expect(hashes.size).toBe(UIDS.length)
  })
})

describe('makeRng', () => {
  it('is deterministic for equal seeds', () => {
    const a = makeRng(12345)
    const b = makeRng(12345)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
  })

  it('emits values in [0,1) with a roughly uniform mean', () => {
    const rng = makeRng(987654321)
    let sum = 0
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      sum += v
    }
    expect(sum / 1000).toBeGreaterThan(0.45)
    expect(sum / 1000).toBeLessThan(0.55)
  })
})

describe('mix', () => {
  it('decorrelates adjacent slots: waypoint angles cover all four quadrants', () => {
    const h = hashUid(UIDS[0])
    const quadrants = new Set<number>()
    for (let slot = 0; slot < 200; slot++) {
      const { x, z } = waypoint(h, slot, BOUNDS)
      quadrants.add((x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0))
    }
    expect(quadrants.size).toBe(4)
  })
})

describe('phaseMs', () => {
  it('stays in [0, SLOT_MS) and varies across characters', () => {
    const phases = UIDS.map((u) => phaseMs(hashUid(u)))
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThan(SLOT_MS)
    }
    expect(new Set(phases).size).toBeGreaterThan(1)
  })
})

describe('slotIndex', () => {
  it('is non-decreasing in time and increments exactly on phase boundaries', () => {
    const h = hashUid(UIDS[1])
    const phase = phaseMs(h)
    // A time chosen so (t + phase) lands exactly on a slot boundary
    const boundary = SLOT_MS * 1000 - phase
    expect(slotIndex(h, boundary - 1)).toBe(999)
    expect(slotIndex(h, boundary)).toBe(1000)
    expect(slotIndex(h, boundary + SLOT_MS - 1)).toBe(1000)
  })

  it('clock skew below SLOT_MS puts two clients at most one slot apart', () => {
    const h = hashUid(UIDS[2])
    const now = 1_750_000_000_000
    for (const skew of [1, 500, 2000, SLOT_MS - 1]) {
      expect(Math.abs(slotIndex(h, now + skew) - slotIndex(h, now))).toBeLessThanOrEqual(1)
    }
  })
})

describe('waypoint', () => {
  it('is identical for identical inputs (cross-client determinism)', () => {
    const h = hashUid(UIDS[3])
    const a = waypoint(h, 42, BOUNDS)
    const b = waypoint(h, 42, BOUNDS)
    expect(a).toEqual(b)
  })

  it('keeps radius within the wander band and inside the island edge', () => {
    const minR = WANDER_MIN_R
    const maxR = WANDER_MIN_R + BOUNDS * WANDER_R_SCALE
    for (const uid of UIDS) {
      const h = hashUid(uid)
      for (let slot = 0; slot < 100; slot++) {
        const { x, z } = waypoint(h, slot, BOUNDS)
        const r = Math.hypot(x, z)
        expect(r).toBeGreaterThanOrEqual(minR)
        expect(r).toBeLessThanOrEqual(maxR)
        // Well inside the island rim, with a wide safety margin
        expect(r).toBeLessThan(plazaEdgeRadius(Math.atan2(z, x)) - 1)
      }
    }
  })

  it('moves between consecutive slots (no stuck waypoints)', () => {
    const h = hashUid(UIDS[4])
    let moved = 0
    for (let slot = 0; slot < 50; slot++) {
      const a = waypoint(h, slot, BOUNDS)
      const b = waypoint(h, slot + 1, BOUNDS)
      if (Math.hypot(a.x - b.x, a.z - b.z) > 0.5) moved++
    }
    expect(moved).toBeGreaterThan(40)
  })
})

describe('currentWaypoint', () => {
  it('matches waypoint(slotIndex(...)) and reports the slot', () => {
    const h = hashUid(UIDS[0])
    const now = 1_750_000_123_456
    const cw = currentWaypoint(h, now, BOUNDS)
    const slot = slotIndex(h, now)
    expect(cw.slot).toBe(slot)
    expect({ x: cw.x, z: cw.z }).toEqual(waypoint(h, slot, BOUNDS))
  })
})

describe('idleVariant / respawnYaw', () => {
  it('idleVariant is deterministic and both variants occur across slots', () => {
    const h = hashUid(UIDS[1])
    const seen = new Set<string>()
    for (let slot = 0; slot < 50; slot++) {
      const v = idleVariant(h, slot)
      expect(idleVariant(h, slot)).toBe(v)
      seen.add(v)
    }
    expect(seen).toEqual(new Set(['idle_bob', 'idle_sway']))
  })

  it('respawnYaw is deterministic and within [0, 2π)', () => {
    const h = hashUid(UIDS[2])
    for (let slot = 0; slot < 20; slot++) {
      const y = respawnYaw(h, slot)
      expect(respawnYaw(h, slot)).toBe(y)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(Math.PI * 2)
    }
  })
})
