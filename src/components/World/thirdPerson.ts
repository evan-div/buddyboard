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
import { plazaEdgeRadius } from './plazaMath'

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

// ─── The island edge ──────────────────────────────────────────────────────────
// The walker is NOT fenced in: ground exists only over the island, so stepping
// past the rim drops you into the clouds exactly as a thrown character would.
// Once you've fallen this far below the surface the plaza's own physics takes
// the body over (tumble → despawn → sky respawn), which is why walk mode
// carries no fall or respawn code of its own.
export const FALL_HANDOFF_Y = -0.4

export function isOverIsland(x: number, z: number): boolean {
  return Math.hypot(x, z) <= plazaEdgeRadius(Math.atan2(z, x))
}

// ─── Backflip ─────────────────────────────────────────────────────────────────
// A second Space tap in quick succession, while still on the way up, converts
// the jump into a backflip. Buffering the first tap to wait and see would add
// input latency to every ordinary jump, so the flip is a mid-air conversion.
export const DOUBLE_TAP_MS = 280
// Top the jump back up so there's reliably time to come all the way round.
export const FLIP_BOOST = 0.92
export const FLIP_MIN_DURATION = 0.42
// Beans rotate about their middle, not their feet — flipping about the group
// origin would swing the whole body through the floor.
export const FLIP_PIVOT_Y = 0.7

// When a body at height y0 rising at vy will next reach the ground. Used to fit
// exactly one rotation into the airtime that's left, so the flip always lands
// upright instead of finishing early or planting the character on their head.
export function timeToLand(y0: number, vy: number, g = JUMP_GRAVITY): number {
  const disc = vy * vy + 2 * g * Math.max(0, y0)
  return (vy + Math.sqrt(Math.max(0, disc))) / g
}

// ─── Facing ───────────────────────────────────────────────────────────────────
// Movement is camera-relative, so the character's facing deviates from the
// camera's forward direction by exactly the input angle: hold D and they turn a
// full 90°, and you spend the whole time looking at their profile.
//
// The tempting fix — rotating the camera to follow the travel direction — does
// not work here, and not subtly: because the input frame IS the camera, the
// deviation the camera chases is regenerated every frame. Simulated at 60fps
// holding W+D, the deviation locks at a constant 42.5° and the camera winds
// round forever, walking the player in circles. It's a no-op for pure forward
// (nothing to correct) and unstable for everything else.
//
// So compress the facing instead. `s` is the input angle off camera-forward:
// this leaves straight-ahead untouched, pulls a sideways step back to a
// three-quarter view, and still lets a backpedal turn all the way around so
// the character faces you.
export const FACING_COMPRESS = 0.52   // rad (~30°) removed at full sideways

export function compressFacing(s: number): number {
  const sn = Math.sin(s)
  return s - Math.sign(s) * FACING_COMPRESS * sn * sn
}

// All of the above rests on one premise: that the input frame IS the camera, so
// every heading is something the player asked for *relative to where they are
// looking*, and the deviation is an artifact worth hiding.
//
// Touch's tap-to-move (tapMove.ts) breaks that premise. There the player names a
// point in the world, and the heading is simply the way to it — the camera had
// no part in choosing it and there is no artifact to compress away. Compressing
// anyway would turn a walk due left into a 60°-off crab. So that caller asks for
// 'travel' and gets the raw heading; it is not a regression of the reasoning
// above, it is the case that reasoning doesn't cover.
export type FacingMode = 'camera' | 'travel'

export interface MoveInput {
  forward: number   // -1..1  (W = +1, S = -1)
  strafe:  number   // -1..1  (D = +1, A = -1)
  sprint:  boolean
  jump:    boolean  // edge-triggered by the caller — held space must not re-fire
  flip:    boolean  // second Space tap inside DOUBLE_TAP_MS, also edge-triggered
}

export interface MoveState {
  pos: THREE.Vector3
  vel: THREE.Vector3      // x/z horizontal, y vertical
  yaw: number             // facing; atan2(dirX, dirZ) to match MiiCharacter
  grounded: boolean
  speed: number           // |horizontal velocity|, cached for the animator
  accel: THREE.Vector3    // horizontal dv/dt, drives the camera's lag and FOV
  /** 0 = upright, 1 = one full backward rotation. Never rests part-way. */
  flip: number
  flipping: boolean
  flipT: number
  flipDur: number
}

