// Pure movement/look math for the first-person walking mode. No React, no
// THREE — plain numbers only, so it unit-tests directly (same convention as
// plazaWalk.ts; see plazaMath.ts for the THREE-flavored geometry helpers).
//
// This is the only place first-person tuning constants live. Nothing here is a
// wire format: the mode is local-only, so these can be retuned freely without
// desyncing other clients.

// ─── Tuning ───────────────────────────────────────────────────────────────────

// NPCs wander at 1.4 u/s. The player is deliberately quicker: at 3.2 it takes
// ~8s to cross the 26-unit island, ~4s sprinting, which reads as brisk without
// making the plaza feel tiny.
export const WALK_SPEED   = 3.2
export const SPRINT_SPEED = 6.0

export const GROUND_ACCEL = 18   // u/s² — reaches walk speed in ~0.18s
export const AIR_ACCEL    = 4    // limited air control, but not zero
export const FRICTION     = 12   // u/s² of decel when no input and grounded

// Softer than the plaza's throw GRAVITY (38): thrown beans should snap down,
// but the player's own jump wants a readable hang time. 6.0/24 gives a 0.75u
// apex (~0.7 body heights) and 0.5s of airtime.
export const FP_GRAVITY    = 24
export const JUMP_VELOCITY = 6.0

// Just shy of straight up/down — exactly ±π/2 lets the view roll over the pole.
export const PITCH_LIMIT      = Math.PI / 2 - 0.05
export const LOOK_SENSITIVITY = 0.0022   // radians per pixel of mouse movement

export const PLAYER_RADIUS = 0.30   // matches RADIUS_APPROX in plazaMath

// Reach for the E prompt: about two body-widths away, in a ~70° half-cone so
// you interact with who you're looking at, not who's behind you.
export const INTERACT_RANGE   = 2.6
export const INTERACT_MIN_DOT = 0.35

// ─── Types ────────────────────────────────────────────────────────────────────

export type Vec2 = { x: number; z: number }

export type MoveInput = {
  forward: number   // -1..1, +1 = W
  strafe:  number   // -1..1, +1 = D
}

export type PlayerState = {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  grounded: boolean
}

export function makePlayerState(x = 0, z = 0): PlayerState {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, grounded: true }
}

// ─── Movement ─────────────────────────────────────────────────────────────────

// Camera-relative ground velocity. yaw 0 faces -Z (three.js convention), so
// forward is (-sin yaw, -cos yaw) and right is (cos yaw, -sin yaw).
// The input pair is normalized first, so W+D is exactly as fast as W.
export function desiredVelocity(input: MoveInput, yaw: number, speed: number): Vec2 {
  const mag = Math.hypot(input.forward, input.strafe)
  if (mag === 0) return { x: 0, z: 0 }
  const f = input.forward / mag
  const s = input.strafe  / mag
  const sy = Math.sin(yaw)
  const cy = Math.cos(yaw)
  return {
    x: (-f * sy + s * cy) * speed,
    z: (-f * cy - s * sy) * speed,
  }
}

// One integration step: horizontal accel toward `desired`, friction when
// grounded and unsteered, gravity, jump impulse, and the y >= 0 ground clamp.
// Returns landing info so the caller can play a thud on touchdown.
export function stepPlayer(
  s: PlayerState,
  desired: Vec2,
  dt: number,
  jumpQueued: boolean,
): { landed: boolean; landSpeed: number } {
  // A jump only launches from the ground — holding Space mid-air does nothing.
  if (jumpQueued && s.grounded) {
    s.vy = JUMP_VELOCITY
    s.grounded = false
  }

  const accel = s.grounded ? GROUND_ACCEL : AIR_ACCEL
  const steering = desired.x !== 0 || desired.z !== 0

  if (steering) {
    // Move velocity toward the target without overshooting it in one step.
    const dx = desired.x - s.vx
    const dz = desired.z - s.vz
    const d  = Math.hypot(dx, dz)
    const k  = Math.min(1, (accel * dt) / (d || 1))
    s.vx += dx * k
    s.vz += dz * k
  } else if (s.grounded) {
    const speed = Math.hypot(s.vx, s.vz)
    if (speed > 0) {
      const drop = Math.min(speed, FRICTION * dt)
      s.vx -= (s.vx / speed) * drop
      s.vz -= (s.vz / speed) * drop
    }
  }

  s.vy -= FP_GRAVITY * dt

  s.x += s.vx * dt
  s.y += s.vy * dt
  s.z += s.vz * dt

  let landed = false
  let landSpeed = 0
  if (s.y <= 0) {
    landed = !s.grounded
    landSpeed = landed ? -s.vy : 0
    s.y = 0
    s.vy = 0
    s.grounded = true
  } else {
    s.grounded = false
  }

  return { landed, landSpeed }
}

// ─── Look ─────────────────────────────────────────────────────────────────────

// Accumulate raw pointer-lock movement deltas. Pitch is clamped so the view
// can't tumble over the pole; yaw wraps to (-π, π] so it never grows unbounded
// across a long session.
export function applyLook(
  yaw: number,
  pitch: number,
  dx: number,
  dy: number,
  sensitivity: number = LOOK_SENSITIVITY,
): { yaw: number; pitch: number } {
  let y = yaw - dx * sensitivity
  const p = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - dy * sensitivity))
  const TAU = Math.PI * 2
  y = ((y + Math.PI) % TAU + TAU) % TAU - Math.PI
  return { yaw: y, pitch: p }
}

// ─── Interaction targeting ────────────────────────────────────────────────────

// Nearest candidate that's both within `range` and inside the forward cone.
// Distance breaks ties, so walking into a cluster always targets whoever you're
// standing closest to rather than whoever happens to be first in the array.
export function pickInteractable<T extends Vec2 & { uid: string }>(
  cands: readonly T[],
  px: number,
  pz: number,
  yaw: number,
  range: number = INTERACT_RANGE,
  minDot: number = INTERACT_MIN_DOT,
): T | null {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  let best: T | null = null
  let bestDist = Infinity

  for (const c of cands) {
    const dx = c.x - px
    const dz = c.z - pz
    const dist = Math.hypot(dx, dz)
    if (dist > range || dist === 0) continue
    if ((dx / dist) * fx + (dz / dist) * fz < minDot) continue
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

// ─── Collision ────────────────────────────────────────────────────────────────

// Push the player out of any overlapping character capsules (circles in XZ).
// One pass is enough at plaza densities; `minDist` is the sum of both radii.
export function resolveCharacterCollision(
  px: number,
  pz: number,
  others: readonly Vec2[],
  minDist: number,
): Vec2 {
  let x = px
  let z = pz
  for (const o of others) {
    const dx = x - o.x
    const dz = z - o.z
    const dist = Math.hypot(dx, dz)
    if (dist >= minDist) continue
    if (dist === 0) {
      // Exactly coincident — no direction to push along, so pick one rather
      // than dividing by zero.
      x += minDist
      continue
    }
    const push = (minDist - dist) / dist
    x += dx * push
    z += dz * push
  }
  return { x, z }
}
