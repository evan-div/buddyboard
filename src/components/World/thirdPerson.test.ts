import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  smoothFactor,
  shortestAngle,
  cameraBasis,
  makeMoveState,
  stepMovement,
  makeCamState,
  applyLook,
  applyZoom,
  stepCamera,
  cameraPlacement,
  nearestInteractable,
  WALK_SPEED,
  SPRINT_SPEED,
  JUMP_SPEED,
  JUMP_GRAVITY,
  isOverIsland,
  timeToLand,
  FALL_HANDOFF_Y,
  FLIP_MIN_DURATION,
  CAM_MIN_DIST,
  CAM_MAX_DIST,
  CAM_PIVOT_Y,
  PITCH_MIN,
  PITCH_MAX,
  FOV_BASE,
  FOV_WIDEN,
  SHOULDER,
  SHOULDER_LOOK,
  INTERACT_RANGE,
  placeCardBeside,
  charHalfWidthPx,
  CARD_GAP,
  CARD_RISE,
  CARD_MARGIN,
  CHAR_HALF_WIDTH_PX_MAX,
  compressFacing,
  resolveCharacterOverlap,
  CHAR_RADIUS,
  type MoveInput,
} from './thirdPerson'
import { plazaEdgeRadius } from './plazaMath'

const DT = 1 / 60
const STILL: MoveInput = { forward: 0, strafe: 0, sprint: false, jump: false, flip: false }
const input = (o: Partial<MoveInput>): MoveInput => ({ ...STILL, ...o })

// Run n frames of movement with a constant input
function run(s: ReturnType<typeof makeMoveState>, i: MoveInput, n: number, camYaw = 0, dt = DT) {
  for (let f = 0; f < n; f++) stepMovement(s, i, camYaw, dt)
}

describe('smoothFactor', () => {
  it('stays within [0,1) and grows with rate and dt', () => {
    expect(smoothFactor(5, DT)).toBeGreaterThan(0)
    expect(smoothFactor(5, DT)).toBeLessThan(1)
    expect(smoothFactor(10, DT)).toBeGreaterThan(smoothFactor(5, DT))
    expect(smoothFactor(5, 0.1)).toBeGreaterThan(smoothFactor(5, DT))
  })

  it('returns 0 for a non-positive dt (a stalled frame must not jump the camera)', () => {
    expect(smoothFactor(9, 0)).toBe(0)
    expect(smoothFactor(9, -1)).toBe(0)
  })

  // The whole reason this function exists: the same rate must produce the same
  // convergence regardless of how the frames are chopped up.
  it('is frame-rate independent — two half-steps equal one full step', () => {
    const rate = 7.5
    const oneStep = 1 - (1 - smoothFactor(rate, 0.1))
    const twoHalves = 1 - (1 - smoothFactor(rate, 0.05)) * (1 - smoothFactor(rate, 0.05))
    expect(twoHalves).toBeCloseTo(oneStep, 12)
  })

  it('converges to the same place at 60fps and 144fps', () => {
    const rate = 7.5, seconds = 0.5
    let a = 0, b = 0
    for (let t = 0; t < seconds; t += 1 / 60)  a += (1 - a) * smoothFactor(rate, 1 / 60)
    for (let t = 0; t < seconds; t += 1 / 144) b += (1 - b) * smoothFactor(rate, 1 / 144)
    expect(Math.abs(a - b)).toBeLessThan(0.005)
  })
})

