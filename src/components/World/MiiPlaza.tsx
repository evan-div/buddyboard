'use client'

import { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import MiiCharacter, { type DragMode } from './MiiCharacter'
import { giveOrTakePoints, updateUserAvatar, updateMemberAvatar, getTransactionsSince } from '@/lib/firestore'
import { subscribeToCases } from '@/lib/appeals'
import { SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, SHOES_COLORS } from '@/lib/avatarDefaults'
import type { GroupMember, AvatarConfig, PlazaPreset, Transaction, CourtCase } from '@/lib/types'

const DEFAULT_PRESETS: PlazaPreset[] = [
  // GIVE
  { id: 'g1',  emoji: '🛁',  label: 'Cleaned bathroom',          points:  15 },
  { id: 'g2',  emoji: '🧹',  label: 'Wiped counters',            points:   5 },
  { id: 'g3',  emoji: '🕯️', label: 'Bought a candle',           points:  20 },
  { id: 'g4',  emoji: '🧻',  label: 'Bought paper towels/TP',    points:  30 },
  { id: 'g5',  emoji: '🧽',  label: 'Cleaned floors',            points:  10 },
  { id: 'g6',  emoji: '🥗',  label: 'Meal prepped',              points:  10 },
  { id: 'g7',  emoji: '🏋️', label: 'Went to gym',               points:   5 },
  { id: 'g8',  emoji: '🚗',  label: 'Drove to a location',       points:   7 },
  { id: 'g9',  emoji: '🥤',  label: 'Bought a drink',            points:  10 },
  { id: 'g10', emoji: '🔋',  label: 'Lent a charger',            points:   5 },
  { id: 'g11', emoji: '🍳',  label: 'Made group dinner',         points:  30 },
  { id: 'g12', emoji: '⛽',  label: 'Gave gas money',            points:  25 },
  { id: 'g13', emoji: '🙏',  label: 'Saved someone a trip',      points:  15 },
  { id: 'g14', emoji: '🧘',  label: 'Stretched before activity', points:   5 },
  // TAKE
  { id: 't1',  emoji: '🍽️', label: "Didn't do dishes",          points: -10 },
  { id: 't2',  emoji: '🗑️', label: 'Left a mess in living area', points: -10 },
  { id: 't3',  emoji: '💩',  label: 'Blew up bathroom',          points:  -2 },
  { id: 't4',  emoji: '💡',  label: 'Left the lights on',        points:  -5 },
  { id: 't5',  emoji: '🍔',  label: 'Ate fast-food',             points:  -5 },
  { id: 't6',  emoji: '🔊',  label: 'Came in late and was loud', points: -10 },
  { id: 't7',  emoji: '🤢',  label: 'Let food go bad',           points:  -5 },
  { id: 't8',  emoji: '🚙',  label: 'Parked like an asshole',    points:  -5 },
  { id: 't9',  emoji: '😴',  label: 'Napped past 4pm',           points:  -2 },
  { id: 't10', emoji: '⛪',  label: "Didn't go to church",       points: -10 },
  { id: 't11', emoji: '🥷',  label: 'Stole food',                points: -20 },
]

// ─── Grass Floor ─────────────────────────────────────────────────────────────

const FSIZE      = 26
const PATCH_GRID = 10                               // 10×10 checker squares
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[FSIZE, FSIZE]} />
        <meshStandardMaterial map={baseTex} roughness={0.95} />
      </mesh>
      {/* Blade instances sit on top for 3D raised-grass texture */}
      <instancedMesh ref={lightRef} args={[bladeGeo, lightMat, BLADES_EACH]} frustumCulled={false} />
      <instancedMesh ref={darkRef}  args={[bladeGeo, darkMat,  BLADES_EACH]} frustumCulled={false} />
      {/* Spire — single deep column, bottom well beyond any camera angle */}
      <mesh position={[0, -75, 0]}>
        <boxGeometry args={[FSIZE, 150, FSIZE]} />
        <meshStandardMaterial color="#6B4226" roughness={0.95} />
      </mesh>
    </group>
  )
}

// ─── Camera Controller ────────────────────────────────────────────────────────

// True 45° isometric default view — equal X and Z so the plaza reads as a diamond.
// Zoom-in pulls the camera diagonally toward the character from the same angle.
const ZOOM_OFFSET_Y    =  3.5   // camera height above character when zoomed
const ZOOM_OFFSET_XZ   =  3.5   // equal X and Z diagonal offset when zoomed
const ZOOM_LOOKAT_Y    =  1.0   // look-at point (torso level)
const DEFAULT_CAM_POS  = new THREE.Vector3(8, 6, 8)
const DEFAULT_CAM_LOOK = new THREE.Vector3(0, 0.6, 0)

