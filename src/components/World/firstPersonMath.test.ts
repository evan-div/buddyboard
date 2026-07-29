import { describe, it, expect } from 'vitest'
import {
  desiredVelocity,
  stepPlayer,
  applyLook,
  pickInteractable,
  resolveCharacterCollision,
  makePlayerState,
  WALK_SPEED,
  PITCH_LIMIT,
  JUMP_VELOCITY,
  FP_GRAVITY,
  INTERACT_RANGE,
} from './firstPersonMath'

const CLOSE = 1e-9

describe('desiredVelocity', () => {
  it('walks toward -Z at yaw 0 (three.js forward)', () => {
    const v = desiredVelocity({ forward: 1, strafe: 0 }, 0, WALK_SPEED)
    expect(v.x).toBeCloseTo(0, 9)
    expect(v.z).toBeCloseTo(-WALK_SPEED, 9)
  })

  it('strafes toward +X at yaw 0', () => {
    const v = desiredVelocity({ forward: 0, strafe: 1 }, 0, WALK_SPEED)
    expect(v.x).toBeCloseTo(WALK_SPEED, 9)
    expect(v.z).toBeCloseTo(0, 9)
  })

  it('rotates with yaw — a quarter turn sends forward toward -X', () => {
    const v = desiredVelocity({ forward: 1, strafe: 0 }, Math.PI / 2, WALK_SPEED)
    expect(v.x).toBeCloseTo(-WALK_SPEED, 9)
    expect(v.z).toBeCloseTo(0, 9)
  })

  it('normalizes diagonals so W+D is not faster than W', () => {
    const straight = desiredVelocity({ forward: 1, strafe: 0 }, 0, WALK_SPEED)
    const diagonal = desiredVelocity({ forward: 1, strafe: 1 }, 0, WALK_SPEED)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(WALK_SPEED, 9)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z), 9)
  })

  it('is exactly zero with no input, at any yaw', () => {
    const v = desiredVelocity({ forward: 0, strafe: 0 }, 1.234, WALK_SPEED)
    expect(v.x).toBe(0)
    expect(v.z).toBe(0)
  })
})

describe('applyLook', () => {
  it('turns left for negative dx (mouse right lowers yaw)', () => {
    const { yaw } = applyLook(0, 0, 100, 0, 0.002)
    expect(yaw).toBeCloseTo(-0.2, 9)
  })

  it('clamps pitch at both poles no matter how far the mouse travels', () => {
    let s = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 100; i++) s = applyLook(s.yaw, s.pitch, 0, -500, 0.002)
    expect(s.pitch).toBeCloseTo(PITCH_LIMIT, 9)

    s = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 100; i++) s = applyLook(s.yaw, s.pitch, 0, 500, 0.002)
    expect(s.pitch).toBeCloseTo(-PITCH_LIMIT, 9)
  })

  it('wraps yaw into (-PI, PI] instead of growing without bound', () => {
    let s = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 200; i++) s = applyLook(s.yaw, s.pitch, -500, 0, 0.002)
    expect(s.yaw).toBeGreaterThan(-Math.PI - CLOSE)
    expect(s.yaw).toBeLessThanOrEqual(Math.PI + CLOSE)
  })
})

