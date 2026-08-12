import { describe, it, expect } from 'vitest'
import {
  GRASS_MIN_FRACTION,
  GRASS_STEPS,
  screenCoverage,
  grassFraction,
  grassStep,
  grassCountFor,
} from './plazaGrass'

describe('screenCoverage', () => {
  it('grows as the camera closes in', () => {
    const far = screenCoverage(16, 120, 60)
    const near = screenCoverage(16, 30, 60)
    expect(near).toBeGreaterThan(far)
  })

  it('stays in 0..1 for any sane camera', () => {
    for (const distance of [0, 0.5, 5, 40, 400, 10_000]) {
      const c = screenCoverage(16, distance, 60)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('grassFraction', () => {
  it('never leaves an island bald', () => {
    // The whole point of the dial: you can see grass on every island in the
    // wide shot, however far away it is.
    for (const coverage of [0, 0.001, 0.01, 0.05]) {
      expect(grassFraction(coverage)).toBeGreaterThanOrEqual(GRASS_MIN_FRACTION)
    }
  })

  it('reaches full density when an island fills the frame', () => {
    expect(grassFraction(1)).toBeCloseTo(1, 6)
  })

  it('is monotonic in coverage', () => {
    let previous = -Infinity
    for (let i = 0; i <= 100; i++) {
      const f = grassFraction(i / 100)
      expect(f).toBeGreaterThanOrEqual(previous)
      previous = f
    }
  })

  it('stays within 0..1', () => {
    for (let i = -10; i <= 110; i++) {
      const f = grassFraction(i / 100)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
})

describe('grassStep', () => {
  it('is a whole step inside the range', () => {
    for (let i = 0; i <= 100; i++) {
      const step = grassStep(i / 100)
      expect(Number.isInteger(step)).toBe(true)
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step).toBeLessThanOrEqual(GRASS_STEPS)
    }
  })

  it('is monotonic, so approaching an island only ever thickens it', () => {
    let previous = -1
    for (let i = 0; i <= 100; i++) {
      const step = grassStep(i / 100)
      expect(step).toBeGreaterThanOrEqual(previous)
      previous = step
    }
  })
})

describe('grassCountFor', () => {
  it('renders at least one blade even at the bottom step', () => {
    expect(grassCountFor(40_000, 0)).toBeGreaterThanOrEqual(1)
  })

  it('never asks for more blades than were generated', () => {
    for (let step = 0; step <= GRASS_STEPS + 3; step++) {
      expect(grassCountFor(1_000, step)).toBeLessThanOrEqual(1_000)
    }
  })

  it('renders everything at the top step', () => {
    expect(grassCountFor(1_000, GRASS_STEPS)).toBe(1_000)
  })
})