function CameraController({
  focusPos,
  orbitRef,
  onUnlock,
  mobile,
}: {
  focusPos: [number, number, number] | null
  orbitRef: React.RefObject<any>
  onUnlock: () => void
  mobile: boolean
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
      // On mobile the bottom sheet covers ~44% of screen; look below the Mii's
      // feet so the character appears in the upper portion of the visible area.
      const lookatY = mobile ? -0.8 : ZOOM_LOOKAT_Y
      const goal     = new THREE.Vector3(fx + ZOOM_OFFSET_XZ, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_XZ)
      const lookGoal = new THREE.Vector3(fx, fy + lookatY, fz)
      camera.position.lerp(goal, 0.07)
      lookAt.current.lerp(lookGoal, 0.07)
      camera.lookAt(lookAt.current)
    } else if (wasLocked.current) {
      camera.position.lerp(DEFAULT_CAM_POS, 0.06)
      lookAt.current.lerp(DEFAULT_CAM_LOOK, 0.06)
      camera.lookAt(lookAt.current)
      if (orbitRef.current) orbitRef.current.target.copy(lookAt.current)
      if (!unlockSent.current && camera.position.distanceTo(DEFAULT_CAM_POS) < 0.4) {
        // Snap exactly to default and force OrbitControls to re-sync from here,
        // so any rotation the user did before zooming in doesn't persist.
        camera.position.copy(DEFAULT_CAM_POS)
        lookAt.current.copy(DEFAULT_CAM_LOOK)
        camera.lookAt(lookAt.current)
        if (orbitRef.current) {
          orbitRef.current.target.copy(DEFAULT_CAM_LOOK)
          orbitRef.current.update()
        }
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

const PAGE_SIZE = 9

interface CardProps {
  member: GroupMember
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  isChief?: boolean
  presets?: PlazaPreset[]
  mobile?: boolean
  onClose: () => void
  onSubmitted: (type: 'celebrate' | 'shame') => void
}

function StatsView({ member, groupId, onBack }: { member: GroupMember; groupId: string; onBack: () => void }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [cases, setCases] = useState<CourtCase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    getTransactionsSince(groupId, thirtyDaysAgo)
      .then((all) => { setTxns(all); setLoading(false) })
      .catch(() => setLoading(false))
    const unsub = subscribeToCases(groupId, setCases)
    return unsub
  }, [groupId])

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const ptsWeek  = txns.filter((t) => t.toUid === member.uid && t.createdAt >= sevenDaysAgo).reduce((s, t) => s + t.points, 0)
  const ptsMonth = txns.filter((t) => t.toUid === member.uid).reduce((s, t) => s + t.points, 0)
  const totalGiven    = txns.filter((t) => t.fromUid === member.uid).reduce((s, t) => s + Math.abs(t.points), 0)
  const totalReceived = txns.filter((t) => t.toUid === member.uid && t.points > 0).reduce((s, t) => s + t.points, 0)

  const memberCases = cases.filter((c) => c.defendantUid === member.uid || c.accuserUid === member.uid)
  const courtWins  = memberCases.filter((c) => {
    if (c.status === 'resolved_innocent' && c.defendantUid === member.uid) return true
    if (c.status === 'resolved_guilty'   && c.accuserUid  === member.uid) return true
    if (c.status === 'accepted'          && c.defendantUid === member.uid) return true
    return false
  }).length
  const courtTotal = memberCases.filter((c) => ['resolved_innocent','resolved_guilty','accepted'].includes(c.status)).length

  const reasonFreq: Record<string, number> = {}
  txns.filter((t) => t.fromUid === member.uid && t.reason).forEach((t) => {
    reasonFreq[t.reason] = (reasonFreq[t.reason] ?? 0) + 1
  })
  const topReason = Object.entries(reasonFreq).sort((a, b) => b[1] - a[1])[0]?.[0]

  function statRow(label: string, value: string, color = '#111') {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
      </div>
    )
  }

  return (
    <div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
      ) : (
        <div>
          {statRow('Pts this week', ptsWeek >= 0 ? `+${ptsWeek}` : String(ptsWeek), ptsWeek > 0 ? '#16a34a' : ptsWeek < 0 ? '#dc2626' : '#6b7280')}
          {statRow('Pts this month', ptsMonth >= 0 ? `+${ptsMonth}` : String(ptsMonth), ptsMonth > 0 ? '#16a34a' : ptsMonth < 0 ? '#dc2626' : '#6b7280')}
          {statRow('Total given (30d)', String(totalGiven))}
          {statRow('Total received (30d)', String(totalReceived))}
          {statRow('Court record', courtTotal > 0 ? `${courtWins}W / ${courtTotal - courtWins}L` : '—')}
          {(member.currentStreak ?? 0) > 0 && statRow('🔥 Streak', `${member.currentStreak} day${(member.currentStreak ?? 1) !== 1 ? 's' : ''}`)}
          {(member.longestStreak ?? 0) > 0 && statRow('Best streak', `${member.longestStreak} days`)}
          {topReason && (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: 10, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Top reason given</div>
              <div style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>{topReason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemberCard({ member, currentUid, groupId, remainingGive, remainingTake, presets, mobile, onClose, onSubmitted }: CardProps) {
  const [view, setView]       = useState<'presets' | 'confirm' | 'custom' | 'stats'>('presets')
  const [mode, setMode]       = useState<'give' | 'take'>('give')
  const [page, setPage]       = useState(0)
  const [selected, setSelected] = useState<PlazaPreset | null>(null)
  const [points, setPoints]   = useState(0)
  const [emoji, setEmoji]     = useState('')
  const [reason, setReason]   = useState('')
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const allPresets   = presets?.length ? presets : DEFAULT_PRESETS
  const modePresets  = allPresets.filter(p => mode === 'give' ? p.points > 0 : p.points < 0)
  const totalPages   = Math.ceil(modePresets.length / PAGE_SIZE)
  const pagePresets  = modePresets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const limit        = mode === 'give' ? remainingGive : remainingTake
  const isOwn        = member.uid === currentUid

  function switchMode(m: 'give' | 'take') { setMode(m); setPage(0); setError('') }

  function selectPreset(p: PlazaPreset) { setSelected(p); setView('confirm') }

  async function confirmPreset() {
    if (!selected) return
    setLoading(true)
    try {
      await giveOrTakePoints(groupId, currentUid, [{
        toUid: member.uid,
        points: selected.points,
        reason: `${selected.emoji} ${selected.label}`,
      }])
      onSubmitted(selected.points > 0 ? 'celebrate' : 'shame')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setView('presets')
    } finally {
      setLoading(false)
    }
  }

  async function handleCustomSubmit() {
    if (points <= 0)    { setError('Enter at least 1 point'); return }
    if (points > limit) { setError(`Only ${limit} pts left today`); return }
    setLoading(true); setError('')
    try {
      const fullReason = [emoji, reason.trim()].filter(Boolean).join(' ')
      const alloc: import('@/lib/types').PointsAllocation = {
        toUid: member.uid,
        points: mode === 'give' ? points : -points,
        reason: fullReason,
      }
      if (caption.trim()) alloc.caption = caption.trim()
      await giveOrTakePoints(groupId, currentUid, [alloc])
      onSubmitted(mode === 'give' ? 'celebrate' : 'shame')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const toggleStyle = (m: 'give' | 'take'): React.CSSProperties => ({
    flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
    background: mode === m ? (m === 'give' ? '#22c55e' : '#ef4444') : 'transparent',
    color: mode === m ? '#fff' : '#888',
  })

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: mobile ? '20px 20px 0 0' : 20,
      padding: mobile ? '8px 16px 28px' : '16px 16px 18px',
      width: mobile ? '100%' : 270,
      boxSizing: 'border-box',
      maxHeight: mobile ? '44vh' : 'none',
      overflowY: mobile ? 'auto' : 'visible',
      boxShadow: '0 -4px 32px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.12)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {mobile && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          {(view === 'custom' || view === 'stats') && (
            <button
              onClick={() => { setView('presets'); setError('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 12, fontWeight: 700, padding: 0, display: 'block', marginBottom: 2 }}
            >← Back</button>
          )}
          <div style={{ fontWeight: 800, fontSize: 15, color: '#111', letterSpacing: -0.3 }}>{member.displayName}</div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⭐ {member.totalPoints.toLocaleString()} pts
            {!isOwn && view !== 'stats' && (
              <button
                onClick={() => setView('stats')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, fontWeight: 700, padding: 0 }}
              >📊 Stats</button>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: 0, marginTop: 1 }}>✕</button>
      </div>

      {isOwn ? (
        <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: '10px 0' }}>This is you!</div>

      ) : view === 'presets' ? (
        <>
          {/* GIVE / TAKE toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3, marginBottom: 12 }}>
            {(['give', 'take'] as const).map(m => (
              <button key={m} onClick={() => switchMode(m)} style={toggleStyle(m)}>
                {m === 'give' ? 'GIVE' : 'TAKE'}
              </button>
            ))}
          </div>

          {/* 3×3 preset grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 10 }}>
            {pagePresets.map(p => (
              <button
                key={p.id}
                onClick={() => selectPreset(p)}
                style={{
                  background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12,
                  padding: '9px 4px 7px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  transition: 'all 0.1s',
                }}
              >
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <span style={{ fontSize: 9, color: '#555', fontWeight: 600, textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>{p.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: p.points > 0 ? '#16a34a' : '#dc2626' }}>
                  {p.points > 0 ? `+${p.points}` : p.points}
                </span>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#ccc' : '#6366f1', fontSize: 20, lineHeight: 1, padding: 0 }}
              >‹</button>
              <span style={{ fontSize: 11, color: '#999', fontWeight: 600 }}>{page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                style={{ background: 'none', border: 'none', cursor: page === totalPages - 1 ? 'default' : 'pointer', color: page === totalPages - 1 ? '#ccc' : '#6366f1', fontSize: 20, lineHeight: 1, padding: 0 }}
              >›</button>
            </div>
          )}

          {/* Custom button */}
          <button
            onClick={() => { setView('custom'); setPoints(0); setEmoji(''); setReason(''); setCaption(''); setError('') }}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 12,
              border: '1.5px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', color: '#6366f1', fontWeight: 700, fontSize: 13,
            }}
          >CUSTOM</button>
        </>

      ) : view === 'stats' ? (
        <StatsView member={member} groupId={groupId} onBack={() => setView('presets')} />

      ) : view === 'confirm' ? (
        <>
          {/* Confirm step */}
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>{selected?.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 6 }}>{selected?.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: (selected?.points ?? 0) > 0 ? '#16a34a' : '#dc2626', marginBottom: 6 }}>
              {(selected?.points ?? 0) > 0 ? `+${selected?.points}` : selected?.points} pts
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>to {member.displayName}</div>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setView('presets'); setError('') }}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 12,
                border: '1.5px solid #e5e7eb', background: '#fff',
                cursor: 'pointer', color: '#555', fontWeight: 700, fontSize: 13,
              }}
            >Cancel</button>
            <button
              onClick={confirmPreset}
              disabled={loading}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
                cursor: loading ? 'default' : 'pointer', color: '#fff', fontWeight: 800, fontSize: 13,
                background: (selected?.points ?? 0) > 0 ? '#22c55e' : '#ef4444',
                opacity: loading ? 0.7 : 1,
              }}
            >{loading ? '…' : 'Confirm'}</button>
          </div>
        </>

      ) : (
        /* Custom view */
        <>
          {/* GIVE / TAKE toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3, marginBottom: 13 }}>
            {(['give', 'take'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setPoints(0); setError('') }} style={toggleStyle(m)}>
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

          {/* Emoji reaction */}
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
                    borderRadius: 8, cursor: 'pointer', fontSize: 18,
                    padding: '3px 4px', lineHeight: 1, transition: 'all 0.1s',
                  }}
                >{e}</button>
              ))}
            </div>
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
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              padding: '8px 10px', fontSize: 12, color: '#111',
              outline: 'none', marginBottom: 7, fontFamily: 'inherit',
            }}
          />

          {/* Caption (optional clap-back) */}
          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Add a clap-back… (optional)"
            maxLength={120}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              padding: '8px 10px', fontSize: 11, color: '#6b7280',
              outline: 'none', marginBottom: 11, fontFamily: 'inherit',
              fontStyle: 'italic',
            }}
          />

          {error && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>{error}</div>}

          <button
            onClick={handleCustomSubmit}
            disabled={loading || points <= 0}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
              cursor: points > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 800, fontSize: 13, color: '#fff',
              background: points > 0 ? (mode === 'give' ? '#22c55e' : '#ef4444') : '#d1d5db',
              transition: 'background 0.15s',
            }}
          >
            {loading ? '…' : mode === 'give' ? `Give ${points} pts` : `Take ${points} pts`}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Self Card (own character customization) ──────────────────────────────────

