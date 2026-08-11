import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  classifyTouch,
  isRunUpgrade,
  ndcFromClient,
  clampRange,
  brakingDistance,
  makeSeekState,
  setSeekTarget,
  clearSeek,
  seekInput,
  TAP_SLOP_PX,
  TAP_MAX_MS,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  ARRIVE_RADIUS,
  STOP_TOLERANCE,
  ARRIVE_SPEED,
  STUCK_ABORT_S,
  TARGET_MAX_RANGE,
  type SeekState,
} from './tapMove'
import {
  makeMoveState,
  stepMovement,
  cameraBasis,
  WALK_SPEED,
  SPRINT_SPEED,
  GROUND_DAMP,
  type MoveInput,
  type MoveState,
} from './thirdPerson'

const DT = 1 / 60
const scratch = (): MoveInput => ({ forward: 0, strafe: 0, sprint: false, jump: false, flip: false })

// Drive a real seek: seekInput → stepMovement, exactly as the controller does.
// Returns a trace so tests can assert on the whole trip rather than the endpoint.
function seek(
  s: MoveState, seekState: SeekState, frames: number, camYaw = 0, dt = DT,
): { dists: number[]; speeds: number[]; brakeEdges: number } {
  const input = scratch()
  const dists: number[] = []
  const speeds: number[] = []
  let brakeEdges = 0
  let wasBraking = false

  for (let i = 0; i < frames; i++) {
    dists.push(Math.hypot(seekState.target.x - s.pos.x, seekState.target.z - s.pos.z))
    speeds.push(s.speed)
    const active = seekState.active
    seekInput(seekState, s.pos, s.vel, camYaw, dt, input)
    if (active && seekState.braking && !wasBraking) brakeEdges++
    wasBraking = seekState.active && seekState.braking
    stepMovement(s, input, camYaw, dt, 'travel')
  }
  return { dists, speeds, brakeEdges }
}

// ─── Gesture discrimination ───────────────────────────────────────────────────

describe('classifyTouch', () => {
  it('calls a short, still touch a tap', () => {
    expect(classifyTouch(3, 4, 120)).toBe('tap')
  })

  it('calls a long, still touch nothing — a slow press is hesitation, not a command', () => {
    expect(classifyTouch(3, 4, 900)).toBe('none')
  })

  it('calls any touch past the slop a drag, however brief', () => {
    expect(classifyTouch(30, 0, 50)).toBe('drag')
    expect(classifyTouch(0, 30, 5000)).toBe('drag')
  })

  it('treats travel exactly at the slop threshold as still a tap', () => {
    expect(classifyTouch(TAP_SLOP_PX, 0, 100)).toBe('tap')
    expect(classifyTouch(TAP_SLOP_PX + 0.001, 0, 100)).toBe('drag')
  })

  it('measures travel as a distance, not per-axis', () => {
    // 8px on each axis is under the threshold on either alone, over it together.
    expect(Math.hypot(8, 8)).toBeGreaterThan(TAP_SLOP_PX)
    expect(classifyTouch(8, 8, 100)).toBe('drag')
  })

  it('accepts a touch exactly at the time limit', () => {
    expect(classifyTouch(0, 0, TAP_MAX_MS)).toBe('tap')
    expect(classifyTouch(0, 0, TAP_MAX_MS + 1)).toBe('none')
  })
})

describe('isRunUpgrade', () => {
  it('upgrades a quick second tap in the same place', () => {
    expect(isRunUpgrade(200, 400, 1000, 202, 403, 1200)).toBe(true)
  })

  it('does not upgrade once the window has passed', () => {
    expect(isRunUpgrade(200, 400, 1000, 200, 400, 1000 + DOUBLE_TAP_MS + 1)).toBe(false)
  })

  it('does not upgrade a quick tap somewhere else — that is a second destination', () => {
    expect(isRunUpgrade(200, 400, 1000, 240, 400, 1100)).toBe(false)
  })

  it('measures separation as a distance, not per-axis', () => {
    // 30 and 25 are each under the slop; together they are not.
    expect(Math.hypot(30, 25)).toBeGreaterThan(DOUBLE_TAP_SLOP_PX)
    expect(isRunUpgrade(200, 400, 1000, 230, 425, 1100)).toBe(false)
  })

  it('never upgrades when there is no previous tap', () => {
    expect(isRunUpgrade(0, 0, NaN, 100, 100, 50)).toBe(false)
    expect(isRunUpgrade(0, 0, -Infinity, 100, 100, 50)).toBe(false)
  })
})

// ─── Ground picking ───────────────────────────────────────────────────────────

