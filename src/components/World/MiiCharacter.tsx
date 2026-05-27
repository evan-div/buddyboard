'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
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
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 2 })
  if (!visible) return null
  return (
    <mesh ref={ref} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.38, 0.46, 32]} />
      <meshStandardMaterial color="#6366f1" transparent opacity={0.85} emissive="#6366f1" emissiveIntensity={0.6} />
    </mesh>
  )
}

// ─── Main Character ───────────────────────────────────────────────────────────

type AnimState = 'walking' | 'idle_bob' | 'idle_sway'

export interface MiiCharacterProps {
  member: GroupMember
  initialPosition: [number, number, number]
  bounds?: number
  isSelected: boolean
  onSelect: (member: GroupMember, pos: [number, number, number]) => void
}

export default function MiiCharacter({
  member, initialPosition, bounds = 5,
  isSelected, onSelect,
}: MiiCharacterProps) {
  const groupRef     = useRef<THREE.Group>(null)
  const bodyGroupRef = useRef<THREE.Group>(null)
  const leftArmRef   = useRef<THREE.Group>(null)
  const rightArmRef  = useRef<THREE.Group>(null)
  const leftLegRef   = useRef<THREE.Group>(null)
  const rightLegRef  = useRef<THREE.Group>(null)

  const animState = useRef<AnimState>('walking')
  const idleTimer = useRef(0)
  const phase     = useRef(Math.random() * Math.PI * 2)
  const targetPos = useRef(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 6, 0,
    initialPosition[2] + (Math.random() - 0.5) * 6,
  ))

  const skinColor = SKIN_TONES[member.avatar.skinTone]

  function pickNewTarget() {
    animState.current = 'walking'
    const angle = Math.random() * Math.PI * 2
    const radius = 1.0 + Math.random() * (bounds * 0.85)
    targetPos.current.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    if (isSelected) {
      // smoothly rotate to face the camera (local +Z toward world +Z = rotation.y → 0)
      let dy = -group.rotation.y
      while (dy >  Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      group.rotation.y += dy * Math.min(1, 10 * delta)
      return
    }
    phase.current += delta
    const t    = phase.current
    const body = bodyGroupRef.current

    if (animState.current === 'walking') {
      const dx = targetPos.current.x - group.position.x
      const dz = targetPos.current.z - group.position.z
      const dist = Math.sqrt(dx*dx + dz*dz)
      if (dist < 0.15) {
        animState.current = Math.random() < 0.5 ? 'idle_bob' : 'idle_sway'
        idleTimer.current = 2 + Math.random() * 3.5
        if (leftArmRef.current)  leftArmRef.current.rotation.x = 0
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0
        if (leftLegRef.current)  leftLegRef.current.rotation.x = 0
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0
      } else {
        const spd = 1.4
        group.position.x = Math.max(-bounds, Math.min(bounds, group.position.x + (dx/dist)*spd*delta))
        group.position.z = Math.max(-bounds, Math.min(bounds, group.position.z + (dz/dist)*spd*delta))
        group.rotation.y = Math.atan2(dx, dz)
        const sw = Math.sin(t*5.5)*0.44
        if (leftArmRef.current)  leftArmRef.current.rotation.x =  sw
        if (rightArmRef.current) rightArmRef.current.rotation.x = -sw
        if (leftLegRef.current)  leftLegRef.current.rotation.x = -sw
        if (rightLegRef.current) rightLegRef.current.rotation.x =  sw
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
      onClick={e => {
        e.stopPropagation()
        const p = groupRef.current!.position
        onSelect(member, [p.x, p.y, p.z])
      }}
    >
      <SelectionRing visible={isSelected} />

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
        <group position={[0, 1.5, 0]}>
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
