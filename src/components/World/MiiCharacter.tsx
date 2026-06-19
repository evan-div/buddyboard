'use client'

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims, buildBodyProfile } from '@/lib/beanDims'
import type { BeanDims } from '@/lib/beanDims'
import type { AvatarConfig, GroupMember } from '@/lib/types'
import { highestBadge } from '@/lib/badges'
import { BeanFace } from '@/components/Avatar/BeanFace'

// ─── Shape-specific body geometry ─────────────────────────────────────────────

function BeanBody({ dims, color, gradientMap }: {
  dims: BeanDims
  color: string
  gradientMap: THREE.DataTexture
}) {
  const shape   = dims.shape ?? 'bean'
  const profile = useMemo(
    () => buildBodyProfile(shape, dims),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, dims.radius, dims.legAttachY, dims.bodyTop],
  )

  return (
    <>
      <mesh scale={1.045}>
        <latheGeometry args={[profile, 32]} />
        <meshBasicMaterial color="black" side={THREE.BackSide} />
      </mesh>
      <mesh>
        <latheGeometry args={[profile, 32]} />
        <meshToonMaterial color={color} gradientMap={gradientMap} />
      </mesh>
    </>
  )
}

// ─── Hair ─────────────────────────────────────────────────────────────────────

function BeanHair({ style, color, bodyTop, radius }: {
  style: AvatarConfig['hairStyle']
  color: string
  bodyTop: number
  radius: number
}) {
  if (style === 'bald') return null
  const r = radius
  const y = bodyTop

  if (style === 'short' || style === 'wavy') {
    return (
      <mesh position={[0, y, 0]}>
        <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'medium') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.1, y - r * 0.5, 0]}>
          <boxGeometry args={[r * 0.22, r * 0.7, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.1, y - r * 0.5, 0]}>
          <boxGeometry args={[r * 0.22, r * 0.7, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'long') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.1, y - r * 1.0, 0]}>
          <boxGeometry args={[r * 0.22, r * 1.4, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.1, y - r * 1.0, 0]}>
          <boxGeometry args={[r * 0.22, r * 1.4, r * 0.55]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'curly') {
    return (
      <group>
        <mesh position={[0, y + r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.82, 10, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 1.0, y - r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.35, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 1.0, y - r * 0.1, 0]}>
          <sphereGeometry args={[r * 0.35, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'mohawk') {
    return (
      <mesh position={[0, y + r * 0.35, 0]}>
        <boxGeometry args={[r * 0.28, r * 0.85, r * 0.75]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'ponytail') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, y - r * 0.3, -r * 0.85]}>
          <sphereGeometry args={[r * 0.38, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (style === 'bun') {
    return (
      <mesh position={[0, y + r * 0.12, 0]}>
        <sphereGeometry args={[r * 0.42, 10, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'topknot') {
    return (
      <mesh position={[0, y + r * 0.3, 0]} scale={[1, 2.2, 1]}>
        <sphereGeometry args={[r * 0.28, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'afro') {
    return (
      <mesh position={[0, y + r * 0.1, 0]}>
        <sphereGeometry args={[r * 0.78, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    )
  }
  if (style === 'braids') {
    return (
      <group>
        <mesh position={[0, y, 0]}>
          <sphereGeometry args={[r * 0.88, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-r * 0.95, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[r * 0.95, y - r * 1.1, 0]}>
          <cylinderGeometry args={[r * 0.14, r * 0.1, r * 1.8, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    )
  }
  return null
}

// ─── Accessory ────────────────────────────────────────────────────────────────

function BeanAccessory({ style, bodyTop, radius, eyeY, eyeZ, eyeSpread }: {
  style: AvatarConfig['accessory']
  bodyTop: number
  radius: number
  eyeY: number
  eyeZ: number
  eyeSpread: number
}) {
  if (style === 'none') return null
  const r = radius

  if (style === 'glasses') {
    const bridge = Math.max(0.01, eyeSpread * 2 - 0.108)
    return (
      <group position={[0, eyeY, eyeZ + 0.01]}>
        <mesh position={[-eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#444" />
        </mesh>
        <mesh position={[eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#444" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.007, 0.007, bridge, 6]} />
          <meshStandardMaterial color="#444" />
        </mesh>
      </group>
    )
  }
  if (style === 'sunglasses') {
    return (
      <group position={[0, eyeY, eyeZ + 0.01]}>
        <mesh position={[-eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[-eyeSpread, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#111" transparent opacity={0.9} />
        </mesh>
        <mesh position={[eyeSpread, 0, 0]}>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[eyeSpread, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#111" transparent opacity={0.9} />
        </mesh>
      </group>
    )
  }
  if (style === 'monocle') {
    return (
      <group position={[eyeSpread, eyeY, eyeZ + 0.01]}>
        <mesh>
          <torusGeometry args={[0.054, 0.013, 8, 16]} />
          <meshStandardMaterial color="#C0A040" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial color="#88AACC" transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  if (style === 'hat') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 1.1, r * 1.1, 0.06, 16]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[r * 0.72, r * 0.78, 0.28, 16]} /><meshStandardMaterial color="#222" /></mesh>
      </group>
    )
  }
  if (style === 'crown') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 0.85, r * 0.85, 0.08, 16]} /><meshStandardMaterial color="#F5D033" /></mesh>
        {[0, 1, 2, 3, 4].map(i => {
          const a = (i / 5) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * r * 0.75, 0.13, Math.cos(a) * r * 0.75]}>
              <coneGeometry args={[0.06, 0.17, 6]} />
              <meshStandardMaterial color="#F5D033" />
            </mesh>
          )
        })}
      </group>
    )
  }
  if (style === 'wizard_hat') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh><cylinderGeometry args={[r * 1.0, r * 1.0, 0.05, 16]} /><meshStandardMaterial color="#4B0082" /></mesh>
        <mesh position={[0, 0.32, 0]}><coneGeometry args={[r * 0.82, 0.6, 16]} /><meshStandardMaterial color="#4B0082" /></mesh>
        <mesh position={[0, 0.14, 0]}><torusGeometry args={[r * 0.7, 0.04, 8, 16]} /><meshStandardMaterial color="#FFD700" /></mesh>
      </group>
    )
  }
  if (style === 'headband') {
    return (
      <mesh position={[0, bodyTop - r * 0.8, 0]} rotation={[0.25, 0, 0]}>
        <torusGeometry args={[r * 0.98, 0.038, 8, 32, Math.PI]} />
        <meshStandardMaterial color="#EC4899" />
      </mesh>
    )
  }
  if (style === 'bunny_ears') {
    return (
      <group position={[0, bodyTop + 0.05, 0]}>
        <mesh position={[-r * 0.45, 0.28, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[r * 0.45, 0.28, 0]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[-r * 0.45, 0.28, 0]} rotation={[0, 0, -0.2]} scale={[0.5, 0.88, 0.4]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="#FFB3C1" />
        </mesh>
        <mesh position={[r * 0.45, 0.28, 0]} rotation={[0, 0, 0.2]} scale={[0.5, 0.88, 0.4]}>
          <capsuleGeometry args={[r * 0.22, 0.36, 4, 8]} />
          <meshStandardMaterial color="#FFB3C1" />
        </mesh>
      </group>
    )
  }
  if (style === 'horns') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        <mesh position={[-r * 0.48, 0.12, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[r * 0.22, 0.24, 8]} />
          <meshStandardMaterial color="#CC2200" />
        </mesh>
        <mesh position={[r * 0.48, 0.12, 0]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[r * 0.22, 0.24, 8]} />
          <meshStandardMaterial color="#CC2200" />
        </mesh>
      </group>
    )
  }
  if (style === 'halo') {
    return (
      <mesh position={[0, bodyTop + 0.28, 0]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[r * 0.72, 0.04, 8, 24]} />
        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.4} />
      </mesh>
    )
  }
  if (style === 'flower_crown') {
    return (
      <group position={[0, bodyTop + 0.04, 0]}>
        {[0, 1, 2, 3, 4, 5].map(i => {
          const a = (i / 6) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.sin(a) * r * 0.9, 0.06, Math.cos(a) * r * 0.9]}>
              <sphereGeometry args={[r * 0.22, 8, 8]} />
              <meshStandardMaterial color={['#FF6B9D', '#FF4757', '#FFA502', '#2ED573', '#7BED9F', '#5352ED'][i]} />
            </mesh>
          )
        })}
      </group>
    )
  }
  return null
}

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

export type DragMode = 'held' | 'flying' | 'sliding' | 'dazed' | 'waking' | 'mad'

// ─── Joint Spring Physics ─────────────────────────────────────────────────────

type BoneRV = { r: number; v: number }
type JointRig = {
  lsX: BoneRV; lsZ: BoneRV   // left shoulder
  rsX: BoneRV; rsZ: BoneRV   // right shoulder
  leX: BoneRV                  // left elbow
  reX: BoneRV                  // right elbow
  lhX: BoneRV; lhZ: BoneRV   // left hip
  rhX: BoneRV; rhZ: BoneRV   // right hip
  lkX: BoneRV                  // left knee
  rkX: BoneRV                  // right knee
  lakX: BoneRV                 // left ankle
  rakX: BoneRV                 // right ankle
  byX: BoneRV; byZ: BoneRV   // body
  ready: boolean
}
function makeRig(): JointRig {
  const z = (): BoneRV => ({ r: 0, v: 0 })
  return {
    lsX: z(), lsZ: z(), rsX: z(), rsZ: z(),
    leX: z(), reX: z(),
    lhX: z(), lhZ: z(), rhX: z(), rhZ: z(),
    lkX: z(), rkX: z(),
    lakX: z(), rakX: z(),
    byX: z(), byZ: z(),
    ready: false,
  }
}

function solveJoint(b: BoneRV, rest: number, K: number, D: number, lo: number, hi: number, dt: number) {
  b.v += (-(b.r - rest) * K - b.v * D) * dt
  b.r += b.v * dt
  if (b.r < lo) { b.r = lo; b.v =  Math.abs(b.v) * 0.15 }
  if (b.r > hi) { b.r = hi; b.v = -Math.abs(b.v) * 0.15 }
}

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
  const groupRef      = useRef<THREE.Group>(null)
  const bodyGroupRef  = useRef<THREE.Group>(null)
  const upperBodyRef  = useRef<THREE.Group>(null)  // hip-pivot
  const leftArmRef    = useRef<THREE.Group>(null)  // shoulder
  const rightArmRef   = useRef<THREE.Group>(null)
  const leftElbowRef  = useRef<THREE.Group>(null)
  const rightElbowRef = useRef<THREE.Group>(null)
  const leftLegRef    = useRef<THREE.Group>(null)  // hip
  const rightLegRef   = useRef<THREE.Group>(null)
  const leftKneeRef   = useRef<THREE.Group>(null)
  const rightKneeRef  = useRef<THREE.Group>(null)
  const leftAnkleRef  = useRef<THREE.Group>(null)
  const rightAnkleRef = useRef<THREE.Group>(null)

  const jointRig      = useRef<JointRig>(makeRig())
  const animState     = useRef<AnimState>('walking')
  const idleTimer     = useRef(0)
  const phase         = useRef(Math.random() * Math.PI * 2)
  const celebTimer    = useRef(0)
  const selectedTimer = useRef(0)
  const dragTimer     = useRef(0)

  // Squish spring — position-tracked, no extra props needed
  const squishY    = useRef(1)
  const squishVelY = useRef(0)
  const sqPrevPos  = useRef(new THREE.Vector3())
  const sqPrevVel  = useRef(new THREE.Vector3())
  const sqInit     = useRef(false)
  const _ia = Math.random() * Math.PI * 2
  const _ir = 1.0 + Math.random() * (bounds * 0.85)
  const targetPos = useRef(new THREE.Vector3(Math.cos(_ia) * _ir, 0, Math.sin(_ia) * _ir))

  const dims      = useBeanDims(member.avatar)
  const skinColor = SKIN_TONES[member.avatar.skinTone]
  const bodyColor = member.avatar.bodyColor ?? member.avatar.shirtColor

  // Two-segment arms and three-joint legs
  const upperArmLen = dims.armLen * 0.55
  const forearmLen  = dims.armLen * 0.45
  const thighLen    = dims.legLen * 0.52
  const shinLen     = dims.legLen * 0.40

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
    dragTimer.current = 0
    jointRig.current  = makeRig()
    if (leftArmRef.current)    { leftArmRef.current.rotation.x    = 0; leftArmRef.current.rotation.z    = 0 }
    if (rightArmRef.current)   { rightArmRef.current.rotation.x   = 0; rightArmRef.current.rotation.z   = 0 }
    if (leftElbowRef.current)  leftElbowRef.current.rotation.x    = 0
    if (rightElbowRef.current) rightElbowRef.current.rotation.x   = 0
    if (leftLegRef.current)    { leftLegRef.current.rotation.x    = 0; leftLegRef.current.rotation.z    = 0 }
    if (rightLegRef.current)   { rightLegRef.current.rotation.x   = 0; rightLegRef.current.rotation.z   = 0 }
    if (leftKneeRef.current)   leftKneeRef.current.rotation.x     = 0
    if (rightKneeRef.current)  rightKneeRef.current.rotation.x    = 0
    if (leftAnkleRef.current)  leftAnkleRef.current.rotation.x    = 0
    if (rightAnkleRef.current) rightAnkleRef.current.rotation.x   = 0
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.x = 0
      bodyGroupRef.current.rotation.z = 0
      bodyGroupRef.current.position.set(0, 0, 0)
      bodyGroupRef.current.scale.set(1, 1, 1)
    }
    if (upperBodyRef.current) {
      upperBodyRef.current.rotation.x = 0
      upperBodyRef.current.rotation.z = 0
    }
    squishY.current    = 1
    squishVelY.current = 0
    sqInit.current     = false
    if (dragMode === null && groupRef.current) {
      groupRef.current.rotation.x = 0
      groupRef.current.rotation.z = 0
      animState.current = 'walking'
      const angle  = Math.random() * Math.PI * 2
      const radius = 1.0 + Math.random() * (bounds * 0.85)
      targetPos.current.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
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

    const dt = Math.min(delta, 1 / 30)

    // ── Squish spring (position-tracked, runs every frame) ────────────────────
    let sqAccelX = 0, sqAccelY = 0, sqAccelZ = 0
    let sqVelX   = 0, sqVelZ   = 0
    {
      if (!sqInit.current) {
        sqPrevPos.current.copy(group.position)
        sqPrevVel.current.set(0, 0, 0)
        sqInit.current = true
      } else {
        const vx = (group.position.x - sqPrevPos.current.x) / dt
        const vy = (group.position.y - sqPrevPos.current.y) / dt
        const vz = (group.position.z - sqPrevPos.current.z) / dt

        sqVelX = vx
        sqVelZ = vz

        if (dragMode) {
          sqAccelX = (vx - sqPrevVel.current.x) / dt
          sqAccelY = (vy - sqPrevVel.current.y) / dt
          sqAccelZ = (vz - sqPrevVel.current.z) / dt
          squishVelY.current -= sqAccelY * 0.0010
          squishVelY.current -= Math.sqrt(sqAccelX * sqAccelX + sqAccelZ * sqAccelZ) * 0.0006
          squishVelY.current  = THREE.MathUtils.clamp(squishVelY.current, -5, 5)
        }

        sqPrevPos.current.copy(group.position)
        sqPrevVel.current.set(vx, vy, vz)
      }

      // Spring solver: stiffness 18, damping 5.5 → ~0.35 s oscillation
      squishVelY.current += (-(squishY.current - 1) * 18 - squishVelY.current * 5.5) * dt
      squishY.current    += squishVelY.current * dt
      squishY.current     = THREE.MathUtils.clamp(squishY.current, 0.62, 1.38)

      if (bodyGroupRef.current) {
        const sy = squishY.current
        bodyGroupRef.current.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
      }
    }

    // ── Unified joint spring physics (all drag modes) ─────────────────────────
    if (dragMode) {
      dragTimer.current += delta
      const t   = dragTimer.current
      const rig = jointRig.current

      // Convert world-space vel/accel to character-local frame (Y-rotation only)
      const cy = Math.cos(-group.rotation.y)
      const sy = Math.sin(-group.rotation.y)
      const lacX = sqAccelX * cy - sqAccelZ * sy
      const lacZ = sqAccelX * sy + sqAccelZ * cy
      const lvX  = sqVelX   * cy - sqVelZ   * sy
      const lvZ  = sqVelX   * sy + sqVelZ   * cy

      // Default spring params (held: underdamped for squishy feel)
      let Ks = 12, Ds = 4.2
      let Ke =  7, De = 3.2
      let Kh = 14, Dh = 4.8
      let Kk =  8, Dk = 3.6
      let Ka =  5, Da = 2.8

      // Default rest angles
      let lsXR = 0, lsZR = 0, rsXR = 0, rsZR = 0
      let leXR = 0, reXR = 0
      let lhXR = 0, lhZR = 0, rhXR = 0, rhZR = 0
      let lkXR = 0, rkXR = 0
      let lakXR = 0, rakXR = 0

      if (dragMode === 'held') {
        // Gravity droop: limbs hang behind the hold point
        lsXR = 0.55;  rsXR = 0.55   // arms swing backward under gravity
        leXR = 0.65;  reXR = 0.65   // elbows bent, gravity-sagging
        lhXR = 0.75;  rhXR = 0.75   // legs hang backward
        lkXR = -0.55; rkXR = -0.55  // knees bent
        lakXR = 0.30; rakXR = 0.30  // ankles/toes droop

        // Inertia: character acceleration kicks joints (chain reaction: shoulder → elbow etc.)
        const aS = 0.030
        rig.lsX.v -= lacZ * aS;          rig.rsX.v -= lacZ * aS
        rig.lsZ.v -= lacX * aS * 0.65;   rig.rsZ.v -= lacX * aS * 0.65
        rig.leX.v -= lacZ * aS * 0.55;   rig.reX.v -= lacZ * aS * 0.55
        rig.lhX.v -= lacZ * aS * 0.80;   rig.rhX.v -= lacZ * aS * 0.80
        rig.lkX.v -= lacZ * aS * 0.55;   rig.rkX.v -= lacZ * aS * 0.55
        rig.lakX.v -= lacZ * aS * 0.40;  rig.rakX.v -= lacZ * aS * 0.40
        // Vertical G: lift = arms droop; drop = arms fly up
        rig.lsX.v += sqAccelY * 0.008;   rig.rsX.v += sqAccelY * 0.008
        rig.lhX.v += sqAccelY * 0.006;   rig.rhX.v += sqAccelY * 0.006

      } else if (dragMode === 'flying' || dragMode === 'sliding') {
        // Arms spread out, legs trail — overdamped for smooth settle
        lsXR = -0.28; rsXR = -0.28
        lsZR = -1.35; rsZR =  1.35
        leXR = -0.35; reXR = -0.35
        lhXR = -0.30; rhXR = -0.30
        lhZR = -0.35; rhZR =  0.35
        lkXR =  0.20; rkXR =  0.20
        lakXR = -0.20; rakXR = -0.20
        Ks = 10; Ds = 7.0
        Ke =  7; De = 6.0
        Kh = 12; Dh = 7.5
        Kk =  7; Dk = 6.0
        Ka =  5; Da = 5.5

      } else if (dragMode === 'dazed') {
        // Explosive initial velocities → spring return
        if (!rig.ready) {
          const s = 8 + Math.random() * 10
          rig.lsX  = { r: leftArmRef.current?.rotation.x    ?? 0, v:  (Math.random()-0.5) * s       }
          rig.lsZ  = { r: leftArmRef.current?.rotation.z    ?? 0, v: -(0.5+Math.random()*0.7) * s   }
          rig.rsX  = { r: rightArmRef.current?.rotation.x   ?? 0, v:  (Math.random()-0.5) * s       }
          rig.rsZ  = { r: rightArmRef.current?.rotation.z   ?? 0, v:  (0.5+Math.random()*0.7) * s   }
          rig.leX  = { r: leftElbowRef.current?.rotation.x  ?? 0, v:  (Math.random()-0.5) * s * 1.4 }
          rig.reX  = { r: rightElbowRef.current?.rotation.x ?? 0, v:  (Math.random()-0.5) * s * 1.4 }
          rig.lhX  = { r: leftLegRef.current?.rotation.x    ?? 0, v:  (Math.random()-0.5) * s * 0.9 }
          rig.lhZ  = { r: leftLegRef.current?.rotation.z    ?? 0, v:  (Math.random()-0.5) * s * 0.5 }
          rig.rhX  = { r: rightLegRef.current?.rotation.x   ?? 0, v:  (Math.random()-0.5) * s * 0.9 }
          rig.rhZ  = { r: rightLegRef.current?.rotation.z   ?? 0, v:  (Math.random()-0.5) * s * 0.5 }
          rig.lkX  = { r: leftKneeRef.current?.rotation.x   ?? 0, v:  (Math.random()-0.5) * s * 1.2 }
          rig.rkX  = { r: rightKneeRef.current?.rotation.x  ?? 0, v:  (Math.random()-0.5) * s * 1.2 }
          rig.lakX = { r: leftAnkleRef.current?.rotation.x  ?? 0, v:  (Math.random()-0.5) * s * 1.3 }
          rig.rakX = { r: rightAnkleRef.current?.rotation.x ?? 0, v:  (Math.random()-0.5) * s * 1.3 }
          rig.byX  = { r: bodyGroupRef.current?.rotation.x  ?? 0, v:  (Math.random()-0.5) * s * 0.6 }
          rig.byZ  = { r: bodyGroupRef.current?.rotation.z  ?? 0, v:  (Math.random()-0.5) * s * 0.6 }
          rig.ready = true
        }
        Ks = 9;  Ds = 3.6
        Ke = 6;  De = 3.0
        Kh = 9;  Dh = 5.5
        Kk = 7;  Dk = 3.8
        Ka = 5;  Da = 3.0

      } else if (dragMode === 'waking') {
        // Damp all joints to rest with body settle wobble
        Ks = 6;  Ds = 5.5
        Ke = 4;  De = 5.0
        Kh = 6;  Dh = 5.5
        Kk = 4;  Dk = 5.0
        Ka = 3;  Da = 4.5
        if (bodyGroupRef.current) {
          bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.03)
          bodyGroupRef.current.rotation.z = Math.sin(t * 18) * 0.18 * Math.max(0, 1 - t / 1.5)
        }

      } else if (dragMode === 'mad') {
        // Arms raised, legs stomp — snappy high-stiffness springs
        lsXR = -Math.PI * 0.70; rsXR = -Math.PI * 0.70
        lsZR = -0.50;           rsZR =  0.50
        leXR = -0.30;            reXR = -0.30
        lhXR = Math.sin(t * 8) * 0.45; rhXR = Math.sin(t * 8 + Math.PI) * 0.45
        Ks = 24; Ds = 7.0
        Ke = 15; De = 5.5
        Kh = 24; Dh = 7.5
        Kk = 15; Dk = 5.5
        Ka = 10; Da = 5.0
        if (bodyGroupRef.current) bodyGroupRef.current.rotation.z = Math.sin(t * 9) * 0.06
      }

      // ── Solve + apply all joints ────────────────────────────────────────────
      solveJoint(rig.lsX, lsXR, Ks, Ds, -2.8,  2.8, dt)
      solveJoint(rig.lsZ, lsZR, Ks, Ds, -1.8,  0.8, dt)
      solveJoint(rig.rsX, rsXR, Ks, Ds, -2.8,  2.8, dt)
      solveJoint(rig.rsZ, rsZR, Ks, Ds, -0.8,  1.8, dt)
      if (leftArmRef.current)  { leftArmRef.current.rotation.x  = rig.lsX.r; leftArmRef.current.rotation.z  = rig.lsZ.r }
      if (rightArmRef.current) { rightArmRef.current.rotation.x = rig.rsX.r; rightArmRef.current.rotation.z = rig.rsZ.r }

      solveJoint(rig.leX, leXR, Ke, De, -0.2,  2.5, dt)
      solveJoint(rig.reX, reXR, Ke, De, -0.2,  2.5, dt)
      if (leftElbowRef.current)  leftElbowRef.current.rotation.x  = rig.leX.r
      if (rightElbowRef.current) rightElbowRef.current.rotation.x = rig.reX.r

      solveJoint(rig.lhX, lhXR, Kh, Dh, -0.7,  1.3, dt)
      solveJoint(rig.lhZ, lhZR, Kh, Dh, -0.7,  0.4, dt)
      solveJoint(rig.rhX, rhXR, Kh, Dh, -0.7,  1.3, dt)
      solveJoint(rig.rhZ, rhZR, Kh, Dh, -0.4,  0.7, dt)
      if (leftLegRef.current)  { leftLegRef.current.rotation.x  = rig.lhX.r; leftLegRef.current.rotation.z  = rig.lhZ.r }
      if (rightLegRef.current) { rightLegRef.current.rotation.x = rig.rhX.r; rightLegRef.current.rotation.z = rig.rhZ.r }

      solveJoint(rig.lkX, lkXR, Kk, Dk, -2.3,  0.3, dt)
      solveJoint(rig.rkX, rkXR, Kk, Dk, -2.3,  0.3, dt)
      if (leftKneeRef.current)  leftKneeRef.current.rotation.x  = rig.lkX.r
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = rig.rkX.r

      solveJoint(rig.lakX, lakXR, Ka, Da, -0.9, 0.9, dt)
      solveJoint(rig.rakX, rakXR, Ka, Da, -0.9, 0.9, dt)
      if (leftAnkleRef.current)  leftAnkleRef.current.rotation.x  = rig.lakX.r
      if (rightAnkleRef.current) rightAnkleRef.current.rotation.x = rig.rakX.r

      // Body tumble spring (dazed / waking)
      if (dragMode === 'dazed' || dragMode === 'waking') {
        solveJoint(rig.byX, 0, 8, 4.0, -0.45, 0.45, dt)
        solveJoint(rig.byZ, 0, 8, 4.0, -0.45, 0.45, dt)
        if (bodyGroupRef.current) { bodyGroupRef.current.rotation.x = rig.byX.r; bodyGroupRef.current.rotation.z = rig.byZ.r }
      }

      // Hot-dog wave: upper body lags behind movement direction (held only)
      if (dragMode === 'held' && upperBodyRef.current) {
        const tX = THREE.MathUtils.clamp( lvZ * 0.14, -0.44, 0.44)
        const tZ = THREE.MathUtils.clamp(-lvX * 0.14, -0.44, 0.44)
        upperBodyRef.current.rotation.x = THREE.MathUtils.lerp(upperBodyRef.current.rotation.x, tX, 0.10)
        upperBodyRef.current.rotation.z = THREE.MathUtils.lerp(upperBodyRef.current.rotation.z, tZ, 0.10)
      }

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
      const dx   = targetPos.current.x - group.position.x
      const dz   = targetPos.current.z - group.position.z
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

        {/* Left leg (hip → knee → ankle) — stays in bodyGroupRef */}
        <group ref={leftLegRef} position={[-dims.radius * 0.4, dims.legAttachY, 0]}>
          <mesh position={[0, -thighLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.055, 0.050, thighLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -thighLen / 2, 0]}>
            <cylinderGeometry args={[0.055, 0.050, thighLen, 8]} />
            <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
          </mesh>
          <group ref={leftKneeRef} position={[0, -thighLen, 0]}>
            <mesh position={[0, -shinLen / 2, 0]} scale={[1.08, 1.06, 1.08]}>
              <cylinderGeometry args={[0.048, 0.038, shinLen, 8]} />
              <meshBasicMaterial color="black" side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -shinLen / 2, 0]}>
              <cylinderGeometry args={[0.048, 0.038, shinLen, 8]} />
              <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
            </mesh>
            <group ref={leftAnkleRef} position={[0, -shinLen, 0]}>
              <mesh position={[0, -0.022, 0.038]}>
                <sphereGeometry args={[0.068, 8, 8]} />
                <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right leg (hip → knee → ankle) */}
        <group ref={rightLegRef} position={[dims.radius * 0.4, dims.legAttachY, 0]}>
          <mesh position={[0, -thighLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
            <cylinderGeometry args={[0.055, 0.050, thighLen, 8]} />
            <meshBasicMaterial color="black" side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, -thighLen / 2, 0]}>
            <cylinderGeometry args={[0.055, 0.050, thighLen, 8]} />
            <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
          </mesh>
          <group ref={rightKneeRef} position={[0, -thighLen, 0]}>
            <mesh position={[0, -shinLen / 2, 0]} scale={[1.08, 1.06, 1.08]}>
              <cylinderGeometry args={[0.048, 0.038, shinLen, 8]} />
              <meshBasicMaterial color="black" side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -shinLen / 2, 0]}>
              <cylinderGeometry args={[0.048, 0.038, shinLen, 8]} />
              <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
            </mesh>
            <group ref={rightAnkleRef} position={[0, -shinLen, 0]}>
              <mesh position={[0, -0.022, 0.038]}>
                <sphereGeometry args={[0.068, 8, 8]} />
                <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Hip pivot: rotating upperBodyRef tilts everything above the hip without moving the legs.
            The inner group cancels the pivot offset so all child positions stay in world-space. */}
        <group ref={upperBodyRef} position={[0, dims.legAttachY, 0]}>
          <group position={[0, -dims.legAttachY, 0]}>

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

            {/* Left arm (shoulder → elbow → hand) */}
            <group ref={leftArmRef} position={[-dims.armX, dims.armAttachY, 0]} rotation={[0, 0, -Math.PI * 0.15]}>
              <mesh position={[0, -upperArmLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
                <cylinderGeometry args={[0.04, 0.037, upperArmLen, 8]} />
                <meshBasicMaterial color="black" side={THREE.BackSide} />
              </mesh>
              <mesh position={[0, -upperArmLen / 2, 0]}>
                <cylinderGeometry args={[0.04, 0.037, upperArmLen, 8]} />
                <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
              </mesh>
              <group ref={leftElbowRef} position={[0, -upperArmLen, 0]}>
                <mesh position={[0, -forearmLen / 2, 0]} scale={[1.08, 1.06, 1.08]}>
                  <cylinderGeometry args={[0.036, 0.028, forearmLen, 8]} />
                  <meshBasicMaterial color="black" side={THREE.BackSide} />
                </mesh>
                <mesh position={[0, -forearmLen / 2, 0]}>
                  <cylinderGeometry args={[0.036, 0.028, forearmLen, 8]} />
                  <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
                </mesh>
                <mesh position={[0, -(forearmLen + 0.038), 0]}>
                  <sphereGeometry args={[0.055, 8, 8]} />
                  <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
                </mesh>
              </group>
            </group>

            {/* Right arm (shoulder → elbow → hand) */}
            <group ref={rightArmRef} position={[dims.armX, dims.armAttachY, 0]} rotation={[0, 0, Math.PI * 0.15]}>
              <mesh position={[0, -upperArmLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
                <cylinderGeometry args={[0.04, 0.037, upperArmLen, 8]} />
                <meshBasicMaterial color="black" side={THREE.BackSide} />
              </mesh>
              <mesh position={[0, -upperArmLen / 2, 0]}>
                <cylinderGeometry args={[0.04, 0.037, upperArmLen, 8]} />
                <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
              </mesh>
              <group ref={rightElbowRef} position={[0, -upperArmLen, 0]}>
                <mesh position={[0, -forearmLen / 2, 0]} scale={[1.08, 1.06, 1.08]}>
                  <cylinderGeometry args={[0.036, 0.028, forearmLen, 8]} />
                  <meshBasicMaterial color="black" side={THREE.BackSide} />
                </mesh>
                <mesh position={[0, -forearmLen / 2, 0]}>
                  <cylinderGeometry args={[0.036, 0.028, forearmLen, 8]} />
                  <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
                </mesh>
                <mesh position={[0, -(forearmLen + 0.038), 0]}>
                  <sphereGeometry args={[0.055, 8, 8]} />
                  <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
                </mesh>
              </group>
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
      </group>
    </group>
  )
}
