// Third-person "walk mode": locomotion integration, the spring-arm camera, and
// the interact-target search. Desktop-only — the plaza's touch path never
// reaches this code.
//
// Pure math over THREE vector types, no React — same convention as plazaMath.ts,
// so the feel constants and the easing are unit-testable (thirdPerson.test.ts).
//
// ⚠️ Every follow/zoom/FOV transition eases through `smoothFactor`, never a bare
// `lerp(a, b, 0.1)` per frame. A fixed per-frame alpha is NOT frame-rate
// independent — it converges twice as fast at 120fps as at 60fps, so the camera
// would feel different on different monitors. smoothFactor takes a rate in
// units of "per second" and yields the equivalent alpha for this frame's dt.

import * as THREE from 'three'
import { clampToPlazaEdge } from './plazaMath'

// ─── Easing ───────────────────────────────────────────────────────────────────

// Exponential blend factor: after `dt` seconds at `rate`, this much of the
// remaining gap is closed. Frame-rate independent by construction.
export function smoothFactor(rate: number, dt: number): number {
  if (dt <= 0) return 0
  return 1 - Math.exp(-rate * dt)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// Signed shortest rotation from `from` to `to`, in (-π, π].
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d >  Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

// ─── Locomotion tuning ────────────────────────────────────────────────────────

export const WALK_SPEED   = 2.8    // units/s — twice the 1.4 idle-wander pace
export const SPRINT_SPEED = 6.4    // shift
export const GROUND_ACCEL = 30     // units/s² closing on the desired velocity
export const GROUND_DAMP  = 17     // units/s² bleeding off speed with no input
export const AIR_ACCEL    = 9      // reduced authority mid-jump
export const TURN_RATE    = 13     // yaw easing rate toward the travel direction
export const JUMP_SPEED   = 7.0    // ≈0.98u apex, ≈0.56s airtime under JUMP_GRAVITY
export const JUMP_GRAVITY = 25
// Keep the walker inside the rounded island edge. Wider than the physics margin
// so the camera behind them doesn't hang out over the void.
export const EDGE_MARGIN  = 0.7

export interface MoveInput {
  forward: number   // -1..1  (W = +1, S = -1)
  strafe:  number   // -1..1  (D = +1, A = -1)
  sprint:  boolean
  jump:    boolean  // edge-triggered by the caller — held space must not re-fire
}

export interface MoveState {
  pos: THREE.Vector3
  vel: THREE.Vector3      // x/z horizontal, y vertical
  yaw: number             // facing; atan2(dirX, dirZ) to match MiiCharacter
  grounded: boolean
  speed: number           // |horizontal velocity|, cached for the animator
  accel: THREE.Vector3    // horizontal dv/dt, drives the camera's lag and FOV
}

export function makeMoveState(x = 0, z = 0, yaw = 0): MoveState {
  return {
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw,
    grounded: true,
    speed: 0,
    accel: new THREE.Vector3(),
  }
}

const _desired = new THREE.Vector3()
const _prevVel = new THREE.Vector3()

// Ground-plane basis for the camera's facing. Forward is the direction the
// camera looks, so W always walks "into the screen" no matter which way the
// character currently faces.
export function cameraBasis(cameraYaw: number): { fx: number; fz: number; rx: number; rz: number } {
  const fx = -Math.sin(cameraYaw)
  const fz = -Math.cos(cameraYaw)
  return { fx, fz, rx: -fz, rz: fx }
}

export function stepMovement(s: MoveState, input: MoveInput, cameraYaw: number, dt: number): void {
  if (dt <= 0) return
  _prevVel.copy(s.vel)

  const { fx, fz, rx, rz } = cameraBasis(cameraYaw)
  _desired.set(
    fx * input.forward + rx * input.strafe,
    0,
    fz * input.forward + rz * input.strafe,
  )
  const mag = Math.hypot(_desired.x, _desired.z)
  const moving = mag > 1e-4
  // Normalize so diagonals aren't 1.41× faster than the cardinals
  if (moving) _desired.multiplyScalar(1 / mag)

  // Close on the target velocity at a bounded rate. Doing it on the 2D vector
  // (rather than per-axis) keeps the acceleration isotropic, and the same code
  // handles "no input" as a target of zero.
  const targetSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED
  const tvx  = moving ? _desired.x * targetSpeed : 0
  const tvz  = moving ? _desired.z * targetSpeed : 0
  const rate = !s.grounded ? AIR_ACCEL : moving ? GROUND_ACCEL : GROUND_DAMP

  const dvx  = tvx - s.vel.x
  const dvz  = tvz - s.vel.z
  const dlen = Math.hypot(dvx, dvz)
  const maxDelta = rate * dt
  if (dlen <= maxDelta) {
    s.vel.x = tvx
    s.vel.z = tvz
  } else {
    s.vel.x += (dvx / dlen) * maxDelta
    s.vel.z += (dvz / dlen) * maxDelta
  }

  // ── Jump / gravity ──────────────────────────────────────────────────────────
  if (input.jump && s.grounded) {
    s.vel.y = JUMP_SPEED
    s.grounded = false
  }
  if (!s.grounded) {
    s.vel.y -= JUMP_GRAVITY * dt
    s.pos.y += s.vel.y * dt
    if (s.pos.y <= 0) {
      s.pos.y = 0
      s.vel.y = 0
      s.grounded = true
    }
  }

  // ── Horizontal integration, then the island edge ────────────────────────────
  s.pos.x += s.vel.x * dt
  s.pos.z += s.vel.z * dt
  if (clampToPlazaEdge(s.pos, EDGE_MARGIN)) {
    // Strip the outward velocity component so you slide along the rim instead
    // of juddering against it frame after frame.
    const r = Math.hypot(s.pos.x, s.pos.z)
    if (r > 1e-6) {
      const nx = s.pos.x / r, nz = s.pos.z / r
      const outward = s.vel.x * nx + s.vel.z * nz
      if (outward > 0) {
        s.vel.x -= nx * outward
        s.vel.z -= nz * outward
      }
    }
  }

  // ── Facing ──────────────────────────────────────────────────────────────────
  // Turn toward where we're heading. Eased, so a 180° reversal sweeps around
  // instead of snapping.
  if (moving) {
    const goal = Math.atan2(_desired.x, _desired.z)
    s.yaw += shortestAngle(s.yaw, goal) * smoothFactor(TURN_RATE, dt)
  }

  s.speed = Math.hypot(s.vel.x, s.vel.z)
  s.accel.set((s.vel.x - _prevVel.x) / dt, 0, (s.vel.z - _prevVel.z) / dt)
}

// ─── Spring-arm camera tuning ─────────────────────────────────────────────────

export const CAM_MIN_DIST     = 2.3
export const CAM_MAX_DIST     = 9.5
export const CAM_START_DIST   = 4.6
export const CAM_PIVOT_Y      = 1.15   // chest/shoulder height above the feet
export const ZOOM_SENSITIVITY = 0.0011 // per wheel deltaY unit, multiplicative
export const ZOOM_RATE        = 9      // easing rate onto the wheel's target

// Over-the-shoulder framing: the arm is offset to the camera's right, and the
// look target follows only part of the way, so the character sits left of
// centre rather than dead centre. The *difference* between these two is what
// actually pushes the character off-centre on screen — SHOULDER alone only
// slides the whole shot sideways.
export const SHOULDER        = 0.85
export const SHOULDER_LOOK   = 0.72

// Pitch floor is 0, not negative, and that is load-bearing: camera height is
// pivot.y + sin(pitch) * dist, so any negative pitch drops the camera below
// the character — at the far end of the zoom range that puts it under the
// island, looking up through the terrain at floating blob shadows.
export const PITCH_MIN =  0.02   // just off horizontal
export const PITCH_MAX =  1.15   // steep, but never straight down
export const MOUSE_SENS = 0.0026

export const FOLLOW_RATE = 7.5   // pivot chasing the character
export const LAG_RATE    = 4.5   // how fast the trailing offset itself eases
export const LAG_PER_ACCEL = 0.020
export const LAG_MAX       = 0.55

export const FOV_BASE    = 60
export const FOV_WIDEN   = 14    // added at full sprint
export const FOV_TIGHTEN = 4     // subtracted while braking hard
export const FOV_TIGHTEN_PER_DECEL = 0.16
export const FOV_RATE    = 3.6   // deliberately slower than FOLLOW_RATE — FOV
                                 // changes are the most obvious if they snap

export interface CamState {
  yaw: number
  pitch: number
  dist: number         // eased actual distance
  distTarget: number   // where the wheel has asked it to go
  fov: number
  pivot: THREE.Vector3 // lagging follow point
  lag: THREE.Vector3   // velocity-aware trailing offset
}

export function makeCamState(yaw = 0, pivot = new THREE.Vector3()): CamState {
  return {
    yaw,
    pitch: 0.42,
    dist: CAM_START_DIST,
    distTarget: CAM_START_DIST,
    fov: FOV_BASE,
    pivot: pivot.clone(),
    lag: new THREE.Vector3(),
  }
}

// Raw pointer-lock deltas → orbit. Mouse right swings the view right; mouse
// down raises the camera (non-inverted). `scale` lets the unlocked
// drag-to-orbit fallback run hotter than locked mouse look, since a drag can
// only travel as far as the window is wide.
export function applyLook(cam: CamState, movementX: number, movementY: number, scale = 1): void {
  cam.yaw   -= movementX * MOUSE_SENS * scale
  cam.pitch  = clamp(cam.pitch + movementY * MOUSE_SENS * scale, PITCH_MIN, PITCH_MAX)
}

// Wheel → zoom target. Multiplicative, so a notch moves the same *proportion*
// of the range at 2.3u as at 9.5u; a linear step feels violent up close and
// useless far out.
export function applyZoom(cam: CamState, wheelDeltaY: number): void {
  const next = cam.distTarget * Math.exp(wheelDeltaY * ZOOM_SENSITIVITY)
  cam.distTarget = clamp(next, CAM_MIN_DIST, CAM_MAX_DIST)
}

const _lagGoal   = new THREE.Vector3()
const _pivotGoal = new THREE.Vector3()

export interface CamStepOpts {
  anchor: THREE.Vector3   // character position (feet)
  vel:    THREE.Vector3
  accel:  THREE.Vector3
}

export function stepCamera(cam: CamState, opts: CamStepOpts, dt: number): void {
  if (dt <= 0) return
  const { anchor, vel, accel } = opts

  // Velocity-aware trail: shove the pivot opposite the character's acceleration,
  // so the arm visibly drags when you take off and eases back in when you stop.
  _lagGoal.set(-accel.x * LAG_PER_ACCEL, 0, -accel.z * LAG_PER_ACCEL)
  if (_lagGoal.lengthSq() > LAG_MAX * LAG_MAX) _lagGoal.setLength(LAG_MAX)
  cam.lag.lerp(_lagGoal, smoothFactor(LAG_RATE, dt))

  _pivotGoal.set(anchor.x + cam.lag.x, anchor.y + CAM_PIVOT_Y + cam.lag.y, anchor.z + cam.lag.z)
  cam.pivot.lerp(_pivotGoal, smoothFactor(FOLLOW_RATE, dt))

  // Zoom eases onto the wheel target rather than jumping a notch at a time.
  cam.dist += (cam.distTarget - cam.dist) * smoothFactor(ZOOM_RATE, dt)

  // ── FOV ─────────────────────────────────────────────────────────────────────
  const speed = Math.hypot(vel.x, vel.z)
  const t = clamp(speed / SPRINT_SPEED, 0, 1)
  // Squared so walking barely reframes and the widening belongs to the sprint.
  let goal = FOV_BASE + t * t * FOV_WIDEN
  // Braking pulls FOV below base for a beat — that dip is what reads as the
  // camera "tightening in" as you come to a stop.
  if (speed > 1e-4) {
    const along = (accel.x * vel.x + accel.z * vel.z) / speed
    if (along < 0) goal -= Math.min(FOV_TIGHTEN, -along * FOV_TIGHTEN_PER_DECEL)
  }
  cam.fov += (goal - cam.fov) * smoothFactor(FOV_RATE, dt)
}

// Resolve the orbit state into a camera position and look target.
export function cameraPlacement(cam: CamState, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
  const cp = Math.cos(cam.pitch)
  const ox = Math.sin(cam.yaw) * cp
  const oy = Math.sin(cam.pitch)
  const oz = Math.cos(cam.yaw) * cp
  // Camera-right on the ground plane, perpendicular to the view direction
  const rx =  Math.cos(cam.yaw)
  const rz = -Math.sin(cam.yaw)

  outPos.set(
    cam.pivot.x + ox * cam.dist + rx * SHOULDER,
    cam.pivot.y + oy * cam.dist,
    cam.pivot.z + oz * cam.dist + rz * SHOULDER,
  )
  outLook.set(
    cam.pivot.x + rx * SHOULDER * SHOULDER_LOOK,
    cam.pivot.y,
    cam.pivot.z + rz * SHOULDER * SHOULDER_LOOK,
  )
}

// ─── Animator handoff ─────────────────────────────────────────────────────────

// Written by the controller every frame and read by MiiCharacter's animator.
// Lives behind a ref, never React state — this changes 60× a second.
export interface Locomotion {
  speed: number
  airborne: boolean
  sprinting: boolean
}

export function makeLocomotion(): Locomotion {
  return { speed: 0, airborne: false, sprinting: false }
}

// ─── Interact targeting ───────────────────────────────────────────────────────

export const INTERACT_RANGE = 2.8
// Half-angle of the cone in front of the walker. Generous: you shouldn't have
// to aim precisely at someone standing right next to you.
export const INTERACT_CONE  = Math.PI * 0.62

export interface InteractCandidate { uid: string; x: number; z: number }

// Nearest character in front of the walker, or null. Ties broken toward
// whoever is closest to straight ahead, so two people side by side resolve
// predictably instead of flickering.
export function nearestInteractable(
  px: number, pz: number, yaw: number,
  candidates: Iterable<InteractCandidate>,
): string | null {
  const fx = Math.sin(yaw), fz = Math.cos(yaw)
  let best: string | null = null
  let bestScore = Infinity

  for (const c of candidates) {
    const dx = c.x - px, dz = c.z - pz
    const dist = Math.hypot(dx, dz)
    if (dist > INTERACT_RANGE) continue
    if (dist < 1e-4) return c.uid

    const cosA = (dx * fx + dz * fz) / dist
    const angle = Math.acos(clamp(cosA, -1, 1))
    if (angle > INTERACT_CONE) continue

    // Distance dominates; the angle only breaks near-ties.
    const score = dist + angle * 0.45
    if (score < bestScore) {
      bestScore = score
      best = c.uid
    }
  }
  return best
}