describe('ndcFromClient', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 }
  const out = new THREE.Vector2()

  it('maps the canvas centre to the origin', () => {
    ndcFromClient(400, 300, rect, out)
    expect(out.x).toBeCloseTo(0, 10)
    expect(out.y).toBeCloseTo(0, 10)
  })

  it('maps the corners to ±1, with Y flipped for NDC', () => {
    ndcFromClient(0, 0, rect, out)
    expect(out.x).toBeCloseTo(-1, 10)
    expect(out.y).toBeCloseTo(1, 10)
    ndcFromClient(800, 600, rect, out)
    expect(out.x).toBeCloseTo(1, 10)
    expect(out.y).toBeCloseTo(-1, 10)
  })

  it('accounts for a canvas that is not at the viewport origin', () => {
    // Regression: the plaza canvas sits under a fixed 56px top bar.
    ndcFromClient(140, 356, { left: 140, top: 56, width: 800, height: 600 }, out)
    expect(out.x).toBeCloseTo(-1, 10)
    expect(out.y).toBeCloseTo(0, 10)
  })
})

describe('clampRange', () => {
  const from = new THREE.Vector3(0, 0, 0)

  it('leaves a nearby point alone', () => {
    const hit = new THREE.Vector3(3, 0, 4)
    clampRange(hit, from)
    expect(hit.x).toBeCloseTo(3, 10)
    expect(hit.z).toBeCloseTo(4, 10)
  })

  it('pulls a far point in along the same bearing', () => {
    // A tap just below the horizon casts a near-parallel ray.
    const hit = new THREE.Vector3(3000, 0, 4000)
    clampRange(hit, from)
    expect(Math.hypot(hit.x, hit.z)).toBeCloseTo(TARGET_MAX_RANGE, 8)
    expect(Math.atan2(hit.z, hit.x)).toBeCloseTo(Math.atan2(4000, 3000), 10)
  })

  it('measures range from the walker, not the world origin', () => {
    const walker = new THREE.Vector3(10, 0, 0)
    const hit = new THREE.Vector3(1000, 0, 0)
    clampRange(hit, walker)
    expect(hit.x).toBeCloseTo(10 + TARGET_MAX_RANGE, 8)
  })

  it('leaves a degenerate hit at the walker alone rather than dividing by zero', () => {
    const hit = new THREE.Vector3(0, 0, 0)
    clampRange(hit, from)
    expect(Number.isFinite(hit.x)).toBe(true)
    expect(Number.isFinite(hit.z)).toBe(true)
  })
})

// ─── Braking ──────────────────────────────────────────────────────────────────

describe('brakingDistance', () => {
  it('is zero at rest', () => {
    expect(brakingDistance(0)).toBe(0)
  })

  it('is v²/2a', () => {
    expect(brakingDistance(WALK_SPEED)).toBeCloseTo(WALK_SPEED ** 2 / (2 * GROUND_DAMP), 10)
    expect(brakingDistance(WALK_SPEED)).toBeCloseTo(0.2306, 3)
    expect(brakingDistance(SPRINT_SPEED)).toBeCloseTo(1.2047, 3)
  })

  it('grows fast enough with speed that a fixed arrive radius could not work', () => {
    // The 5× spread between a walk and a sprint is the whole argument for
    // computing this from live speed instead of picking a constant.
    expect(brakingDistance(SPRINT_SPEED) / brakingDistance(WALK_SPEED)).toBeGreaterThan(4)
    expect(brakingDistance(SPRINT_SPEED)).toBeGreaterThan(ARRIVE_RADIUS * 5)
  })

  it('is monotone in speed', () => {
    for (let v = 0; v < 8; v += 0.5) {
      expect(brakingDistance(v + 0.5)).toBeGreaterThan(brakingDistance(v))
    }
  })

  it('matches what stepMovement actually does when the input goes to zero', () => {
    // The exactness claim in the module comment, checked against the integrator.
    const s = makeMoveState()
    const input = scratch()
    input.forward = 1
    for (let i = 0; i < 240; i++) stepMovement(s, input, 0, DT)   // reach WALK_SPEED
    const v0 = s.speed
    const z0 = s.pos.z
    input.forward = 0
    for (let i = 0; i < 240; i++) stepMovement(s, input, 0, DT)   // coast to a halt
    expect(s.speed).toBeCloseTo(0, 9)
    // Discretization undershoots by about v·dt/2 — and undershoot is the safe
    // direction, since it means we stop short rather than sail past.
    const travelled = Math.abs(s.pos.z - z0)
    const predicted = brakingDistance(v0)
    expect(travelled).toBeLessThanOrEqual(predicted + 1e-9)
    expect(travelled).toBeGreaterThan(predicted - v0 * DT)
  })
})