const HAIR_STYLE_OPTIONS: { value: AvatarConfig['hairStyle']; label: string }[] = [
  { value: 'bald',     label: 'Bald'     },
  { value: 'short',    label: 'Short'    },
  { value: 'medium',   label: 'Med'      },
  { value: 'long',     label: 'Long'     },
  { value: 'curly',    label: 'Curly'    },
  { value: 'wavy',     label: 'Wavy'     },
  { value: 'mohawk',   label: 'Mohawk'   },
  { value: 'ponytail', label: 'Ponytail' },
]

const ACCESSORY_OPTIONS: { value: AvatarConfig['accessory']; label: string }[] = [
  { value: 'none',       label: 'None'    },
  { value: 'glasses',    label: 'Glasses' },
  { value: 'sunglasses', label: 'Shades'  },
  { value: 'hat',        label: 'Hat'     },
  { value: 'crown',      label: 'Crown'   },
  { value: 'headband',   label: 'Headband'},
]

function SwatchBtn({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 24, height: 24, borderRadius: '50%', background: color,
      border: 'none', cursor: 'pointer',
      outline: selected ? '3px solid #6366f1' : '2px solid transparent',
      outlineOffset: 2,
      transform: selected ? 'scale(1.18)' : 'scale(1)',
      transition: 'all 0.1s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
    }} />
  )
}

