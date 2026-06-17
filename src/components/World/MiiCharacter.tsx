'use client'

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims } from '@/lib/beanDims'
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
  const r  = dims.radius
  const cl = dims.capLen
  const gY = dims.groundY
  const shape = dims.shape ?? 'bean'

  const fillMat    = <meshToonMaterial color={color} gradientMap={gradientMap} />
  const outlineMat = <meshBasicMaterial color="black" side={THREE.BackSide} />

  if (shape === 'peanut') {
    const botR   = r
    const botY   = dims.legAttachY + botR  // anchor sphere bottom at legAttachY
    const topR   = r * 0.72
    const topY   = gY + cl * 0.60
    const waistR = r * 0.30
    const waistH = Math.max(0.04, (topY - topR) - (botY + botR))
    const waistY = (topY - topR + botY + botR) / 2
    return (
      <>
        <mesh position={[0, botY, 0]} scale={1.06}><sphereGeometry args={[botR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, botY, 0]}><sphereGeometry args={[botR, 12, 12]} />{fillMat}</mesh>
        <mesh position={[0, waistY, 0]} scale={1.08}><cylinderGeometry args={[waistR, waistR, waistH + 0.06, 12]} />{outlineMat}</mesh>
        <mesh position={[0, waistY, 0]}><cylinderGeometry args={[waistR, waistR, waistH + 0.06, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.06}><sphereGeometry args={[topR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 12, 12]} />{fillMat}</mesh>
      </>
    )
  }

  if (shape === 'gourd') {
    const botR  = r * 1.18
    const botY  = dims.legAttachY + botR  // anchor sphere bottom at legAttachY
    const topR  = r * 0.60
    const topY  = gY + cl * 0.70
    const neckR = r * 0.52
    const neckH = Math.max(0.04, (topY - topR * 0.5) - (botY + botR * 0.55))
    const neckY = (topY - topR * 0.5 + botY + botR * 0.55) / 2
    return (
      <>
        <mesh position={[0, botY, 0]} scale={1.05}><sphereGeometry args={[botR, 14, 14]} />{outlineMat}</mesh>
        <mesh position={[0, botY, 0]}><sphereGeometry args={[botR, 14, 14]} />{fillMat}</mesh>
        <mesh position={[0, neckY, 0]} scale={1.08}><cylinderGeometry args={[neckR, botR * 0.62, neckH, 12]} />{outlineMat}</mesh>
        <mesh position={[0, neckY, 0]}><cylinderGeometry args={[neckR, botR * 0.62, neckH, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.08}><sphereGeometry args={[topR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 12, 12]} />{fillMat}</mesh>
      </>
    )
  }

  if (shape === 'strawberry') {
    const tipR = r * 0.26
    const midR = r * 0.66
    const topR = r * 1.04
    const tipY = dims.legAttachY + tipR
    const midY = tipY + (tipR + midR) * 0.78
    const topY = midY + (midR + topR) * 0.78
    return (
      <>
        <mesh position={[0, tipY, 0]} scale={1.07}><sphereGeometry args={[tipR, 10, 10]} />{outlineMat}</mesh>
        <mesh position={[0, tipY, 0]}><sphereGeometry args={[tipR, 10, 10]} />{fillMat}</mesh>
        <mesh position={[0, midY, 0]} scale={1.05}><sphereGeometry args={[midR, 12, 12]} />{outlineMat}</mesh>
        <mesh position={[0, midY, 0]}><sphereGeometry args={[midR, 12, 12]} />{fillMat}</mesh>
        <mesh position={[0, topY, 0]} scale={1.04}><sphereGeometry args={[topR, 14, 14]} />{outlineMat}</mesh>
        <mesh position={[0, topY, 0]}><sphereGeometry args={[topR, 14, 14]} />{fillMat}</mesh>
      </>
    )
  }

  // Default: bean (capsule)
  return (
    <>
      <mesh position={[0, gY, 0]} scale={1.06}><capsuleGeometry args={[r, cl, 8, 16]} />{outlineMat}</mesh>
      <mesh position={[0, gY, 0]}><capsuleGeometry args={[r, cl, 8, 16]} />{fillMat}</mesh>
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
  const leftArmRef   = useRef<THREE.Group>(null)
  const rightArmRef  = useRef<THREE.Group>(null)
  const leftLegRef   = useRef<THREE.Group>(null)
  const rightLegRef  = useRef<THREE.Group>(null)

  const ragdoll       = useRef<RagdollRef>(makeRagdoll())
  const animState     = useRef<AnimState>('walking')
  const idleTimer     = useRef(0)
  const phase         = useRef(Math.random() * Math.PI * 2)
  const celebTimer    = useRef(0)
  const selectedTimer = useRef(0)
  const dragTimer     = useRef(0)
  const _ia = Math.random() * Math.PI * 2
  const _ir = 1.0 + Math.random() * (bounds * 0.85)
  const targetPos = useRef(new THREE.Vector3(Math.cos(_ia) * _ir, 0, Math.sin(_ia) * _ir))

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

    // ── flying / sliding ─────────────────────────────────────────────────────
    if (dragMode === 'flying' || dragMode === 'sliding') {
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

    // ── dazed (ragdoll) ──────────────────────────────────────────────────────
    if (dragMode === 'dazed') {
      dragTimer.current += delta
      const dt = Math.min(delta, 1 / 30)

      if (!ragdoll.current.ready) {
        const s  = 7 + Math.random() * 9
        const rd = ragdoll.current
        rd.laX = { r: leftArmRef.current?.rotation.x  ?? 0, v:  (Math.random() - 0.5) * s }
        rd.laZ = { r: leftArmRef.current?.rotation.z  ?? 0, v: -(0.4 + Math.random() * 0.7) * s }
        rd.raX = { r: rightArmRef.current?.rotation.x ?? 0, v:  (Math.random() - 0.5) * s }
        rd.raZ = { r: rightArmRef.current?.rotation.z ?? 0, v:  (0.4 + Math.random() * 0.7) * s }
        rd.llX = { r: leftLegRef.current?.rotation.x  ?? 0, v:  (Math.random() - 0.5) * s * 0.7 }
        rd.llZ = { r: leftLegRef.current?.rotation.z  ?? 0, v:  (Math.random() - 0.5) * s * 0.4 }
        rd.rlX = { r: rightLegRef.current?.rotation.x ?? 0, v:  (Math.random() - 0.5) * s * 0.7 }
        rd.rlZ = { r: rightLegRef.current?.rotation.z ?? 0, v:  (Math.random() - 0.5) * s * 0.4 }
        rd.byX = { r: bodyGroupRef.current?.rotation.x ?? 0, v:  (Math.random() - 0.5) * s * 0.5 }
        rd.byZ = { r: bodyGroupRef.current?.rotation.z ?? 0, v:  (Math.random() - 0.5) * s * 0.5 }
        rd.ready = true
      }

      const rd = ragdoll.current
      let r: number, v: number

      ;[r, v] = rdSpring(rd.laX.r, rd.laX.v, 0.28, RD_K, RD_D, dt)
      ;[rd.laX.r, rd.laX.v] = rdClamp(r, v, -2.6, 2.6)
      ;[r, v] = rdSpring(rd.laZ.r, rd.laZ.v, -0.22, RD_K, RD_D, dt)
      ;[rd.laZ.r, rd.laZ.v] = rdClamp(r, v, -1.6, 0.55)
      if (leftArmRef.current)  { leftArmRef.current.rotation.x  = rd.laX.r; leftArmRef.current.rotation.z  = rd.laZ.r }

      ;[r, v] = rdSpring(rd.raX.r, rd.raX.v, 0.28, RD_K, RD_D, dt)
      ;[rd.raX.r, rd.raX.v] = rdClamp(r, v, -2.6, 2.6)
      ;[r, v] = rdSpring(rd.raZ.r, rd.raZ.v,  0.22, RD_K, RD_D, dt)
      ;[rd.raZ.r, rd.raZ.v] = rdClamp(r, v, -0.55, 1.6)
      if (rightArmRef.current) { rightArmRef.current.rotation.x = rd.raX.r; rightArmRef.current.rotation.z = rd.raZ.r }

      ;[r, v] = rdSpring(rd.llX.r, rd.llX.v, 0.04, RD_K, RD_DL, dt)
      ;[rd.llX.r, rd.llX.v] = rdClamp(r, v, -0.6, 1.0)
      ;[r, v] = rdSpring(rd.llZ.r, rd.llZ.v, -0.04, RD_K, RD_DL, dt)
      ;[rd.llZ.r, rd.llZ.v] = rdClamp(r, v, -0.65, 0.25)
      if (leftLegRef.current)  { leftLegRef.current.rotation.x  = rd.llX.r; leftLegRef.current.rotation.z  = rd.llZ.r }

      ;[r, v] = rdSpring(rd.rlX.r, rd.rlX.v, 0.04, RD_K, RD_DL, dt)
      ;[rd.rlX.r, rd.rlX.v] = rdClamp(r, v, -0.6, 1.0)
      ;[r, v] = rdSpring(rd.rlZ.r, rd.rlZ.v,  0.04, RD_K, RD_DL, dt)
      ;[rd.rlZ.r, rd.rlZ.v] = rdClamp(r, v, -0.25, 0.65)
      if (rightLegRef.current) { rightLegRef.current.rotation.x = rd.rlX.r; rightLegRef.current.rotation.z = rd.rlZ.r }

      ;[r, v] = rdSpring(rd.byX.r, rd.byX.v, 0, RD_K * 0.5, RD_DL, dt)
      ;[rd.byX.r, rd.byX.v] = rdClamp(r, v, -0.45, 0.45)
      ;[r, v] = rdSpring(rd.byZ.r, rd.byZ.v, 0, RD_K * 0.5, RD_DL, dt)
      ;[rd.byZ.r, rd.byZ.v] = rdClamp(r, v, -0.45, 0.45)
      if (bodyGroupRef.current) { bodyGroupRef.current.rotation.x = rd.byX.r; bodyGroupRef.current.rotation.z = rd.byZ.r }

      return
    }

    // ── waking ───────────────────────────────────────────────────────────────
    if (dragMode === 'waking') {
      dragTimer.current += delta
      const t = dragTimer.current
      if (bodyGroupRef.current) {
        bodyGroupRef.current.rotation.x = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.x, 0, 0.03)
        const damp = Math.max(0, 1 - t / 1.5)
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
