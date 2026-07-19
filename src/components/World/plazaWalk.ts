// Deterministic shared wander schedule. Every client derives each character's
// current wander waypoint from (uid hash, wall-clock time slot), so all
// viewers see characters walking to the SAME spots with zero network traffic.
// Late joiners spawn characters at the current waypoint; after physics
// (throws, drops, respawns) characters walk back to it, re-converging clients.
//
// ⚠️ WIRE FORMAT: hashUid, mix, makeRng, and SLOT_MS together define the
// shared world. Changing any of them shuffles every character's schedule and
// desyncs mixed-version clients until they all update. The snapshot test in
// plazaWalk.test.ts pins the current behavior — don't "improve" these
// functions casually.
//
// Pure math, no React/THREE imports, unit-tested (see plazaMath.ts for the
// same convention).

export const SLOT_MS = 8000          // one wander decision per slot
export const WANDER_MIN_R = 1.0      // matches the old pickNewTarget range:
export const WANDER_R_SCALE = 0.85   //   radius = 1.0 + rand * (bounds * 0.85)

// 32-bit imul-31 string hash — same scheme the original spawn positions used.
export function hashUid(uid: string): number {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (Math.imul(31, h) + uid.charCodeAt(i)) | 0
  return h >>> 0
}

// Avalanche two ints into one seed — decorrelates adjacent slot seeds so a
// character's consecutive waypoints don't cluster.
export function mix(a: number, b: number): number {
  let x = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0
  return (x ^ (x >>> 15)) >>> 0
}

// LCG in [0,1) — same constants as the cloud sprites' seededRandom.
export function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}

// Per-character retarget offset in [0, SLOT_MS) so the plaza doesn't turn in
// unison on slot boundaries.
export function phaseMs(uidHash: number): number {
  return mix(uidHash, 0x5eed) % SLOT_MS
}

export function slotIndex(uidHash: number, nowMs: number): number {
  return Math.floor((nowMs + phaseMs(uidHash)) / SLOT_MS)
}

// The four deterministic draws every slot decision is built from:
// [angle, radiusFrac, idlePick, yawFrac]
function slotDraws(uidHash: number, slot: number): [number, number, number, number] {
  const rng = makeRng(mix(uidHash, slot))
  return [rng(), rng(), rng(), rng()]
}

// Absolute plaza coordinates for a slot. Identical on every client.
export function waypoint(uidHash: number, slot: number, bounds: number): { x: number; z: number } {
  const [a, r] = slotDraws(uidHash, slot)
  const angle = a * Math.PI * 2
  const radius = WANDER_MIN_R + r * bounds * WANDER_R_SCALE
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

export function currentWaypoint(
  uidHash: number,
  nowMs: number,
  bounds: number,
): { x: number; z: number; slot: number } {
  const slot = slotIndex(uidHash, nowMs)
  const { x, z } = waypoint(uidHash, slot, bounds)
  return { x, z, slot }
}

// Deterministic idle animation once the character reaches the slot's waypoint.
export function idleVariant(uidHash: number, slot: number): 'idle_bob' | 'idle_sway' {
  return slotDraws(uidHash, slot)[2] < 0.5 ? 'idle_bob' : 'idle_sway'
}

// Deterministic facing for the sky drop-in after falling off the island.
export function respawnYaw(uidHash: number, slot: number): number {
  return slotDraws(uidHash, slot)[3] * Math.PI * 2
}