function PillBtn({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      background: selected ? '#6366f1' : '#f3f4f6',
      color: selected ? '#fff' : '#555',
      transition: 'all 0.1s',
    }}>{label}</button>
  )
}

function SelfCard({ member, groupId, mobile, onClose, onAvatarUpdated }: {
  member: GroupMember
  groupId: string
  mobile?: boolean
  onClose: () => void
  onAvatarUpdated?: () => void
}) {
  const [draft, setDraft] = useState<AvatarConfig>(() => ({ ...member.avatar }))
  const [tab, setTab]     = useState<'look' | 'shirt' | 'pants' | 'shoes' | 'extras'>('look')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(member.avatar)

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        updateUserAvatar(member.uid, draft),
        updateMemberAvatar(groupId, member.uid, draft),
      ])
      onAvatarUpdated?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save avatar:', e)
    } finally {
      setSaving(false)
    }
  }

  const sLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7,
  }
  const swatchRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }

  return (
    <div style={{
      background: '#fff',
      borderRadius: mobile ? '20px 20px 0 0' : 20,
      padding: mobile ? '8px 16px 28px' : '16px 16px 18px',
      width: mobile ? '100%' : 270,
      boxSizing: 'border-box',
      maxHeight: mobile ? '44vh' : 'none',
      overflowY: mobile ? 'auto' : 'visible',
      boxShadow: '0 -4px 32px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.12)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {mobile && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#111', letterSpacing: -0.3 }}>{member.displayName}</div>
          <div style={{ fontSize: 11, color: '#6366f1', marginTop: 2, fontWeight: 600 }}>Customize your look</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: 0, marginTop: 1 }}>✕</button>
      </div>

      {/* Tab bar — 5 tabs */}
      <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 2, marginBottom: 14 }}>
        {(['look', 'shirt', 'pants', 'shoes', 'extras'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '5px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 10,
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? '#6366f1' : '#888',
            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.12s',
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Look: skin tone + hair style + hair color */}
      {tab === 'look' && (
        <div>
          <div style={sLabel}>Skin Tone</div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            {(Object.entries(SKIN_TONES) as [AvatarConfig['skinTone'], string][]).map(([key, hex]) => (
              <SwatchBtn key={key} color={hex} selected={draft.skinTone === key}
                onClick={() => setDraft(d => ({ ...d, skinTone: key }))} />
            ))}
          </div>
          <div style={sLabel}>Hair Style</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {HAIR_STYLE_OPTIONS.map(({ value, label }) => (
              <PillBtn key={value} label={label} selected={draft.hairStyle === value}
                onClick={() => setDraft(d => ({ ...d, hairStyle: value }))} />
            ))}
          </div>
          <div style={sLabel}>Hair Color</div>
          <div style={swatchRow}>
            {HAIR_COLORS.map(hex => (
              <SwatchBtn key={hex} color={hex} selected={draft.hairColor === hex}
                onClick={() => setDraft(d => ({ ...d, hairColor: hex }))} />
            ))}
          </div>
        </div>
      )}

      {/* Shirt */}
      {tab === 'shirt' && (
        <div>
          <div style={sLabel}>Shirt Color</div>
          <div style={swatchRow}>
            {SHIRT_COLORS.map(hex => (
              <SwatchBtn key={hex} color={hex} selected={draft.shirtColor === hex}
                onClick={() => setDraft(d => ({ ...d, shirtColor: hex }))} />
            ))}
          </div>
        </div>
      )}

      {/* Pants */}
      {tab === 'pants' && (
        <div>
          <div style={sLabel}>Pants Color</div>
          <div style={swatchRow}>
            {PANTS_COLORS.map(hex => (
              <SwatchBtn key={hex} color={hex} selected={(draft.pantsColor ?? '#1e293b') === hex}
                onClick={() => setDraft(d => ({ ...d, pantsColor: hex }))} />
            ))}
          </div>
        </div>
      )}

      {/* Shoes */}
      {tab === 'shoes' && (
        <div>
          <div style={sLabel}>Shoes Color</div>
          <div style={swatchRow}>
            {SHOES_COLORS.map(hex => (
              <SwatchBtn key={hex} color={hex} selected={(draft.shoesColor ?? '#111827') === hex}
                onClick={() => setDraft(d => ({ ...d, shoesColor: hex }))} />
            ))}
          </div>
        </div>
      )}

      {/* Extras: accessory */}
      {tab === 'extras' && (
        <div>
          <div style={sLabel}>Accessory</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ACCESSORY_OPTIONS.map(({ value, label }) => (
              <PillBtn key={value} label={label} selected={draft.accessory === value}
                onClick={() => setDraft(d => ({ ...d, accessory: value }))} />
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving || !dirty || saved} style={{
        width: '100%', padding: '11px 0', borderRadius: 12,
        border: 'none', cursor: dirty && !saving && !saved ? 'pointer' : 'default',
        fontWeight: 800, fontSize: 13, color: '#fff', marginTop: 14,
        background: saved ? '#22c55e' : dirty ? '#6366f1' : '#d1d5db',
        transition: 'background 0.15s',
      }}>
        {saved ? '✓ Saved!' : saving ? 'Saving…' : dirty ? 'Save Changes' : 'No Changes'}
      </button>
    </div>
  )
}

// ─── Physics / drag constants ─────────────────────────────────────────────────

const HOLD_HEIGHT = 1.8
const HEAD_HEIGHT = 1.5   // head center is 1.5 units above group origin (feet)
const GRAVITY     = 26
const FLING_MIN   = 4.0
const WALL_BOUND  = FSIZE / 2 - 0.5
const IMPACT_DAZE = 6
const IMPACT_MAD  = 4

interface PhysState {
  mode: DragMode
  pos: THREE.Vector3
  vel: THREE.Vector3
  angVel: THREE.Vector3
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
          const clampedX = THREE.MathUtils.clamp(hitPoint.x, -WALL_BOUND, WALL_BOUND)
          const clampedZ = THREE.MathUtils.clamp(hitPoint.z, -WALL_BOUND, WALL_BOUND)
          phys.pos.x = THREE.MathUtils.lerp(phys.pos.x, clampedX, 0.14)
          phys.pos.y = THREE.MathUtils.lerp(phys.pos.y, hitPoint.y - HEAD_HEIGHT, 0.14)
          phys.pos.z = THREE.MathUtils.lerp(phys.pos.z, clampedZ, 0.14)
          group.position.copy(phys.pos)
          // Tilt body to follow drag direction — feels like hauling dead weight
          group.rotation.x = THREE.MathUtils.lerp(group.rotation.x,  dragCursorVel.current.z * 0.022, 0.12)
          group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -dragCursorVel.current.x * 0.022, 0.12)
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

        // Tumble: apply angular velocity to group rotation
        group.rotation.x += phys.angVel.x * delta
        group.rotation.y += phys.angVel.y * delta
        group.rotation.z += phys.angVel.z * delta
        const angDrag = Math.pow(0.984, delta * 60)
        phys.angVel.multiplyScalar(angDrag)

        // Wall clamping — ALWAYS applied, independent of ground.
        // Must run before the ground check so a fast throw that overshoots
        // both the wall and y=0 in the same frame still lands within bounds.
        // Do NOT touch vel.y: walls only redirect lateral velocity; killing
        // it was what caused characters to snap to the ground after bounces.
        if (Math.abs(phys.pos.x) > WALL_BOUND) {
          phys.pos.x = Math.sign(phys.pos.x) * WALL_BOUND
          phys.vel.x *= -0.45
          phys.vel.z *= 0.7
          phys.angVel.z *= -0.5
        }
        if (Math.abs(phys.pos.z) > WALL_BOUND) {
          phys.pos.z = Math.sign(phys.pos.z) * WALL_BOUND
          phys.vel.z *= -0.45
          phys.vel.x *= 0.7
          phys.angVel.x *= -0.5
        }

        // Ground collision — after wall clamping so landing position is always in-bounds
        if (phys.pos.y <= 0) {
          phys.pos.y = 0
          phys.angVel.set(0, 0, 0)
          const impactSpeed = phys.vel.length()
          if (impactSpeed >= IMPACT_DAZE) {
            // Snap immediately to face-forward fallen pose on impact
            group.rotation.x = 1.25 + (Math.random() - 0.5) * 0.15
            group.rotation.z = (Math.random() - 0.5) * 0.3
            setCharMode(uid, 'dazed')
          } else if (impactSpeed >= IMPACT_MAD) {
            group.rotation.x = 0
            group.rotation.z = 0
            setCharMode(uid, 'mad')
          } else {
            group.rotation.x = 0
            group.rotation.z = 0
            setCharMode(uid, null)
          }
        }

        group.position.copy(phys.pos)
      } else if (phys.mode === 'dazed') {
        phys.modeTimer += delta
        // Hold the fallen pose — rotation was snapped on landing, no lerp needed
        if (phys.modeTimer >= 3.0) {
          setCharMode(uid, 'waking')
        }
      } else if (phys.mode === 'waking') {
        phys.modeTimer += delta
        // Lerp back to upright as they recover
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, Math.min(1, delta * 1.8))
        group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, Math.min(1, delta * 2.5))
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

// Seeded LCG so sprite positions are deterministic across renders
function seededRandom(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967295
  }
}

