import * as THREE from 'three'

// Pure geometry/physics math for the plaza, kept free of React and rendering
// so it can be unit-tested directly.

// ─── Plaza outline ────────────────────────────────────────────────────────────
// A superellipse ("squircle") with a gentle sinusoidal wobble: the plaza keeps
// its square footprint but the corners are rounded and the edge reads organic.
// The floor, dirt base, grass blades, and physics bounds all follow this line.

export const FSIZE = 26

const EDGE_EXP = 4

export type PlazaEdgeSettings = {
  seed: number
  aggressiveness: number
}

export const DEFAULT_PLAZA_EDGE: PlazaEdgeSettings = {
  seed: 0,
  aggressiveness: 1,
}

export function plazaEdgeRadius(
  theta: number,
  settings: PlazaEdgeSettings = DEFAULT_PLAZA_EDGE,
): number {
  const c = Math.abs(Math.cos(theta))
  const s = Math.abs(Math.sin(theta))
  const base = (FSIZE / 2) / Math.pow(c ** EDGE_EXP + s ** EDGE_EXP, 1 / EDGE_EXP)
  const seedPhase = settings.seed * 0.61803398875
  const aggression = THREE.MathUtils.clamp(settings.aggressiveness, 0, 4)
  const wobble = 1 + aggression * (
    0.025 * Math.sin(theta * 5 + 1.7 + seedPhase)
    + 0.015 * Math.sin(theta * 9 + 0.4 - seedPhase * 1.7)
  )
  return base * wobble
}

// Pull a position back inside the rounded edge; returns true if it was outside
export function clampToPlazaEdge(
  pos: THREE.Vector3,
  margin = 0.45,
  settings: PlazaEdgeSettings = DEFAULT_PLAZA_EDGE,
): boolean {
  const r = Math.hypot(pos.x, pos.z)
  if (r === 0) return false
  const maxR = plazaEdgeRadius(Math.atan2(pos.z, pos.x), settings) - margin
  if (r <= maxR) return false
  const scale = maxR / r
  pos.x *= scale
  pos.z *= scale
  return true
}

// ─── Capsule ground support ───────────────────────────────────────────────────
// Approximate bean geometry constants for effective ground-floor calculation.
// These match the default dims from useBeanDims (bodyWidth=0.5, bodyHeight=0.5).

export const GROUND_Y_APPROX = 0.65   // body center height above group root
export const CAP_HALF_APPROX = 0.225  // capsule half-length (capLen/2)
export const RADIUS_APPROX   = 0.29   // capsule radius

// Ground height for the group origin so the body capsule rests on (never in)
// the floor, exact for any orientation: project the body's local up-axis into
// world space and support the capsule's lowest point.
const _capUp = new THREE.Vector3()
export function capsuleFloorY(q: THREE.Quaternion): number {
  const uY = _capUp.set(0, 1, 0).applyQuaternion(q).y
  return Math.max(0, RADIUS_APPROX + CAP_HALF_APPROX * Math.abs(uY) - GROUND_Y_APPROX * uY)
}

// ─── Lying-down orientation (quaternions) ─────────────────────────────────────
// A knocked-out bean lies with its long (local Y) axis horizontal. Two params
// describe the pose: `heading` (which way the head points, cosmetic) and `roll`
// about the long axis — 0 = face-down (prone), ±π/2 = on a side, π = on its back.
// Euler angles can't express "roll about the long axis" cleanly once the body is
// tipped over, so the grounded states use quaternions.

export const AXIS_X = new THREE.Vector3(1, 0, 0)
export const AXIS_Y = new THREE.Vector3(0, 1, 0)

// Scratch objects are module-private so callers can never alias `out` with
// one of them (which would corrupt the result mid-computation).
const _lq1 = new THREE.Quaternion()
const _lq2 = new THREE.Quaternion()
const _rq1 = new THREE.Quaternion()
const _rq2 = new THREE.Quaternion()
const _rq3 = new THREE.Quaternion()
const _rlong = new THREE.Vector3()

// Build the lying pose: roll about the long axis, tip 90° forward, then head.
export function lyingQuat(out: THREE.Quaternion, heading: number, roll: number): THREE.Quaternion {
  out.setFromAxisAngle(AXIS_Y, heading)
  out.multiply(_lq1.setFromAxisAngle(AXIS_X, Math.PI / 2))
  out.multiply(_lq2.setFromAxisAngle(AXIS_Y, roll))
  return out
}

// Read the (heading, roll) that best describe how a body is currently lying.
export function readLyingPose(q: THREE.Quaternion): { heading: number; roll: number } {
  const L = _rlong.set(0, 1, 0).applyQuaternion(q)          // long axis in world
  const heading = Math.atan2(L.x, L.z)
  // Strip heading and the 90° tip; the residual is the roll about the long axis
  _rq1.setFromAxisAngle(AXIS_X, -Math.PI / 2)
  _rq2.setFromAxisAngle(AXIS_Y, -heading)
  _rq3.copy(_rq1).multiply(_rq2).multiply(q)
  const roll = 2 * Math.atan2(_rq3.y, _rq3.w)
  return { heading, roll }
}
