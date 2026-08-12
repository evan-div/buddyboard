import { describe, it, expect } from 'vitest'
import { shroudFade } from './PlazaArchipelago'

// The fade that keeps an unearned island a mystery at every range. Far out the
// sky rings in front of it do the hiding and it can sit at full strength; up
// close those rings are behind the camera, so the silhouette has to thin out or
// it reads as a flat grey slab (which is exactly how it looked before).
describe('shroudFade', () => {
  it('is at full strength once the camera is far off', () => {
    expect(shroudFade(95)).toBe(1)
    expect(shroudFade(400)).toBe(1)
  })

  it('thins the silhouette up close, without erasing it', () => {
    const near = shroudFade(10)
    expect(near).toBeLessThan(0.5)
    expect(near).toBeGreaterThan(0.2)
    // Clamped, not extrapolated — a camera inside the shroud can't invert it.
    expect(shroudFade(0)).toBe(near)
  })

  it('never gets *more* legible as the camera approaches', () => {
    let prev = shroudFade(0)
    for (let d = 5; d <= 200; d += 5) {
      const fade = shroudFade(d)
      expect(fade).toBeGreaterThanOrEqual(prev)
      prev = fade
    }
  })
})