// ─── The seek ─────────────────────────────────────────────────────────────────

describe('seekInput — direction', () => {
  it('produces a unit-length input in the camera basis', () => {
    const out = scratch()
    for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.37) {
      for (let a = 0; a < Math.PI * 2; a += 0.41) {
        const s = makeSeekState()
        setSeekTarget(s, Math.cos(a) * 9, Math.sin(a) * 9, false)
        seekInput(s, new THREE.Vector3(), new THREE.Vector3(), yaw, DT, out)
        expect(Math.hypot(out.forward, out.strafe)).toBeCloseTo(1, 10)
      }
    }
  })

  it('round-trips through the camera basis to the true world direction', () => {
    // This is the guarantee that lets stepMovement be reused untouched: the
    // basis is orthonormal, so its inverse is a pair of dot products and the
    // integrator recomposes exactly the direction we meant.
    const out = scratch()
    for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.37) {
      for (let a = 0; a < Math.PI * 2; a += 0.41) {
        const wx = Math.cos(a), wz = Math.sin(a)
        const s = makeSeekState()
        setSeekTarget(s, wx * 9, wz * 9, false)
        seekInput(s, new THREE.Vector3(), new THREE.Vector3(), yaw, DT, out)

        const { fx, fz, rx, rz } = cameraBasis(yaw)
        expect(fx * out.forward + rx * out.strafe).toBeCloseTo(wx, 10)
        expect(fz * out.forward + rz * out.strafe).toBeCloseTo(wz, 10)
      }
    }
  })

  it('asks for a sprint only when the destination was double-tapped', () => {
    const out = scratch()
    const s = makeSeekState()
    setSeekTarget(s, 9, 0, false)
    seekInput(s, new THREE.Vector3(), new THREE.Vector3(), 0, DT, out)
    expect(out.sprint).toBe(false)
    setSeekTarget(s, 9, 0, true)
    seekInput(s, new THREE.Vector3(), new THREE.Vector3(), 0, DT, out)
    expect(out.sprint).toBe(true)
  })

  it('never asks to jump or flip — touch has no affordance for either', () => {
    const out = scratch()
    out.jump = true
    out.flip = true
    const s = makeSeekState()
    setSeekTarget(s, 9, 0, false)
    seekInput(s, new THREE.Vector3(), new THREE.Vector3(), 0, DT, out)
    // seekInput leaves them to the caller rather than silently owning them.
    expect(out.jump).toBe(true)
    expect(out.flip).toBe(true)
  })

  it('produces no input at all when idle', () => {
    const out = scratch()
    out.forward = 1
    out.strafe = 1
    out.sprint = true
    const s = makeSeekState()
    expect(seekInput(s, new THREE.Vector3(), new THREE.Vector3(), 0, DT, out)).toBe(false)
    expect(out.forward).toBe(0)
    expect(out.strafe).toBe(0)
    expect(out.sprint).toBe(false)
  })
})

