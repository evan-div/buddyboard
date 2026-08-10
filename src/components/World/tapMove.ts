// Tap-to-move: the touch half of third-person walk mode.
//
// Desktop walk mode reads a direction straight off the keyboard — WASD names a
// heading and the character goes that way until you let go. Touch has no such
// affordance, and the obvious substitute (a thumbstick pinned to the corner)
// would be the only permanent chrome on the screen, competing for the bottom of
// the viewport with the tab bar and the member sheet. So touch names a
// *destination* instead: tap the ground, walk there, stop. Double-tap, run.
//
// The plaza is what makes that viable. It's 26 units across, flat, and has no
// obstacles, so the straight line to any point is always a valid path and there
// is no pathfinding here at all — just a seek that produces the same
// `{forward, strafe, sprint}` a keyboard would, so `stepMovement` runs
// unmodified underneath it.
//
// Pure math over THREE vector types, no React, same convention as thirdPerson.ts
// and plazaMath.ts (tests in tapMove.test.ts).
//
// ⚠️ Imports from thirdPerson.ts, never the reverse — a cycle here would be
// loaded at module scope by both and is not worth the debugging.

import * as THREE from 'three'
import {
  cameraBasis, GROUND_DAMP, GROUND_ACCEL, WALK_SPEED, SPRINT_SPEED, DOUBLE_TAP_MS,
  type MoveInput,
} from './thirdPerson'

// Re-exported so callers and tests can reach the double-tap window from the
// module that gives it this second meaning.
export { DOUBLE_TAP_MS }

// ─── Gesture discrimination ───────────────────────────────────────────────────
// A one-finger touch on the canvas is ambiguous until it ends: it might be a tap
// (a destination) or a drag (an orbit). The plaza has discriminated gestures by
// *time* before — the 250ms carry hold — but never by distance, so this is new.

// Above a deliberate tap's finger roll, below the ~15px browsers use for scroll
// intent, so an orbit drag still takes hold almost immediately.
export const TAP_SLOP_PX = 10
// A stationary press longer than this is hesitation, not a command. Kept well
// clear of the plaza's 250ms carry hold so the two thresholds can't be confused
// for each other when reading the code.
export const TAP_MAX_MS = 500
// The second tap of a double must land near the first. This is finger-to-finger
// placement drift, not within-touch drift, so it is necessarily much larger than
// TAP_SLOP_PX. Two taps further apart than this are two walk commands.
export const DOUBLE_TAP_SLOP_PX = 36

export type Gesture = 'tap' | 'drag' | 'none'

export function classifyTouch(dxPx: number, dyPx: number, elapsedMs: number): Gesture {
  if (Math.hypot(dxPx, dyPx) > TAP_SLOP_PX) return 'drag'
  return elapsedMs <= TAP_MAX_MS ? 'tap' : 'none'
}

// Does this tap upgrade the previous one to a run, or start a fresh walk?
//
// Reuses DOUBLE_TAP_MS rather than defining a parallel constant: the app should
// have one double-tap feel, and one meaning — "a second tap this soon means
// *more*, not *again*". It's the same window that turns a jump into a backflip.
export function isRunUpgrade(
  prevX: number, prevY: number, prevMs: number,
  x: number, y: number, ms: number,
): boolean {
  if (!Number.isFinite(prevMs)) return false
  if (ms - prevMs > DOUBLE_TAP_MS) return false
  return Math.hypot(x - prevX, y - prevY) <= DOUBLE_TAP_SLOP_PX
}

// ─── Camera feel on touch ─────────────────────────────────────────────────────

// Same number as the desktop drag-to-orbit fallback (DRAG_SCALE) for the same
// reason: a drag can only travel as far as the screen is wide, where a locked
// mouse can keep going forever. Kept separate so the two can diverge once
// there's real-hardware feedback.
//
// No axis inversion, which is worth stating because it looks like an oversight:
// applyLook is written for first-person mouse look, and touch normally wants
// direct manipulation instead. They happen to agree here. OrbitControls drags
// right by `theta -= dx` and applyLook by `yaw -= dx` onto the same spherical
// parameterization, and likewise down-raises-the-camera on the other axis — so
// orbiting inside walk mode already feels exactly like orbiting outside it.
export const TOUCH_LOOK_SCALE = 1.8

// Pinch distance (px) → the wheel deltaY units applyZoom expects. Traversing the
// whole zoom range takes ln(CAM_MAX_DIST / CAM_MIN_DIST) / ZOOM_SENSITIVITY
// ≈ 1291 wheel units; at 6.0 that's ~215px of pinch, about a comfortable span.
export const PINCH_TO_WHEEL = 6.0

