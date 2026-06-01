'use client'

import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import type { AvatarConfig, GroupMember } from '@/lib/types'

export type Period = 'daily' | 'weekly' | 'monthly' | 'alltime'
export type RankedMember = GroupMember & { periodPoints: number }

// ─── Hair (mirrors MiiCharacter) ─────────────────────────────────────────────

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
    <group position={[0, 0.22, 0]}>
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.18, 0.22, 0.26, 16]} /><meshStandardMaterial color="#222" /></mesh>
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.28, 0.28, 0.05, 16]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
    </group>
  )
  if (style === 'crown') return (
    <group position={[0, 0.26, 0]}>
      <mesh><cylinderGeometry args={[0.22, 0.22, 0.08, 16]} /><meshStandardMaterial color="#F5D033" metalness={0.6} roughness={0.2} /></mesh>
      {[-0.15, 0, 0.15].map((x, i) => (
        <mesh key={i} position={[x, 0.12, 0]}><boxGeometry args={[0.06, 0.16, 0.06]} /><meshStandardMaterial color="#F5D033" metalness={0.6} roughness={0.2} /></mesh>
      ))}
    </group>
  )
  if (style === 'headband') return (
    <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[0.27, 0.035, 8, 24, Math.PI]} />
      <meshStandardMaterial color="#EC4899" />
    </mesh>
  )
  return null
}

// ─── Podium Block ─────────────────────────────────────────────────────────────

const PODIUM_CFG = {
  1: { x:  0,    height: 2.2, color: '#C8960C', metalness: 0.7, roughness: 0.25, label: '1' },
  2: { x: -2.45, height: 1.5, color: '#9EA3A8', metalness: 0.8, roughness: 0.2,  label: '2' },
  3: { x:  2.45, height: 1.1, color: '#A0522D', metalness: 0.55, roughness: 0.35, label: '3' },
} as const

const PW = 1.75  // podium width
const PD = 1.4   // podium depth

function PodiumBlock({ rank }: { rank: 1 | 2 | 3 }) {
  const cfg = PODIUM_CFG[rank]
  return (
    <group position={[cfg.x, 0, 0]}>
      <mesh position={[0, cfg.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PW, cfg.height, PD]} />
        <meshStandardMaterial color={cfg.color} metalness={cfg.metalness} roughness={cfg.roughness} />
      </mesh>
      {/* Rank number on front face */}
      <Html
        position={[0, cfg.height / 2, PD / 2 + 0.02]}
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div style={{
          fontSize: '26px',
          fontWeight: 900,
          color: 'rgba(255,255,255,0.85)',
          textShadow: '0 2px 6px rgba(0,0,0,0.5)',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1,
        }}>
          {cfg.label}
        </div>
      </Html>
    </group>
  )
}

// ─── Podium Mii (static character with idle animation) ────────────────────────

