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
} from './plazaIslands'
import { FSIZE } from './plazaMath'

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
  it('sizes home at the full plaza radius and satellites smaller', () => {
    expect(islandRadius(HOME_ISLAND)).toBeCloseTo(FSIZE / 2, 6)
    for (const i of ISLANDS.slice(1)) {
      expect(islandRadius(i)).toBeLessThan(FSIZE / 2)
    }
  })

  it('has no bridge for home', () => {
    expect(bridgeFor(HOME_ISLAND)).toBeNull()
  })

  it('runs each bridge radially between the two rims without overlapping them', () => {
    for (const i of ISLANDS.slice(1)) {
      const b = bridgeFor(i)!
      expect(b.length).toBeGreaterThan(0)
      // Bridge endpoints sit near each rim, not at the centres
      const fromR = Math.hypot(b.from.x, b.from.z)
      expect(fromR).toBeCloseTo((FSIZE / 2) * 0.95, 6)
      const toR = Math.hypot(b.to.x - i.center.x, b.to.z - i.center.z)
      expect(toR).toBeCloseTo(islandRadius(i) * 0.95, 6)
      // ...and the deck points from home out toward the island
      expect(Math.atan2(i.center.z, i.center.x)).toBeCloseTo(b.angle, 6)
    }
  })

  it('keeps satellites clear of the home island', () => {
    for (const i of ISLANDS.slice(1)) {
      const dist = Math.hypot(i.center.x, i.center.z)
      expect(dist).toBeGreaterThan(FSIZE / 2 + islandRadius(i))
    }
  })

  it('grows the camera framing radius as islands unlock', () => {
    const solo = archipelagoRadius(0)
    const full = archipelagoRadius(99999)
    expect(solo).toBeCloseTo(FSIZE / 2, 6)
    expect(full).toBeGreaterThan(solo)
  })
})
