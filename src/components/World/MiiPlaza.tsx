'use client'

import { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MiiCharacter, { type DragMode } from './MiiCharacter'
import { giveOrTakePoints } from '@/lib/firestore'
import type { GroupMember } from '@/lib/types'

// ─── Grass Floor ─────────────────────────────────────────────────────────────

const FSIZE      = 26
const PATCH_GRID = 16                               // 16×16 checker squares
const PATCH_W    = FSIZE / PATCH_GRID               // 1.625 per patch
const N_BLADES   = 3000                             // blades per patch (3D texture only)
const BLADE_H    = 0.16
const BLADE_W    = 0.022
const BLADES_EACH = (PATCH_GRID * PATCH_GRID / 2) * N_BLADES   // 5120

const LIGHT_COLOR = '#6dc957'
const DARK_COLOR  = '#246b24'

function makeBladeMat(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.85 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    mat.userData.shader = shader
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float h    = position.y / ${BLADE_H.toFixed(2)};
      float sway = h * sin(uTime * 1.35 + instanceMatrix[3][0] * 0.65 + instanceMatrix[3][2] * 0.52) * 0.04;
      transformed.x += sway;
      transformed.z += sway * 0.22;`,
    )
  }
  return mat
}

function GrassFloor() {
  const lightRef = useRef<THREE.InstancedMesh>(null)
  const darkRef  = useRef<THREE.InstancedMesh>(null)

  // Canvas-drawn checkerboard — solid full coverage, no gaps between blades
  const baseTex = useMemo(() => {
    const PX = 512, TILES = PATCH_GRID, TW = PX / TILES
    const cv  = document.createElement('canvas')
    cv.width  = PX; cv.height = PX
    const ctx = cv.getContext('2d')!
    for (let y = 0; y < TILES; y++)
      for (let x = 0; x < TILES; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? LIGHT_COLOR : DARK_COLOR
        ctx.fillRect(x * TW, y * TW, TW, TW)
      }
    return new THREE.CanvasTexture(cv)
  }, [])

  const bladeGeo = useMemo(() => {
    const geo   = new THREE.BufferGeometry()
    const verts = new Float32Array([
      -BLADE_W,  0,       0,
       BLADE_W,  0,       0,
       0,        BLADE_H, 0,
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  const lightMat = useMemo(() => makeBladeMat(LIGHT_COLOR), [])
  const darkMat  = useMemo(() => makeBladeMat(DARK_COLOR), [])

  useEffect(() => {
    const dummy = new THREE.Object3D()
    let li = 0, di = 0
    for (let ix = 0; ix < PATCH_GRID; ix++) {
      for (let iz = 0; iz < PATCH_GRID; iz++) {
        const cx      = -FSIZE / 2 + PATCH_W * ix + PATCH_W / 2
        const cz      = -FSIZE / 2 + PATCH_W * iz + PATCH_W / 2
        const isLight = (ix + iz) % 2 === 0
        const tiltX   = isLight ? -0.28 : 0.12
        const yawBase = isLight ? 0 : Math.PI / 2
        for (let b = 0; b < N_BLADES; b++) {
          const ox = (Math.random() - 0.5) * PATCH_W * 1.1
          const oz = (Math.random() - 0.5) * PATCH_W * 1.1
          dummy.position.set(cx + ox, 0, cz + oz)
          dummy.rotation.set(tiltX, yawBase + (Math.random() - 0.5) * 1.2, 0)
          dummy.scale.setScalar(0.80 + Math.random() * 0.45)
          dummy.updateMatrix()
          if (isLight) lightRef.current?.setMatrixAt(li++, dummy.matrix)
          else          darkRef.current?.setMatrixAt(di++, dummy.matrix)
        }
      }
    }
    if (lightRef.current) lightRef.current.instanceMatrix.needsUpdate = true
    if (darkRef.current)  darkRef.current.instanceMatrix.needsUpdate  = true
  }, [])

  useFrame((_, delta) => {
    const ls = lightMat.userData.shader
    const ds = darkMat.userData.shader
    if (ls) ls.uniforms.uTime.value += delta
    if (ds) ds.uniforms.uTime.value += delta
  })

  return (
    <group>
      {/* Solid checkerboard base — canvas texture guarantees full coverage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[FSIZE, FSIZE]} />
        <meshStandardMaterial map={baseTex} roughness={0.95} />
      </mesh>
      {/* Blade instances sit on top for 3D raised-grass texture */}
      <instancedMesh ref={lightRef} args={[bladeGeo, lightMat, BLADES_EACH]} frustumCulled={false} />
      <instancedMesh ref={darkRef}  args={[bladeGeo, darkMat,  BLADES_EACH]} frustumCulled={false} />
    </group>
  )
}

// ─── Camera Controller ────────────────────────────────────────────────────────

// Camera zooms in from behind/below looking slightly upward past the head,
// so the character sits in the lower frame and the card floats above them.
const ZOOM_OFFSET_Y    =  2.2   // camera height above ground
const ZOOM_OFFSET_Z    =  5.0   // camera distance behind character
const ZOOM_LOOKAT_Y    =  1.0   // look-at point (torso level)
const DEFAULT_CAM_POS  = new THREE.Vector3(0, 8, 12)
const DEFAULT_CAM_LOOK = new THREE.Vector3(0, 0.6, 0)

function CameraController({
  focusPos,
  orbitRef,
  onUnlock,
}: {
  focusPos: [number, number, number] | null
  orbitRef: React.RefObject<any>
  onUnlock: () => void
}) {
  const { camera } = useThree()
  const lookAt     = useRef(DEFAULT_CAM_LOOK.clone())
  const wasLocked  = useRef(false)
  const unlockSent = useRef(false)

  useFrame(() => {
    if (focusPos) {
      wasLocked.current  = true
      unlockSent.current = false
      const [fx, fy, fz] = focusPos
      const goal     = new THREE.Vector3(fx, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_Z)
      const lookGoal = new THREE.Vector3(fx, fy + ZOOM_LOOKAT_Y, fz)
      camera.position.lerp(goal, 0.07)
      lookAt.current.lerp(lookGoal, 0.07)
      camera.lookAt(lookAt.current)
    } else if (wasLocked.current) {
      camera.position.lerp(DEFAULT_CAM_POS, 0.06)
      lookAt.current.lerp(DEFAULT_CAM_LOOK, 0.06)
      camera.lookAt(lookAt.current)
      if (orbitRef.current) orbitRef.current.target.copy(lookAt.current)
      if (!unlockSent.current && camera.position.distanceTo(DEFAULT_CAM_POS) < 0.4) {
        unlockSent.current = true
        wasLocked.current  = false
        onUnlock()
      }
    }
  })

  return null
}

// ─── Member Card (DOM overlay) ────────────────────────────────────────────────

const EMOJIS = ['🎉','💪','🔥','⭐','👏','😤','💀','🙄','😂','❤️','🫡','💯','🤑','👀','🐐']

interface CardProps {
  member: GroupMember
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  onClose: () => void
  onSubmitted: (type: 'celebrate' | 'shame') => void
}

function MemberCard({ member, currentUid, groupId, remainingGive, remainingTake, onClose, onSubmitted }: CardProps) {
  const [mode, setMode]       = useState<'give' | 'take'>('give')
  const [points, setPoints]   = useState(0)
  const [emoji, setEmoji]     = useState('')
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const limit = mode === 'give' ? remainingGive : remainingTake
  const isOwn = member.uid === currentUid

  function switchMode(m: 'give' | 'take') { setMode(m); setPoints(0); setError('') }

  async function handleSubmit() {
    if (points <= 0)    { setError('Enter at least 1 point'); return }
    if (points > limit) { setError(`Only ${limit} pts left today`); return }
    setLoading(true); setError('')
    try {
      const fullReason = [emoji, reason.trim()].filter(Boolean).join(' ')
      await giveOrTakePoints(groupId, currentUid, [{
        toUid: member.uid,
        points: mode === 'give' ? points : -points,
        reason: fullReason,
      }])
      onSubmitted(mode === 'give' ? 'celebrate' : 'shame')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 20,
      padding: '16px 16px 18px',
      width: 230,
      boxShadow: '0 20px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#111', letterSpacing: -0.3 }}>{member.displayName}</div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>⭐ {member.totalPoints.toLocaleString()} pts</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: 0, marginTop: 1 }}
        >✕</button>
      </div>

      {isOwn ? (
        <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: '10px 0' }}>This is you!</div>
      ) : (
        <>
          {/* Give / Take toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3, marginBottom: 13 }}>
            {(['give', 'take'] as const).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                  background: mode === m ? (m === 'give' ? '#22c55e' : '#ef4444') : 'transparent',
                  color: mode === m ? '#fff' : '#888',
                }}
              >
                {m === 'give' ? 'GIVE' : 'TAKE'}
              </button>
            ))}
          </div>

          {/* Points stepper */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 13 }}>
            <button
              onClick={() => setPoints(p => Math.max(0, p - 1))}
              style={{
                width: 34, height: 34, borderRadius: '50%', border: '2px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}
            >−</button>
            <div style={{ textAlign: 'center', minWidth: 52 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#111', lineHeight: 1 }}>{points}</div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>{limit} left today</div>
            </div>
            <button
              onClick={() => setPoints(p => Math.min(limit, p + 1))}
              style={{
                width: 34, height: 34, borderRadius: '50%', border: '2px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}
            >+</button>
          </div>

          {/* Emoji reaction — single-select grid */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Reaction
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(prev => prev === e ? '' : e)}
                  style={{
                    background: emoji === e ? '#f0f0ff' : 'none',
                    border: emoji === e ? '2px solid #6366f1' : '2px solid transparent',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 18,
                    padding: '3px 4px',
                    lineHeight: 1,
                    transition: 'all 0.1s',
                  }}
                >{e}</button>
              ))}
            </div>
          </div>

          {/* Reason text input */}
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={mode === 'give' ? 'Why are you giving?' : 'Why are you taking?'}
            maxLength={100}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              padding: '8px 10px', fontSize: 12, color: '#111',
              outline: 'none', marginBottom: 11, fontFamily: 'inherit',
            }}
          />

          {error && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>{error}</div>}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || points <= 0}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              border: 'none', cursor: points > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: 13, color: '#fff',
              background: points > 0 ? (mode === 'give' ? '#22c55e' : '#ef4444') : '#d1d5db',
              transition: 'background 0.15s',
            }}
          >
            {loading ? '...' : mode === 'give' ? `Give ${points} pts` : `Take ${points} pts`}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Physics / drag constants ─────────────────────────────────────────────────

const HOLD_HEIGHT = 1.8
const GRAVITY     = 26
const FLING_MIN   = 4.0
const WALL_BOUND  = FSIZE / 2 - 0.5
const IMPACT_DAZE = 10
const IMPACT_MAD  = 4

interface PhysState {
  mode: DragMode
  pos: THREE.Vector3
  vel: THREE.Vector3
  modeTimer: number
  gentleDrop: boolean
}

// ─── Physics Updater ──────────────────────────────────────────────────────────

interface PhysicsUpdaterProps {
  draggingUid:    React.RefObject<string | null>
  dragCursor:     React.RefObject<THREE.Vector3>
  dragCursorVel:  React.RefObject<THREE.Vector3>
  charGroups:     React.RefObject<Map<string, THREE.Group>>
  physicsMap:     React.RefObject<Map<string, PhysState>>
  orbitRef:       React.RefObject<any>
  cameraLocked:   boolean
  setCharMode:    (uid: string, mode: DragMode | null) => void
}

function PhysicsUpdater({
  draggingUid, dragCursor, dragCursorVel,
  charGroups, physicsMap, orbitRef, cameraLocked, setCharMode,
}: PhysicsUpdaterProps) {
  const { pointer, camera } = useThree()
  const raycaster  = useMemo(() => new THREE.Raycaster(), [])
  const holdPlane  = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT), [])
  const prevCursor = useRef(new THREE.Vector3())
  const hitPoint   = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    // Update orbit enabled state
    if (orbitRef.current) {
      orbitRef.current.enabled = !draggingUid.current && !cameraLocked
    }

    // If dragging: raycast pointer to hold plane, compute smoothed velocity, move char
    if (draggingUid.current) {
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(holdPlane, hitPoint)) {
        // EMA smoothed velocity (0.6 old, 0.4 new)
        const rawVelX = (hitPoint.x - prevCursor.current.x) / delta
        const rawVelZ = (hitPoint.z - prevCursor.current.z) / delta
        dragCursorVel.current.x = dragCursorVel.current.x * 0.6 + rawVelX * 0.4
        dragCursorVel.current.z = dragCursorVel.current.z * 0.6 + rawVelZ * 0.4
        prevCursor.current.copy(hitPoint)
        dragCursor.current.copy(hitPoint)

        const phys = physicsMap.current.get(draggingUid.current)
        const group = charGroups.current.get(draggingUid.current)
        if (phys && group) {
          phys.pos.lerp(hitPoint, 0.14)
          group.position.copy(phys.pos)
        }
      }
    }

    // Tick physics states
    physicsMap.current.forEach((phys, uid) => {
      const group = charGroups.current.get(uid)
      if (!group) return

      if (phys.mode === 'flying') {
        // Ballistic integration
        phys.vel.y -= GRAVITY * delta
        phys.pos.addScaledVector(phys.vel, delta)

        // Wall collisions (x and z)
        if (Math.abs(phys.pos.x) > WALL_BOUND) {
          phys.pos.x = Math.sign(phys.pos.x) * WALL_BOUND
          phys.vel.x *= -0.1
          phys.vel.z *= 0.6
        }
        if (Math.abs(phys.pos.z) > WALL_BOUND) {
          phys.pos.z = Math.sign(phys.pos.z) * WALL_BOUND
          phys.vel.z *= -0.1
          phys.vel.x *= 0.6
        }

        // Ground collision
        if (phys.pos.y <= 0) {
          phys.pos.y = 0
          const impactSpeed = phys.vel.length()
          if (impactSpeed >= IMPACT_DAZE) {
            setCharMode(uid, 'dazed')
          } else if (impactSpeed >= IMPACT_MAD) {
            setCharMode(uid, 'mad')
          } else {
            setCharMode(uid, null)
          }
        }

        group.position.copy(phys.pos)
      } else if (phys.mode === 'dazed') {
        phys.modeTimer += delta
        if (phys.modeTimer >= 3.0) {
          setCharMode(uid, 'waking')
        }
      } else if (phys.mode === 'waking') {
        phys.modeTimer += delta
        if (phys.modeTimer >= 1.5) {
          setCharMode(uid, null)
        }
      } else if (phys.mode === 'mad') {
        phys.modeTimer += delta
        if (phys.modeTimer >= 2.5) {
          setCharMode(uid, null)
        }
      }
    })
  })

  return null
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

// ─── Sky / Clouds ────────────────────────────────────────────────────────────

const CLOUD_DEFS: { pos: [number, number, number]; scale: number }[] = [
  { pos: [-9, 9.5, -10], scale: 1.0 },
  { pos: [  6, 11,  -13], scale: 1.3 },
  { pos: [ -3, 10,  -16], scale: 0.85 },
  { pos: [ 10,  9,   -8], scale: 0.7 },
  { pos: [ -7, 12,  -20], scale: 1.15 },
  { pos: [  1, 10.5, -6], scale: 0.65 },
]

const PUFF_OFFSETS: [number, number, number][] = [
  [0, 0, 0],
  [0.9, -0.15, 0.1],
  [-0.85, -0.1, 0.05],
  [0.4, 0.4, -0.1],
  [-0.4, 0.35, 0.1],
  [0, 0, 0.7],
]
const PUFF_SIZES = [0.9, 0.7, 0.65, 0.6, 0.55, 0.55]

const cloudGeo = new THREE.SphereGeometry(1, 7, 5)
const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 })

function CloudGroup({ pos, scale }: { pos: [number, number, number]; scale: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const offset   = useRef(Math.random() * Math.PI * 2)
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.position.x = pos[0] + Math.sin(clock.elapsedTime * 0.04 + offset.current) * 1.5
  })
  return (
    <group ref={groupRef} position={pos}>
      {PUFF_OFFSETS.map((off, i) => (
        <mesh
          key={i}
          geometry={cloudGeo}
          material={cloudMat}
          position={[off[0] * scale, off[1] * scale, off[2] * scale]}
          scale={PUFF_SIZES[i] * scale}
        />
      ))}
    </group>
  )
}

function Clouds() {
  return (
    <>
      {CLOUD_DEFS.map((c, i) => (
        <CloudGroup key={i} pos={c.pos} scale={c.scale} />
      ))}
    </>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────

function Scene({
  members,
  selectedUid,
  focusPos,
  cameraLocked,
  onUnlock,
  onSelect,
  animatingUid,
  animationType,
}: {
  members: GroupMember[]
  selectedUid: string | null
  focusPos: [number, number, number] | null
  cameraLocked: boolean
  onUnlock: () => void
  onSelect: (member: GroupMember, pos: [number, number, number]) => void
  animatingUid: string | null
  animationType: 'celebrate' | 'shame' | null
}) {
  const orbitRef = useRef<any>(null)
  const { gl }   = useThree()

  const charGroups    = useRef<Map<string, THREE.Group>>(new Map())
  const physicsMap    = useRef<Map<string, PhysState>>(new Map())
  const draggingUid   = useRef<string | null>(null)
  const pendingPickup = useRef<{ uid: string; member: GroupMember; pos: [number, number, number] } | null>(null)
  const holdTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragCursor    = useRef(new THREE.Vector3())
  const dragCursorVel = useRef(new THREE.Vector3())
  const [dragModeMap, setDragModeMap] = useState<Map<string, DragMode>>(new Map())

  const positions = useMemo<[number, number, number][]>(() => {
    return members.map((_, i) => {
      const angle  = (i / Math.max(members.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.2
      const radius = 1.2 + Math.random() * 3.5
      return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
    })
  }, [members.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const setCharMode = useCallback((uid: string, mode: DragMode | null) => {
    const existing = physicsMap.current.get(uid)
    if (mode === null) {
      physicsMap.current.delete(uid)
      setDragModeMap(prev => {
        const next = new Map(prev)
        next.delete(uid)
        return next
      })
    } else {
      const pos = existing?.pos ?? (charGroups.current.get(uid)?.position.clone() ?? new THREE.Vector3())
      const vel = existing?.vel ?? new THREE.Vector3()
      physicsMap.current.set(uid, {
        mode,
        pos,
        vel,
        modeTimer: 0,
        gentleDrop: false,
      })
      setDragModeMap(prev => {
        const next = new Map(prev)
        next.set(uid, mode)
        return next
      })
    }
  }, [])

  const handlePickupStart = useCallback((member: GroupMember) => {
    if (cameraLocked || draggingUid.current) return

    // Always use the character's live position, not the stale spawn position
    const group = charGroups.current.get(member.uid)
    const pos: [number, number, number] = group
      ? [group.position.x, group.position.y, group.position.z]
      : [0, 0, 0]

    pendingPickup.current = { uid: member.uid, member, pos }

    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      const pickup = pendingPickup.current
      if (!pickup) return
      pendingPickup.current = null

      const group = charGroups.current.get(pickup.uid)
      const startPos = group
        ? group.position.clone().setY(HOLD_HEIGHT)
        : new THREE.Vector3(pos[0], HOLD_HEIGHT, pos[2])

      dragCursorVel.current.set(0, 0, 0)
      dragCursor.current.copy(startPos)

      physicsMap.current.set(pickup.uid, {
        mode: 'held',
        pos: startPos,
        vel: new THREE.Vector3(),
        modeTimer: 0,
        gentleDrop: false,
      })
      draggingUid.current = pickup.uid

      setDragModeMap(prev => {
        const next = new Map(prev)
        next.set(pickup.uid, 'held')
        return next
      })
    }, 250)
  }, [cameraLocked])

  const handlePointerUp = useCallback(() => {
    // Clear pending hold timer
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }

    // Quick tap: pendingPickup still set means the 250ms hold never fired
    if (pendingPickup.current) {
      const { member, pos } = pendingPickup.current
      pendingPickup.current = null
      onSelect(member, pos)
      return
    }

    // Release a held character
    if (draggingUid.current) {
      const uid   = draggingUid.current
      const speed = dragCursorVel.current.length()

      if (speed >= FLING_MIN) {
        // Fling: launch with cursor velocity + upward arc
        const phys = physicsMap.current.get(uid)
        if (phys) {
          phys.vel.set(
            dragCursorVel.current.x,
            Math.max(2, speed * 0.22),
            dragCursorVel.current.z,
          )
          phys.mode = 'flying'
          setDragModeMap(prev => {
            const next = new Map(prev)
            next.set(uid, 'flying')
            return next
          })
        }
      } else {
        // Gentle drop — return to normal
        const phys = physicsMap.current.get(uid)
        if (phys) {
          phys.gentleDrop = true
          // Drop to ground gently
          phys.vel.set(0, -2, 0)
          phys.mode = 'flying'
          setDragModeMap(prev => {
            const next = new Map(prev)
            next.set(uid, 'flying')
            return next
          })
        }
      }

      draggingUid.current = null
    }
  }, [onSelect])

  // Register pointerup on canvas domElement
  useEffect(() => {
    gl.domElement.addEventListener('pointerup', handlePointerUp)
    return () => gl.domElement.removeEventListener('pointerup', handlePointerUp)
  }, [gl.domElement, handlePointerUp])

  return (
    <>
      <color attach="background" args={['#a8d8f0']} />
      <CameraController focusPos={focusPos} orbitRef={orbitRef} onUnlock={onUnlock} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <Clouds />
      <GrassFloor />
      {members.map((member, i) => (
        <MiiCharacter
          key={member.uid}
          member={member}
          initialPosition={positions[i]}
          bounds={5.5}
          isSelected={selectedUid === member.uid}
          onSelect={onSelect}
          celebrationType={member.uid === animatingUid ? animationType : null}
          dragMode={dragModeMap.get(member.uid) ?? null}
          onPickupStart={() => handlePickupStart(member)}
          onGroupMount={(uid, g) => {
            if (g) charGroups.current.set(uid, g)
            else   charGroups.current.delete(uid)
          }}
        />
      ))}
      <PhysicsUpdater
        draggingUid={draggingUid}
        dragCursor={dragCursor}
        dragCursorVel={dragCursorVel}
        charGroups={charGroups}
        physicsMap={physicsMap}
        orbitRef={orbitRef}
        cameraLocked={cameraLocked}
        setCharMode={setCharMode}
      />
      <OrbitControls
        ref={orbitRef}
        enabled={!cameraLocked}
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
  members, currentUid, groupId, remainingGive, remainingTake, onPointsSubmitted,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const animTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null)
  const [focusPos, setFocusPos]             = useState<[number, number, number] | null>(null)
  const [cameraLocked, setCameraLocked]     = useState(false)
  const [headScreenY, setHeadScreenY]       = useState<number>(0)
  const [animatingUid, setAnimatingUid]     = useState<string | null>(null)
  const [animationType, setAnimationType]   = useState<'celebrate' | 'shame' | null>(null)

  useEffect(() => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current) }, [])

  function handleSelect(member: GroupMember, pos: [number, number, number]) {
    const [fx, fy, fz] = pos
    const container = containerRef.current
    if (container) {
      const w = container.clientWidth
      const h = container.clientHeight
      // Project where the character's head will appear once the camera settles
      const tempCam = new THREE.PerspectiveCamera(48, w / h, 0.1, 100)
      tempCam.position.set(fx, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_Z)
      tempCam.lookAt(fx, fy + ZOOM_LOOKAT_Y, fz)
      tempCam.updateMatrixWorld()
      const headNDC = new THREE.Vector3(fx, fy + 1.8, fz).project(tempCam)
      // NDC y: 1 = top, -1 = bottom  →  screen y: 0 = top
      setHeadScreenY(((1 - headNDC.y) / 2) * h)
    }
    setSelectedMember(member)
    setFocusPos(pos)
    setCameraLocked(true)
  }

  function handleClose() {
    setSelectedMember(null)
    setFocusPos(null)
    // cameraLocked stays true until CameraController lerps back and calls onUnlock
  }

  // card top aligns ~40px above the projected head, shifted right of the character
  const cardTop = Math.max(16, headScreenY - 40)

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 'calc(100dvh - 160px)',
        minHeight: 400,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        background: '#a8d8f0',
      }}
    >
      <Canvas
        camera={{ position: [0, 8, 12], fov: 48 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => { if (selectedMember) handleClose() }}
      >
        <Suspense fallback={null}>
          <Scene
            members={members}
            selectedUid={selectedMember?.uid ?? null}
            focusPos={focusPos}
            cameraLocked={cameraLocked}
            onUnlock={() => setCameraLocked(false)}
            onSelect={handleSelect}
            animatingUid={animatingUid}
            animationType={animationType}
          />
        </Suspense>
      </Canvas>

      {/* Member card — right of character, vertically aligned to head level */}
      {selectedMember && (
        <div style={{
          position: 'absolute',
          left: 'calc(50% + 150px)',
          top: cardTop,
          zIndex: 10,
          pointerEvents: 'auto',
        }}>
          <MemberCard
            member={selectedMember}
            currentUid={currentUid}
            groupId={groupId}
            remainingGive={remainingGive}
            remainingTake={remainingTake}
            onClose={handleClose}
            onSubmitted={(type) => {
              onPointsSubmitted()
              const uid = selectedMember!.uid
              handleClose()
              if (animTimerRef.current) clearTimeout(animTimerRef.current)
              setAnimatingUid(uid)
              setAnimationType(type)
              animTimerRef.current = setTimeout(() => {
                setAnimatingUid(null)
                setAnimationType(null)
              }, type === 'celebrate' ? 3500 : 4200)
            }}
          />
        </div>
      )}

      {/* Hint */}
      {!selectedMember && (
        <div style={{
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
        }}>
          Hold to carry · Drag to rotate · Scroll to zoom · Tap a Mii to interact
        </div>
      )}
    </div>
  )
}