describe('seekInput — arrival', () => {
  it('walks to the destination and stops there', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -6, false)
    seek(s, k, 400)

    expect(k.active).toBe(false)
    expect(Math.hypot(s.pos.x - 0, s.pos.z - -6)).toBeLessThanOrEqual(ARRIVE_RADIUS)
    expect(s.speed).toBeLessThan(ARRIVE_SPEED)
  })

  it('stops on the mark from a sprint too', () => {
    // The case a fixed arrive radius fails: 1.2u of stopping distance.
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -12, true)
    const { speeds } = seek(s, k, 500)

    expect(k.active).toBe(false)
    expect(Math.hypot(s.pos.x, s.pos.z - -12)).toBeLessThanOrEqual(ARRIVE_RADIUS)
    expect(s.speed).toBeLessThan(ARRIVE_SPEED)
    expect(Math.max(...speeds)).toBeGreaterThan(SPRINT_SPEED * 0.98)
  })

  it('stops on the destination from any distance, without sailing past it', () => {
    // Swept rather than spot-checked on purpose. Whether a walker parks on the
    // destination or blows through it turns on where the frame boundaries happen
    // to fall relative to the braking threshold, so one distance can pass on
    // luck while its neighbour overshoots by a body length.
    const OVERSHOOT_TOLERANCE = 0.01   // 1cm of parking drift is not a sail-past

    for (const run of [false, true]) {
      for (let d = 0.3; d <= 12; d += 0.13) {
        const s = makeMoveState()
        const k = makeSeekState()
        setSeekTarget(k, 0, -d, run)

        const input = scratch()
        let deepest = 0     // furthest the walker ever gets *past* the target
        for (let i = 0; i < 900; i++) {
          seekInput(k, s.pos, s.vel, 0, DT, input)
          stepMovement(s, input, 0, DT, 'travel')
          deepest = Math.max(deepest, -d - s.pos.z)
        }

        const label = `${d.toFixed(2)}u, run=${run}`
        expect(deepest, `sailed past ${label}`).toBeLessThan(OVERSHOOT_TOLERANCE)
        expect(k.active, `never arrived at ${label}`).toBe(false)
        // Resting a little short is expected — braking has to commit early
        // enough that a walker still gaining speed can never overshoot. What
        // matters is that the shortfall stays inside the marker ring.
        expect(Math.abs(s.pos.z - -d), `rested too far from ${label}`)
          .toBeLessThanOrEqual(STOP_TOLERANCE)
        expect(s.speed, `still moving at ${label}`).toBeLessThan(ARRIVE_SPEED)
      }
    }
  })

  it('does not call it arrived while still travelling at speed', () => {
    // The bug this guards: retiring the seek on proximity alone hands a
    // full-tilt walker back to plain damping mid-stride, and they coast through
    // the destination and out the far side with nothing steering them.
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -9, true)
    const out = scratch()

    for (let i = 0; i < 900; i++) {
      const wasActive = k.active
      seekInput(k, s.pos, s.vel, 0, DT, out)
      if (wasActive && !k.active) {
        expect(s.speed).toBeLessThanOrEqual(ARRIVE_SPEED)
        break
      }
      stepMovement(s, out, 0, DT, 'travel')
    }
    expect(k.active).toBe(false)
  })

  it('commits to braking exactly once — no accel/brake chatter at the end', () => {
    // Without the latch this oscillates: distance-left and distance-needed
    // shrink at the same rate, so the predicate flickers frame to frame. It is
    // visible as a stutter and audible as machine-gun footsteps.
    for (const run of [false, true]) {
      const s = makeMoveState()
      const k = makeSeekState()
      setSeekTarget(k, 0, -9, run)
      const { brakeEdges } = seek(s, k, 500)
      expect(brakeEdges).toBe(1)
    }
  })

  it('respects the walk/run speed ceiling on the way', () => {
    const walk = makeMoveState()
    const wk = makeSeekState()
    setSeekTarget(wk, 0, -14, false)
    const { speeds: walkSpeeds } = seek(walk, wk, 500)
    expect(Math.max(...walkSpeeds)).toBeLessThanOrEqual(WALK_SPEED + 1e-6)
    expect(Math.max(...walkSpeeds)).toBeGreaterThan(WALK_SPEED * 0.98)
  })

  it('handles a short hop without a crawling tail', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -0.4, false)
    const { speeds } = seek(s, k, 200)
    expect(k.active).toBe(false)

    // Single-peaked: speed rises, then falls, and never picks back up.
    const moving = speeds.filter((v) => v > 1e-6)
    const peak = moving.indexOf(Math.max(...moving))
    for (let i = 1; i <= peak; i++) expect(moving[i]).toBeGreaterThanOrEqual(moving[i - 1] - 1e-9)
    for (let i = peak + 1; i < moving.length; i++) expect(moving[i]).toBeLessThanOrEqual(moving[i - 1] + 1e-9)
  })

  it('arrives in the same place at 60fps and at 144fps', () => {
    // The house invariant — every rate in this system is per-second, so the
    // resting position must not depend on the monitor.
    const a = makeMoveState()
    const ka = makeSeekState()
    setSeekTarget(ka, 4, -7, true)
    seek(a, ka, 600, 0, 1 / 60)

    const b = makeMoveState()
    const kb = makeSeekState()
    setSeekTarget(kb, 4, -7, true)
    seek(b, kb, 1440, 0, 1 / 144)

    expect(ka.active).toBe(false)
    expect(kb.active).toBe(false)
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeLessThan(0.1)
  })

  it('retires a destination it is already standing on', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, ARRIVE_RADIUS * 0.5, 0, false)
    expect(seekInput(k, s.pos, s.vel, 0, DT, scratch())).toBe(false)
    expect(k.active).toBe(false)
  })
})