interface SpriteDef {
  pos: [number, number, number]
  texIdx: number
  width: number
}

// 240 sprites in 7 concentric rings — dense inner wrap, full horizon coverage
const SPRITE_DEFS: SpriteDef[] = (() => {
  const r    = seededRandom(42)
  const defs: SpriteDef[] = []
  const rings = [
    { count: 20, r0: 15, r1: 30, y0:  1.0, y1:  4.0, w0: 22, w1: 35 },  // foreground — near camera, above plaza
    { count: 18, r0: 28, r1: 45, y0: -0.5, y1:  2.0, w0: 28, w1: 45 },  // mid foreground
    { count: 29, r0:  9, r1: 13, y0: -2.0, y1: -3.5, w0:  9, w1: 16 },  // wraps the spire
    { count: 43, r0: 13, r1: 20, y0: -2.5, y1: -4.0, w0: 14, w1: 23 },
    { count: 49, r0: 20, r1: 32, y0: -3.0, y1: -5.0, w0: 18, w1: 30 },
    { count: 45, r0: 32, r1: 50, y0: -2.0, y1: -4.0, w0: 24, w1: 39 },  // transition — rising
    { count: 43, r0: 50, r1: 72, y0: -1.0, y1: -3.0, w0: 33, w1: 53 },
    { count: 40, r0: 72, r1: 100, y0:  0.0, y1: -2.0, w0: 43, w1: 69 }, // horizon level
    { count: 38, r0: 100, r1: 140, y0:  1.5, y1: -0.5, w0: 55, w1: 88 }, // sky clouds past plaza
  ]
  rings.forEach(({ count, r0, r1, y0, y1, w0, w1 }) => {
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2 + r() * 0.45 - 0.225
      const radius = r0 + r() * (r1 - r0)
      const y      = y0 + r() * (y1 - y0)
      const width  = w0 + r() * (w1 - w0)
      defs.push({
        pos: [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as [number, number, number],
        texIdx: Math.floor(r() * 3),
        width,
      })
    }
  })
  return defs
})()

