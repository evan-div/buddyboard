'use client'

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import type { AvatarConfig, GroupMember } from '@/lib/types'

// ─── Hair ─────────────────────────────────────────────────────────────────────

function Hair({ style, color }: { style: AvatarConfig['hairStyle']; color: string }) {
  if (style === 'bald') return null
  if (style === 'short') return (
    <mesh position={[0, 0.1, 0]}>
      <sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
  if (style === 'medium') return (
    <group>
      <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[-0.215, -0.02, 0]}><boxGeometry args={[0.07, 0.22, 0.2]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.215, -0.02, 0]}><boxGeometry args={[0.07, 0.22, 0.2]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
  if (style === 'long') return (
    <group>
      <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[-0.215, -0.1, 0]}><boxGeometry args={[0.07, 0.44, 0.2]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.215, -0.1, 0]}><boxGeometry args={[0.07, 0.44, 0.2]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
  if (style === 'curly') return (
    <group>
      <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.22, 12, 12]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[-0.15, 0.1, 0.08]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.15, 0.1, 0.08]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
  if (style === 'mohawk') return (
    <mesh position={[0, 0.26, 0]}><boxGeometry args={[0.09, 0.28, 0.26]} /><meshStandardMaterial color={color} /></mesh>
  )
  if (style === 'ponytail') return (
    <group>
      <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0, -0.22]}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, -0.08, -0.28]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
  if (style === 'wavy') return (
    <group>
      <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[-0.215, -0.02, 0]}><boxGeometry args={[0.07, 0.26, 0.2]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.215, -0.02, 0]}><boxGeometry args={[0.07, 0.26, 0.2]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
  return (
    <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.225, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} /><meshStandardMaterial color={color} /></mesh>
  )
}

function Accessory({ style }: { style: AvatarConfig['accessory'] }) {
  if (style === 'none') return null
  if (style === 'glasses') return (
    <group position={[0, 0.04, 0.26]}>
      <mesh position={[-0.1, 0, 0]}><torusGeometry args={[0.054, 0.013, 8, 16]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0.1, 0, 0]}><torusGeometry args={[0.054, 0.013, 8, 16]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.007, 0.007, 0.05, 6]} /><meshStandardMaterial color="#444" /></mesh>
    </group>
  )
  if (style === 'sunglasses') return (
    <group position={[0, 0.04, 0.265]}>
      <mesh position={[-0.1, 0, 0]}><torusGeometry args={[0.054, 0.013, 8, 16]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.1, 0, 0.005]}><circleGeometry args={[0.05, 16]} /><meshStandardMaterial color="#111" transparent opacity={0.9} /></mesh>
      <mesh position={[0.1, 0, 0]}><torusGeometry args={[0.054, 0.013, 8, 16]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.1, 0, 0.005]}><circleGeometry args={[0.05, 16]} /><meshStandardMaterial color="#111" transparent opacity={0.9} /></mesh>
    </group>
  )
  if (style === 'hat') return (
    <group position={[0, 0.2, 0]}>
      <mesh><cylinderGeometry args={[0.32, 0.32, 0.04, 16]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.2, 0.22, 0.24, 16]} /><meshStandardMaterial color="#222" /></mesh>
    </group>
  )
  if (style === 'crown') return (
    <group position={[0, 0.2, 0]}>
      <mesh><cylinderGeometry args={[0.24, 0.24, 0.07, 16]} /><meshStandardMaterial color="#F5D033" /></mesh>
      {[0,1,2,3,4].map(i => {
        const a = (i/5)*Math.PI*2
        return <mesh key={i} position={[Math.sin(a)*0.21,0.09,Math.cos(a)*0.21]}><coneGeometry args={[0.05,0.14,6]} /><meshStandardMaterial color="#F5D033" /></mesh>
      })}
    </group>
  )
  if (style === 'headband') return (
    <mesh position={[0, 0.06, 0]} rotation={[0.25, 0, 0]}>
      <torusGeometry args={[0.24, 0.026, 8, 32, Math.PI]} /><meshStandardMaterial color="#EC4899" />
    </mesh>
  )
  return null
}

// ─── Selection Ring ───────────────────────────────────────────────────────────