// ─── Ground picking ───────────────────────────────────────────────────────────

// The tap plane sits at the *grass tops*, not the floor. The lawn is what the
// player sees and aims at — blob shadows are drawn at this height for exactly
// the same reason (MiiPlaza's "the lawn IS the visible ground"). Picking against
// y=0 instead puts every destination 0.16/tan(pitch) ≈ 0.36u short at the
// default camera pitch, which is a third of a character width, consistently, in
// the same direction. It reads as "the marker is wrong" rather than as a bug.
export const GROUND_PICK_Y = 0.16   // = BLADE_H in MiiPlaza

// The camera's pitch floor is 0.02 rad, so a tap a few pixels below the horizon
// casts a ray nearly parallel to the ground and meets it thousands of units out.
// Cap the reach rather than rejecting the tap: still far enough to walk off the
// rim on purpose (the island is 26 across), without a mis-tap sending the
// character to the next county.
export const TARGET_MAX_RANGE = 26  // = FSIZE in plazaMath

export interface ClientRectLike { left: number; top: number; width: number; height: number }

// Touch coordinates → normalized device coords, computed from the event and the
// canvas rect directly rather than read off R3F's shared `pointer`, which is
// driven by the plaza's synthetic-event re-dispatch and can be a frame stale.
export function ndcFromClient(
  clientX: number, clientY: number, rect: ClientRectLike, out: THREE.Vector2,
): THREE.Vector2 {
  return out.set(
     ((clientX - rect.left) / rect.width)  * 2 - 1,
    -((clientY - rect.top)  / rect.height) * 2 + 1,
  )
}

// Pull `hit` in toward `from` so it's at most TARGET_MAX_RANGE away, keeping the
// direction. Mutates and returns `hit`.
export function clampRange(
  hit: THREE.Vector3, from: THREE.Vector3, max = TARGET_MAX_RANGE,
): THREE.Vector3 {
  const dx = hit.x - from.x
  const dz = hit.z - from.z
  const d  = Math.hypot(dx, dz)
  if (d <= max || d < 1e-9) return hit
  hit.x = from.x + (dx / d) * max
  hit.z = from.z + (dz / d) * max
  return hit
}

// ─── Seek tuning ──────────────────────────────────────────────────────────────

// Close enough to not bother walking. Roughly half CHAR_RADIUS — a tap this
// near your own feet is one you're already standing on.
export const ARRIVE_RADIUS = 0.18

// How far short of the destination the walker can actually come to rest.
//
// Not a tunable — an emergent consequence of braking conservatively. The latch
// has to fire early enough that a walker still gaining speed can never sail
// past, which on a short leg means committing while there's still room to
// spare. That room is where they stop. Worst case is a short double-tapped
// sprint, which is also the least likely thing anyone does.
//
// It is here because it sizes the destination marker: the ring has to be wide
// enough that the character reliably comes to rest inside it, or every short
// trip looks like a miss.
export const STOP_TOLERANCE = 0.28
// Slow enough to call it stopped. ~2% of WALK_SPEED, and deliberately below the
// animator's `speed > 0.08` gait threshold, so a seek always ends in the idle
// pose rather than freezing mid-stride.
export const ARRIVE_SPEED = 0.06
// Give up on a destination we're not making progress toward. Required, not
// defensive: resolveCharacterOverlap enforces 0.68u between bodies, so a
// destination underneath somebody else is *unreachable*, and without this the
// walker leans into them forever.
export const STUCK_SPEED   = 0.15
export const STUCK_ABORT_S = 1.2
// Destination marker fade. Just under FOLLOW_RATE, so it clears about as fast as
// the camera settles.
export const MARKER_FADE_RATE = 7

export interface SeekState {
  active: boolean
  run: boolean
  /** Latched once we've committed to coasting in — see seekInput. */
  braking: boolean
  /** Destination on the ground plane; y is unused. */
  target: THREE.Vector3
  /** How long we've been below STUCK_SPEED while still trying to accelerate. */
  stuckT: number
}

export function makeSeekState(): SeekState {
  return { active: false, run: false, braking: false, target: new THREE.Vector3(), stuckT: 0 }
}

export function setSeekTarget(seek: SeekState, x: number, z: number, run: boolean): void {
  seek.target.set(x, 0, z)
  seek.active  = true
  seek.run     = run
  seek.braking = false   // a new destination always re-opens the throttle
  seek.stuckT  = 0
}

export function clearSeek(seek: SeekState): void {
  seek.active  = false
  seek.run     = false
  seek.braking = false
  seek.stuckT  = 0
}

