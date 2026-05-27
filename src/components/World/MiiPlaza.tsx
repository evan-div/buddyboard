'use client'

import { Suspense, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MiiCharacter from './MiiCharacter'
import { giveOrTakePoints } from '@/lib/firestore'
import type { GroupMember } from '@/lib/types'

// ─── Checkered Floor ─────────────────────────────────────────────────────────

function CheckerFloor() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#dedad4' : '#cac6bf'
        ctx.fillRect(x * 64, y * 64, 64, 64)
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
    return tex
  }, [])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[26, 26]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}

// ─── Member Card (centered DOM overlay) ──────────────────────────────────────

const EMOJIS = ['🎉', '💪', '🔥', '⭐', '👏', '😤', '💀', '🙄', '😂', '❤️', '🫡', '💯', '🤑', '👀', '🐐']

interface MemberCardProps {
  member: GroupMember
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onClose: () => void
  onSubmitted: () => void
}

function MemberCard({
  member,
  currentUid,
  groupId,
  remainingGive,
  remainingTake,
  onClose,
  onSubmitted,
}: MemberCardProps) {
  const [mode, setMode]       = useState<'give' | 'take'>('give')
  const [points, setPoints]   = useState('')
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const limit = mode === 'give' ? remainingGive : remainingTake
  const pts   = Math.max(0, parseInt(points) || 0)

  function switchMode(m: 'give' | 'take') {
    setMode(m)
    setPoints('')
    setError('')
  }

  async function handleSubmit() {
    if (pts <= 0)    { setError('Enter at least 1 point'); return }
    if (pts > limit) { setError(`Only ${limit} pts remaining today`); return }
    setLoading(true)
    setError('')
    try {
      await giveOrTakePoints(groupId, currentUid, [{
        toUid: member.uid,
        points: mode === 'give' ? pts : -pts,
        reason: reason.trim(),
      }])
      onSubmitted()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const isOwnProfile = member.uid === currentUid

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-lg leading-tight">{member.displayName}</h3>
            <p className="text-yellow-400 text-sm mt-0.5">⭐ {member.totalPoints.toLocaleString()} pts</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-3 mt-0.5"
          >✕</button>
        </div>

        {isOwnProfile ? (
          <p className="text-gray-400 text-sm text-center py-4">This is you!</p>
        ) : (
          <>
            {/* Give / Take toggle */}
            <div className="flex bg-gray-800 rounded-xl p-1 gap-1 mb-4">
              <button
                onClick={() => switchMode('give')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'give' ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >Give Points</button>
              <button
                onClick={() => switchMode('take')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'take' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >Take Points</button>
            </div>

            {/* Points input */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="number"
                min={1}
                max={limit}
                value={points}
                onChange={e => setPoints(e.target.value)}
                placeholder="0"
                className="w-20 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-center text-lg font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <span className={`text-sm font-medium ${mode === 'give' ? 'text-green-400' : 'text-red-400'}`}>
                pts · {limit} left today
              </span>
            </div>

            {/* Emoji row */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setReason(r => r + emoji)}
                  className="text-xl hover:scale-125 transition-transform leading-none"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Reason input */}
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={mode === 'give' ? 'Why are you giving points?' : 'Why are you taking points?'}
              maxLength={100}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors mb-3"
            />

            {error && (
              <p className="text-red-400 text-xs mb-3">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || pts <= 0 || pts > limit}
              className={`w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
                mode === 'give'
                  ? 'bg-green-600 hover:bg-green-500 shadow-green-500/20'
                  : 'bg-red-600 hover:bg-red-500 shadow-red-500/20'
              }`}
            >
              {loading
                ? 'Submitting...'
                : mode === 'give'
                ? `Give ${pts} pts to ${member.displayName}`
                : `Take ${pts} pts from ${member.displayName}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

function Scene({
  members,
  selectedUid,
  onSelect,
}: {
  members: GroupMember[]
  selectedUid: string | null
  onSelect: (member: GroupMember) => void
}) {
  const positions = useMemo<[number, number, number][]>(() => {
    return members.map((_, i) => {
      const angle  = (i / Math.max(members.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.2
      const radius = 1.2 + Math.random() * 3.5
      return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
    })
  }, [members.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <CheckerFloor />
      {members.map((member, i) => (
        <MiiCharacter
          key={member.uid}
          member={member}
          initialPosition={positions[i]}
          bounds={5.5}
          isSelected={selectedUid === member.uid}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        target={[0, 0.6, 0]}
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.15}
        enablePan
        makeDefault
      />
    </>
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────

interface Props {
  members: GroupMember[]
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onPointsSubmitted: () => void
}

export default function MiiPlaza({
  members,
  currentUid,
  groupId,
  remainingGive,
  remainingTake,
  onPointsSubmitted,
}: Props) {
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null)

  return (
    <div
      style={{
        width: '100%',
        height: 'calc(100dvh - 160px)',
        minHeight: 400,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        background: '#f5f2ec',
      }}
    >
      <Canvas
        camera={{ position: [0, 8, 12], fov: 48 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => setSelectedMember(null)}
      >
        <Suspense fallback={null}>
          <Scene
            members={members}
            selectedUid={selectedMember?.uid ?? null}
            onSelect={setSelectedMember}
          />
        </Suspense>
      </Canvas>

      {/* Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.5)',
          color: '#ccc',
          fontSize: 11,
          padding: '4px 12px',
          borderRadius: 20,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Drag to rotate · Scroll to zoom · Tap a Mii to interact
      </div>

      {/* Centered member card — portalled to body to escape canvas stacking context */}
      {selectedMember && typeof document !== 'undefined' && createPortal(
        <MemberCard
          member={selectedMember}
          currentUid={currentUid}
          groupId={groupId}
          remainingGive={remainingGive}
          remainingTake={remainingTake}
          onClose={() => setSelectedMember(null)}
          onSubmitted={onPointsSubmitted}
        />,
        document.body
      )}
    </div>
  )
}
