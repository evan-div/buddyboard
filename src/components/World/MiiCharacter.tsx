'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { giveOrTakePoints } from '@/lib/firestore'
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

// ─── Floating Card ────────────────────────────────────────────────────────────

const EMOJIS = ['🎉','💪','🔥','⭐','👏','😤','💀','🙄','😂','❤️','🫡','💯','🤑','👀','🐐']

interface CardProps {
  member: GroupMember
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onClose: () => void
  onSubmitted: () => void
}

function FloatingCard({ member, currentUid, groupId, remainingGive, remainingTake, onClose, onSubmitted }: CardProps) {
  const [mode, setMode]           = useState<'give' | 'take'>('give')
  const [points, setPoints]       = useState(0)
  const [reason, setReason]       = useState('')
  const [showEmojis, setShowEmojis] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const limit = mode === 'give' ? remainingGive : remainingTake
  const isOwn = member.uid === currentUid

  function switchMode(m: 'give' | 'take') {
    setMode(m); setPoints(0); setError('')
  }

  async function handleSubmit() {
    if (points <= 0)    { setError('Enter at least 1'); return }
    if (points > limit) { setError(`Max ${limit} today`); return }
    setLoading(true); setError('')
    try {
      await giveOrTakePoints(groupId, currentUid, [{
        toUid: member.uid,
        points: mode === 'give' ? points : -points,
        reason: reason.trim(),
      }])
      onSubmitted(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const card: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: 20,
    padding: '14px 14px 16px',
    width: 210,
    boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
    fontFamily: 'system-ui, sans-serif',
    userSelect: 'none',
  }

  return (
    <Html position={[0, 2.3, 0]} center distanceFactor={5} style={{ pointerEvents: 'none' }} zIndexRange={[100,0]}>
      <div style={{ ...card, pointerEvents: 'auto' }}>

        {/* Name + close */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{member.displayName}</div>
            <div style={{ fontSize: 12, color: '#f59e0b' }}>⭐ {member.totalPoints.toLocaleString()} pts</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        {isOwn ? (
          <div style={{ textAlign: 'center', color: '#888', fontSize: 13, padding: '12px 0' }}>This is you!</div>
        ) : (
          <>
            {/* Give / Take toggle */}
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3, marginBottom: 12 }}>
              {(['give','take'] as const).map(m => (
                <button key={m} onClick={() => switchMode(m)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                  background: mode === m ? (m === 'give' ? '#22c55e' : '#ef4444') : 'transparent',
                  color: mode === m ? '#fff' : '#888',
                }}>
                  {m === 'give' ? 'GIVE' : 'TAKE'}
                </button>
              ))}
            </div>

            {/* Emoji toggle */}
            <div style={{ marginBottom: 10 }}>
              <button onClick={() => setShowEmojis(v => !v)} style={{
                width: '100%', background: 'none',
                border: '2px dashed #d1d5db', borderRadius: 12,
                padding: '8px 0', cursor: 'pointer',
                fontSize: 13, color: '#9ca3af', fontWeight: 600,
              }}>
                {showEmojis ? 'Hide emojis' : '😊 Add emoji'}
              </button>
              {showEmojis && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, justifyContent: 'center' }}>
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => setReason(r => r + e)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2,
                    }}>{e}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Points stepper */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
              <button onClick={() => setPoints(p => Math.max(0, p - 1))} style={{
                width: 32, height: 32, borderRadius: '50%', border: '2px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}>−</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#111', lineHeight: 1 }}>{points}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{limit} left today</div>
              </div>
              <button onClick={() => setPoints(p => Math.min(limit, p + 1))} style={{
                width: 32, height: 32, borderRadius: '50%', border: '2px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}>+</button>
            </div>

            {/* Reason */}
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={mode === 'give' ? 'Why are you giving?' : 'Why are you taking?'}
              maxLength={100}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '2px solid #e5e7eb', borderRadius: 10,
                padding: '8px 10px', fontSize: 12, color: '#111',
                outline: 'none', marginBottom: 10,
                fontFamily: 'inherit',
              }}
            />

            {error && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>{error}</div>}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || points <= 0}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 12,
                border: 'none', cursor: points > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 800, fontSize: 13, color: '#fff',
                background: points > 0
                  ? (mode === 'give' ? '#22c55e' : '#ef4444')
                  : '#d1d5db',
                transition: 'background 0.15s',
              }}
            >
              {loading ? '...' : mode === 'give' ? `Give ${points} pts` : `Take ${points} pts`}
            </button>
          </>
        )}
      </div>
    </Html>
  )
}

// ─── Main Character ───────────────────────────────────────────────────────────

type AnimState = 'walking' | 'idle_bob' | 'idle_sway'

export interface MiiCharacterProps {
  member: GroupMember
  initialPosition: [number, number, number]
  bounds?: number
  isSelected: boolean
  onSelect: (member: GroupMember) => void
  onDeselect: () => void
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onPointsSubmitted: () => void
}

export default function MiiCharacter({
  member, initialPosition, bounds = 5,
  isSelected, onSelect, onDeselect,
  currentUid, groupId, remainingGive, remainingTake, onPointsSubmitted,
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
    const body  = bodyGroupRef.current
    if (!group) return
    phase.current += delta
    const t = phase.current

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
    <group ref={groupRef} position={initialPosition} onClick={e => { e.stopPropagation(); onSelect(member) }}>
      <SelectionRing visible={isSelected} />

      {isSelected && (
        <FloatingCard
          member={member}
          currentUid={currentUid}
          groupId={groupId}
          remainingGive={remainingGive}
          remainingTake={remainingTake}
          onClose={onDeselect}
          onSubmitted={onPointsSubmitted}
        />
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
