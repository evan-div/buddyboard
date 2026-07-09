'use client'

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims } from '@/lib/beanDims'
import type { GroupMember } from '@/lib/types'
import { highestBadge } from '@/lib/badges'
import { BeanFace } from '@/components/Avatar/BeanFace'
import { BeanBody, BeanHair, BeanAccessory } from '@/components/Avatar/BeanParts'

// ─── Selection Ring ───────────────────────────────────────────────────────────

function SelectionRing({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => { if (groupRef.current) groupRef.current.rotation.y += delta * 2 })
  if (!visible) return null
  return (
    <group ref={groupRef} position={[0, 0.08, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.46, 32, 1, 0, Math.PI * 1.5]} />
        <meshStandardMaterial color="#6366f1" transparent opacity={0.85} emissive="#6366f1" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

// ─── Celebration Particles ────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#F5D033', '#FF6B9D', '#6366F1', '#22c55e', '#F97316', '#ffffff', '#06B6D4']
const PARTICLE_COUNT  = 24

type ParticleState = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; maxAge: number }

function CelebrationParticles({ bodyTop }: { bodyTop: number }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(Array(PARTICLE_COUNT).fill(null))
  const particles = useRef<ParticleState[]>([])

  useFrame((_, delta) => {
    // Lazy init on the first animation frame keeps render pure
    if (particles.current.length === 0) {
      particles.current = Array.from({ length: PARTICLE_COUNT }, () => ({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          bodyTop + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.5,
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          2.5 + Math.random() * 3.5,
          (Math.random() - 0.5) * 5,
        ),
        age: 0,
        maxAge: 1.0 + Math.random() * 1.2,
      }))
    }

    particles.current.forEach((p, i) => {
      p.age = Math.min(p.maxAge, p.age + delta)
      p.vel.y -= delta * 9
      p.pos.addScaledVector(p.vel, delta)
      const mesh = meshRefs.current[i]
      if (!mesh) return
      mesh.position.copy(p.pos)
      const t = p.age / p.maxAge
      mesh.scale.setScalar(Math.max(0, (1 - t) * 0.09))
    })
  })

  return (
    <group>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <mesh key={i} ref={el => { meshRefs.current[i] = el }}>
          <boxGeometry args={[1, 1, 0.18]} />
          <meshStandardMaterial
            color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
            emissive={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
            emissiveIntensity={1.3}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── Drag Mode ────────────────────────────────────────────────────────────────

export type DragMode = 'held' | 'flying' | 'sliding' | 'dazed' | 'waking' | 'mad' | 'fallen'

// Get-up choreography timing, shared with the plaza physics: a knocked-out
// character rolls onto its stomach (ROLL), plants its arms (HOLD), then pushes
// upright (RISE).
export const WAKE_ROLL = 0.5
export const WAKE_HOLD = 0.5
export const WAKE_RISE = 0.9

// ─── Ragdoll Spring Physics ───────────────────────────────────────────────────

const RD_K  = 9.0
const RD_D  = 3.6
const RD_DL = 5.5

function rdSpring(r: number, v: number, rest: number, K: number, D: number, dt: number): [number, number] {
  const nv = v + (-K * (r - rest) - D * v) * dt
  return [r + nv * dt, nv]
}

function rdClamp(r: number, v: number, lo: number, hi: number): [number, number] {
  if (r < lo) return [lo,  Math.abs(v) * 0.15]
  if (r > hi) return [hi, -Math.abs(v) * 0.15]
  return [r, v]
}

type BoneRV = { r: number; v: number }
type RagdollRef = {
  laX: BoneRV; laZ: BoneRV
  raX: BoneRV; raZ: BoneRV
  llX: BoneRV; llZ: BoneRV
  rlX: BoneRV; rlZ: BoneRV
  byX: BoneRV; byZ: BoneRV
  ready: boolean
}
function makeRagdoll(): RagdollRef {
  const z = (): BoneRV => ({ r: 0, v: 0 })
  return {
    laX: z(), laZ: z(), raX: z(), raZ: z(),
    llX: z(), llZ: z(), rlX: z(), rlZ: z(),
    byX: z(), byZ: z(),
    ready: false,
  }
}

// Scratch objects for the prone-detection up-axis test (module-level, reused)
const _wakeUp = new THREE.Vector3()
const _identQuat = new THREE.Quaternion()

// ─── Main Character ───────────────────────────────────────────────────────────

type AnimState = 'walking' | 'idle_bob' | 'idle_sway'

export interface MiiCharacterProps {
  member: GroupMember
  initialPosition: [number, number, number]
  bounds?: number
  isSelected: boolean
  celebrationType?: 'celebrate' | 'shame' | null
  dragMode?: DragMode | null
  onPickupStart?: () => void
  onGroupMount?: (uid: string, g: THREE.Group | null) => void
}

export default function MiiCharacter({
  member, initialPosition, bounds = 5,
  isSelected, celebrationType = null,
  dragMode = null, onPickupStart, onGroupMount,
}: MiiCharacterProps) {
  const groupRef     = useRef<THREE.Group>(null)
  const bodyGroupRef = useRef<THREE.Group>(null)
  const leftArmRef   = useRef<THREE.Group>(null)
  const rightArmRef  = useRef<THREE.Group>(null)
  const leftLegRef   = useRef<THREE.Group>(null)
  const rightLegRef  = useRef<THREE.Group>(null)

  const ragdoll       = useRef<RagdollRef>(makeRagdoll())
  const animState     = useRef<AnimState>('walking')
  const idleTimer     = useRef(0)
  const phase         = useRef(0)
  const celebTimer    = useRef(0)
  const selectedTimer = useRef(0)
  const dragTimer     = useRef(0)
  // Seeded lazily (first frame / mount effect) so render stays pure and we
  // don't allocate a new Vector3 + call Math.random on every re-render
  const targetPos = useRef<THREE.Vector3 | null>(null)
  const prevDragMode = useRef<DragMode | null>(null)
  const prevBodyRot  = useRef({ x: 0, z: 0 })
  const wakeProne    = useRef(false)

  const dims      = useBeanDims(member.avatar)
  const skinColor = SKIN_TONES[member.avatar.skinTone]
  const bodyColor = member.avatar.bodyColor ?? member.avatar.shirtColor

  const gradientMap = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([80, 140, 230]), 3, 1, THREE.RedFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [])

  const eyeY      = dims.faceCenterY
  const eyeZ      = dims.faceZ
  const eyeSpread = Math.min(0.12, dims.faceZ * 0.42)
  const mouthY    = dims.faceCenterY - dims.faceZ * 0.38
  const mouthZ    = dims.faceZ
  const overlayY  = dims.bodyTop + 0.3

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(initialPosition[0], initialPosition[1], initialPosition[2])
    }
    // Desync this character's animation cycle from the others
    phase.current = Math.random() * Math.PI * 2
    pickNewTarget()
    onGroupMount?.(member.uid, groupRef.current)
    return () => { onGroupMount?.(member.uid, null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    celebTimer.current = 0
    bodyGroupRef.current?.position.set(0, 0, 0)
    if (bodyGroupRef.current) { bodyGroupRef.current.rotation.z = 0; bodyGroupRef.current.rotation.x = 0 }
    if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
    if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
    if (rightLegRef.current) rightLegRef.current.rotation.x = 0
  }, [celebrationType])

  useEffect(() => {
    selectedTimer.current = 0
    if (!isSelected) {
      if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
      if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
      if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = 0
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0
    }
  }, [isSelected])

  useEffect(() => {
    const prev = prevDragMode.current
    prevDragMode.current = dragMode
    dragTimer.current = 0

    // The throw→land→get-up chain keeps ragdoll continuity: limbs are never
    // snapped to neutral mid-sequence, only jolted by the impacts.
    if (dragMode === 'flying') {
      ragdoll.current.ready = false   // fresh throw (or respawn drop): reseed
      prevBodyRot.current.x = groupRef.current?.rotation.x ?? 0
      prevBodyRot.current.z = groupRef.current?.rotation.z ?? 0
      return
    }
    if (dragMode === 'sliding') {
      kickRagdoll(prev === 'flying' ? 9 : 5)   // ground impact jolt
      prevBodyRot.current.x = groupRef.current?.rotation.x ?? 0
      prevBodyRot.current.z = groupRef.current?.rotation.z ?? 0
      return
    }
    if (dragMode === 'dazed') {
      kickRagdoll(4)
      return
    }
    if (dragMode === 'waking') {
      // Knocked flat if the body's up-axis isn't pointing skyward
      const up = _wakeUp.set(0, 1, 0).applyQuaternion(groupRef.current?.quaternion ?? _identQuat)
      wakeProne.current = up.y < 0.6
      return
    }
    if (dragMode === 'fallen') return

    // held / mad / null: these animate limbs from a clean neutral pose
    ragdoll.current.ready = false
    if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
    if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
    if (leftLegRef.current)  { leftLegRef.current.rotation.x  = 0; leftLegRef.current.rotation.z  = 0 }
    if (rightLegRef.current) { rightLegRef.current.rotation.x = 0; rightLegRef.current.rotation.z = 0 }
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.x = 0
      bodyGroupRef.current.rotation.z = 0
      bodyGroupRef.current.position.set(0, 0, 0)
    }
    if (dragMode === null && groupRef.current) {
      groupRef.current.rotation.x = 0
      groupRef.current.rotation.z = 0
      pickNewTarget()
    }
  }, [dragMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed every ragdoll spring from the limbs' current pose with random impulses
  function seedRagdoll(sMin: number, sMax: number) {
    const s  = sMin + Math.random() * (sMax - sMin)
    const rd = ragdoll.current
    rd.laX = { r: leftArmRef.current?.rotation.x  ?? 0, v:  (Math.random() - 0.5) * s }
    rd.laZ = { r: leftArmRef.current?.rotation.z  ?? 0, v: -(0.4 + Math.random() * 0.7) * s }
    rd.raX = { r: rightArmRef.current?.rotation.x ?? 0, v:  (Math.random() - 0.5) * s }
    rd.raZ = { r: rightArmRef.current?.rotation.z ?? 0, v:  (0.4 + Math.random() * 0.7) * s }
    rd.llX = { r: leftLegRef.current?.rotation.x  ?? 0, v:  (Math.random() - 0.5) * s * 0.7 }
    rd.llZ = { r: leftLegRef.current?.rotation.z  ?? 0, v:  (Math.random() - 0.5) * s * 0.4 }
    rd.rlX = { r: rightLegRef.current?.rotation.x ?? 0, v:  (Math.random() - 0.5) * s * 0.7 }
    rd.rlZ = { r: rightLegRef.current?.rotation.z ?? 0, v:  (Math.random() - 0.5) * s * 0.4 }
    rd.byX = { r: bodyGroupRef.current?.rotation.x ?? 0, v: (Math.random() - 0.5) * s * 0.5 }
    rd.byZ = { r: bodyGroupRef.current?.rotation.z ?? 0, v: (Math.random() - 0.5) * s * 0.5 }
    rd.ready = true
  }

  // Jolt the springs without losing the current pose (impacts, bounces)
  function kickRagdoll(s: number) {
    const rd = ragdoll.current
    if (!rd.ready) { seedRagdoll(s * 0.8, s * 1.2); return }
    for (const b of [rd.laX, rd.laZ, rd.raX, rd.raZ]) b.v += (Math.random() - 0.5) * 2 * s
    for (const b of [rd.llX, rd.llZ, rd.rlX, rd.rlZ]) b.v += (Math.random() - 0.5) * 1.2 * s
    rd.byX.v += (Math.random() - 0.5) * 0.8 * s
    rd.byZ.v += (Math.random() - 0.5) * 0.8 * s
  }

  // Advance all limb springs toward the given rest pose and apply to the rig
  function stepRagdoll(
    dt: number,
    rest: { laX: number; laZ: number; raX: number; raZ: number; lX: number; lZ: number },
    K: number, D: number, DL: number,
  ) {
    const rd = ragdoll.current
    let r: number, v: number

    ;[r, v] = rdSpring(rd.laX.r, rd.laX.v, rest.laX, K, D, dt)
    ;[rd.laX.r, rd.laX.v] = rdClamp(r, v, -2.6, 2.6)
    ;[r, v] = rdSpring(rd.laZ.r, rd.laZ.v, rest.laZ, K, D, dt)
    ;[rd.laZ.r, rd.laZ.v] = rdClamp(r, v, -1.6, 0.55)
    if (leftArmRef.current)  { leftArmRef.current.rotation.x  = rd.laX.r; leftArmRef.current.rotation.z  = rd.laZ.r }

    ;[r, v] = rdSpring(rd.raX.r, rd.raX.v, rest.raX, K, D, dt)
    ;[rd.raX.r, rd.raX.v] = rdClamp(r, v, -2.6, 2.6)
    ;[r, v] = rdSpring(rd.raZ.r, rd.raZ.v, rest.raZ, K, D, dt)
    ;[rd.raZ.r, rd.raZ.v] = rdClamp(r, v, -0.55, 1.6)
    if (rightArmRef.current) { rightArmRef.current.rotation.x = rd.raX.r; rightArmRef.current.rotation.z = rd.raZ.r }

    ;[r, v] = rdSpring(rd.llX.r, rd.llX.v, rest.lX, K, DL, dt)
    ;[rd.llX.r, rd.llX.v] = rdClamp(r, v, -0.6, 1.0)
    ;[r, v] = rdSpring(rd.llZ.r, rd.llZ.v, -rest.lZ, K, DL, dt)
    ;[rd.llZ.r, rd.llZ.v] = rdClamp(r, v, -0.65, 0.25)
    if (leftLegRef.current)  { leftLegRef.current.rotation.x  = rd.llX.r; leftLegRef.current.rotation.z  = rd.llZ.r }

    ;[r, v] = rdSpring(rd.rlX.r, rd.rlX.v, rest.lX, K, DL, dt)
    ;[rd.rlX.r, rd.rlX.v] = rdClamp(r, v, -0.6, 1.0)
    ;[r, v] = rdSpring(rd.rlZ.r, rd.rlZ.v, rest.lZ, K, DL, dt)
    ;[rd.rlZ.r, rd.rlZ.v] = rdClamp(r, v, -0.25, 0.65)
    if (rightLegRef.current) { rightLegRef.current.rotation.x = rd.rlX.r; rightLegRef.current.rotation.z = rd.rlZ.r }

    ;[r, v] = rdSpring(rd.byX.r, rd.byX.v, 0, K * 0.5, DL, dt)
    ;[rd.byX.r, rd.byX.v] = rdClamp(r, v, -0.45, 0.45)
    ;[r, v] = rdSpring(rd.byZ.r, rd.byZ.v, 0, K * 0.5, DL, dt)
    ;[rd.byZ.r, rd.byZ.v] = rdClamp(r, v, -0.45, 0.45)
    if (bodyGroupRef.current) { bodyGroupRef.current.rotation.x = rd.byX.r; bodyGroupRef.current.rotation.z = rd.byZ.r }
  }

  function pickNewTarget() {
    animState.current = 'walking'
    const angle  = Math.random() * Math.PI * 2
    const radius = 1.0 + Math.random() * (bounds * 0.85)
    if (!targetPos.current) targetPos.current = new THREE.Vector3()
    targetPos.current.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }

  useFrame((_, rawDelta) => {
    // Clamp the timestep so animation timers don't skip phases after a stall
    const delta = Math.min(rawDelta, 0.1)
    const group = groupRef.current
    if (!group) return

    // ── fallen (off the island, hidden until respawn) ────────────────────────
    if (dragMode === 'fallen') return

    // ── held ─────────────────────────────────────────────────────────────────
    if (dragMode === 'held') {
      dragTimer.current += delta
      const t = dragTimer.current
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = Math.sin(t * 11.3 + 0.3) * 0.9
        leftArmRef.current.rotation.z  = Math.sin(t * 9.7  + 1.1) * 0.5
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = Math.sin(t * 10.1 + 2.2) * 0.9
        rightArmRef.current.rotation.z = Math.sin(t * 12.5 + 0.7) * 0.5
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x  = Math.sin(t * 13.7 + 1.5) * 0.7
        leftLegRef.current.rotation.z  = Math.sin(t * 8.4  + 2.9) * 0.2
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = Math.sin(t * 12.2 + 0.9) * 0.7
        rightLegRef.current.rotation.z = Math.sin(t * 9.1  + 3.5) * 0.2
      }
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = Math.sin(t * 7.3 + 0.5) * 0.1
        bodyGroupRef.current.rotation.z = Math.sin(t * 6.1 + 1.8) * 0.1
      }
      return
    }

    // ── flying / sliding: limp ragdoll limbs ─────────────────────────────────
    if (dragMode === 'flying' || dragMode === 'sliding') {
      const dt = Math.min(delta, 1 / 30)
      const rd = ragdoll.current
      if (!rd.ready) seedRagdoll(5, 9)

      // Limbs lag behind the body's tumble: inject the frame's rotation delta
      // as opposing spring velocity so arms and legs trail limply
      const dRx = group.rotation.x - prevBodyRot.current.x
      const dRz = group.rotation.z - prevBodyRot.current.z
      prevBodyRot.current.x = group.rotation.x
      prevBodyRot.current.z = group.rotation.z
      const lag = dragMode === 'flying' ? 1.9 : 1.4
      rd.laX.v -= dRx * lag * 1.2
      rd.raX.v -= dRx * lag
      rd.laZ.v -= dRz * lag
      rd.raZ.v -= dRz * lag * 1.2
      rd.llX.v -= dRx * lag * 0.8
      rd.rlX.v -= dRx * lag * 0.7
      rd.llZ.v -= dRz * lag * 0.5
      rd.rlZ.v -= dRz * lag * 0.6

      // Limp rest: limbs just hang loosely from the shoulders/hips (a hair of
      // outward droop keeps arms clear of the torso). Very low stiffness, so
      // the body's tumble drives the motion — nothing settles to a posed shape.
      const rest = { laX: 0, laZ: -0.12, raX: 0, raZ: 0.12, lX: 0, lZ: 0 }
      if (dragMode === 'flying') {
        // Airborne — springs barely pull; limbs float and trail the tumble
        stepRagdoll(dt, rest, RD_K * 0.35, RD_D * 0.5, RD_DL * 0.5)
      } else {
        // Skidding — more damping so limbs drag and settle as the body stops
        stepRagdoll(dt, rest, RD_K * 0.45, RD_D * 1.4, RD_DL * 1.4)
      }
      return
    }

    // ── dazed (ragdoll) ──────────────────────────────────────────────────────
    if (dragMode === 'dazed') {
      dragTimer.current += delta
      const dt = Math.min(delta, 1 / 30)
      if (!ragdoll.current.ready) seedRagdoll(7, 16)
      // Knocked out face-down: limbs sprawl outward and settle limp
      stepRagdoll(dt, { laX: 0.28, laZ: -0.22, raX: 0.28, raZ: 0.22, lX: 0.04, lZ: 0.04 }, RD_K, RD_D, RD_DL)
      return
    }

    // ── waking: roll onto stomach, plant arms, push off, rise ────────────────
    if (dragMode === 'waking') {
      dragTimer.current += delta
      const t = dragTimer.current
      if (wakeProne.current) {
        if (t < WAKE_ROLL) {
          // Rolling onto the stomach (body turn handled by physics): limbs stay
          // limp, flopping with the roll
          const dt = Math.min(delta, 1 / 30)
          if (!ragdoll.current.ready) seedRagdoll(2, 4)
          stepRagdoll(dt, { laX: 0.2, laZ: -0.2, raX: 0.2, raZ: 0.2, lX: 0.05, lZ: 0.05 }, RD_K * 0.7, RD_D, RD_DL)
        } else if (t < WAKE_ROLL + WAKE_HOLD) {
          // Plant the hands in a push-up pose while the body is prone
          const k = Math.min(1, delta * 9)
          if (leftArmRef.current) {
            leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  -1.65, k)
            leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  -0.35, k)
          }
          if (rightArmRef.current) {
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -1.65, k)
            rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z,  0.35, k)
          }
          if (leftLegRef.current)  leftLegRef.current.rotation.x  = THREE.MathUtils.lerp(leftLegRef.current.rotation.x,  0, k)
          if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, k)
          // A small effortful shudder while gathering strength
          if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(t * 24) * 0.03
        } else {
          // Push: arms extend through the rise, then relax; legs tuck under
          const rise = Math.min(1, (t - WAKE_ROLL - WAKE_HOLD) / WAKE_RISE)
          const k = Math.min(1, delta * (2 + rise * 4))
          if (leftArmRef.current) {
            leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  -1.65 * (1 - rise), k)
            leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  -0.35 * (1 - rise), k)
          }
          if (rightArmRef.current) {
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -1.65 * (1 - rise), k)
            rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z,  0.35 * (1 - rise), k)
          }
          const tuck = Math.sin(rise * Math.PI) * 0.75
          if (leftLegRef.current)  { leftLegRef.current.rotation.x  = -tuck;       leftLegRef.current.rotation.z  = THREE.MathUtils.lerp(leftLegRef.current.rotation.z, 0, k) }
          if (rightLegRef.current) { rightLegRef.current.rotation.x = -tuck * 0.8; rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z, 0, k) }
          if (bodyGroupRef.current) {
            bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, k)
            bodyGroupRef.current.rotation.z = Math.sin(t * 14) * 0.05 * (1 - rise)
          }
        }
      } else {
        // Barely tilted: just steady the limbs back to neutral with a wobble
        if (bodyGroupRef.current) {
          bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.03)
          const damp = Math.max(0, 1 - t / 1.2)
          bodyGroupRef.current.rotation.z = Math.sin(t * 18) * 0.18 * damp
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  0, 0.04)
          leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  0, 0.04)
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.04)
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0, 0.04)
        }
        if (leftLegRef.current)  leftLegRef.current.rotation.x  = THREE.MathUtils.lerp(leftLegRef.current.rotation.x,  0, 0.04)
        if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.04)
      }
      return
    }

    // ── mad ──────────────────────────────────────────────────────────────────
    if (dragMode === 'mad') {
      dragTimer.current += delta
      const t = dragTimer.current
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = -Math.PI * 0.7 + Math.sin(t * 12) * 0.15
        leftArmRef.current.rotation.z  = -0.5
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI * 0.7 + Math.sin(t * 13 + 1) * 0.15
        rightArmRef.current.rotation.z =  0.5
      }
      if (leftLegRef.current)  leftLegRef.current.rotation.x  = Math.sin(t * 8) * 0.4
      if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(t * 8 + Math.PI) * 0.4
      if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(t * 9) * 0.06
      return
    }

    // ── celebrate ────────────────────────────────────────────────────────────
    if (celebrationType === 'celebrate') {
      celebTimer.current += delta
      const t    = celebTimer.current
      const body = bodyGroupRef.current
      if (body) body.position.y = t < 1.8 ? Math.max(0, Math.sin(t * Math.PI * 1.1) * 0.55) : 0
      const armAngle = Math.max(-Math.PI * 0.85, -t * 5)
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = armAngle
      if (rightArmRef.current) rightArmRef.current.rotation.x = armAngle
      return
    }

    // ── shame ─────────────────────────────────────────────────────────────────
    if (celebrationType === 'shame') {
      celebTimer.current += delta
      const t = celebTimer.current
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = Math.min(0.32, t * 0.8)
        bodyGroupRef.current.rotation.z = Math.sin(t * 1.4) * 0.04
      }
      if (rightArmRef.current) {
        const raise   = Math.min(1, t * 1.8)
        const scratch = Math.sin(t * 7) * 0.16
        rightArmRef.current.rotation.x = -raise * 2.1 + scratch
      }
      return
    }

    // ── selected ──────────────────────────────────────────────────────────────
    if (isSelected) {
      selectedTimer.current += delta
      const t = selectedTimer.current

      const TARGET_FACING = Math.PI / 4
      let dy = TARGET_FACING - group.rotation.y
      while (dy >  Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      group.rotation.y += dy * Math.min(1, 10 * delta)

      if (t < 2.5) {
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -Math.PI * 0.78
          rightArmRef.current.rotation.z = Math.sin(t * 4.5) * 0.62
        }
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0
      } else {
        const c = (t - 2.5) % 7.5
        if (c < 2.5) {
          if (rightArmRef.current) { rightArmRef.current.rotation.x = -0.28; rightArmRef.current.rotation.z =  0.30 }
          if (leftArmRef.current)  { leftArmRef.current.rotation.x  = -0.22; leftArmRef.current.rotation.z  = -0.20 }
          if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(c * 1.6) * 0.055
        } else if (c < 5.0) {
          const k = c - 2.5
          if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
          if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
          if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = 0
          if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(k * Math.PI / 1.1) * 0.60
        } else {
          const s = c - 5.0
          if (rightLegRef.current) rightLegRef.current.rotation.x = 0
          if (rightArmRef.current) {
            const raise = Math.min(1, s * 2.2)
            rightArmRef.current.rotation.x = -raise * 1.85 + Math.sin(s * 6) * 0.13
            rightArmRef.current.rotation.z = 0
          }
        }
      }
      return
    }

    // ── normal walk / idle ────────────────────────────────────────────────────
    phase.current += delta
    const t    = phase.current
    const body = bodyGroupRef.current

    if (animState.current === 'walking') {
      if (!targetPos.current) pickNewTarget()
      const dx   = targetPos.current!.x - group.position.x
      const dz   = targetPos.current!.z - group.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 0.15) {
        animState.current = Math.random() < 0.5 ? 'idle_bob' : 'idle_sway'
        idleTimer.current = 2 + Math.random() * 3.5
        if (leftArmRef.current)  leftArmRef.current.rotation.x  = 0
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0
        if (leftLegRef.current)  leftLegRef.current.rotation.x  = 0
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0
      } else {
        const spd = 1.4
        group.position.x += (dx / dist) * spd * delta
        group.position.z += (dz / dist) * spd * delta
        group.rotation.y = Math.atan2(dx, dz)
        const sw = Math.sin(t * 5.5) * 0.44
        if (leftArmRef.current)  leftArmRef.current.rotation.x  =  sw
        if (rightArmRef.current) rightArmRef.current.rotation.x = -sw
        if (leftLegRef.current)  leftLegRef.current.rotation.x  = -sw
        if (rightLegRef.current) rightLegRef.current.rotation.x  =  sw
      }
    } else if (animState.current === 'idle_bob') {
      idleTimer.current -= delta
      if (body) body.position.y = Math.sin(t * 2.6) * 0.03
      if (idleTimer.current <= 0) { if (body) body.position.y = 0; pickNewTarget() }
    } else if (animState.current === 'idle_sway') {
      idleTimer.current -= delta
      if (body) body.rotation.z = Math.sin(t * 1.8) * 0.07
      if (idleTimer.current <= 0) { if (body) body.rotation.z = 0; pickNewTarget() }
    }
  })

  return (
    <group
      ref={groupRef}
      onPointerDown={e => {
        e.stopPropagation()
        if (!dragMode) onPickupStart?.()
      }}
    >
      <SelectionRing visible={isSelected && !dragMode} />

      {celebrationType === 'celebrate' && <CelebrationParticles bodyTop={dims.bodyTop} />}

      {!dragMode && (() => {
        const badge  = highestBadge(member.badges ?? [])
        const streak = member.currentStreak ?? 0
        if (!badge && streak < 3) return null
        return (
          <Html position={[0, overlayY, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
              {streak >= 3 && <span>🔥{streak}</span>}
              {badge && <span title={badge.label}>{badge.emoji}</span>}
            </div>
          </Html>
        )
      })()}

      {celebrationType === 'shame' && (
        <Html position={[0, overlayY - 0.1, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>👎</div>
        </Html>
      )}

      {dragMode === 'dazed' && (
        <Html position={[0, overlayY, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>💫</div>
        </Html>
      )}

      {dragMode === 'waking' && (
        <Html position={[0, overlayY, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>😵</div>
        </Html>
      )}

      {dragMode === 'mad' && (
        <Html position={[0, overlayY, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>😤</div>
        </Html>
      )}

      <group ref={bodyGroupRef}>
        {/* Ground shadow */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[dims.radius * 0.8, 16]} />
          <meshBasicMaterial color="#000" transparent opacity={0.08} />
        </mesh>

        {/* Left leg */}
        <group ref={leftLegRef} position={[-dims.radius * 0.4, dims.legAttachY, 0]}>
          <mesh position={[0, -dims.legLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -dims.legLen / 2, 0]}>
            <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
            <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
          </mesh>
          <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
            <sphereGeometry args={[0.068, 8, 8]} />
            <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
          </mesh>
        </group>

        {/* Right leg */}
        <group ref={rightLegRef} position={[dims.radius * 0.4, dims.legAttachY, 0]}>
          <mesh position={[0, -dims.legLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -dims.legLen / 2, 0]}>
            <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
            <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
          </mesh>
          <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
            <sphereGeometry args={[0.068, 8, 8]} />
            <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
          </mesh>
        </group>

        {/* Body */}
        <BeanBody dims={dims} color={bodyColor} gradientMap={gradientMap} />

        <BeanFace
          eyeStyle={member.avatar.eyeStyle ?? 'normal'}
          mouthStyle={member.avatar.mouthStyle ?? 'smile'}
          eyeSize={member.avatar.eyeSize}
          eyeSpacing={member.avatar.eyeSpacing}
          eyeY={eyeY}
          eyeZ={eyeZ}
          mouthY={mouthY}
          mouthZ={mouthZ}
        />

        {/* Left arm — rotated outward (-Z) so it angles away from body */}
        <group ref={leftArmRef} position={[-dims.armX, dims.armAttachY, 0]} rotation={[0, 0, -Math.PI * 0.15]}>
          <mesh position={[0, -dims.armLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -dims.armLen / 2, 0]}>
            <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
            <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
          </mesh>
          <mesh position={[0, -(dims.armLen + 0.04), 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
          </mesh>
        </group>

        {/* Right arm — rotated outward (+Z) */}
        <group ref={rightArmRef} position={[dims.armX, dims.armAttachY, 0]} rotation={[0, 0, Math.PI * 0.15]}>
          <mesh position={[0, -dims.armLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -dims.armLen / 2, 0]}>
            <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
            <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
          </mesh>
          <mesh position={[0, -(dims.armLen + 0.04), 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
          </mesh>
        </group>

        {/* Hair */}
        <BeanHair
          style={member.avatar.hairStyle}
          color={member.avatar.hairColor}
          bodyTop={dims.bodyTop}
          radius={dims.radius}
        />

        {/* Accessory */}
        <BeanAccessory
          style={member.avatar.accessory}
          bodyTop={dims.bodyTop}
          radius={dims.radius}
          eyeY={eyeY}
          eyeZ={eyeZ}
          eyeSpread={eyeSpread}
        />
      </group>
    </group>
  )
}