export function makeMoveState(x = 0, z = 0, yaw = 0): MoveState {
  return {
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw,
    grounded: true,
    speed: 0,
    accel: new THREE.Vector3(),
    flip: 0,
    flipping: false,
    flipT: 0,
    flipDur: 0,
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

export function stepMovement(
  s: MoveState,
  input: MoveInput,
  cameraYaw: number,
  dt: number,
  // Defaulted positional rather than an options object: this is called every
  // frame, and an object literal per call would allocate where the rest of walk
  // mode deliberately doesn't.
  facing: FacingMode = 'camera',
): void {
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

  // ── Horizontal integration first ────────────────────────────────────────────
  // Ground support is decided from where the step actually landed, which is
  // what lets a walker stride off the rim rather than being fenced in.
  s.pos.x += s.vel.x * dt
  s.pos.z += s.vel.z * dt
  const supported = isOverIsland(s.pos.x, s.pos.z)

  // Walked past the edge: nothing underneath any more.
  if (s.grounded && !supported) s.grounded = false

  // ── Jump / backflip / gravity ───────────────────────────────────────────────
  if (input.jump && s.grounded) {
    s.vel.y = JUMP_SPEED
    s.grounded = false
  }
  // Convert an in-flight jump into a backflip. Only on the way up, so a late
  // second tap near the ground can't start a rotation there's no room for.
  if (input.flip && !s.grounded && !s.flipping && s.vel.y > 0) {
    s.vel.y = Math.max(s.vel.y, JUMP_SPEED * FLIP_BOOST)
    s.flipping = true
    s.flipT = 0
    s.flipDur = Math.max(FLIP_MIN_DURATION, timeToLand(s.pos.y, s.vel.y))
  }
  if (!s.grounded) {
    s.vel.y -= JUMP_GRAVITY * dt
    s.pos.y += s.vel.y * dt
    // Only the island catches you.
    if (supported && s.pos.y <= 0) {
      s.pos.y = 0
      s.vel.y = 0
      s.grounded = true
    }
  }

  if (s.flipping) {
    s.flipT += dt
    s.flip = clamp(s.flipT / s.flipDur, 0, 1)
    // Landing always ends it upright — flipDur was fitted to the airtime, so
    // by here the rotation has come the whole way round anyway.
    if (s.grounded) {
      s.flipping = false
      s.flip = 0
    }
  }

  // ── Facing ──────────────────────────────────────────────────────────────────
  // Turn toward where we're heading. Under 'camera' that's compressed toward
  // camera-forward so a sideways step doesn't leave us staring at the
  // character's profile (see compressFacing); under 'travel' it's the raw
  // heading. Both ease at TURN_RATE, so a 180° reversal sweeps around instead
  // of snapping either way.
  if (moving) {
    const travel = Math.atan2(_desired.x, _desired.z)
    let goal: number
    if (facing === 'travel') {
      goal = travel
    } else {
      const forward = cameraYaw + Math.PI        // where the camera is looking
      goal = forward + compressFacing(shortestAngle(forward, travel))
    }
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
export const FOLLOW_RATE_REDUCED = 20  // near-rigid, for prefers-reduced-motion
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
  /** Honour prefers-reduced-motion: drop the decorative camera dynamics. */
  reducedMotion?: boolean
}

export function stepCamera(cam: CamState, opts: CamStepOpts, dt: number): void {
  if (dt <= 0) return
  const { anchor, vel, accel } = opts
  const reduced = opts.reducedMotion === true

  // Velocity-aware trail: shove the pivot opposite the character's acceleration,
  // so the arm visibly drags when you take off and eases back in when you stop.
  // Under reduced motion the arm is rigid — the trail is exactly the kind of
  // unrequested viewport movement that provokes motion sickness.
  if (reduced) {
    cam.lag.set(0, 0, 0)
  } else {
    _lagGoal.set(-accel.x * LAG_PER_ACCEL, 0, -accel.z * LAG_PER_ACCEL)
    if (_lagGoal.lengthSq() > LAG_MAX * LAG_MAX) _lagGoal.setLength(LAG_MAX)
    cam.lag.lerp(_lagGoal, smoothFactor(LAG_RATE, dt))
  }

  _pivotGoal.set(anchor.x + cam.lag.x, anchor.y + CAM_PIVOT_Y + cam.lag.y, anchor.z + cam.lag.z)
  cam.pivot.lerp(_pivotGoal, smoothFactor(reduced ? FOLLOW_RATE_REDUCED : FOLLOW_RATE, dt))

  // Zoom eases onto the wheel target rather than jumping a notch at a time.
  // Kept under reduced motion: it's directly user-initiated, and easing it is
  // gentler than snapping.
  cam.dist += (cam.distTarget - cam.dist) * smoothFactor(ZOOM_RATE, dt)

  // ── FOV ─────────────────────────────────────────────────────────────────────
  const speed = Math.hypot(vel.x, vel.z)
  let goal: number
  if (reduced) {
    // A moving FOV is the single most nauseating part of this camera; pin it.
    goal = FOV_BASE
  } else {
    const t = clamp(speed / SPRINT_SPEED, 0, 1)
    // Squared so walking barely reframes and the widening belongs to the sprint.
    goal = FOV_BASE + t * t * FOV_WIDEN
    // Braking pulls FOV below base for a beat — that dip is what reads as the
    // camera "tightening in" as you come to a stop.
    if (speed > 1e-4) {
      const along = (accel.x * vel.x + accel.z * vel.z) / speed
      if (along < 0) goal -= Math.min(FOV_TIGHTEN, -along * FOV_TIGHTEN_PER_DECEL)
    }
  }
  // Still eased, so flipping the setting mid-session doesn't jump the framing.
  cam.fov += (goal - cam.fov) * smoothFactor(FOV_RATE, dt)
}

// ─── Character collision ──────────────────────────────────────────────────────

export const CHAR_RADIUS = 0.34

// Push the walker out of anyone they've walked into, and cancel the velocity
// heading into them so they slide around rather than grinding in place.
//
// Only the walker moves. The others are positioned by the shared deterministic
// wander schedule in plazaWalk.ts — shoving them here would put this client's
// world out of step with every other viewer's.
export function resolveCharacterOverlap(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  others: Iterable<{ x: number; z: number }>,
  radius = CHAR_RADIUS,
): boolean {
  const minDist = radius * 2
  let pushed = false
  for (const o of others) {
    const dx = pos.x - o.x
    const dz = pos.z - o.z
    const d  = Math.hypot(dx, dz)
    if (d >= minDist) continue
    // Exactly co-located (a respawn drop landing on us): pick an axis so the
    // normal stays well defined. `d` stays 0 so the push is the full diameter —
    // deriving the normal must not also fake the distance.
    const nx = d < 1e-6 ? 1 : dx / d
    const nz = d < 1e-6 ? 0 : dz / d
    pos.x += nx * (minDist - d)
    pos.z += nz * (minDist - d)
    const into = vel.x * nx + vel.z * nz
    if (into < 0) {
      vel.x -= nx * into
      vel.z -= nz * into
    }
    pushed = true
  }
  return pushed
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

// ─── Member card placement ────────────────────────────────────────────────────
// The orbit-mode card can live at a fixed offset from screen centre, because
// zooming to a character always parks them in the same spot. In walk mode the
// spring arm can be anywhere, so the card has to be placed from the target's
// actual projected screen position — otherwise it lands on top of them.

// Height up the character's body to anchor the card against — roughly head
// level, so the card reads as attached to them rather than to their feet.
export const CARD_ANCHOR_Y = 1.6

export const CARD_GAP    = 28   // px between the character's silhouette and the card
export const CARD_RISE   = 40   // px the card sits above the anchor, matching
                                // orbit mode's `headScreenY - 40`
export const CARD_MARGIN = 16   // px minimum gap to the viewport edge

// Half-width of a bean in world units, arms included — used to convert the
// character's distance from the camera into how wide they look on screen.
export const CHAR_HALF_WIDTH = 0.55
// Cap so a character pressed right up against the camera doesn't demand an
// absurd offset (the viewport clamp would fight it anyway).
export const CHAR_HALF_WIDTH_PX_MAX = 220

export interface Size { width: number; height: number }

// Pixels per world unit at a given depth, for a perspective camera.
export function projectedScale(fovDeg: number, viewportHeight: number, dist: number): number {
  const focal = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360))
  return focal / Math.max(0.2, dist)
}

// How wide the character looks on screen, in px, at this depth.
export function charHalfWidthPx(fovDeg: number, viewportHeight: number, dist: number): number {
  return Math.min(
    CHAR_HALF_WIDTH_PX_MAX,
    CHAR_HALF_WIDTH * projectedScale(fovDeg, viewportHeight, dist),
  )
}

// Place the card beside the anchor: to its right by preference, flipped to the
// left when there isn't room, and always fully inside the viewport. Clears the
// character's silhouette rather than just the anchor point — standing next to
// someone makes them huge on screen, which is exactly when a fixed gap fails.
export function placeCardBeside(
  anchorX: number,
  anchorY: number,
  card: Size,
  view: Size,
  anchorHalfWidth = 0,
): { left: number; top: number; side: 'right' | 'left' } {
  const clearance = anchorHalfWidth + CARD_GAP
  const rightLeft = anchorX + clearance
  const leftLeft  = anchorX - clearance - card.width

  let side: 'right' | 'left'
  let left: number
  if (rightLeft + card.width <= view.width - CARD_MARGIN) {
    side = 'right'; left = rightLeft
  } else if (leftLeft >= CARD_MARGIN) {
    side = 'left';  left = leftLeft
  } else {
    // Neither side fits — keep it on the roomier side and clamp.
    const roomRight = view.width - anchorX
    side = roomRight >= anchorX ? 'right' : 'left'
    left = side === 'right' ? rightLeft : leftLeft
  }
  left = clamp(left, CARD_MARGIN, Math.max(CARD_MARGIN, view.width - card.width - CARD_MARGIN))

  const top = clamp(
    anchorY - CARD_RISE,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, view.height - card.height - CARD_MARGIN),
  )
  return { left, top, side }
}

// ─── Animator handoff ─────────────────────────────────────────────────────────

// Written by the controller every frame and read by MiiCharacter's animator.
// Lives behind a ref, never React state — this changes 60× a second.
export interface Locomotion {
  speed: number
  airborne: boolean
  sprinting: boolean
  /** Vertical velocity, so a landing can be squashed in proportion to the fall. */
  vy: number
  /** Live walker position — other characters read it to turn and look at you. */
  pos: THREE.Vector3
}

export function makeLocomotion(): Locomotion {
  return { speed: 0, airborne: false, sprinting: false, vy: 0, pos: new THREE.Vector3() }
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