// How far a body moving at `speed` travels before GROUND_DAMP brings it to rest.
//
// Exact, not an estimate: stepMovement closes velocity on its target at a
// bounded rate and clamps the last step exactly onto it, so with no input the
// walker decelerates at a constant GROUND_DAMP u/s² and lands on precisely zero.
// That makes this the textbook v²/2a — 0.23u from WALK_SPEED, but 1.20u from
// SPRINT_SPEED. That 5× spread is the whole reason a fixed "start slowing here"
// radius can't work and the distance has to come from live speed.
export function brakingDistance(speed: number, damp: number = GROUND_DAMP): number {
  return (speed * speed) / (2 * damp)
}

// World-space seek → the camera-relative MoveInput stepMovement wants.
//
// Writes forward/strafe/sprint into `out` (the caller owns jump/flip — touch has
// no affordance for either). Mutates `seek`: latches the brake, retires the
// destination on arrival, and counts down the stuck timer. Returns seek.active,
// i.e. false once the destination has been retired.
export function seekInput(
  seek: SeekState,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  cameraYaw: number,
  dt: number,
  out: MoveInput,
): boolean {
  out.forward = 0
  out.strafe  = 0
  out.sprint  = false
  if (!seek.active) return false

  const dx = seek.target.x - pos.x
  const dz = seek.target.z - pos.z
  const dist  = Math.hypot(dx, dz)
  const speed = Math.hypot(vel.x, vel.z)

  // Parked on it. Both halves matter: retiring on proximity alone lets a walker
  // at full tilt clip the radius, drop the seek, and then coast straight through
  // the destination and out the far side with nothing left steering them.
  if (dist <= ARRIVE_RADIUS && speed <= ARRIVE_SPEED) { clearSeek(seek); return false }

  // Coasting in. Stop when we've bled off the speed, or when we stop closing at
  // all — the latter also catches a dead stop, and a coast that got shoved past
  // the destination by a collision and is now drifting away from it.
  if (seek.braking) {
    const closing = dx * vel.x + dz * vel.z
    if (speed <= ARRIVE_SPEED || closing <= 0) { clearSeek(seek); return false }
    return true   // zero input; GROUND_DAMP does the rest
  }

  // Under power but going nowhere: wedged against another bean, or against a
  // destination we can't stand on.
  if (speed < STUCK_SPEED) {
    seek.stuckT += dt
    if (seek.stuckT > STUCK_ABORT_S) { clearSeek(seek); return false }
  } else {
    seek.stuckT = 0
  }

  // Commit to braking, and *stay* committed.
  //
  // The latch is load-bearing, not tidiness: while braking, the distance left
  // and the distance needed both shrink at exactly -v, so the predicate is
  // marginally stable and the integrator's own rounding decides it. Unlatched,
  // the controller re-accelerates for a frame, brakes, re-accelerates — a
  // visible stutter, and an audible one, since the animator fires a footstep
  // every half stride cycle.
  //
  // The lookahead is the other half. Overshooting the destination and drifting
  // back is the worst-looking failure this system has, and we only get to test
  // once per frame, so the question to ask is not "can I stop from here?" but
  // "will I still be able to stop after one more frame of this?" — which is a
  // different question in two ways, both of which bite:
  //
  //   · a frame of travel is 20% of the walk braking distance, far more than
  //     any percentage fudge would absorb; and
  //   · the walker accelerates at GROUND_ACCEL but sheds speed at GROUND_DAMP,
  //     which is slower. On a short leg they gain more speed in the frame than
  //     the extra stopping room that speed will need, so a check against the
  //     *current* speed is permanently one frame behind and the walker sails
  //     through the destination on exactly the short hops.
  //
  // So project the speed forward through one frame of acceleration and ask
  // whether that speed could still stop in what's left. Errs early, lands a
  // little short, never past.
  const cruise = seek.run ? SPRINT_SPEED : WALK_SPEED
  const vNext  = Math.min(cruise, speed + GROUND_ACCEL * dt)
  if (dist <= brakingDistance(vNext) + vNext * dt) {
    seek.braking = true
    return true
  }

  // Full throttle along the ground direction to the target, expressed in the
  // camera's basis because that's the frame stepMovement integrates in.
  //
  // cameraBasis is orthonormal, so these two dot products are exactly its
  // inverse: stepMovement recomposes the identical world direction, at unit
  // magnitude, and its own normalize is a no-op on the result. That is what lets
  // the whole integrator be reused here untouched.
  const { fx, fz, rx, rz } = cameraBasis(cameraYaw)
  const nx = dx / dist
  const nz = dz / dist
  out.forward = nx * fx + nz * fz
  out.strafe  = nx * rx + nz * rz
  out.sprint  = seek.run
  return true
}
