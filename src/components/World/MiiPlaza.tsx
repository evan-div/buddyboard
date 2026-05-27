'use client'

import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MiiCharacter from './MiiCharacter'
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

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

function Scene({
  members,
  selectedUid,
  onSelect,
  onDeselect,
  currentUid,
  groupId,
  remainingGive,
  remainingTake,
  onPointsSubmitted,
}: {
  members: GroupMember[]
  selectedUid: string | null
  onSelect: (member: GroupMember) => void
  onDeselect: () => void
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onPointsSubmitted: () => void
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
          onDeselect={onDeselect}
          currentUid={currentUid}
          groupId={groupId}
          remainingGive={remainingGive}
          remainingTake={remainingTake}
          onPointsSubmitted={onPointsSubmitted}
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
            onDeselect={() => setSelectedMember(null)}
            currentUid={currentUid}
            groupId={groupId}
            remainingGive={remainingGive}
            remainingTake={remainingTake}
            onPointsSubmitted={onPointsSubmitted}
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
    </div>
  )
}