function makeCloudTex(seed: number): THREE.CanvasTexture {
  const W = 512, H = 256
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  let s = seed | 0
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0x100000000 }
  const numPuffs = 7 + Math.floor(rng() * 5)
  for (let i = 0; i < numPuffs; i++) {
    const cx = W * (0.10 + rng() * 0.80)
    const cy = H * (0.30 + rng() * 0.42)
    const r  = H * (0.20 + rng() * 0.32)
    const bri = 232 + Math.floor(rng() * 23)
    const a   = 0.78 + rng() * 0.18
    const g = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r)
    g.addColorStop(0.00, `rgba(${bri},${bri},${Math.min(255,bri+4)},${a})`)
    g.addColorStop(0.55, `rgba(${bri},${Math.min(255,bri+3)},${Math.min(255,bri+6)},${(a * 0.65).toFixed(2)})`)
    g.addColorStop(0.85, `rgba(255,255,255,${(a * 0.15).toFixed(2)})`)
    g.addColorStop(1.00, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(cv)
}

// Full-sphere billboard via THREE.Sprite — always faces the camera on every axis, no visible edges
function CloudSprite({ pos, texture, width }: {
  pos: [number, number, number]
  texture: THREE.Texture
  width: number
}) {
  const ref    = useRef<THREE.Sprite>(null)
  const driftT = useRef(Math.random() * Math.PI * 2)
  const height = width * 0.5  // 2:1 aspect matches canvas texture

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.05 + driftT.current
    ref.current.position.x = pos[0] + Math.sin(t)        * 4.0
    ref.current.position.z = pos[2] + Math.cos(t * 0.65) * 3.0
  })

  return (
    <sprite ref={ref} position={pos} scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.01} depthWrite={false} />
    </sprite>
  )
}