describe('shortestAngle', () => {
  it('takes the short way around the wrap', () => {
    expect(shortestAngle(0, 0.5)).toBeCloseTo(0.5, 10)
    expect(shortestAngle(0.1, -0.1)).toBeCloseTo(-0.2, 10)
    // 350° → 10° is +20°, not -340°
    expect(shortestAngle(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 10)
    expect(shortestAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 10)
  })

  it('stays within (-π, π]', () => {
    for (let a = -8; a < 8; a += 0.37)
      for (let b = -8; b < 8; b += 0.53) {
        const d = shortestAngle(a, b)
        expect(d).toBeGreaterThan(-Math.PI - 1e-9)
        expect(d).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
  })
})

describe('cameraBasis', () => {
  it('points forward down -Z and right down +X at yaw 0 (three.js default view)', () => {
    const { fx, fz, rx, rz } = cameraBasis(0)
    expect(fx).toBeCloseTo(0, 10)
    expect(fz).toBeCloseTo(-1, 10)
    expect(rx).toBeCloseTo(1, 10)
    expect(rz).toBeCloseTo(0, 10)
  })

  it('is orthonormal at every yaw', () => {
    for (let y = -Math.PI; y < Math.PI; y += 0.31) {
      const { fx, fz, rx, rz } = cameraBasis(y)
      expect(Math.hypot(fx, fz)).toBeCloseTo(1, 10)
      expect(Math.hypot(rx, rz)).toBeCloseTo(1, 10)
      expect(fx * rx + fz * rz).toBeCloseTo(0, 10)
    }
  })
})

describe('stepMovement — camera-relative walking', () => {
  it('walks W into the screen, and rotating the camera rotates the walk', () => {
    const s = makeMoveState()
    run(s, input({ forward: 1 }), 60, 0)
    expect(s.pos.z).toBeLessThan(-0.5)   // -Z is "into the screen" at yaw 0
    expect(Math.abs(s.pos.x)).toBeLessThan(1e-6)

    // Same key, camera turned 90°: the character now walks along -X
    const t = makeMoveState()
    run(t, input({ forward: 1 }), 60, Math.PI / 2)
    expect(t.pos.x).toBeLessThan(-0.5)
    expect(Math.abs(t.pos.z)).toBeLessThan(1e-6)
  })

  it('strafes D to the camera-right', () => {
    const s = makeMoveState()
    run(s, input({ strafe: 1 }), 60, 0)
    expect(s.pos.x).toBeGreaterThan(0.5)
    expect(Math.abs(s.pos.z)).toBeLessThan(1e-6)
  })

  // 60 frames is a full second — long past the ~0.2s ramp to terminal speed,
  // but short enough that a sprint doesn't reach the island rim and get clamped.
  it('settles at walk speed, and sprint is faster', () => {
    const walk = makeMoveState()
    run(walk, input({ forward: 1 }), 60)
    expect(walk.speed).toBeCloseTo(WALK_SPEED, 4)

    const sprint = makeMoveState()
    run(sprint, input({ forward: 1, sprint: true }), 60)
    expect(sprint.speed).toBeCloseTo(SPRINT_SPEED, 4)
    expect(sprint.speed).toBeGreaterThan(walk.speed)
  })

  it('does not let diagonals outrun the cardinals', () => {
    const straight = makeMoveState()
    run(straight, input({ forward: 1 }), 60)
    const diagonal = makeMoveState()
    run(diagonal, input({ forward: 1, strafe: 1 }), 60)
    expect(diagonal.speed).toBeCloseTo(straight.speed, 6)
  })

  it('eases to a stop when the keys are released rather than halting dead', () => {
    const s = makeMoveState()
    run(s, input({ forward: 1, sprint: true }), 60)
    const moving = s.speed
    stepMovement(s, STILL, 0, DT)
    expect(s.speed).toBeLessThan(moving)
    expect(s.speed).toBeGreaterThan(0)   // momentum, not an instant stop
    run(s, STILL, 120)
    expect(s.speed).toBeCloseTo(0, 6)
  })

  it('reports the acceleration that drives the camera lag', () => {
    const s = makeMoveState()
    stepMovement(s, input({ forward: 1 }), 0, DT)
    // Accelerating into the screen: acceleration points -Z
    expect(s.accel.z).toBeLessThan(0)
    run(s, input({ forward: 1 }), 240)
    expect(s.accel.length()).toBeCloseTo(0, 6)   // at speed, no acceleration
  })
})

describe('stepMovement — jumping', () => {
  it('leaves the ground, peaks near the analytic apex, and lands', () => {
    const s = makeMoveState()
    stepMovement(s, input({ jump: true }), 0, DT)
    expect(s.grounded).toBe(false)

    let apex = 0, frames = 1
    while (!s.grounded && frames < 1000) {
      stepMovement(s, STILL, 0, DT)
      apex = Math.max(apex, s.pos.y)
      frames++
    }
    const analyticApex    = (JUMP_SPEED * JUMP_SPEED) / (2 * JUMP_GRAVITY)
    const analyticAirtime = (2 * JUMP_SPEED) / JUMP_GRAVITY
    expect(apex).toBeGreaterThan(analyticApex * 0.9)
    expect(apex).toBeLessThan(analyticApex * 1.1)
    expect(frames * DT).toBeCloseTo(analyticAirtime, 1)
    expect(s.pos.y).toBe(0)               // lands exactly on the floor
    expect(s.vel.y).toBe(0)
  })

  it('ignores a jump that arrives mid-air (no double jump)', () => {
    const s = makeMoveState()
    stepMovement(s, input({ jump: true }), 0, DT)
    const vyAfterLaunch = s.vel.y
    stepMovement(s, input({ jump: true }), 0, DT)
    expect(s.vel.y).toBeLessThan(vyAfterLaunch)   // still falling off, not re-kicked
  })

  it('keeps steering authority in the air, but reduced', () => {
    const ground = makeMoveState()
    stepMovement(ground, input({ forward: 1 }), 0, DT)
    const air = makeMoveState()
    stepMovement(air, input({ jump: true }), 0, DT)
    stepMovement(air, input({ forward: 1 }), 0, DT)
    expect(air.speed).toBeGreaterThan(0)
    expect(air.speed).toBeLessThan(ground.speed)
  })
})

describe('isOverIsland', () => {
  it('agrees with the plaza outline in every direction', () => {
    for (let th = -Math.PI; th < Math.PI; th += 0.3) {
      const r = plazaEdgeRadius(th)
      const inside = { x: Math.cos(th) * (r - 0.2), z: Math.sin(th) * (r - 0.2) }
      const outside = { x: Math.cos(th) * (r + 0.2), z: Math.sin(th) * (r + 0.2) }
      expect(isOverIsland(inside.x, inside.z)).toBe(true)
      expect(isOverIsland(outside.x, outside.z)).toBe(false)
    }
  })

  it('treats the centre as solid ground', () => {
    expect(isOverIsland(0, 0)).toBe(true)
  })
})

// The walker used to be fenced in. Now the rim is a cliff: ground only exists
// over the island, so you can walk off and fall.
describe('stepMovement — walking off the island', () => {
  it('crosses the rim and starts falling instead of stopping', () => {
    const s = makeMoveState()
    run(s, input({ forward: 1, sprint: true }), 600, 0)
    expect(isOverIsland(s.pos.x, s.pos.z)).toBe(false)   // out past the edge
    expect(s.grounded).toBe(false)
    expect(s.pos.y).toBeLessThan(0)                      // and dropping
    expect(s.vel.y).toBeLessThan(0)
  })

  it('falls from any heading, not just one', () => {
    for (let camYaw = -Math.PI; camYaw < Math.PI; camYaw += Math.PI / 5) {
      const s = makeMoveState()
      run(s, input({ forward: 1, sprint: true }), 700, camYaw)
      expect(s.pos.y).toBeLessThan(FALL_HANDOFF_Y)
    }
  })

  it('keeps accelerating downward once clear of the island', () => {
    const s = makeMoveState()
    run(s, input({ forward: 1, sprint: true }), 600, 0)
    const firstY = s.pos.y
    const firstVy = s.vel.y
    run(s, input({ forward: 1, sprint: true }), 60, 0)
    expect(s.pos.y).toBeLessThan(firstY)
    expect(s.vel.y).toBeLessThan(firstVy)   // gravity still applies out there
  })

  it('still walks normally well inside the island', () => {
    const s = makeMoveState()
    run(s, input({ forward: 1 }), 60, 0)
    expect(isOverIsland(s.pos.x, s.pos.z)).toBe(true)
    expect(s.grounded).toBe(true)
    expect(s.pos.y).toBe(0)
  })

  it('lands back on the island when a jump comes down inside it', () => {
    const s = makeMoveState()
    stepMovement(s, input({ jump: true }), 0, DT)
    for (let f = 0; f < 200 && !s.grounded; f++) stepMovement(s, STILL, 0, DT)
    expect(s.grounded).toBe(true)
    expect(s.pos.y).toBe(0)
  })
})

describe('timeToLand', () => {
  it('matches the analytic airtime from the ground', () => {
    expect(timeToLand(0, JUMP_SPEED)).toBeCloseTo((2 * JUMP_SPEED) / JUMP_GRAVITY, 10)
  })

  it('grows with height and with upward speed', () => {
    expect(timeToLand(2, 0)).toBeGreaterThan(timeToLand(1, 0))
    expect(timeToLand(1, 5)).toBeGreaterThan(timeToLand(1, 0))
  })

  it('is never negative, even falling from the floor', () => {
    expect(timeToLand(0, -5)).toBeGreaterThanOrEqual(0)
    expect(timeToLand(0, 0)).toBe(0)
  })
})

describe('stepMovement — backflip', () => {
  const jumpThenFlip = () => {
    const s = makeMoveState()
    stepMovement(s, input({ jump: true }), 0, DT)     // first tap
    stepMovement(s, input({ flip: true }), 0, DT)     // second tap, mid-rise
    return s
  }

  it('starts a flip on the second tap while rising', () => {
    const s = jumpThenFlip()
    expect(s.flipping).toBe(true)
    expect(s.flip).toBeGreaterThan(0)
  })

  it('does nothing on the ground — a flip needs air', () => {
    const s = makeMoveState()
    stepMovement(s, input({ flip: true }), 0, DT)
    expect(s.flipping).toBe(false)
    expect(s.flip).toBe(0)
    expect(s.grounded).toBe(true)
  })

  it('will not start once you are already falling', () => {
    const s = makeMoveState()
    stepMovement(s, input({ jump: true }), 0, DT)
    while (s.vel.y > 0) stepMovement(s, STILL, 0, DT)   // past the apex
    stepMovement(s, input({ flip: true }), 0, DT)
    expect(s.flipping).toBe(false)
  })

  it('completes exactly one rotation and lands upright', () => {
    const s = jumpThenFlip()
    let maxFlip = 0
    for (let f = 0; f < 400 && !s.grounded; f++) {
      stepMovement(s, STILL, 0, DT)
      maxFlip = Math.max(maxFlip, s.flip)
    }
    expect(s.grounded).toBe(true)
    expect(maxFlip).toBeGreaterThan(0.9)   // came all the way round…
    expect(maxFlip).toBeLessThanOrEqual(1)  // …and no further
    expect(s.flip).toBe(0)                  // upright again on landing
    expect(s.flipping).toBe(false)
  })

  it('never rests part-way through a rotation', () => {
    const s = jumpThenFlip()
    for (let f = 0; f < 400 && !s.grounded; f++) stepMovement(s, STILL, 0, DT)
    for (let f = 0; f < 60; f++) stepMovement(s, STILL, 0, DT)
    expect(s.flip).toBe(0)
  })

  it('rotates monotonically — no stutter or reversal', () => {
    const s = jumpThenFlip()
    let prev = s.flip
    while (!s.grounded) {
      stepMovement(s, STILL, 0, DT)
      if (s.grounded) break
      expect(s.flip).toBeGreaterThanOrEqual(prev)
      prev = s.flip
    }
  })

  it('gives enough air for the flip to finish', () => {
    const s = jumpThenFlip()
    let frames = 0
    while (!s.grounded && frames < 400) { stepMovement(s, STILL, 0, DT); frames++ }
    expect(frames * DT).toBeGreaterThan(FLIP_MIN_DURATION)
  })

  it('a second flip request mid-flip is ignored', () => {
    const s = jumpThenFlip()
    const dur = s.flipDur
    stepMovement(s, input({ flip: true }), 0, DT)
    expect(s.flipDur).toBe(dur)
  })

  it('can still steer during a flip', () => {
    const s = jumpThenFlip()
    for (let f = 0; f < 20; f++) stepMovement(s, input({ forward: 1 }), 0, DT)
    expect(s.speed).toBeGreaterThan(0)
  })
})

describe('stepMovement — facing', () => {
  it('eases toward the travel direction instead of snapping', () => {
    const s = makeMoveState()
    stepMovement(s, input({ forward: 1 }), 0, DT)
    // Walking toward -Z means a facing of atan2(0,-1) = π, matching
    // MiiCharacter's rotation.y = atan2(dx, dz) convention.
    expect(Math.abs(s.yaw)).toBeGreaterThan(0)
    expect(Math.abs(s.yaw)).toBeLessThan(Math.PI)   // partway, not there yet
    run(s, input({ forward: 1 }), 120)
    expect(Math.abs(shortestAngle(s.yaw, Math.PI))).toBeLessThan(0.01)
  })

  it('holds its facing when there is no input', () => {
    const s = makeMoveState(0, 0, 1.234)
    run(s, STILL, 60)
    expect(s.yaw).toBe(1.234)
  })
})

describe('compressFacing', () => {
  const deg = (r: number) => (r * 180) / Math.PI
  const rad = (d: number) => (d * Math.PI) / 180

  it('leaves straight ahead and a full backpedal untouched', () => {
    expect(compressFacing(0)).toBeCloseTo(0, 10)
    expect(compressFacing(Math.PI)).toBeCloseTo(Math.PI, 10)
    expect(compressFacing(-Math.PI)).toBeCloseTo(-Math.PI, 10)
  })

  it('pulls a sideways step back to a three-quarter view', () => {
    // 90° off camera-forward is the pure-strafe profile case
    expect(deg(compressFacing(rad(90)))).toBeCloseTo(90 - deg(0.52), 6)
    expect(deg(compressFacing(rad(90)))).toBeLessThan(65)
    expect(deg(compressFacing(rad(90)))).toBeGreaterThan(55)
  })

  it('is symmetric about zero', () => {
    for (let d = 5; d <= 175; d += 10)
      expect(compressFacing(rad(-d))).toBeCloseTo(-compressFacing(rad(d)), 12)
  })

  it('never reverses — a bigger input angle always turns further', () => {
    let prev = -Infinity
    for (let d = 0; d <= 180; d += 1) {
      const v = compressFacing(rad(d))
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('only ever reduces the turn, never exaggerates it', () => {
    for (let d = 0; d <= 180; d += 3) {
      const v = deg(compressFacing(rad(d)))
      expect(v).toBeLessThanOrEqual(d + 1e-9)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('stepMovement — the facing mode is opt-in', () => {
  // Everything else in this file calls the four-argument form. This pins that
  // the fifth parameter defaults to the behaviour those 900 lines describe, so
  // adding the tap-to-move caller can't have moved the desktop feel.
  it('defaults to camera-relative facing', () => {
    const implicit = makeMoveState()
    const explicit = makeMoveState()
    const i = input({ forward: 1, strafe: 1 })

    for (let n = 0; n < 90; n++) {
      stepMovement(implicit, i, 0.7, DT)
      stepMovement(explicit, i, 0.7, DT, 'camera')
    }
    expect(implicit.yaw).toBe(explicit.yaw)
    expect(implicit.pos.x).toBe(explicit.pos.x)
    expect(implicit.pos.z).toBe(explicit.pos.z)
    expect(implicit.speed).toBe(explicit.speed)
  })

  it("'travel' faces the way the character is actually going", () => {
    const s = makeMoveState()
    // Pure strafe: the case compression bends the furthest.
    for (let n = 0; n < 200; n++) stepMovement(s, input({ strafe: 1 }), 0, DT, 'travel')
    const { rx, rz } = cameraBasis(0)
    expect(s.yaw).toBeCloseTo(Math.atan2(rx, rz), 3)
  })

  it("'travel' still moves identically — only the facing differs", () => {
    const camera = makeMoveState()
    const travel = makeMoveState()
    const i = input({ forward: 1, strafe: -1, sprint: true })

    for (let n = 0; n < 120; n++) {
      stepMovement(camera, i, 1.1, DT, 'camera')
      stepMovement(travel, i, 1.1, DT, 'travel')
    }
    expect(travel.pos.x).toBeCloseTo(camera.pos.x, 12)
    expect(travel.pos.z).toBeCloseTo(camera.pos.z, 12)
    expect(travel.speed).toBeCloseTo(camera.speed, 12)
    expect(travel.yaw).not.toBeCloseTo(camera.yaw, 2)
  })
})

describe('stepMovement — facing under compression', () => {
  const faceOffset = (input: MoveInput, camYaw = 0) => {
    const s = makeMoveState()
    run(s, input, 200, camYaw)
    // camera-forward at camYaw is atan2(-sin, -cos) = camYaw + π
    return (shortestAngle(camYaw + Math.PI, s.yaw) * 180) / Math.PI
  }

  it('faces dead ahead when running straight forward', () => {
    expect(Math.abs(faceOffset(input({ forward: 1 })))).toBeLessThan(1)
  })

  // Before compression these were 45° / 90°; the 90° case was a pure profile.
  it('keeps the back to camera on a diagonal', () => {
    expect(Math.abs(faceOffset(input({ forward: 1, strafe: 1 })))).toBeLessThan(35)
  })

  it('no longer shows a full profile on a pure strafe', () => {
    const off = Math.abs(faceOffset(input({ strafe: 1 })))
    expect(off).toBeLessThan(65)
    expect(off).toBeGreaterThan(50)   // still visibly angled into the step
  })

  it('still turns all the way around to backpedal', () => {
    expect(Math.abs(faceOffset(input({ forward: -1 })))).toBeGreaterThan(175)
  })

  it('holds regardless of which way the camera points', () => {
    for (const camYaw of [-2.5, -1.0, 0, 0.8, 2.2])
      expect(Math.abs(faceOffset(input({ strafe: 1 }), camYaw))).toBeLessThan(65)
  })
})

describe('resolveCharacterOverlap', () => {
  const at = (x: number, z: number) => new THREE.Vector3(x, 0, z)

  it('leaves a walker who is clear of everyone alone', () => {
    const pos = at(0, 0), vel = at(1, 0)
    expect(resolveCharacterOverlap(pos, vel, [{ x: 5, z: 5 }])).toBe(false)
    expect(pos.x).toBe(0)
    expect(vel.x).toBe(1)
  })

  it('pushes out to exactly touching, never further', () => {
    const pos = at(0.2, 0), vel = at(0, 0)
    expect(resolveCharacterOverlap(pos, vel, [{ x: 0, z: 0 }])).toBe(true)
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(CHAR_RADIUS * 2, 10)
  })

  it('cancels the velocity heading into them but keeps the sliding part', () => {
    const pos = at(0.3, 0)
    const vel = new THREE.Vector3(-2, 0, 3)   // -x drives into them, +z slides past
    resolveCharacterOverlap(pos, vel, [{ x: 0, z: 0 }])
    expect(vel.x).toBeCloseTo(0, 10)          // the "into" component is gone
    expect(vel.z).toBeCloseTo(3, 10)          // the tangential component survives
  })

  it('does not brake a walker who is already moving away', () => {
    const pos = at(0.3, 0)
    const vel = new THREE.Vector3(4, 0, 0)
    resolveCharacterOverlap(pos, vel, [{ x: 0, z: 0 }])
    expect(vel.x).toBeCloseTo(4, 10)
  })

  it('resolves a dead-on overlap instead of dividing by zero', () => {
    const pos = at(0, 0), vel = at(0, 0)
    expect(resolveCharacterOverlap(pos, vel, [{ x: 0, z: 0 }])).toBe(true)
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.z)).toBe(true)
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(CHAR_RADIUS * 2, 10)
  })

  it('separates from every character in a crowd', () => {
    const others = [{ x: 0, z: 0 }, { x: 0.5, z: 0.1 }, { x: 0.2, z: 0.5 }]
    const pos = at(0.25, 0.2), vel = at(0, 0)
    // A single pass can push into a neighbour; a few settle it, like any
    // iterative solver.
    for (let i = 0; i < 12; i++) resolveCharacterOverlap(pos, vel, others)
    for (const o of others)
      expect(Math.hypot(pos.x - o.x, pos.z - o.z)).toBeGreaterThanOrEqual(CHAR_RADIUS * 2 - 1e-6)
  })

  it('never lets the walker end up inside someone while walking into them', () => {
    const s = makeMoveState(3, 0)
    const blocker = [{ x: 0, z: 0 }]
    // Walk straight at a stationary character for two seconds
    for (let f = 0; f < 120; f++) {
      stepMovement(s, input({ forward: 1 }), Math.PI / 2, 1 / 60)
      resolveCharacterOverlap(s.pos, s.vel, blocker)
      expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThanOrEqual(CHAR_RADIUS * 2 - 1e-6)
    }
  })
})

describe('stepCamera — reduced motion', () => {
  const opts = (vx = 0, vz = 0, ax = 0, az = 0, reducedMotion = false) => ({
    anchor: new THREE.Vector3(),
    vel: new THREE.Vector3(vx, 0, vz),
    accel: new THREE.Vector3(ax, 0, az),
    reducedMotion,
  })

  it('pins the FOV at base no matter how fast you go', () => {
    const cam = makeCamState()
    for (let i = 0; i < 600; i++) stepCamera(cam, opts(SPRINT_SPEED, 0, 0, 0, true), DT)
    expect(cam.fov).toBeCloseTo(FOV_BASE, 4)
  })

  it('does not dip the FOV under braking either', () => {
    const cam = makeCamState()
    for (let i = 0; i < 300; i++) stepCamera(cam, opts(0.5, 0, -30, 0, true), DT)
    expect(cam.fov).toBeCloseTo(FOV_BASE, 4)
  })

  it('holds the arm rigid instead of trailing under acceleration', () => {
    const cam = makeCamState()
    for (let i = 0; i < 60; i++) stepCamera(cam, opts(3, 0, 30, 0, true), DT)
    expect(cam.lag.lengthSq()).toBe(0)
  })

  it('tracks the character faster than the normal spring arm', () => {
    const normal = makeCamState()
    const reduced = makeCamState()
    const anchor = new THREE.Vector3(5, 0, 0)
    for (let i = 0; i < 12; i++) {
      stepCamera(normal,  { anchor, vel: new THREE.Vector3(), accel: new THREE.Vector3() }, DT)
      stepCamera(reduced, { anchor, vel: new THREE.Vector3(), accel: new THREE.Vector3(), reducedMotion: true }, DT)
    }
    expect(reduced.pivot.x).toBeGreaterThan(normal.pivot.x)
  })

  it('still lets the wheel zoom work', () => {
    const cam = makeCamState()
    applyZoom(cam, -600)
    for (let i = 0; i < 300; i++) stepCamera(cam, opts(0, 0, 0, 0, true), DT)
    expect(cam.dist).toBeCloseTo(cam.distTarget, 4)
  })
})

describe('applyLook', () => {
  it('swings the view right when the mouse moves right', () => {
    const cam = makeCamState()
    const before = cam.yaw
    applyLook(cam, 100, 0)
    expect(cam.yaw).toBeLessThan(before)   // yaw decreases → forward rotates toward +X
  })

  it('clamps pitch so the camera never flips over the top or under the floor', () => {
    const cam = makeCamState()
    applyLook(cam, 0, 100000)
    expect(cam.pitch).toBe(PITCH_MAX)
    applyLook(cam, 0, -100000)
    expect(cam.pitch).toBe(PITCH_MIN)
  })
})

describe('applyZoom', () => {
  it('clamps to the zoom range at both ends', () => {
    const cam = makeCamState()
    for (let i = 0; i < 200; i++) applyZoom(cam, 120)
    expect(cam.distTarget).toBe(CAM_MAX_DIST)
    for (let i = 0; i < 400; i++) applyZoom(cam, -120)
    expect(cam.distTarget).toBe(CAM_MIN_DIST)
  })

  it('is multiplicative — a notch covers the same proportion near and far', () => {
    const near = makeCamState(); near.distTarget = 3
    const far  = makeCamState(); far.distTarget  = 8
    applyZoom(near, 100)
    applyZoom(far, 100)
    expect(near.distTarget / 3).toBeCloseTo(far.distTarget / 8, 10)
  })

  it('round-trips: zooming in then out returns to where it started', () => {
    const cam = makeCamState()
    const start = cam.distTarget
    applyZoom(cam, 240)
    applyZoom(cam, -240)
    expect(cam.distTarget).toBeCloseTo(start, 10)
  })
})

describe('stepCamera', () => {
  const opts = (vx = 0, vz = 0, ax = 0, az = 0, at = new THREE.Vector3()) => ({
    anchor: at,
    vel: new THREE.Vector3(vx, 0, vz),
    accel: new THREE.Vector3(ax, 0, az),
  })

  it('eases the pivot toward the character rather than snapping onto it', () => {
    const cam = makeCamState()
    const anchor = new THREE.Vector3(5, 0, 5)
    stepCamera(cam, opts(0, 0, 0, 0, anchor), DT)
    // One frame closes only part of the gap
    expect(cam.pivot.x).toBeGreaterThan(0)
    expect(cam.pivot.x).toBeLessThan(5)
    for (let i = 0; i < 300; i++) stepCamera(cam, opts(0, 0, 0, 0, anchor), DT)
    expect(cam.pivot.x).toBeCloseTo(5, 3)
  })

  it('trails behind under acceleration and recentres once up to speed', () => {
    const cam = makeCamState()
    const anchor = new THREE.Vector3()
    // Accelerating hard along +X: the arm should hang back along -X
    for (let i = 0; i < 40; i++) stepCamera(cam, opts(3, 0, 30, 0, anchor), DT)
    expect(cam.lag.x).toBeLessThan(-0.05)
    const trailing = cam.lag.x
    // Acceleration stops; the trail eases back to centre
    for (let i = 0; i < 200; i++) stepCamera(cam, opts(6.4, 0, 0, 0, anchor), DT)
    expect(cam.lag.x).toBeGreaterThan(trailing)
    expect(cam.lag.x).toBeCloseTo(0, 2)
  })

  it('widens the FOV with speed and never overshoots the budget', () => {
    const cam = makeCamState()
    for (let i = 0; i < 600; i++) stepCamera(cam, opts(SPRINT_SPEED, 0), DT)
    expect(cam.fov).toBeGreaterThan(FOV_BASE + FOV_WIDEN * 0.9)
    expect(cam.fov).toBeLessThanOrEqual(FOV_BASE + FOV_WIDEN + 1e-6)
  })

  it('barely reframes at a walk — the widening belongs to the sprint', () => {
    const walk = makeCamState()
    for (let i = 0; i < 600; i++) stepCamera(walk, opts(WALK_SPEED, 0), DT)
    const sprint = makeCamState()
    for (let i = 0; i < 600; i++) stepCamera(sprint, opts(SPRINT_SPEED, 0), DT)
    expect(walk.fov - FOV_BASE).toBeLessThan((sprint.fov - FOV_BASE) * 0.35)
  })

  it('tightens below base while braking', () => {
    const cam = makeCamState()
    // Slow but decelerating hard — the dip should take the FOV under base
    for (let i = 0; i < 200; i++) stepCamera(cam, opts(0.5, 0, -30, 0), DT)
    expect(cam.fov).toBeLessThan(FOV_BASE)
  })

  it('moves the FOV gradually — no visible snap on any single frame', () => {
    const cam = makeCamState()
    let maxJump = 0
    for (let i = 0; i < 600; i++) {
      const before = cam.fov
      stepCamera(cam, opts(SPRINT_SPEED, 0), DT)
      maxJump = Math.max(maxJump, Math.abs(cam.fov - before))
    }
    expect(maxJump).toBeLessThan(1)   // under a degree per frame
  })

  it('eases the zoom onto the wheel target', () => {
    const cam = makeCamState()
    applyZoom(cam, -600)                       // ask to pull in
    const target = cam.distTarget
    stepCamera(cam, opts(), DT)
    expect(cam.dist).toBeGreaterThan(target)   // not there yet
    for (let i = 0; i < 300; i++) stepCamera(cam, opts(), DT)
    expect(cam.dist).toBeCloseTo(target, 4)
  })
})

describe('cameraPlacement', () => {
  const pos = new THREE.Vector3(), look = new THREE.Vector3()

  it('sits behind the character, over the shoulder rather than dead centre', () => {
    const cam = makeCamState()
    cam.yaw = 0; cam.pitch = 0; cam.dist = 4
    cam.pivot.set(0, 1, 0)
    cameraPlacement(cam, pos, look)

    expect(pos.z).toBeCloseTo(4, 6)                 // behind, along +Z
    expect(pos.x).toBeCloseTo(SHOULDER, 6)          // and offset to the side
    expect(pos.x).not.toBeCloseTo(0, 3)             // explicitly NOT directly behind
    // The look target follows the shoulder only partway, so the character (at
    // pivot x=0) lands left of frame centre instead of dead centre.
    expect(look.x).toBeCloseTo(SHOULDER * SHOULDER_LOOK, 6)
    expect(look.x).toBeLessThan(pos.x)
    expect(look.x).toBeGreaterThan(0)
  })

  it('keeps the arm length as the pivot distance at every orbit angle', () => {
    const cam = makeCamState()
    cam.dist = 5
    cam.pivot.set(2, 1, -3)
    for (let y = -Math.PI; y < Math.PI; y += 0.4)
      for (let p = PITCH_MIN; p <= PITCH_MAX; p += 0.25) {
        cam.yaw = y; cam.pitch = p
        cameraPlacement(cam, pos, look)
        // Strip the lateral shoulder offset; what remains is the arm itself.
        const dx = pos.x - cam.pivot.x - Math.cos(y) * SHOULDER
        const dy = pos.y - cam.pivot.y
        const dz = pos.z - cam.pivot.z + Math.sin(y) * SHOULDER
        expect(Math.hypot(dx, dy, dz)).toBeCloseTo(5, 6)
      }
  })

  // Regression: PITCH_MIN used to be negative, which at the far end of the
  // zoom range put the camera *under* the island — you'd orbit down and end up
  // looking up through the terrain at floating blob shadows.
  it('never drops the camera below the character, at any pitch or zoom', () => {
    const cam = makeCamState()
    cam.pivot.set(0, CAM_PIVOT_Y, 0)
    for (const d of [CAM_MIN_DIST, 4.6, CAM_MAX_DIST])
      for (let p = PITCH_MIN; p <= PITCH_MAX; p += 0.05)
        for (let y = -Math.PI; y < Math.PI; y += 0.5) {
          cam.dist = d; cam.pitch = p; cam.yaw = y
          cameraPlacement(cam, pos, look)
          expect(pos.y).toBeGreaterThanOrEqual(cam.pivot.y)
        }
  })

  it('always looks down at the character from above at a positive pitch', () => {
    const cam = makeCamState()
    cam.yaw = 0.9; cam.pitch = 0.6; cam.dist = 4
    cam.pivot.set(0, 1, 0)
    cameraPlacement(cam, pos, look)
    expect(pos.y).toBeGreaterThan(look.y)
  })
})

describe('placeCardBeside', () => {
  const VIEW = { width: 1280, height: 800 }
  const CARD = { width: 270, height: 420 }

  it('sits to the right of the character, clear of them, when there is room', () => {
    const { left, top, side } = placeCardBeside(400, 300, CARD, VIEW)
    expect(side).toBe('right')
    expect(left).toBe(400 + CARD_GAP)
    expect(left).toBeGreaterThan(400)          // never covers the character
    expect(top).toBe(300 - CARD_RISE)
  })

  it('flips to the left when the character is near the right edge', () => {
    const { left, side } = placeCardBeside(1150, 300, CARD, VIEW)
    expect(side).toBe('left')
    expect(left + CARD.width).toBeLessThan(1150)   // still clear of the character
    expect(left).toBeGreaterThanOrEqual(CARD_MARGIN)
  })

  it('keeps the card fully on screen wherever the character is', () => {
    for (let x = -200; x <= VIEW.width + 200; x += 37)
      for (let y = -200; y <= VIEW.height + 200; y += 41) {
        const { left, top } = placeCardBeside(x, y, CARD, VIEW)
        expect(left).toBeGreaterThanOrEqual(CARD_MARGIN)
        expect(top).toBeGreaterThanOrEqual(CARD_MARGIN)
        expect(left + CARD.width).toBeLessThanOrEqual(VIEW.width - CARD_MARGIN)
        expect(top + CARD.height).toBeLessThanOrEqual(VIEW.height - CARD_MARGIN)
      }
  })

  it('does not overlap the character horizontally in either orientation', () => {
    // Anywhere there's room on one side or the other, the card clears the anchor
    for (let x = 320; x <= VIEW.width - 320; x += 23) {
      const { left, side } = placeCardBeside(x, 400, CARD, VIEW)
      if (side === 'right') expect(left).toBeGreaterThanOrEqual(x)
      else expect(left + CARD.width).toBeLessThanOrEqual(x)
    }
  })

  // The bug this fixes: standing right next to someone makes them fill a big
  // chunk of the screen, and a gap measured from their head point alone left
  // the card sitting on top of their body.
  it('clears the character silhouette, not just the anchor point', () => {
    const halfW = 190     // a bean seen from ~2 units away
    const { left, side } = placeCardBeside(400, 400, CARD, VIEW, halfW)
    expect(side).toBe('right')
    expect(left).toBeGreaterThanOrEqual(400 + halfW)
  })

  it('flips to the left when a wide silhouette leaves no room on the right', () => {
    const { left, side } = placeCardBeside(820, 400, CARD, VIEW, 190)
    expect(side).toBe('left')
    expect(left + CARD.width).toBeLessThanOrEqual(820 - 190)
  })

  it('stays on screen for every anchor position and silhouette width', () => {
    for (const halfW of [0, 40, 120, 220])
      for (let x = -100; x <= VIEW.width + 100; x += 29) {
        const { left, top } = placeCardBeside(x, 400, CARD, VIEW, halfW)
        expect(left).toBeGreaterThanOrEqual(CARD_MARGIN)
        expect(left + CARD.width).toBeLessThanOrEqual(VIEW.width - CARD_MARGIN)
        expect(top).toBeGreaterThanOrEqual(CARD_MARGIN)
      }
  })

  it('clamps rather than overflowing when the card cannot fit the viewport', () => {
    const tiny = { width: 320, height: 300 }
    const { left, top } = placeCardBeside(160, 150, { width: 400, height: 500 }, tiny)
    expect(left).toBe(CARD_MARGIN)
    expect(top).toBe(CARD_MARGIN)
  })

  it('tracks the character as they move across the screen', () => {
    const a = placeCardBeside(300, 400, CARD, VIEW)
    const b = placeCardBeside(500, 400, CARD, VIEW)
    expect(b.left).toBeGreaterThan(a.left)     // card follows, not pinned
    const up = placeCardBeside(300, 250, CARD, VIEW)
    expect(up.top).toBeLessThan(a.top)
  })
})

describe('charHalfWidthPx', () => {
  it('grows as the character gets closer to the camera', () => {
    const near = charHalfWidthPx(60, 800, 2)
    const far  = charHalfWidthPx(60, 800, 8)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
  })

  it('shrinks as the FOV widens (same character, more world on screen)', () => {
    expect(charHalfWidthPx(74, 800, 4)).toBeLessThan(charHalfWidthPx(60, 800, 4))
  })

  it('is capped so a character against the lens cannot demand the whole screen', () => {
    expect(charHalfWidthPx(60, 800, 0.01)).toBe(CHAR_HALF_WIDTH_PX_MAX)
  })

  it('matches the perspective projection at a known configuration', () => {
    // fov 60°, 800px tall → focal = 400 / tan(30°) ≈ 692.8 px per world unit at
    // depth 1, so a 0.55u half-width at 4u reads as ≈95px.
    expect(charHalfWidthPx(60, 800, 4)).toBeCloseTo((0.55 * 400) / Math.tan(Math.PI / 6) / 4, 6)
  })
})

describe('nearestInteractable', () => {
  // yaw 0 faces +Z, matching MiiCharacter's rotation.y = atan2(dx, dz)
  it('finds someone standing in front', () => {
    expect(nearestInteractable(0, 0, 0, [{ uid: 'a', x: 0, z: 2 }])).toBe('a')
  })

  it('ignores someone behind you', () => {
    expect(nearestInteractable(0, 0, 0, [{ uid: 'a', x: 0, z: -2 }])).toBeNull()
  })

  it('ignores someone out of range', () => {
    expect(nearestInteractable(0, 0, 0, [{ uid: 'a', x: 0, z: INTERACT_RANGE + 0.1 }])).toBeNull()
  })

  it('prefers the closer of two candidates', () => {
    expect(nearestInteractable(0, 0, 0, [
      { uid: 'far',  x: 0.2, z: 2.5 },
      { uid: 'near', x: 0.2, z: 1.0 },
    ])).toBe('near')
  })

  it('breaks near-ties toward whoever is straight ahead', () => {
    // Same distance; one dead ahead, one off to the side
    const r = 2
    const off = { uid: 'off', x: r * Math.sin(1.0), z: r * Math.cos(1.0) }
    expect(nearestInteractable(0, 0, 0, [off, { uid: 'ahead', x: 0, z: r }])).toBe('ahead')
  })

  it('follows the walker facing, not the world axes', () => {
    const behindInWorld = [{ uid: 'a', x: 0, z: -2 }]
    expect(nearestInteractable(0, 0, Math.PI, behindInWorld)).toBe('a')
  })

  it('returns null for an empty plaza', () => {
    expect(nearestInteractable(0, 0, 0, [])).toBeNull()
  })
})
