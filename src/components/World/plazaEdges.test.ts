import { describe, it, expect } from 'vitest'
import {
  FSIZE,
  HOME_EDGE,
  EXP_RANGE,
  EDGE_AMPLITUDE_MAX,
  edgeRadius,
  edgeKey,
  edgeMinRadius,
  edgeMaxRadius,
  edgeMaxExtent,
  makeEdgeShape,
  plazaEdgeRadius,
  type EdgeShape,
} from './plazaMath'
import { ISLANDS, HOME_ISLAND, edgeForIsland } from './plazaIslands'
import { mix } from './plazaWalk'

const TAU = Math.PI * 2

// Every island the game can ever raise, not just the four we ship: the budget
// in makeEdgeShape is what keeps these invariants true, so it is what gets
// tested. A shipped island failing one of these is a bug; a *hypothetical* one
// failing means the budget was widened without checking what it protects.
const FUZZ = Array.from({ length: 500 }, (_, i) => makeEdgeShape(mix(i, 0x15e1)))
const SHIPPED = ISLANDS.map((i) => i.edge)
const ALL_EDGES = [...SHIPPED, ...FUZZ]

function sample(edge: EdgeShape, n: number): number[] {
  return Array.from({ length: n }, (_, i) => edgeRadius((i / n) * TAU, edge))
}

// These properties are checked over ~500 shapes × ~2000 angles. Asserting per
// sample would mean a million expect() calls — which costs seconds of test time
// and reports a failure as one anonymous number. Reduce first, assert once, and
// name the shape that broke it.
function worstEdge<T>(
  edges: readonly EdgeShape[],
  measure: (edge: EdgeShape) => T,
  worseThan: (a: T, b: T) => boolean,
): { edge: EdgeShape; value: T } {
  let worst = { edge: edges[0], value: measure(edges[0]) }
  for (const edge of edges.slice(1)) {
    const value = measure(edge)
    if (worseThan(value, worst.value)) worst = { edge, value }
  }
  return worst
}

describe('home is untouched', () => {
  // The single most important test in the archipelago work. Every rock, blade,
  // tile and physics bound on the home island is derived from this curve, so
  // the generalized evaluator has to reproduce it *bit for bit* — not close,
  // identical. Transcribed from the original implementation on purpose: if
  // someone reassociates the additions inside edgeRadius (`1 + (t1 + t2)`
  // instead of `(1 + t1) + t2`) the result moves by an ulp and this fails.
  function legacyEdgeRadius(theta: number): number {
    const EDGE_EXP = 4
    const c = Math.abs(Math.cos(theta))
    const s = Math.abs(Math.sin(theta))
    const base = (FSIZE / 2) / Math.pow(c ** EDGE_EXP + s ** EDGE_EXP, 1 / EDGE_EXP)
    const wobble = 1 + 0.025 * Math.sin(theta * 5 + 1.7) + 0.015 * Math.sin(theta * 9 + 0.4)
    return base * wobble
  }

  it('reproduces the original outline exactly', () => {
    for (let i = 0; i < 1024; i++) {
      const theta = (i / 1024) * TAU
      expect(Object.is(edgeRadius(theta, HOME_EDGE), legacyEdgeRadius(theta))).toBe(true)
      expect(Object.is(plazaEdgeRadius(theta), legacyEdgeRadius(theta))).toBe(true)
    }
  })

  it('is the home islandardless of what the seeder would produce', () => {
    expect(edgeForIsland(HOME_ISLAND.id)).toBe(HOME_EDGE)
  })
})