describe('seekInput — retargeting', () => {
  it('picks up a new destination mid-walk and keeps its momentum', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -12, false)
    seek(s, k, 90)
    const speedAtSwitch = s.speed
    expect(speedAtSwitch).toBeGreaterThan(1)

    setSeekTarget(k, 8, -12, false)
    const input = scratch()
    seekInput(k, s.pos, s.vel, 0, DT, input)
    stepMovement(s, input, 0, DT, 'travel')
    expect(s.speed).toBeGreaterThan(speedAtSwitch * 0.9)   // no stall on the switch

    seek(s, k, 500)
    expect(k.active).toBe(false)
    expect(Math.hypot(s.pos.x - 8, s.pos.z - -12)).toBeLessThanOrEqual(ARRIVE_RADIUS)
  })

  it('re-opens the throttle when retargeted while braking', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -6, false)
    // Run until the brake latches, then move the goalposts.
    const input = scratch()
    for (let i = 0; i < 500 && !k.braking; i++) {
      seekInput(k, s.pos, s.vel, 0, DT, input)
      stepMovement(s, input, 0, DT, 'travel')
    }
    expect(k.braking).toBe(true)

    setSeekTarget(k, 0, -16, false)
    expect(k.braking).toBe(false)
    seekInput(k, s.pos, s.vel, 0, DT, input)
    expect(Math.hypot(input.forward, input.strafe)).toBeCloseTo(1, 10)

    seek(s, k, 600)
    expect(k.active).toBe(false)
    expect(Math.hypot(s.pos.x, s.pos.z - -16)).toBeLessThanOrEqual(ARRIVE_RADIUS)
  })

  it('upgrading to a run mid-walk raises the speed ceiling', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -20, false)
    seek(s, k, 120)
    expect(s.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-6)

    // The second tap: same place, now running.
    setSeekTarget(k, 0, -20, true)
    const { speeds } = seek(s, k, 240)
    expect(Math.max(...speeds)).toBeGreaterThan(WALK_SPEED * 1.5)
  })
})

describe('seekInput — giving up', () => {
  it('abandons a destination it cannot make progress toward', () => {
    // Standing on someone else's toes: the overlap resolver holds bodies 0.68u
    // apart, so a destination underneath them is unreachable. Without this the
    // walker leans into them forever.
    const k = makeSeekState()
    setSeekTarget(k, 0, -6, false)
    const pos = new THREE.Vector3()
    const pinned = new THREE.Vector3()   // shoved back to zero every frame
    const out = scratch()

    let frames = 0
    const limit = Math.ceil(STUCK_ABORT_S / DT) + 5
    while (k.active && frames < limit) {
      seekInput(k, pos, pinned, 0, DT, out)
      frames++
    }
    expect(k.active).toBe(false)
    expect(frames).toBeLessThanOrEqual(limit)
    // And not before the grace period — a walker leaning into a crowd for half a
    // second is still trying.
    expect(frames).toBeGreaterThanOrEqual(Math.floor(STUCK_ABORT_S / DT))
  })

  it('does not give up on a walker who is merely still accelerating', () => {
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 0, -20, false)
    seek(s, k, Math.ceil(STUCK_ABORT_S / DT) + 30)
    expect(k.active).toBe(true)
  })

  it('clearSeek wipes the latch and the stuck timer, not just the flag', () => {
    const k = makeSeekState()
    setSeekTarget(k, 0, -6, true)
    k.braking = true
    k.stuckT = 99
    clearSeek(k)
    expect(k.active).toBe(false)
    expect(k.run).toBe(false)
    expect(k.braking).toBe(false)
    expect(k.stuckT).toBe(0)
  })
})

describe('facing under tap-to-move', () => {
  it('faces exactly where it is walking, not compressed toward the camera', () => {
    // Compression exists to hide a camera-relative artifact; tap-to-move has no
    // such artifact, and compressing anyway would read as a sideways crab.
    const s = makeMoveState()
    const k = makeSeekState()
    setSeekTarget(k, 12, 0, false)      // due +X, i.e. straight across the view
    seek(s, k, 200)
    expect(s.yaw).toBeCloseTo(Math.atan2(1, 0), 2)
  })

  it('is measurably different from the camera-relative facing for the same path', () => {
    const travel = makeMoveState()
    const kt = makeSeekState()
    setSeekTarget(kt, 12, 0, false)
    seek(travel, kt, 200)

    // The same world direction, driven the way the keyboard drives it.
    const camera = makeMoveState()
    const input = scratch()
    const { fx, fz, rx, rz } = cameraBasis(0)
    input.forward = 1 * fx + 0 * fz
    input.strafe  = 1 * rx + 0 * rz
    for (let i = 0; i < 200; i++) stepMovement(camera, input, 0, DT)

    expect(Math.abs(camera.yaw - travel.yaw)).toBeGreaterThan(0.3)
  })
})