function Clouds() {
  const [tex1, tex2, tex3] = useMemo(() => [
    makeCloudTex(101), makeCloudTex(202), makeCloudTex(303),
  ], [])

  const fadeTex = useMemo(() => {
    const size = 1024, c = size / 2
    const cv   = document.createElement('canvas')
    cv.width   = cv.height = size
    const ctx  = cv.getContext('2d')!
    const g    = ctx.createRadialGradient(c, c, c * 0.05, c, c, c)
    g.addColorStop(0.00, 'rgba(244,244,244,0.80)')
    g.addColorStop(0.45, 'rgba(244,244,244,0.60)')
    g.addColorStop(0.72, 'rgba(244,244,244,0.30)')
    g.addColorStop(1.00, 'rgba(244,244,244,0.00)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(cv)
  }, [])

  const texArr = [tex1, tex2, tex3]

  return (
    <>
      {/* Gradient base — opaque under spire, fades to transparent at horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, 0]}>
        <planeGeometry args={[700, 700]} />
        <meshStandardMaterial map={fadeTex} transparent depthWrite={false} roughness={1} />
      </mesh>
      {SPRITE_DEFS.map((def, i) => (
        <CloudSprite key={i} pos={def.pos} texture={texArr[def.texIdx]} width={def.width} />
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
  mobile,
}: {
  members: GroupMember[]
  selectedUid: string | null
  focusPos: [number, number, number] | null
  cameraLocked: boolean
  onUnlock: () => void
  onSelect: (member: GroupMember, pos: [number, number, number]) => void
  animatingUid: string | null
  animationType: 'celebrate' | 'shame' | null
  mobile: boolean
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

  // Spawn positions keyed by uid — assigned once per member, never changed.
  // Indexing by array position (i) would teleport characters when Firestore
  // re-orders members after a points update, because the same uid would receive
  // a different initialPosition prop reference and R3F would re-apply it.
  const spawnPositions = useRef<Map<string, [number, number, number]>>(new Map())
  members.forEach((member, i) => {
    if (!spawnPositions.current.has(member.uid)) {
      const total  = members.length
      const angle  = (i / Math.max(total, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.2
      const radius = 1.2 + Math.random() * 3.5
      spawnPositions.current.set(member.uid, [Math.cos(angle) * radius, 0, Math.sin(angle) * radius])
    }
  })

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
      const pos    = existing?.pos    ?? (charGroups.current.get(uid)?.position.clone() ?? new THREE.Vector3())
      const vel    = existing?.vel    ?? new THREE.Vector3()
      const angVel = existing?.angVel ?? new THREE.Vector3()
      physicsMap.current.set(uid, {
        mode,
        pos,
        vel,
        angVel,
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
        ? group.position.clone().setY(HOLD_HEIGHT - HEAD_HEIGHT)
        : new THREE.Vector3(pos[0], HOLD_HEIGHT - HEAD_HEIGHT, pos[2])

      dragCursorVel.current.set(0, 0, 0)
      dragCursor.current.copy(startPos)

      physicsMap.current.set(pickup.uid, {
        mode: 'held',
        pos: startPos,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
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
          phys.angVel.set(
            (Math.random() - 0.5) * speed * 0.55,
            (Math.random() - 0.5) * speed * 0.30,
            (Math.random() - 0.5) * speed * 0.70,
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
          phys.vel.set(0, -2, 0)
          phys.angVel.set(0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5)
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

  // Register pointerup and touch events on canvas domElement
  useEffect(() => {
    const el = gl.domElement

    // ── Pointer (mouse / stylus) ──────────────────────────────────────────────
    el.addEventListener('pointerup', handlePointerUp)

    // ── Touch (mobile) ────────────────────────────────────────────────────────
    // Convert a single touch to NDC coords so the existing EMA cursor logic works
    function touchToNDC(touch: Touch) {
      const rect = el.getBoundingClientRect()
      return {
        x:  ((touch.clientX - rect.left)  / rect.width)  * 2 - 1,
        y: -((touch.clientY - rect.top)   / rect.height) * 2 + 1,
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        // Single touch: treat as pointerdown on the Mii (hold-to-carry)
        // The Mii's onPointerDown fires via React's synthetic system, so we don't
        // need to replicate pick-up start here — just prime the drag cursor position.
        const t = e.touches[0]
        const ndc = touchToNDC(t)
        // Dispatch a synthetic pointermove so the raycaster has a fresh cursor
        el.dispatchEvent(new PointerEvent('pointermove', {
          clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true,
        }))
        void ndc
      }
    }

    let prevPinchDist = 0

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 1) {
        if (draggingUid.current !== null || holdTimer.current !== null) {
          // Mii drag: intercept and prevent scroll
          e.preventDefault()
          const t = e.touches[0]
          el.dispatchEvent(new PointerEvent('pointermove', {
            clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true,
          }))
        }
        // else: no preventDefault → browser generates pointer events → OrbitControls rotates
      } else if (e.touches.length === 2) {
        e.preventDefault() // prevent page pinch-zoom
        // Dispatch a wheel event so OrbitControls handles zoom through its own code path
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (!prevPinchDist) { prevPinchDist = dist; return }
        const delta = prevPinchDist - dist
        prevPinchDist = dist
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: delta * 2, bubbles: true, cancelable: true }))
      }
    }

    function onTouchEnd(e: TouchEvent) {
      prevPinchDist = 0
      // Fire pointerup so the hold/fling logic in handlePointerUp runs
      const lastTouch = e.changedTouches[0]
      if (lastTouch) {
        el.dispatchEvent(new PointerEvent('pointerup', {
          clientX: lastTouch.clientX, clientY: lastTouch.clientY, bubbles: true,
        }))
      }
    }

    el.addEventListener('touchstart',  onTouchStart,  { passive: true })
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true })

    return () => {
      el.removeEventListener('pointerup',  handlePointerUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [gl.domElement, handlePointerUp])

  return (
    <>
      {/* sky is transparent — CSS gradient on the container div shows through */}
      <CameraController focusPos={focusPos} orbitRef={orbitRef} onUnlock={onUnlock} mobile={mobile} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Clouds />
      </Suspense>
      <GrassFloor />
      {members.map((member) => (
        <MiiCharacter
          key={member.uid}
          member={member}
          initialPosition={spawnPositions.current.get(member.uid) ?? [0, 0, 0]}
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
        maxDistance={40}
        enableRotate={true}
        enablePan={false}
        minPolarAngle={Math.PI / 3.3}
        maxPolarAngle={Math.PI / 2.2}
        makeDefault
      />
    </>
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────

// Fires onReady after N rendered frames — guarantees WebGL has actually painted.
function ReadySignal({ onReady, afterFrames = 3 }: { onReady: () => void; afterFrames?: number }) {
  const count = useRef(0)
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    count.current++
    if (count.current >= afterFrames) {
      fired.current = true
      onReady()
    }
  })
  return null
}

interface Props {
  members: GroupMember[]
  currentUid: string
  groupId: string
  remainingGive: number
  remainingTake: number
  isChief?: boolean
  presets?: PlazaPreset[]
  onPointsSubmitted: () => void
  onAvatarUpdated?: () => void
  onReady?: () => void
}

export default function MiiPlaza({
  members, currentUid, groupId, remainingGive, remainingTake, isChief, presets, onPointsSubmitted, onAvatarUpdated, onReady,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const animTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null)
  const [focusPos, setFocusPos]             = useState<[number, number, number] | null>(null)
  const [cameraLocked, setCameraLocked]     = useState(false)
  const [headScreenY, setHeadScreenY]       = useState<number>(0)
  const [animatingUid, setAnimatingUid]     = useState<string | null>(null)
  const [animationType, setAnimationType]   = useState<'celebrate' | 'shame' | null>(null)
  const [isMobile, setIsMobile]             = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current) }, [])

  function handleSelect(member: GroupMember, pos: [number, number, number]) {
    const [fx, fy, fz] = pos
    const container = containerRef.current
    if (container) {
      const w = container.clientWidth
      const h = container.clientHeight
      // Project where the character's head will appear once the camera settles
      const tempCam = new THREE.PerspectiveCamera(55, w / h, 0.1, 100)
      tempCam.position.set(fx + ZOOM_OFFSET_XZ, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_XZ)
      tempCam.lookAt(fx, fy + ZOOM_LOOKAT_Y, fz)
      tempCam.updateMatrixWorld()
      const headNDC = new THREE.Vector3(fx, fy + 1.8, fz).project(tempCam)
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

  const cardTop = Math.max(16, headScreenY - 40)

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100dvh',
        minHeight: 400,
        borderRadius: 0,
        overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
        background: 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)',
      }}
    >
      <Canvas
        camera={{ position: [8, 6, 8], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
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
            mobile={isMobile}
          />
        </Suspense>
        {onReady && <ReadySignal onReady={onReady} />}
      </Canvas>

      {/* Card overlay — avatar editor for self, give/take for others */}
      {selectedMember && (
        <div style={isMobile ? {
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          zIndex: 10,
          pointerEvents: 'auto',
        } : {
          position: 'absolute',
          left: 'calc(50% + 150px)',
          top: cardTop,
          zIndex: 10,
          pointerEvents: 'auto',
        }}>
          {selectedMember.uid === currentUid ? (
            <SelfCard
              member={selectedMember}
              groupId={groupId}
              mobile={isMobile}
              onClose={handleClose}
              onAvatarUpdated={onAvatarUpdated}
            />
          ) : (
            <MemberCard
              member={selectedMember}
              currentUid={currentUid}
              groupId={groupId}
              remainingGive={remainingGive}
              remainingTake={remainingTake}
              isChief={isChief}
              presets={presets}
              mobile={isMobile}
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
          )}
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
          {isMobile ? 'Hold to carry · Pinch to zoom · Swipe to rotate' : 'Hold to carry · Scroll to zoom · Tap a Mii to interact'}
        </div>
      )}
    </div>
  )
}