function SelectionRing({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => { if (groupRef.current) groupRef.current.rotation.y += delta * 2 })
  if (!visible) return null
  return (
    <group ref={groupRef} position={[0, 0.11, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.46, 32, 1, 0, Math.PI * 1.5]} />
        <meshStandardMaterial color="#6366f1" transparent opacity={0.85} emissive="#6366f1" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

// ─── Celebration Particles ────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#F5D033','#FF6B9D','#6366F1','#22c55e','#F97316','#ffffff','#06B6D4']
const PARTICLE_COUNT  = 24

type ParticleState = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; maxAge: number }

function CelebrationParticles() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(Array(PARTICLE_COUNT).fill(null))
  const particles = useRef<ParticleState[]>([])

  if (particles.current.length === 0) {
    particles.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        1.9 + Math.random() * 0.4,
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

  useFrame((_, delta) => {
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

export type DragMode = 'held' | 'flying' | 'dazed' | 'waking' | 'mad'

// ─── Main Character ───────────────────────────────────────────────────────────

type AnimState = 'walking' | 'idle_bob' | 'idle_sway'

export interface MiiCharacterProps {
  member: GroupMember
  initialPosition: [number, number, number]
  bounds?: number
  isSelected: boolean
  onSelect: (member: GroupMember, pos: [number, number, number]) => void
  celebrationType?: 'celebrate' | 'shame' | null
  dragMode?: DragMode | null
  onPickupStart?: () => void
  onGroupMount?: (uid: string, g: THREE.Group | null) => void
}

export default function MiiCharacter({
  member, initialPosition, bounds = 5,
  isSelected, onSelect, celebrationType = null,
  dragMode = null, onPickupStart, onGroupMount,
}: MiiCharacterProps) {
  const groupRef     = useRef<THREE.Group>(null)
  const bodyGroupRef = useRef<THREE.Group>(null)
  const headRef      = useRef<THREE.Group>(null)
  const leftArmRef   = useRef<THREE.Group>(null)
  const rightArmRef  = useRef<THREE.Group>(null)
  const leftLegRef   = useRef<THREE.Group>(null)
  const rightLegRef  = useRef<THREE.Group>(null)

  const animState    = useRef<AnimState>('walking')
  const idleTimer    = useRef(0)
  const phase        = useRef(Math.random() * Math.PI * 2)
  const celebTimer   = useRef(0)
  const selectedTimer = useRef(0)
  const dragTimer    = useRef(0)
  const targetPos    = useRef(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 6, 0,
    initialPosition[2] + (Math.random() - 0.5) * 6,
  ))

  const skinColor = SKIN_TONES[member.avatar.skinTone]

  // Expose groupRef to parent
  useEffect(() => {
    onGroupMount?.(member.uid, groupRef.current)
    return () => { onGroupMount?.(member.uid, null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset all celebration-driven transforms when celebrationType changes
  useEffect(() => {
    celebTimer.current = 0
    bodyGroupRef.current?.position.set(0, 0, 0)
    if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = 0
    if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
    if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
    if (headRef.current)     headRef.current.rotation.x = 0
    if (rightLegRef.current) rightLegRef.current.rotation.x = 0
  }, [celebrationType])

  // Reset selection-driven transforms and timer when selection changes
  useEffect(() => {
    selectedTimer.current = 0
    if (!isSelected) {
      if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
      if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
      if (headRef.current)     headRef.current.rotation.x = 0
      if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = 0
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0
    }
  }, [isSelected])

  // Reset on dragMode change
  useEffect(() => {
    dragTimer.current = 0
    if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
    if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
    if (leftLegRef.current)  { leftLegRef.current.rotation.x  = 0; leftLegRef.current.rotation.z  = 0 }
    if (rightLegRef.current) { rightLegRef.current.rotation.x = 0; rightLegRef.current.rotation.z = 0 }
    if (headRef.current)     { headRef.current.rotation.x = 0; headRef.current.rotation.z = 0 }
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.x = 0
      bodyGroupRef.current.rotation.z = 0
      bodyGroupRef.current.position.set(0, 0, 0)
    }
    // When returning to normal, pick a new walk target from current position
    if (dragMode === null && groupRef.current) {
      const p = groupRef.current.position
      groupRef.current.rotation.x = 0
      groupRef.current.rotation.z = 0
      animState.current = 'walking'
      const angle  = Math.random() * Math.PI * 2
      const radius = 1.0 + Math.random() * (bounds * 0.85)
      targetPos.current.set(p.x + Math.cos(angle) * radius, 0, p.z + Math.sin(angle) * radius)
    }
  }, [dragMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickNewTarget() {
    animState.current = 'walking'
    const angle  = Math.random() * Math.PI * 2
    const radius = 1.0 + Math.random() * (bounds * 0.85)
    targetPos.current.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    // ── Drag mode: held ──────────────────────────────────────────────────────
    if (dragMode === 'held') {
      dragTimer.current += delta
      const t = dragTimer.current
      // Fast random squirm: all 4 limbs oscillate rapidly at different frequencies
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
      // Slight body tilt / wiggle
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = Math.sin(t * 7.3 + 0.5) * 0.1
        bodyGroupRef.current.rotation.z = Math.sin(t * 6.1 + 1.8) * 0.1
      }
      return
    }

    // ── Drag mode: flying ────────────────────────────────────────────────────
    if (dragMode === 'flying') {
      // Limbs fling outward by inertia — spread-eagle ragdoll pose.
      // The whole-body tumble comes from group.rotation set in MiiPlaza.
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  -0.25, 0.12)
        leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  -1.4,  0.12)
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -0.25, 0.12)
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z,   1.4, 0.12)
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x  = THREE.MathUtils.lerp(leftLegRef.current.rotation.x,  -0.3, 0.12)
        leftLegRef.current.rotation.z  = THREE.MathUtils.lerp(leftLegRef.current.rotation.z,  -0.4, 0.12)
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.3, 0.12)
        rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z,   0.4, 0.12)
      }
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.1)
        bodyGroupRef.current.rotation.z = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.z, 0, 0.1)
      }
      return
    }

    // ── Drag mode: dazed ────────────────────────────────────────────────────
    if (dragMode === 'dazed') {
      dragTimer.current += delta
      // Group is lerping to face-down in MiiPlaza — keep body neutral, limbs splayed
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.07)
        bodyGroupRef.current.rotation.z = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.z, 0, 0.07)
      }
      if (headRef.current) {
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.07)
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  0,    0.07)
        leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  -1.3, 0.07)
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0,   0.07)
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z,  1.3, 0.07)
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x  = THREE.MathUtils.lerp(leftLegRef.current.rotation.x,  0,    0.07)
        leftLegRef.current.rotation.z  = THREE.MathUtils.lerp(leftLegRef.current.rotation.z,  -0.3, 0.07)
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0,   0.07)
        rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z,  0.3, 0.07)
      }
      return
    }

    // ── Drag mode: waking ────────────────────────────────────────────────────
    if (dragMode === 'waking') {
      dragTimer.current += delta
      const t = dragTimer.current
      // Slowly straighten body/head back to zero
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.03)
        bodyGroupRef.current.rotation.z = 0
      }
      if (headRef.current) {
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.03)
        // Head shake: fast sin, damped over time
        const damp = Math.max(0, 1 - t / 1.5)
        headRef.current.rotation.z = Math.sin(t * 18) * 0.25 * damp
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = THREE.MathUtils.lerp(leftArmRef.current.rotation.x,  0, 0.04)
        leftArmRef.current.rotation.z  = THREE.MathUtils.lerp(leftArmRef.current.rotation.z,  0, 0.04)
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.04)
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0, 0.04)
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x  = THREE.MathUtils.lerp(leftLegRef.current.rotation.x,  0, 0.04)
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.04)
      }
      return
    }

    // ── Drag mode: mad ───────────────────────────────────────────────────────
    if (dragMode === 'mad') {
      dragTimer.current += delta
      const t = dragTimer.current
      // Arms raised and shaking
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x  = -Math.PI * 0.7 + Math.sin(t * 12) * 0.15
        leftArmRef.current.rotation.z  = -0.5
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI * 0.7 + Math.sin(t * 13 + 1) * 0.15
        rightArmRef.current.rotation.z =  0.5
      }
      // Feet stomping
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x  = Math.sin(t * 8) * 0.4
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = Math.sin(t * 8 + Math.PI) * 0.4
      }
      // Body bob with anger
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.z = Math.sin(t * 9) * 0.06
      }
      return
    }

    // ── Celebrate ────────────────────────────────────────────────────────────
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

    // ── Shame ─────────────────────────────────────────────────────────────────
    if (celebrationType === 'shame') {
      celebTimer.current += delta
      const t = celebTimer.current
      if (headRef.current) headRef.current.rotation.x = Math.min(0.48, t * 1.2)
      if (rightArmRef.current) {
        const raise   = Math.min(1, t * 1.8)
        const scratch = Math.sin(t * 7) * 0.16
        rightArmRef.current.rotation.x = -raise * 2.1 + scratch
      }
      if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(t * 1.4) * 0.04
      return
    }

    // ── Selected: face camera then play greeting / idle sequence ─────────────
    if (isSelected) {
      selectedTimer.current += delta
      const t = selectedTimer.current

      // Always face the camera
      let dy = -group.rotation.y
      while (dy >  Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      group.rotation.y += dy * Math.min(1, 10 * delta)

      if (t < 2.5) {
        // ── Phase 1: Wave & smile (0–2.5 s) ─────────────────────────────────
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -Math.PI * 0.78
          rightArmRef.current.rotation.z = Math.sin(t * 4.5) * 0.62
        }
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0
      } else {
        // Cycle through three idles, 2.5 s each
        const c = (t - 2.5) % 7.5

        if (c < 2.5) {
          // ── Phase 2: Sheepish fidget ─────────────────────────────────────
          if (rightArmRef.current) { rightArmRef.current.rotation.x = -0.28; rightArmRef.current.rotation.z =  0.30 }
          if (leftArmRef.current)  { leftArmRef.current.rotation.x  = -0.22; leftArmRef.current.rotation.z  = -0.20 }
          if (headRef.current)     headRef.current.rotation.x = 0.20
          if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(c * 1.6) * 0.055
        } else if (c < 5.0) {
          // ── Phase 3: Kick the ground ─────────────────────────────────────
          const k = c - 2.5
          if (rightArmRef.current) { rightArmRef.current.rotation.x = 0; rightArmRef.current.rotation.z = 0 }
          if (leftArmRef.current)  { leftArmRef.current.rotation.x  = 0; leftArmRef.current.rotation.z  = 0 }
          if (headRef.current)     headRef.current.rotation.x = 0
          if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = 0
          // One forward kick, gentle return
          if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(k * Math.PI / 1.1) * 0.60
        } else {
          // ── Phase 4: Scratch head ────────────────────────────────────────
          const s = c - 5.0
          if (rightLegRef.current) rightLegRef.current.rotation.x = 0
          if (headRef.current)     headRef.current.rotation.x = 0.14
          if (rightArmRef.current) {
            const raise = Math.min(1, s * 2.2)
            rightArmRef.current.rotation.x = -raise * 1.85 + Math.sin(s * 6) * 0.13
            rightArmRef.current.rotation.z = 0
          }
        }
      }
      return
    }

    // ── Normal walk / idle ────────────────────────────────────────────────────
    phase.current += delta
    const t    = phase.current
    const body = bodyGroupRef.current

    if (animState.current === 'walking') {
      const dx   = targetPos.current.x - group.position.x
      const dz   = targetPos.current.z - group.position.z
      const dist = Math.sqrt(dx*dx + dz*dz)
      if (dist < 0.15) {
        animState.current = Math.random() < 0.5 ? 'idle_bob' : 'idle_sway'
        idleTimer.current = 2 + Math.random() * 3.5
        if (leftArmRef.current)  leftArmRef.current.rotation.x  = 0
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0
        if (leftLegRef.current)  leftLegRef.current.rotation.x  = 0
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0
      } else {
        const spd = 1.4
        group.position.x = Math.max(-bounds, Math.min(bounds, group.position.x + (dx/dist)*spd*delta))
        group.position.z = Math.max(-bounds, Math.min(bounds, group.position.z + (dz/dist)*spd*delta))
        group.rotation.y = Math.atan2(dx, dz)
        const sw = Math.sin(t*5.5)*0.44
        if (leftArmRef.current)  leftArmRef.current.rotation.x  =  sw
        if (rightArmRef.current) rightArmRef.current.rotation.x = -sw
        if (leftLegRef.current)  leftLegRef.current.rotation.x  = -sw
        if (rightLegRef.current) rightLegRef.current.rotation.x  =  sw
      }
    } else if (animState.current === 'idle_bob') {
      idleTimer.current -= delta
      if (body) body.position.y = Math.sin(t*2.6)*0.03
      if (idleTimer.current <= 0) { if (body) body.position.y = 0; pickNewTarget() }
    } else if (animState.current === 'idle_sway') {
      idleTimer.current -= delta
      if (body) body.rotation.z = Math.sin(t*1.8)*0.07
      if (idleTimer.current <= 0) { if (body) body.rotation.z = 0; pickNewTarget() }
    }
  })

  return (
    <group
      ref={groupRef}
      position={initialPosition}
      onPointerDown={e => {
        e.stopPropagation()
        if (!dragMode) onPickupStart?.()
      }}
    >
      <SelectionRing visible={isSelected && !dragMode} />

      {celebrationType === 'celebrate' && <CelebrationParticles />}

      {celebrationType === 'shame' && (
        <Html position={[0, 2.55, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>👎</div>
        </Html>
      )}

      {dragMode === 'dazed' && (
        <Html position={[0, 2.7, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>💫</div>
        </Html>
      )}

      {dragMode === 'waking' && (
        <Html position={[0, 2.7, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>😵</div>
        </Html>
      )}

      {dragMode === 'mad' && (
        <Html position={[0, 2.7, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>😤</div>
        </Html>
      )}

      <group ref={bodyGroupRef}>
        <group ref={leftLegRef} position={[-0.12, 0.65, 0]}>
          <mesh position={[0, -0.325, 0]}><cylinderGeometry args={[0.085, 0.08, 0.65, 8]} /><meshStandardMaterial color="#1e293b" /></mesh>
          <mesh position={[0, -0.67, 0.04]}><boxGeometry args={[0.12, 0.08, 0.18]} /><meshStandardMaterial color="#111" /></mesh>
        </group>
        <group ref={rightLegRef} position={[0.12, 0.65, 0]}>
          <mesh position={[0, -0.325, 0]}><cylinderGeometry args={[0.085, 0.08, 0.65, 8]} /><meshStandardMaterial color="#1e293b" /></mesh>
          <mesh position={[0, -0.67, 0.04]}><boxGeometry args={[0.12, 0.08, 0.18]} /><meshStandardMaterial color="#111" /></mesh>
        </group>
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.52, 0.5, 0.3]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
        <group ref={leftArmRef} position={[-0.32, 1.08, 0]}>
          <mesh position={[-0.02, -0.21, 0]}><cylinderGeometry args={[0.075, 0.065, 0.42, 8]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
          <mesh position={[-0.02, -0.45, 0]}><sphereGeometry args={[0.074, 8, 8]} /><meshStandardMaterial color={skinColor} /></mesh>
        </group>
        <group ref={rightArmRef} position={[0.32, 1.08, 0]}>
          <mesh position={[0.02, -0.21, 0]}><cylinderGeometry args={[0.075, 0.065, 0.42, 8]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
          <mesh position={[0.02, -0.45, 0]}><sphereGeometry args={[0.074, 8, 8]} /><meshStandardMaterial color={skinColor} /></mesh>
        </group>
        <mesh position={[0, 1.21, 0]}><cylinderGeometry args={[0.1, 0.1, 0.18, 8]} /><meshStandardMaterial color={skinColor} /></mesh>
        <group ref={headRef} position={[0, 1.5, 0]}>
          <mesh><sphereGeometry args={[0.28, 20, 20]} /><meshStandardMaterial color={skinColor} /></mesh>
          <mesh position={[-0.1, 0.04, 0.261]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[-0.1, 0.04, 0.276]}><sphereGeometry args={[0.023, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
          <mesh position={[0.1, 0.04, 0.261]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0.1, 0.04, 0.276]}><sphereGeometry args={[0.023, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
          <mesh position={[0, -0.02, 0.278]}><sphereGeometry args={[0.028, 8, 8]} /><meshStandardMaterial color={skinColor} /></mesh>
          <mesh position={[0, -0.1, 0.262]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.062, 0.014, 8, 16, Math.PI]} /><meshStandardMaterial color="#2a1010" /></mesh>
          <Hair style={member.avatar.hairStyle} color={member.avatar.hairColor} />
          <Accessory style={member.avatar.accessory} />
        </group>
      </group>
    </group>
  )
}