describe('stepPlayer', () => {
  const still = { x: 0, z: 0 }

  it('stays grounded and still with no input', () => {
    const s = makePlayerState()
    const r = stepPlayer(s, still, 1 / 60, false)
    expect(s.grounded).toBe(true)
    expect(s.y).toBe(0)
    expect(r.landed).toBe(false)
  })

  it('leaves the ground on jump and lands once, after roughly the expected airtime', () => {
    const s = makePlayerState()
    stepPlayer(s, still, 1 / 60, true)
    expect(s.grounded).toBe(false)
    expect(s.vy).toBeGreaterThan(0)

    let landings = 0
    let frames = 1
    for (; frames < 600; frames++) {
      if (stepPlayer(s, still, 1 / 60, false).landed) {
        landings++
        break
      }
    }
    expect(landings).toBe(1)
    expect(s.grounded).toBe(true)
    expect(s.y).toBe(0)

    // 2 * v / g, within a frame either side of the discrete integration
    const expectedFrames = (2 * JUMP_VELOCITY / FP_GRAVITY) * 60
    expect(frames).toBeGreaterThan(expectedFrames - 3)
    expect(frames).toBeLessThan(expectedFrames + 3)
  })

  it('reports a positive landing speed so callers can scale the thud', () => {
    const s = makePlayerState()
    stepPlayer(s, still, 1 / 60, true)
    let landSpeed = 0
    for (let i = 0; i < 600; i++) {
      const r = stepPlayer(s, still, 1 / 60, false)
      if (r.landed) { landSpeed = r.landSpeed; break }
    }
    expect(landSpeed).toBeGreaterThan(0)
  })

  it('ignores a jump requested while airborne', () => {
    const s = makePlayerState()
    stepPlayer(s, still, 1 / 60, true)
    const apexV = s.vy
    stepPlayer(s, still, 1 / 60, true)
    // Only gravity should have acted — no second impulse.
    expect(s.vy).toBeLessThan(apexV)
    expect(s.vy).toBeCloseTo(apexV - FP_GRAVITY / 60, 9)
  })

  it('accelerates toward the target speed without overshooting it', () => {
    const s = makePlayerState()
    const desired = desiredVelocity({ forward: 1, strafe: 0 }, 0, WALK_SPEED)
    for (let i = 0; i < 120; i++) stepPlayer(s, desired, 1 / 60, false)
    expect(Math.hypot(s.vx, s.vz)).toBeLessThanOrEqual(WALK_SPEED + CLOSE)
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(WALK_SPEED, 6)
  })

  it('brings a moving player to a full stop under friction', () => {
    const s = makePlayerState()
    s.vx = WALK_SPEED
    for (let i = 0; i < 120; i++) stepPlayer(s, still, 1 / 60, false)
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(0, 9)
  })
})

describe('pickInteractable', () => {
  const at = (uid: string, x: number, z: number) => ({ uid, x, z })

  it('picks the nearer of two candidates ahead of you', () => {
    // yaw 0 looks toward -Z
    const near = at('near', 0, -1)
    const far  = at('far', 0, -2)
    expect(pickInteractable([far, near], 0, 0, 0)?.uid).toBe('near')
  })

  it('ignores someone standing directly behind you', () => {
    expect(pickInteractable([at('behind', 0, 1)], 0, 0, 0)).toBeNull()
  })

  it('ignores someone beyond interact range', () => {
    expect(pickInteractable([at('yonder', 0, -(INTERACT_RANGE + 0.1))], 0, 0, 0)).toBeNull()
  })

  it('follows where you are looking, not where you are facing by default', () => {
    const east = at('east', 1, 0)
    expect(pickInteractable([east], 0, 0, 0)).toBeNull()
    // Turning to look toward +X brings them into the cone
    expect(pickInteractable([east], 0, 0, -Math.PI / 2)?.uid).toBe('east')
  })

  it('returns null for an empty candidate list', () => {
    expect(pickInteractable([], 0, 0, 0)).toBeNull()
  })
})

describe('resolveCharacterCollision', () => {
  it('leaves a clear position untouched', () => {
    const r = resolveCharacterCollision(0, 0, [{ x: 5, z: 5 }], 0.6)
    expect(r.x).toBe(0)
    expect(r.z).toBe(0)
  })

  it('separates an overlap to exactly the minimum distance', () => {
    const other = { x: 0.2, z: 0 }
    const r = resolveCharacterCollision(0, 0, [other], 0.6)
    expect(Math.hypot(r.x - other.x, r.z - other.z)).toBeCloseTo(0.6, 9)
  })

  it('does not produce NaN when exactly coincident', () => {
    const r = resolveCharacterCollision(1, 1, [{ x: 1, z: 1 }], 0.6)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.z)).toBe(true)
  })

  it('handles being wedged between two characters', () => {
    const others = [{ x: 0.2, z: 0 }, { x: -0.2, z: 0 }]
    const r = resolveCharacterCollision(0, 0, others, 0.6)
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.z)).toBe(true)
  })
})
