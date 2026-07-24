import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  FSIZE,
  plazaEdgeRadius,
  clampToPlazaEdge,
  capsuleFloorY,
  lyingQuat,
  readLyingPose,
  GROUND_Y_APPROX,
  CAP_HALF_APPROX,
  RADIUS_APPROX,
  AXIS_X,
  TILE_MARGIN,
  tileToWorld,
  tileKey,
  isTileInside,
  tilesInsidePlaza,
  nearestFreeTile,
} from './plazaMath'

const TAU = Math.PI * 2

// Normalize an angle difference into (-π, π]
function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}

describe('plazaEdgeRadius', () => {
  it('stays within the square footprint (plus wobble) in every direction', () => {
    for (let i = 0; i < 256; i++) {
      const r = plazaEdgeRadius((i / 256) * TAU)
      expect(r).toBeGreaterThan(FSIZE / 2 * 0.9)     // never collapses inward
      expect(r).toBeLessThan(FSIZE / 2 * Math.SQRT2) // never beyond the square's corner
    }
  })

  it('reaches furthest toward the corners of the squircle', () => {
    // A superellipse with n=4 bulges toward the diagonals relative to a circle
    const onAxis   = plazaEdgeRadius(0)
    const diagonal = plazaEdgeRadius(Math.PI / 4)
    expect(diagonal).toBeGreaterThan(onAxis)
  })
})

describe('clampToPlazaEdge', () => {
  it('leaves interior points untouched', () => {
    const pos = new THREE.Vector3(1, 0.5, -2)
    const moved = clampToPlazaEdge(pos)
    expect(moved).toBe(false)
    expect(pos.x).toBe(1)
    expect(pos.z).toBe(-2)
  })

  it('pulls outside points back to the margin and reports it', () => {
    for (let i = 0; i < 32; i++) {
      const th = (i / 32) * TAU
      const pos = new THREE.Vector3(Math.cos(th) * 100, 0, Math.sin(th) * 100)
      const moved = clampToPlazaEdge(pos)
      expect(moved).toBe(true)
      const r = Math.hypot(pos.x, pos.z)
      const maxR = plazaEdgeRadius(Math.atan2(pos.z, pos.x)) - 0.45
      expect(r).toBeLessThanOrEqual(maxR + 1e-9)
      // Direction is preserved (pure radial pull-in)
      expect(angleDiff(Math.atan2(pos.z, pos.x), th)).toBeCloseTo(0, 9)
    }
  })

  it('does not divide by zero at the exact center', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    expect(clampToPlazaEdge(pos)).toBe(false)
  })
})

describe('capsuleFloorY', () => {
  it('supports an upright body at radius + half-length - center offset', () => {
    const upright = new THREE.Quaternion()
    expect(capsuleFloorY(upright)).toBeCloseTo(
      Math.max(0, RADIUS_APPROX + CAP_HALF_APPROX - GROUND_Y_APPROX),
      6
    )
  })

  it('supports a body lying on its side at capsule radius + lift', () => {
    // Long axis horizontal: uY = 0 → floor = radius + groundY*0... formula:
    // radius + capHalf*|0| - groundY*0 = radius
    const side = new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2)
    expect(capsuleFloorY(side)).toBeCloseTo(RADIUS_APPROX, 6)
  })

  it('never returns a negative floor for any orientation', () => {
    for (let i = 0; i < 128; i++) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(i * 0.7, i * 1.3, i * 2.1)
      )
      expect(capsuleFloorY(q)).toBeGreaterThanOrEqual(0)
    }
  })

  it('is highest when fully inverted (capsule end pointing down)', () => {
    const inverted = new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI)
    const upright  = new THREE.Quaternion()
    expect(capsuleFloorY(inverted)).toBeGreaterThan(capsuleFloorY(upright))
  })
})

describe('placement grid', () => {
  it('every tile reported inside sits within the plaza edge minus the margin', () => {
    for (const t of tilesInsidePlaza()) {
      const { x, z } = tileToWorld(t)
      const r = Math.hypot(x, z)
      const maxR = plazaEdgeRadius(Math.atan2(z, x)) - TILE_MARGIN
      // center tile (r === 0) is always allowed
      if (r > 0) expect(r).toBeLessThanOrEqual(maxR + 1e-9)
      expect(isTileInside(t)).toBe(true)
    }
  })

  it('produces a non-trivial number of plantable tiles', () => {
    expect(tilesInsidePlaza().length).toBeGreaterThan(20)
  })

  it('rejects tiles well outside the island', () => {
    expect(isTileInside({ q: 100, r: 100 })).toBe(false)
  })

  it('nearestFreeTile returns the closest unoccupied tile', () => {
    const taken = new Set<string>()
    const near = nearestFreeTile({ x: 0, z: 0 }, taken)
    expect(near).not.toBeNull()
    // With nothing taken, the closest tile to the origin is the origin tile
    expect(tileKey(near!)).toBe('0,0')
  })

  it('nearestFreeTile skips occupied tiles', () => {
    const taken = new Set<string>(['0,0'])
    const near = nearestFreeTile({ x: 0, z: 0 }, taken)
    expect(near).not.toBeNull()
    expect(tileKey(near!)).not.toBe('0,0')
  })

  it('nearestFreeTile returns null when every tile is taken', () => {
    const taken = new Set<string>(tilesInsidePlaza().map(tileKey))
    expect(nearestFreeTile({ x: 0, z: 0 }, taken)).toBeNull()
  })
})

describe('lyingQuat / readLyingPose', () => {
  it('round-trips heading and roll across the full range', () => {
    const q = new THREE.Quaternion()
    for (let hi = 0; hi < 12; hi++) {
      for (let ri = 0; ri < 12; ri++) {
        const heading = -Math.PI + (hi / 12) * TAU
        const roll    = -Math.PI * 0.95 + (ri / 12) * Math.PI * 1.9
        lyingQuat(q, heading, roll)
        const pose = readLyingPose(q)
        expect(angleDiff(pose.heading, heading)).toBeCloseTo(0, 5)
        expect(angleDiff(pose.roll, roll)).toBeCloseTo(0, 5)
      }
    }
  })

  it('roll 0 lies face-down: body forward (+Z) points at the ground', () => {
    const q = lyingQuat(new THREE.Quaternion(), 0.4, 0)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(forward.y).toBeCloseTo(-1, 5)
  })

  it('roll π lies on the back: body forward points at the sky', () => {
    const q = lyingQuat(new THREE.Quaternion(), -1.1, Math.PI)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(forward.y).toBeCloseTo(1, 5)
  })

  it('lays the long axis horizontal for any pose', () => {
    const q = lyingQuat(new THREE.Quaternion(), 2.2, 1.3)
    const long = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    expect(Math.abs(long.y)).toBeLessThan(1e-6)
  })

  it('is alias-safe: reusing one quaternion as out repeatedly stays correct', () => {
    // Regression: the pre-extraction implementation shared its scratch
    // quaternions with callers, so passing the shared scratch as `out`
    // silently corrupted the pose (the get-up rise started from a wrong
    // orientation). The module now keeps private scratch, so any caller
    // quaternion must work.
    const out = new THREE.Quaternion()
    const expected = lyingQuat(new THREE.Quaternion(), 0.8, 0)
    lyingQuat(out, 0.8, 0)
    expect(out.angleTo(expected)).toBeCloseTo(0, 6)
  })
})