function PodiumMii({ member, x, podiumH, phaseOffset, period }: {
  member: RankedMember
  x: number
  podiumH: number
  phaseOffset: number
  period: Period
}) {
  const bodyRef  = useRef<THREE.Group>(null)
  const headRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)

  const skin = SKIN_TONES[member.avatar.skinTone]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.2 + phaseOffset
    if (bodyRef.current)  bodyRef.current.position.y  =  Math.sin(t)        * 0.025
    if (lArmRef.current)  lArmRef.current.rotation.x  =  Math.sin(t * 0.9)  * 0.07
    if (rArmRef.current)  rArmRef.current.rotation.x  = -Math.sin(t * 0.9 + 0.8) * 0.07
    if (headRef.current)  headRef.current.rotation.y  =  Math.sin(t * 0.45) * 0.09
  })

  const showChange = period !== 'alltime'
  const pts = member.periodPoints
  const isPos = pts > 0
  const isNeg = pts < 0
  const changeColor  = showChange ? (isPos ? '#4ade80' : isNeg ? '#f87171' : '#9ca3af') : '#fbbf24'
  const changeText   = showChange
    ? `${isPos ? '↑ +' : isNeg ? '↓ ' : '– '}${pts === 0 ? '0' : pts}`
    : `${pts.toLocaleString()} pts`

  return (
    <group position={[x, podiumH, 0]}>
      {/* Name + score label above head */}
      <Html position={[0, 2.2, 0]} center style={{ pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 800, color: 'white',
            textShadow: '0 1px 5px rgba(0,0,0,0.9)',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '76px', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {member.displayName}
          </div>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: changeColor,
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            {changeText}
          </div>
        </div>
      </Html>

      <group ref={bodyRef}>
        {/* Left leg */}
        <group position={[-0.12, 0.65, 0]}>
          <mesh position={[0, -0.325, 0]}><cylinderGeometry args={[0.085, 0.08, 0.65, 8]} /><meshStandardMaterial color={member.avatar.pantsColor ?? '#1e293b'} /></mesh>
          <mesh position={[0, -0.67, 0.04]}><boxGeometry args={[0.12, 0.08, 0.18]} /><meshStandardMaterial color={member.avatar.shoesColor ?? '#111827'} /></mesh>
        </group>
        {/* Right leg */}
        <group position={[0.12, 0.65, 0]}>
          <mesh position={[0, -0.325, 0]}><cylinderGeometry args={[0.085, 0.08, 0.65, 8]} /><meshStandardMaterial color={member.avatar.pantsColor ?? '#1e293b'} /></mesh>
          <mesh position={[0, -0.67, 0.04]}><boxGeometry args={[0.12, 0.08, 0.18]} /><meshStandardMaterial color={member.avatar.shoesColor ?? '#111827'} /></mesh>
        </group>
        {/* Torso */}
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.52, 0.5, 0.3]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
        {/* Left arm */}
        <group ref={lArmRef} position={[-0.32, 1.08, 0]}>
          <mesh position={[-0.02, -0.21, 0]}><cylinderGeometry args={[0.075, 0.065, 0.42, 8]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
          <mesh position={[-0.02, -0.45, 0]}><sphereGeometry args={[0.074, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        {/* Right arm */}
        <group ref={rArmRef} position={[0.32, 1.08, 0]}>
          <mesh position={[0.02, -0.21, 0]}><cylinderGeometry args={[0.075, 0.065, 0.42, 8]} /><meshStandardMaterial color={member.avatar.shirtColor} /></mesh>
          <mesh position={[0.02, -0.45, 0]}><sphereGeometry args={[0.074, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        {/* Neck */}
        <mesh position={[0, 1.21, 0]}><cylinderGeometry args={[0.1, 0.1, 0.18, 8]} /><meshStandardMaterial color={skin} /></mesh>
        {/* Head */}
        <group ref={headRef} position={[0, 1.5, 0]}>
          <mesh><sphereGeometry args={[0.28, 20, 20]} /><meshStandardMaterial color={skin} /></mesh>
          <mesh position={[-0.1, 0.04, 0.261]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[-0.1, 0.04, 0.276]}><sphereGeometry args={[0.023, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
          <mesh position={[0.1, 0.04, 0.261]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0.1, 0.04, 0.276]}><sphereGeometry args={[0.023, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
          <mesh position={[0, -0.02, 0.278]}><sphereGeometry args={[0.028, 8, 8]} /><meshStandardMaterial color={skin} /></mesh>
          <mesh position={[0, -0.1, 0.262]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.062, 0.014, 8, 16, Math.PI]} /><meshStandardMaterial color="#2a1010" /></mesh>
          <Hair style={member.avatar.hairStyle} color={member.avatar.hairColor} />
          <Accessory style={member.avatar.accessory} />
        </group>
      </group>
    </group>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ first, second, third, period }: {
  first?: RankedMember
  second?: RankedMember
  third?: RankedMember
  period: Period
}) {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 12, 8]}  intensity={1.3} castShadow />
      <directionalLight position={[-4, 6, 2]}  intensity={0.4} />
      <directionalLight position={[0, 4, -6]}  intensity={0.15} />

      {/* Stage floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 5]} />
        <meshStandardMaterial color="#dde0ea" roughness={0.85} />
      </mesh>

      {/* Podiums */}
      <PodiumBlock rank={1} />
      <PodiumBlock rank={2} />
      <PodiumBlock rank={3} />

      {/* Characters */}
      {first  && <PodiumMii member={first}  x={PODIUM_CFG[1].x} podiumH={PODIUM_CFG[1].height} phaseOffset={0}   period={period} />}
      {second && <PodiumMii member={second} x={PODIUM_CFG[2].x} podiumH={PODIUM_CFG[2].height} phaseOffset={1.5} period={period} />}
      {third  && <PodiumMii member={third}  x={PODIUM_CFG[3].x} podiumH={PODIUM_CFG[3].height} phaseOffset={2.9} period={period} />}
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function PodiumScene({ first, second, third, period }: {
  first?: RankedMember
  second?: RankedMember
  third?: RankedMember
  period: Period
}) {
  return (
    <div style={{
      height: '400px',
      borderRadius: '16px',
      overflow: 'hidden',
      marginBottom: '20px',
      background: 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)',
    }}>
      <Canvas
        camera={{ position: [0, 2.8, 6.5], fov: 58 }}
        onCreated={({ camera }) => camera.lookAt(0, 2.2, 0)}
        gl={{ antialias: true, alpha: true }}
        shadows
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <Scene first={first} second={second} third={third} period={period} />
        </Suspense>
      </Canvas>
    </div>
  )
}
