'use client'

import { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import MiiCharacter, { type DragMode } from './MiiCharacter'
import { giveOrTakePoints, updateUserAvatar, updateMemberAvatar } from '@/lib/firestore'
import { SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, SHOES_COLORS } from '@/lib/avatarDefaults'
import type { GroupMember, AvatarConfig } from '@/lib/types'

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
      {/* Spire — dirt body + stone base below the grass */}
      <mesh position={[0, -12, 0]}>
        <boxGeometry args={[FSIZE, 24, FSIZE]} />
        <meshStandardMaterial color="#6B4226" roughness={0.95} />
      </mesh>
      <mesh position={[0, -27, 0]}>
        <boxGeometry args={[FSIZE - 3, 6, FSIZE - 3]} />
        <meshStandardMaterial color="#6a6a6a" roughness={0.98} />
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
const DEFAULT_CAM_POS  = new THREE.Vector3(9, 8, 9)
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
      const goal     = new THREE.Vector3(fx + ZOOM_OFFSET_XZ, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_XZ)
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

function SelfCard({ member, groupId, onClose, onAvatarUpdated }: {
  member: GroupMember
  groupId: string
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
      background: '#fff', borderRadius: 20, padding: '16px 16px 18px', width: 270,
      boxShadow: '0 20px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
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

        // Wall collisions (x and z) — also kill upward momentum so they don't rocket skyward
        if (Math.abs(phys.pos.x) > WALL_BOUND) {
          phys.pos.x = Math.sign(phys.pos.x) * WALL_BOUND
          phys.vel.x *= -0.1
          phys.vel.y *= 0.25
          phys.vel.z *= 0.4
          phys.angVel.z *= -0.5
        }
        if (Math.abs(phys.pos.z) > WALL_BOUND) {
          phys.pos.z = Math.sign(phys.pos.z) * WALL_BOUND
          phys.vel.z *= -0.1
          phys.vel.y *= 0.25
          phys.vel.x *= 0.4
          phys.angVel.x *= -0.5
        }

        // Ground collision
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

// 114 sprites in 5 concentric rings — inner ring hugs the spire, outer fades to horizon
const SPRITE_DEFS: SpriteDef[] = (() => {
  const r    = seededRandom(42)
  const defs: SpriteDef[] = []
  const rings = [
    { count: 20, r0: 13, r1: 18, y0: -3.0, y1: -4.0, w0:  8, w1: 14 },
    { count: 24, r0: 19, r1: 28, y0: -4.0, y1: -5.5, w0: 11, w1: 18 },
    { count: 26, r0: 29, r1: 43, y0: -5.0, y1: -7.0, w0: 15, w1: 24 },
    { count: 24, r0: 44, r1: 65, y0: -6.0, y1: -8.0, w0: 20, w1: 32 },
    { count: 20, r0: 66, r1: 95, y0: -7.0, y1: -9.0, w0: 26, w1: 44 },
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

// Full-sphere billboard via THREE.Sprite — always faces the camera on every axis, no visible edges
function CloudSprite({ pos, texture, width }: {
  pos: [number, number, number]
  texture: THREE.Texture
  width: number
}) {
  const ref    = useRef<THREE.Sprite>(null)
  const driftT = useRef(Math.random() * Math.PI * 2)
  const height = width * (1080 / 1920)  // preserve 16:9 SVG aspect ratio

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.022 + driftT.current
    ref.current.position.x = pos[0] + Math.sin(t)       * 1.5
    ref.current.position.z = pos[2] + Math.cos(t * 0.6) * 1.2
  })

  return (
    <sprite ref={ref} position={pos} scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.01} depthWrite={false} />
    </sprite>
  )
}

function Clouds() {
  const [tex1, tex2, tex3] = useTexture(['/Cloud1.svg', '/Cloud2.svg', '/Cloud3.svg'])

  const fadeTex = useMemo(() => {
    const size = 1024, c = size / 2
    const cv   = document.createElement('canvas')
    cv.width   = cv.height = size
    const ctx  = cv.getContext('2d')!
    const g    = ctx.createRadialGradient(c, c, c * 0.05, c, c, c)
    g.addColorStop(0.00, 'rgba(244,244,244,0.88)')
    g.addColorStop(0.45, 'rgba(244,244,244,0.82)')
    g.addColorStop(0.72, 'rgba(244,244,244,0.55)')
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

  // Register pointerup on canvas domElement
  useEffect(() => {
    gl.domElement.addEventListener('pointerup', handlePointerUp)
    return () => gl.domElement.removeEventListener('pointerup', handlePointerUp)
  }, [gl.domElement, handlePointerUp])

  return (
    <>
      {/* sky is transparent — CSS gradient on the container div shows through */}
      <CameraController focusPos={focusPos} orbitRef={orbitRef} onUnlock={onUnlock} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Clouds />
      </Suspense>
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
        maxDistance={40}
        enableRotate={false}
        enablePan={false}
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
  onAvatarUpdated?: () => void
}

export default function MiiPlaza({
  members, currentUid, groupId, remainingGive, remainingTake, onPointsSubmitted, onAvatarUpdated,
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
      const tempCam = new THREE.PerspectiveCamera(55, w / h, 0.1, 100)
      tempCam.position.set(fx + ZOOM_OFFSET_XZ, fy + ZOOM_OFFSET_Y, fz + ZOOM_OFFSET_XZ)
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
        background: 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)',
      }}
    >
      <Canvas
        camera={{ position: [9, 8, 9], fov: 55 }}
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
          />
        </Suspense>
      </Canvas>

      {/* Card overlay — avatar editor for self, give/take for others */}
      {selectedMember && (
        <div style={{
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
          Hold to carry · Scroll to zoom · Tap a Mii to interact
        </div>
      )}
    </div>
  )
}
