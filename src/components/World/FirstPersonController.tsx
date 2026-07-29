'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useBeanDims } from '@/lib/beanDims'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import type { GroupMember } from '@/lib/types'
import { clampToPlazaEdge } from './plazaMath'
import { playThud } from './plazaSound'
import type { DragMode } from './MiiCharacter'
import type { FPKeys, FPLook } from './useFirstPersonInput'
import {
  desiredVelocity,
  stepPlayer,
  applyLook,
  pickInteractable,
  resolveCharacterCollision,
  makePlayerState,
  WALK_SPEED,
  SPRINT_SPEED,
  PLAYER_RADIUS,
  LOOK_SENSITIVITY,
} from './firstPersonMath'

// Drives the player's own character group and the camera while first-person
// mode is active. Renders nothing — it writes into the same THREE.Group that
// MiiPlaza already tracks in charGroups, so blob shadows and grass trampling
// keep following the player for free.

// How far above the character's eyes the camera actually sits. The face center
// is on the bean's surface; nudging up puts the view just behind the eyes.
const EYE_OFFSET = 0.08
// Subtle vertical head bob — enough to sell walking, not enough to nauseate.
const BOB_AMPLITUDE = 0.02
const BOB_RATE      = 3.4
// Nearest-character scan cadence. Every frame is wasted work for a handful of
// members; 6 Hz is well below the speed anyone can walk in and out of range.
const SCAN_INTERVAL = 1 / 6
// Fastest landing we scale the thud against (matches a fall from ~2 units).
const LAND_REF_SPEED = 10

export default function FirstPersonController({
  active,
  locked,
  keys,
  look,
  playerMember,
  members,
  charGroups,
  dragModeMap,
  onNearbyChange,
}: {
  active: boolean
  locked: boolean
  keys: React.RefObject<FPKeys>
  look: React.RefObject<FPLook>
  playerMember: GroupMember | null
  members: GroupMember[]
  charGroups: React.RefObject<Map<string, THREE.Group>>
  dragModeMap: Map<string, DragMode>
  onNearbyChange: (member: GroupMember | null, pos: [number, number, number] | null) => void
}) {
  const { camera } = useThree()

  const state    = useRef(makePlayerState())
  const yaw      = useRef(0)
  const pitch    = useRef(0)
  const bobPhase = useRef(0)
  const scanTime = useRef(0)
  const nearbyUid = useRef<string | null>(null)

  const scratch = useMemo(() => new THREE.Vector3(), [])
  const euler   = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  const others  = useRef<{ uid: string; x: number; z: number }[]>([])

  // A taller avatar genuinely sees further over the plaza.
  const dims = useBeanDims(playerMember?.avatar ?? DEFAULT_AVATAR)
  const eyeHeight = dims.faceCenterY + EYE_OFFSET

  // Entering the mode: start standing where the character already is, facing
  // the way it already faces, so the transition doesn't teleport you.
  useEffect(() => {
    if (!active || !playerMember) return
    const group = charGroups.current?.get(playerMember.uid)
    const s = state.current
    s.x = group?.position.x ?? 0
    s.z = group?.position.z ?? 0
    s.y = 0
    s.vx = s.vy = s.vz = 0
    s.grounded = true
    yaw.current   = group?.rotation.y ?? 0
    pitch.current = 0
    bobPhase.current = 0
    nearbyUid.current = null
    onNearbyChange(null, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playerMember?.uid])

  useFrame((_, rawDelta) => {
    if (!active || !playerMember) return
    // Same stall guard the rest of the plaza uses: an unclamped delta after a
    // backgrounded tab would launch the player across the island.
    const delta = Math.min(rawDelta, 0.1)

    const group = charGroups.current?.get(playerMember.uid)
    const s = state.current

    // Look and movement only run while the pointer is captured. With the
    // points card open the player stands still rather than drifting.
    if (locked) {
      const l = look.current
      const next = applyLook(yaw.current, pitch.current, l.dx, l.dy, LOOK_SENSITIVITY)
      yaw.current = next.yaw
      pitch.current = next.pitch
      l.dx = 0
      l.dy = 0
    }

    const k = keys.current
    const input = locked ? { forward: k.forward, strafe: k.strafe } : { forward: 0, strafe: 0 }
    const speed = k.sprint ? SPRINT_SPEED : WALK_SPEED
    const desired = desiredVelocity(input, yaw.current, speed)

    const jump = locked && k.jumpQueued
    k.jumpQueued = false
    const { landed, landSpeed } = stepPlayer(s, desired, delta, jump)

    // Collect everyone else's position once — reused for collision and the
    // interact scan. Characters mid-respawn sit 30 units below the floor;
    // colliding with them would wall you off from empty ground.
    const list = others.current
    list.length = 0
    const map = charGroups.current
    if (map) {
      for (const m of members) {
        if (m.uid === playerMember.uid) continue
        if (dragModeMap.get(m.uid) === 'fallen') continue
        const g = map.get(m.uid)
        if (g) list.push({ uid: m.uid, x: g.position.x, z: g.position.z })
      }
    }

    // Island boundary — reuse the plaza's single source of truth for the
    // superellipse outline rather than approximating it again here. Velocity is
    // left alone: input regenerates it each frame anyway, and clamping position
    // only means you slide along the edge instead of sticking to it.
    scratch.set(s.x, 0, s.z)
    if (clampToPlazaEdge(scratch, PLAYER_RADIUS)) {
      s.x = scratch.x
      s.z = scratch.z
    }

    // Don't walk through other beans. Only while grounded — in the air you can
    // clear them, which makes Space feel like it does something.
    if (s.grounded) {
      const resolved = resolveCharacterCollision(s.x, s.z, list, PLAYER_RADIUS * 2)
      s.x = resolved.x
      s.z = resolved.z
    }

    if (landed && landSpeed > 1) {
      playThud(Math.min(1, landSpeed / LAND_REF_SPEED))
    }

    // Head bob tracks actual ground speed, so it stops the instant you do.
    const groundSpeed = Math.hypot(s.vx, s.vz)
    let bob = 0
    if (s.grounded && groundSpeed > 0.05) {
      bobPhase.current += delta * BOB_RATE * (groundSpeed / WALK_SPEED) * Math.PI
      bob = Math.sin(bobPhase.current) * BOB_AMPLITUDE * Math.min(1, groundSpeed / WALK_SPEED)
    } else {
      bobPhase.current = 0
    }

    // Move the real character group: everything else in the plaza (blob
    // shadows, grass interactors, other clients' collision reads) already
    // watches this group, so nothing else needs teaching about the player.
    if (group) {
      group.position.set(s.x, s.y, s.z)
      group.rotation.y = yaw.current
    }

    camera.position.set(s.x, s.y + eyeHeight + bob, s.z)
    euler.set(pitch.current, yaw.current, 0)
    camera.quaternion.setFromEuler(euler)

    // Who's in front of me? Throttled — the answer only changes as fast as
    // you can walk.
    scanTime.current += delta
    if (scanTime.current >= SCAN_INTERVAL) {
      scanTime.current = 0
      const hit = pickInteractable(list, s.x, s.z, yaw.current)
      const uid = hit?.uid ?? null
      if (uid !== nearbyUid.current) {
        nearbyUid.current = uid
        const m = uid ? (members.find((c) => c.uid === uid) ?? null) : null
        onNearbyChange(m, hit ? [hit.x, 0, hit.z] : null)
      }
    }
  })

  return null
}