describe('edge shapes stay inside the plaza envelope', () => {
  it('never collapses inward', () => {
    const worst = worstEdge(ALL_EDGES, (e) => Math.min(...sample(e, 512)), (a, b) => a < b)
    expect(worst.value, `narrowest shape: ${JSON.stringify(worst.edge)}`)
      .toBeGreaterThan((FSIZE / 2) * 0.9)
  })

  it('never reaches past the square corner', () => {
    const worst = worstEdge(ALL_EDGES, (e) => Math.max(...sample(e, 512)), (a, b) => a > b)
    expect(worst.value, `widest shape: ${JSON.stringify(worst.edge)}`)
      .toBeLessThan((FSIZE / 2) * Math.SQRT2)
  })

  it('still bulges toward the corners like a squircle', () => {
    // This is the invariant the amplitude budget exists to protect: the wobble
    // must never be strong enough to flatten a diagonal below an axis, or the
    // islands stop reading as the same family of shape.
    const worst = worstEdge(
      ALL_EDGES,
      (e) => edgeRadius(Math.PI / 4, e) - edgeRadius(0, e),
      (a, b) => a < b,
    )
    expect(worst.value, `flattest diagonal: ${JSON.stringify(worst.edge)}`).toBeGreaterThan(0)
  })

  it('closes on itself — the harmonics are whole cycles', () => {
    // A fractional frequency puts a notch in the outline at bearing 0, and the
    // dirt column, the grass rejection and the tile test all inherit it.
    for (const edge of ALL_EDGES) {
      expect(Number.isInteger(edge.k1)).toBe(true)
      expect(Number.isInteger(edge.k2)).toBe(true)
      expect(edgeRadius(0, edge)).toBeCloseTo(edgeRadius(TAU, edge), 10)
    }
  })

  it('keeps every generated shape inside the documented budget', () => {
    for (const edge of FUZZ) {
      expect(edge.a1 + edge.a2).toBeLessThanOrEqual(EDGE_AMPLITUDE_MAX)
      expect(edge.exp).toBeGreaterThanOrEqual(EXP_RANGE[0])
      expect(edge.exp).toBeLessThanOrEqual(EXP_RANGE[1])
    }
  })
})

describe('derived extremes', () => {
  // Sampled finer than the scan that produced the bounds, so a too-coarse scan
  // shows up here rather than as blades hanging over the void.
  it('bound the sampled radius', () => {
    const worst = worstEdge(
      ALL_EDGES,
      (e) => {
        const rs = sample(e, 2048)
        // How far outside [min, max] the curve strays, as a fraction.
        return Math.max(
          (edgeMinRadius(e) - Math.min(...rs)) / edgeMinRadius(e),
          (Math.max(...rs) - edgeMaxRadius(e)) / edgeMaxRadius(e),
        )
      },
      (a, b) => a > b,
    )
    expect(worst.value, `escapes its bounds: ${JSON.stringify(worst.edge)}`).toBeLessThanOrEqual(0)
  })

  it('bound the outline in x — the grass sampler depends on it', () => {
    const worst = worstEdge(
      ALL_EDGES,
      (e) => {
        let widest = 0
        for (let i = 0; i < 2048; i++) {
          const theta = (i / 2048) * TAU
          widest = Math.max(widest, Math.abs(Math.cos(theta) * edgeRadius(theta, e)))
        }
        return widest - edgeMaxExtent(e)
      },
      (a, b) => a > b,
    )
    expect(worst.value, `wider than reported: ${JSON.stringify(worst.edge)}`).toBeLessThanOrEqual(0)
  })

  it('reports home the same way the old constants did', () => {
    expect(edgeMaxRadius(HOME_EDGE)).toBeGreaterThan(FSIZE / 2)   // the squircle bulges past 13
    expect(edgeMinRadius(HOME_EDGE)).toBeLessThan(FSIZE / 2)
  })
})

describe('per-island seeding', () => {
  it('is stable across calls', () => {
    for (const island of ISLANDS) {
      expect(edgeForIsland(island.id)).toEqual(edgeForIsland(island.id))
    }
  })

  it('gives every island a visibly different silhouette', () => {
    // Not "different numbers" — different *shapes*. Two islands whose rims
    // never diverge by a fifth of a character width read as copies.
    const MIN_DIVERGENCE = 0.3
    for (let a = 0; a < SHIPPED.length; a++) {
      for (let b = a + 1; b < SHIPPED.length; b++) {
        let worst = 0
        for (let i = 0; i < 720; i++) {
          const theta = (i / 720) * TAU
          worst = Math.max(worst, Math.abs(edgeRadius(theta, SHIPPED[a]) - edgeRadius(theta, SHIPPED[b])))
        }
        expect(worst).toBeGreaterThan(MIN_DIVERGENCE)
      }
    }
  })

  it('gives distinguishable keys to distinguishable shapes', () => {
    expect(new Set(SHIPPED.map(edgeKey)).size).toBe(SHIPPED.length)
    expect(edgeKey(HOME_EDGE)).toBe(edgeKey({ ...HOME_EDGE }))
  })
})
