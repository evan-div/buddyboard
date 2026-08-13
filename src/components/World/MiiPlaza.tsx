'use client'

import { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import MiiCharacter, { WAKE_ROLL, WAKE_HOLD, WAKE_RISE, type DragMode } from './MiiCharacter'
import StylizedGrassSurface, { type GrassIsland } from './StylizedGrassSurface'
import PlazaGarden from './PlazaGarden'
import PlazaArchipelago from './PlazaArchipelago'
import { makePlazaShape, makeCheckerTexture, makeDirtTexture } from './plazaTextures'
import { playPickup, playWhoosh, playThud, buzz } from './plazaSound'
import { FSIZE, plazaEdgeRadius, capsuleFloorY, lyingQuat, readLyingPose, AXIS_Y, tileKey, tileToWorld, tilesOnIsland, type IslandFrame, type Tile } from './plazaMath'
import { PLAZA_SPECIES, getSpecies, STAGE_LABELS, stageLabel } from './plazaSpecies'
import { ISLANDS, HOME_ISLAND, ALL_UNLOCKED_POINTS, POLAR_MIN, POLAR_MAX, getIsland, isUnlocked, unlockedIslands, progressToNext, archipelagoRadius, islandView, islandAt, clampToNearestIsland, type IslandDef } from './plazaIslands'
import { hashUid, currentWaypoint, respawnYaw } from './plazaWalk'
import { reservedTiles } from './plazaScenery'
import ThirdPersonController from './ThirdPersonController'
import { makeLocomotion, placeCardBeside, type Locomotion } from './thirdPerson'
import { giveOrTakePoints, updateUserAvatar, updateMemberAvatar, getTransactionsSince, sendPlazaEvent, subscribeToPlazaEvents, updatePlazaHold, clearPlazaHold, subscribeToPlazaHolds, recordCheckin, subscribeToCheckins, plantSeed, removePlazaObject, subscribeToPlazaObjects } from '@/lib/firestore'
import { growthStage, isDormant, TIME_DAYS, NOURISH_DAYS } from '@/lib/plazaGrowth'
import { dayKey, timeAgo } from '@/lib/utils'
import { subscribeToCases } from '@/lib/appeals'
import { SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, SHOES_COLORS } from '@/lib/avatarDefaults'
import type { GroupMember, AvatarConfig, PlazaPreset, Transaction, CourtCase, PlazaVec, PlazaObject, Checkin } from '@/lib/types'

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

const PATCH_GRID = 10                               // 10×10 checker squares
const PATCH_W    = FSIZE / PATCH_GRID               // 2.6 per patch
// Blades are decorative texture on top of the solid checkerboard base, so a
// moderate count reads the same. 3000/patch (300k triangles total) measurably
// hurt low-end mobile GPUs.
const N_BLADES   = 1000                             // blades per patch
const BLADE_H    = 0.16
const BLADE_W    = 0.022
const BLADES_EACH = (PATCH_GRID * PATCH_GRID / 2) * N_BLADES   // 50k per color

const LIGHT_COLOR = '#6dc957'
const DARK_COLOR  = '#246b24'

// ─── Plaza outline ────────────────────────────────────────────────────────────
// Edge math lives in plazaMath.ts (unit-tested); this file renders it.

// Registers each compiled shader's uTime uniform into the passed ref so the
// render loop can advance the sway animation without touching the material.
function makeBladeMat(
  color: string,
  timeUniforms: React.RefObject<{ value: number }[]>,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.85 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    timeUniforms.current.push(shader.uniforms.uTime as { value: number })
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

const N_ROCKS = 90

function GrassFloor({
  islands,
  mobile,
  lowerGraphics,
  reducedMotion,
  characterGroups,
}: {
  /** Every island the group has earned — they all get grass. */
  islands: GrassIsland[]
  mobile: boolean
  lowerGraphics: boolean
  reducedMotion: boolean
  characterGroups: React.RefObject<Map<string, THREE.Group>>
}) {
  const lightRef = useRef<THREE.InstancedMesh>(null)
  const darkRef  = useRef<THREE.InstancedMesh>(null)
  const rocksRef = useRef<THREE.InstancedMesh>(null)
  const timeUniforms = useRef<{ value: number }[]>([])

  const baseTex = useMemo(() => makeCheckerTexture(PATCH_GRID, LIGHT_COLOR, DARK_COLOR), [])

  const plazaShape = useMemo(() => makePlazaShape(), [])
  const topGeo = useMemo(() => new THREE.ShapeGeometry(plazaShape), [plazaShape])
  const dirtGeo = useMemo(
    () => new THREE.ExtrudeGeometry(plazaShape, { depth: 150, bevelEnabled: false }),
    [plazaShape],
  )

  const dirtTex = useMemo(() => makeDirtTexture(), [])

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

  const lightMat = useMemo(() => makeBladeMat(LIGHT_COLOR, timeUniforms), [])
  const darkMat  = useMemo(() => makeBladeMat(DARK_COLOR, timeUniforms), [])

  useEffect(() => {
    if (!lowerGraphics) return
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
          const px = cx + ox
          const pz = cz + oz
          // No blades beyond the rounded plaza edge
          if (Math.hypot(px, pz) > plazaEdgeRadius(Math.atan2(pz, px)) - 0.06) continue
          dummy.position.set(px, 0, pz)
          dummy.rotation.set(tiltX, yawBase + (Math.random() - 0.5) * 1.2, 0)
          dummy.scale.setScalar(0.80 + Math.random() * 0.45)
          dummy.updateMatrix()
          if (isLight) lightRef.current?.setMatrixAt(li++, dummy.matrix)
          else          darkRef.current?.setMatrixAt(di++, dummy.matrix)
        }
      }
    }
    if (lightRef.current) {
      lightRef.current.count = li
      lightRef.current.instanceMatrix.needsUpdate = true
    }
    if (darkRef.current) {
      darkRef.current.count = di
      darkRef.current.instanceMatrix.needsUpdate = true
    }
  }, [lowerGraphics])

  // Rocks half-buried in the dirt wall around the rim — denser near the top
  // where the wall is most visible, thinning out below
  useEffect(() => {
    const mesh = rocksRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    let seed = 12345
    const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
    for (let i = 0; i < N_ROCKS; i++) {
      const th   = rng() * Math.PI * 2
      const y    = -(0.3 + Math.pow(rng(), 1.7) * 9.5)
      const size = 0.18 + rng() * 0.55
      const rOut = plazaEdgeRadius(th) - size * 0.35
      dummy.position.set(Math.cos(th) * rOut, y, Math.sin(th) * rOut)
      dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
      dummy.scale.set(size, size * (0.7 + rng() * 0.5), size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const shade = 0.42 + rng() * 0.34
      color.setRGB(shade, shade * (0.9 + rng() * 0.1), shade * 0.82)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    if (!lowerGraphics || reducedMotion) return
    for (const u of timeUniforms.current) u.value += delta
  })

  return (
    <group>
      {lowerGraphics ? (
        <>
          {/* Original one-triangle checker grass remains the explicit fallback. */}
          <mesh geometry={topGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <meshStandardMaterial map={baseTex} roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          <instancedMesh ref={lightRef} args={[bladeGeo, lightMat, BLADES_EACH]} frustumCulled={false} />
          <instancedMesh ref={darkRef}  args={[bladeGeo, darkMat,  BLADES_EACH]} frustumCulled={false} />
        </>
      ) : (
        // One field per island, thinned by distance — see plazaGrass.ts.
        <StylizedGrassSurface
          islands={islands}
          mobile={mobile}
          reducedMotion={reducedMotion}
          characterGroups={characterGroups}
        />
      )}
      {/* Dirt base — the plaza outline extruded deep below any camera angle */}
      <mesh geometry={dirtGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <meshStandardMaterial map={dirtTex} roughness={0.95} />
      </mesh>
      {/* Rocks poking out of the dirt wall */}
      <instancedMesh ref={rocksRef} args={[undefined, undefined, N_ROCKS]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
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

// A request to fly the camera out to one island. The nonce distinguishes two
// taps on the same island, so asking again re-centres the view.
export type IslandVisit = { id: string; nonce: number }

// Exponential approach rate for an island hop, in units of "e-folds per second"
// — 4 lands a 40-unit crossing in a little over a second.
const FLY_RATE = 4

function CameraController({
  focusPos,
  visit,
  orbitRef,
  onUnlock,
  onFlying,
  mobile,
  disabled = false,
  returnNonce = 0,
}: {
  focusPos: [number, number, number] | null
  /** Island to fly to and park on, or null for the plaza's own camera. */
  visit: IslandVisit | null
  orbitRef: React.RefObject<OrbitControlsImpl | null>
  onUnlock: () => void
  onFlying: (flying: boolean) => void
  mobile: boolean
  /** Third-person mode owns the camera — stay entirely out of the way. */
  disabled?: boolean
  /** Bumped when walk mode exits, to run the same eased return-to-default
      path a closing member card uses (instead of leaving the camera parked
      at head height wherever the player stopped walking). */
  returnNonce?: number
}) {
  const { camera } = useThree()
  const lookAt     = useRef(DEFAULT_CAM_LOOK.clone())
  const wasLocked  = useRef(false)
  const unlockSent = useRef(false)
  // Island we are currently gliding toward; null once we have arrived.
  const flyingTo   = useRef<string | null>(null)

  useEffect(() => {
    if (!visit) return
    flyingTo.current = visit.id
    // Cancel any pending glide back to the default view, so closing a member
    // card just before a visit doesn't drag the camera home behind our back.
    wasLocked.current  = false
    unlockSent.current = true
    onFlying(true)
    onUnlock()
  }, [visit, onFlying, onUnlock])

  useEffect(() => {
    if (returnNonce === 0) return
    wasLocked.current  = true
    unlockSent.current = false
  }, [returnNonce])

  useFrame((_, rawDelta) => {
    if (disabled) {
      // Walk mode owns the camera. Abandon any island glide still in flight —
      // the walker's own camera takes over from wherever we are.
      if (flyingTo.current) {
        flyingTo.current = null
        onFlying(false)
      }
      return
    }
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
    } else if (flyingTo.current) {
      // Glide out to the island and hand the camera back to OrbitControls
      // re-targeted on it, so you can orbit and zoom around that island the
      // same way you can around home.
      const view     = islandView(getIsland(flyingTo.current))
      const goal     = new THREE.Vector3(view.position.x, view.position.y, view.position.z)
      const lookGoal = new THREE.Vector3(view.target.x, view.target.y, view.target.z)
      // Time-based easing, not per-frame: these hops cross the whole archipelago
      // and a fixed step would crawl on a phone rendering at a few frames a
      // second. Deliberately unclamped — a long frame should cover more ground,
      // and a huge one (a backgrounded tab) simply lands the camera.
      const t = 1 - Math.exp(-FLY_RATE * rawDelta)
      camera.position.lerp(goal, t)
      lookAt.current.lerp(lookGoal, t)
      camera.lookAt(lookAt.current)
      if (camera.position.distanceTo(goal) < 0.4) {
        camera.position.copy(goal)
        lookAt.current.copy(lookGoal)
        camera.lookAt(lookAt.current)
        if (orbitRef.current) {
          orbitRef.current.target.copy(lookGoal)
          orbitRef.current.update()
        }
        flyingTo.current = null
        onFlying(false)
      }
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
  presets?: PlazaPreset[]
  mobile?: boolean
  onClose: () => void
  onSubmitted: (type: 'celebrate' | 'shame') => void
}

function StatsView({ member, groupId }: { member: GroupMember; groupId: string }) {
  // fetchedAt doubles as the loading flag and the reference point for the
  // 7-day cutoff, so render doesn't have to call Date.now() itself
  const [txData, setTxData] = useState<{ txns: Transaction[]; fetchedAt: number } | null>(null)
  const [cases, setCases] = useState<CourtCase[]>([])

  useEffect(() => {
    let stale = false
    const fetchedAt = Date.now()
    getTransactionsSince(groupId, new Date(fetchedAt - 30 * 24 * 60 * 60 * 1000))
      .then((all) => { if (!stale) setTxData({ txns: all, fetchedAt }) })
      .catch(() => { if (!stale) setTxData({ txns: [], fetchedAt }) })
    const unsub = subscribeToCases(groupId, setCases)
    return () => { stale = true; unsub() }
  }, [groupId])

  const loading = txData === null
  const txns = txData?.txns ?? []
  const sevenDaysAgo = new Date((txData?.fetchedAt ?? 0) - 7 * 24 * 60 * 60 * 1000)
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
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: 0, marginTop: 1 }}>✕</button>
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
        <StatsView member={member} groupId={groupId} />

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
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: 0, marginTop: 1 }}>✕</button>
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
const GRAVITY     = 38
const FLING_MIN   = 4.0
const IMPACT_DAZE = 6
const IMPACT_MAD  = 4
// Thrown off the island: fall into the clouds, despawn, drop back in from the sky
const FALL_DEPTH     = -30   // y below which a fallen character despawns
const RESPAWN_DELAY  = 1.6   // seconds hidden before dropping back in
const RESPAWN_HEIGHT = 9     // drop-in height above the island center
// Wander radius scale shared by spawn, respawn, and MiiCharacter's schedule —
// all three must agree or clients compute different waypoints.
const WANDER_BOUNDS = 3.0
// A remote hold with no stream updates for this long is treated as abandoned
// (holder crashed, lost connection, or their writes are being denied)
const HOLD_STALE_MS = 6_000
// ─── Lying-down orientation ───────────────────────────────────────────────────
// lyingQuat/readLyingPose live in plazaMath.ts (unit-tested). These scratch
// quaternions are for slerp targets in the physics loop below.

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qc = new THREE.Quaternion()
const _upVec = new THREE.Vector3()

interface PhysState {
  mode: DragMode
  pos: THREE.Vector3
  vel: THREE.Vector3
  angVel: THREE.Vector3
  modeTimer: number
  gentleDrop: boolean
  bounceCount: number
  pendingMode?: 'dazed' | 'mad'
  heading: number   // grounded pose: head direction
  landRoll: number  // grounded pose: roll about long axis (0 = face-down)
  prone: boolean    // knocked flat (vs. only lightly tilted) — full get-up
}

// ─── Physics Updater ──────────────────────────────────────────────────────────

// ─── Blob contact shadows ─────────────────────────────────────────────────────
// One soft dark ellipse per character, pinned to the ground under them. It
// grows and fades as the character gains height, which is what visually sells
// throws — the body and its shadow separate. Independent of body rotation, so
// tumbling never tilts the shadow.

// Three stacked translucent discs fake a radial falloff without any texture
// (plain transparent materials render reliably everywhere).
const SHADOW_RINGS = [
  { r: 0.42, o: 0.20 },
  { r: 0.30, o: 0.22 },
  { r: 0.18, o: 0.24 },
]

function BlobShadows({ members, charGroups, islands }: {
  members: GroupMember[]
  charGroups: React.RefObject<Map<string, THREE.Group>>
  islands: readonly IslandDef[]
}) {
  const shadowMap = useRef<Map<string, THREE.Group>>(new Map())

  useFrame(() => {
    for (const member of members) {
      const shadow = shadowMap.current.get(member.uid)
      const g = charGroups.current.get(member.uid)
      if (!shadow) continue
      if (!g || !g.visible) { shadow.visible = false; continue }
      // No shadow once the character sails past the island edge — but any
      // island counts, so a Mii flung toward the garden keeps its shadow all
      // the way across.
      const overIsland = islandAt(g.position.x, g.position.z, islands) !== null
      shadow.visible = overIsland
      if (!overIsland) continue

      const h = Math.max(0, g.position.y)
      // Sit just above the grass-blade tops — the lawn IS the visible ground,
      // so a shadow at the true floor would be buried under the blades.
      shadow.position.set(g.position.x, BLADE_H + 0.015, g.position.z)
      shadow.scale.setScalar(1 + h * 0.12)
      const fade = 1 / (1 + h * 0.8)
      shadow.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
        mat.opacity = SHADOW_RINGS[i].o * fade
      })
    }
  })

  return (
    <>
      {members.map((member) => (
        <group
          key={member.uid}
          ref={(grp) => {
            if (grp) shadowMap.current.set(member.uid, grp)
            else shadowMap.current.delete(member.uid)
          }}
          position={[0, BLADE_H + 0.015, 0]}
        >
          {SHADOW_RINGS.map((ring, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, i * 0.002, 0]}>
              <circleGeometry args={[ring.r, 20]} />
              <meshBasicMaterial color="#000" transparent opacity={ring.o} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

// Live position target for a character held by another member's client
export interface RemoteHold {
  target: THREE.Vector3
  lastAt: number   // local receipt time, for stale-hold cleanup
}

interface PhysicsUpdaterProps {
  draggingUid:    React.RefObject<string | null>
  dragCursor:     React.RefObject<THREE.Vector3>
  dragCursorVel:  React.RefObject<THREE.Vector3>
  charGroups:     React.RefObject<Map<string, THREE.Group>>
  physicsMap:     React.RefObject<Map<string, PhysState>>
  remoteHolds:    React.RefObject<Map<string, RemoteHold>>
  orbitRef:       React.RefObject<OrbitControlsImpl | null>
  cameraLocked:   boolean
  cameraFlying:   boolean
  walkMode:       boolean
  islands:        readonly IslandDef[]
  setCharMode:    (uid: string, mode: DragMode | null) => void
  onHeldMove:     (pos: THREE.Vector3) => void
  onHoldStale:    (uid: string) => void
}

function PhysicsUpdater({
  draggingUid, dragCursor, dragCursorVel,
  charGroups, physicsMap, remoteHolds, orbitRef, cameraLocked, cameraFlying, walkMode, islands,
  setCharMode, onHeldMove, onHoldStale,
}: PhysicsUpdaterProps) {
  const { pointer, camera } = useThree()
  const raycaster  = useMemo(() => new THREE.Raycaster(), [])
  const holdPlane  = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT), [])
  const prevCursor = useRef(new THREE.Vector3())
  const hitPoint   = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDelta) => {
    // Clamp the timestep: after a stall (backgrounded tab, long GC pause) the
    // next frame's delta can be seconds — integrating that teleports flying
    // characters across (or off) the island.
    const delta = Math.min(rawDelta, 0.1)

    // Update orbit enabled state (the camera also takes the controls away from
    // the user while it glides to another island)
    if (orbitRef.current) {
      orbitRef.current.enabled =
        !draggingUid.current && !cameraLocked && !cameraFlying && !walkMode
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
          phys.pos.x = THREE.MathUtils.lerp(phys.pos.x, hitPoint.x, 0.14)
          phys.pos.y = THREE.MathUtils.lerp(phys.pos.y, hitPoint.y - HEAD_HEIGHT, 0.14)
          phys.pos.z = THREE.MathUtils.lerp(phys.pos.z, hitPoint.z, 0.14)
          clampToNearestIsland(phys.pos, islands)
          group.position.copy(phys.pos)
          // Tilt body to follow drag direction — feels like hauling dead weight
          group.rotation.x = THREE.MathUtils.lerp(group.rotation.x,  dragCursorVel.current.z * 0.022, 0.12)
          group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -dragCursorVel.current.x * 0.022, 0.12)
          // Stream the position so other members watch the drag live
          onHeldMove(phys.pos)
        }
      }
    }

    // Tick physics states
    physicsMap.current.forEach((phys, uid) => {
      const group = charGroups.current.get(uid)
      if (!group) return

      if (phys.mode === 'held' && draggingUid.current !== uid) {
        // Held by another member: glide toward their streamed drag position.
        // If the stream goes quiet (dragger crashed or lost connection),
        // let go so the character doesn't dangle forever.
        const hold = remoteHolds.current.get(uid)
        if (hold) {
          if (Date.now() - hold.lastAt > HOLD_STALE_MS) {
            remoteHolds.current.delete(uid)
            onHoldStale(uid)
            phys.vel.set(0, -2, 0)
            phys.angVel.set(0, 0, 0)
            setCharMode(uid, 'flying')
            const sp = physicsMap.current.get(uid)
            if (sp) sp.gentleDrop = true
            return
          }
          const k = Math.min(1, delta * 9)
          phys.pos.lerp(hold.target, k)
          clampToNearestIsland(phys.pos, islands)
          group.position.copy(phys.pos)
          // Same hauled-weight tilt the dragger sees, from the glide velocity
          group.rotation.x = THREE.MathUtils.lerp(group.rotation.x,  (hold.target.z - phys.pos.z) * 0.35, 0.12)
          group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -(hold.target.x - phys.pos.x) * 0.35, 0.12)
        }
      } else if (phys.mode === 'flying') {
        // Ballistic integration
        phys.vel.y -= GRAVITY * delta
        phys.pos.addScaledVector(phys.vel, delta)

        // Tumble: apply angular velocity to group rotation
        group.rotation.x += phys.angVel.x * delta
        group.rotation.y += phys.angVel.y * delta
        group.rotation.z += phys.angVel.z * delta
        const angDrag = Math.pow(0.984, delta * 60)
        phys.angVel.multiplyScalar(angDrag)

        // A throw that crosses the rounded edge leaves the island: no walls,
        // no ground — the character sails off and tumbles into the clouds,
        // then despawns for a sky respawn. Land anywhere in the archipelago
        // and you land *on* it.
        const overIsland = islandAt(phys.pos.x, phys.pos.z, islands) !== null

        if (!overIsland) {
          if (phys.pos.y < FALL_DEPTH) {
            group.visible = false
            setCharMode(uid, 'fallen')
          }
          group.position.copy(phys.pos)
          return
        }

        // Ground collision — only while over the island. The floor height
        // accounts for the body's full tumble orientation so the rotated bean
        // never dips below the ground plane.
        const effectiveFloor = capsuleFloorY(group.quaternion)

        if (phys.pos.y <= effectiveFloor) {
          phys.pos.y = effectiveFloor

          const impactVY    = Math.abs(phys.vel.y)
          const totalSpeed  = phys.vel.length()
          const bounceAtten = 0.30 - phys.bounceCount * 0.09  // weaker each bounce

          if (bounceAtten > 0.05 && impactVY > 1.2 && phys.bounceCount < 3) {
            // Bounce: reflect vertical velocity with attenuation; shed lateral + angular velocity
            phys.vel.y  = impactVY * bounceAtten
            phys.vel.x *= 0.65
            phys.vel.z *= 0.65
            phys.angVel.multiplyScalar(0.45)
            phys.bounceCount += 1
            playThud(Math.min(1, impactVY / 16) * 0.6)
            // Stay in flying mode — group.position.copy(phys.pos) at end of block applies
          } else {
            // Final landing
            phys.vel.y = 0  // kill vertical; keep lateral so sliding can decelerate it
            phys.bounceCount = 0
            playThud(Math.min(1, totalSpeed / 12))
            if (totalSpeed >= IMPACT_MAD) buzz(totalSpeed >= IMPACT_DAZE ? 45 : 25)

            if (totalSpeed >= IMPACT_DAZE) {
              // Hard impact: slide to a stop, then snap to fallen pose
              setCharMode(uid, 'sliding')
              const sp = physicsMap.current.get(uid)
              if (sp) sp.pendingMode = 'dazed'
            } else if (totalSpeed >= IMPACT_MAD) {
              // Medium impact: slide to a stop, then mad (lerps upright smoothly)
              setCharMode(uid, 'sliding')
              const sp = physicsMap.current.get(uid)
              if (sp) sp.pendingMode = 'mad'
            } else {
              // Gentle landing: waking mode lerps back to upright if still tilted
              phys.vel.set(0, 0, 0)
              phys.angVel.set(0, 0, 0)
              if (Math.abs(group.rotation.x) > 0.06 || Math.abs(group.rotation.z) > 0.06) {
                setCharMode(uid, 'waking')
              } else {
                group.rotation.x = 0
                group.rotation.z = 0
                setCharMode(uid, null)
              }
            }
          }
        }

        group.position.copy(phys.pos)
      } else if (phys.mode === 'sliding') {
        // On the first slide frame, read how the body is tumbling and lock in
        // the pose it will settle into: a hard hit (dazed) lies flat however it
        // fell — face-down, on a side, or on its back; a medium hit (mad) skids
        // to a stop upright.
        if (phys.modeTimer === 0) {
          if (phys.pendingMode === 'dazed') {
            const pose = readLyingPose(group.quaternion)
            phys.heading  = pose.heading
            phys.landRoll = pose.roll
          } else {
            phys.heading  = group.rotation.y
            phys.landRoll = 0
          }
          phys.angVel.multiplyScalar(0.3)
        }
        phys.modeTimer += delta

        // Ground friction on the skid
        const friction = Math.pow(0.04, delta)  // near-zero in ~0.5s
        phys.vel.x *= friction
        phys.vel.z *= friction
        phys.vel.y  = 0

        // Settle toward the resting orientation (no clamp, so nothing locks at a
        // fixed lean; slerp takes the short way so it never flops to the far side)
        if (phys.pendingMode === 'dazed') lyingQuat(_qc, phys.heading, phys.landRoll)
        else                              _qc.setFromAxisAngle(AXIS_Y, phys.heading)
        group.quaternion.slerp(_qc, Math.min(1, delta * 5))

        // Rest exactly on the ground at the current tilt
        phys.pos.y = capsuleFloorY(group.quaternion)

        // Slide position
        phys.pos.x += phys.vel.x * delta
        phys.pos.z += phys.vel.z * delta
        clampToNearestIsland(phys.pos, islands)
        group.position.copy(phys.pos)

        // Hand off once the skid has stopped AND the body has settled
        const lateralSq = phys.vel.x * phys.vel.x + phys.vel.z * phys.vel.z
        if (lateralSq < 0.05 && group.quaternion.angleTo(_qc) < 0.12) {
          setCharMode(uid, phys.pendingMode ?? null)
        }
      } else if (phys.mode === 'dazed') {
        // Knocked out: lie still (limbs go limp in MiiCharacter) before getting up
        phys.modeTimer += delta
        phys.pos.y = capsuleFloorY(group.quaternion)
        group.position.copy(phys.pos)
        if (phys.modeTimer >= 3.0) {
          setCharMode(uid, 'waking')
        }
      } else if (phys.mode === 'waking') {
        // Getting up. On entry, read the resting pose. If knocked flat, the
        // character first ROLLS onto its stomach (roll → 0 about the long axis),
        // then plants its arms (WAKE_HOLD, animated in MiiCharacter) and pushes
        // off the ground with an eased rise. A lightly-tilted body just steadies.
        if (phys.modeTimer === 0) {
          phys.prone = _upVec.set(0, 1, 0).applyQuaternion(group.quaternion).y < 0.6
          if (phys.prone) {
            const pose = readLyingPose(group.quaternion)
            phys.heading  = pose.heading
            phys.landRoll = pose.roll
          } else {
            // Near-upright: the long axis is ~vertical so its heading is
            // unreliable; keep the current yaw.
            phys.heading  = group.rotation.y
            phys.landRoll = 0
          }
        }
        phys.modeTimer += delta

        if (!phys.prone) {
          // Lightly tilted: steady back upright quickly
          _qc.setFromAxisAngle(AXIS_Y, phys.heading)
          group.quaternion.slerp(_qc, Math.min(1, delta * 6))
          if (phys.modeTimer >= 0.4) setCharMode(uid, null)
        } else if (phys.modeTimer < WAKE_ROLL) {
          // Roll onto the stomach
          const f = phys.modeTimer / WAKE_ROLL
          const e = f * f * (3 - 2 * f)   // smoothstep
          group.quaternion.copy(lyingQuat(_qc, phys.heading, phys.landRoll * (1 - e)))
        } else if (phys.modeTimer < WAKE_ROLL + WAKE_HOLD) {
          // Prone, planting the hands (arms animate in MiiCharacter)
          group.quaternion.copy(lyingQuat(_qc, phys.heading, 0))
        } else {
          // Push off: ease the whole body from prone up to standing
          const rise = Math.min(1, (phys.modeTimer - WAKE_ROLL - WAKE_HOLD) / WAKE_RISE)
          const f = 1 - Math.pow(1 - rise, 3)
          lyingQuat(_qa, phys.heading, 0)
          _qb.setFromAxisAngle(AXIS_Y, phys.heading)
          group.quaternion.copy(_qa).slerp(_qb, f)
          if (phys.modeTimer >= WAKE_ROLL + WAKE_HOLD + WAKE_RISE + 0.1) {
            setCharMode(uid, null)
          }
        }
        phys.pos.y = capsuleFloorY(group.quaternion)
        group.position.copy(phys.pos)
      } else if (phys.mode === 'mad') {
        phys.modeTimer += delta
        // Settle upright (heading preserved)
        _qc.setFromAxisAngle(AXIS_Y, phys.heading)
        group.quaternion.slerp(_qc, Math.min(1, delta * 5))
        phys.pos.y = THREE.MathUtils.lerp(phys.pos.y, capsuleFloorY(group.quaternion), Math.min(1, delta * 5))
        group.position.copy(phys.pos)
        if (phys.modeTimer >= 2.5) {
          setCharMode(uid, null)
        }
      } else if (phys.mode === 'fallen') {
        // Hidden below the clouds; after a beat, drop back in from the sky.
        // Respawn AT the current shared wander waypoint with a deterministic
        // yaw, so every client sees the drop-in at the same spot and the
        // simulations re-converge (vel/angVel start at zero → the fall and
        // bounce chain is identical everywhere).
        phys.modeTimer += delta
        if (phys.modeTimer >= RESPAWN_DELAY) {
          const h  = hashUid(uid)
          const wp = currentWaypoint(h, Date.now(), WANDER_BOUNDS)
          phys.pos.set(wp.x, RESPAWN_HEIGHT, wp.z)
          phys.vel.set(0, 0, 0)
          phys.angVel.set(0, 0, 0)
          group.rotation.set(0, respawnYaw(h, wp.slot), 0)
          group.position.copy(phys.pos)
          group.visible = true
          setCharMode(uid, 'flying')
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

type CloudRing = { count: number; r0: number; r1: number; y0: number; y1: number; w0: number; w1: number }

// The mist an island sits in — laid around each island's own centre, which is
// what makes it read as floating rather than as a hole in a cloud sea.
// Trimmed from 22/26 to pay for the veil and sea rings below: on a shrouded
// island the veil's own rim ring now sits in the same band, and on an earned one
// the thicker sea reads through the gaps. Sprite count is the draw-call budget.
const COLLAR_RINGS: CloudRing[] = [
  { count: 19, r0: 14, r1: 18, y0: -2.0, y1: -3.5, w0: 3, w1: 6 },
  { count: 22, r0: 17, r1: 24, y0: -2.5, y1: -4.5, w0: 4, w1: 8 },
]

// The sky the whole archipelago sits in. Radii are fractions of its reach, so
// the shell always closes outside the land: written as absolute numbers they
// were tuned around a lone 26-unit island, and the two lowest rings ended up
// hanging in front of the satellites once the ring of islands grew past them.
const SKY_RINGS: CloudRing[] = [
  { count: 26, r0: 1.05, r1: 1.35, y0:  1.0, y1:  4.0, w0:  8, w1: 13 },  // above the land, near the camera
  { count: 24, r0: 1.30, r1: 1.70, y0: -0.5, y1:  2.0, w0:  8, w1: 15 },
  { count: 34, r0: 0.00, r1: 0.62, y0: -2.8, y1: -5.5, w0:  9, w1: 16 },  // the sea directly under the archipelago
  { count: 56, r0: 0.60, r1: 1.10, y0: -3.0, y1: -5.0, w0:  8, w1: 14 },  // the sea below, between islands
  { count: 52, r0: 1.10, r1: 1.60, y0: -1.0, y1: -3.0, w0: 11, w1: 18 },
  { count: 50, r0: 1.60, r1: 2.20, y0:  0.0, y1: -2.0, w0: 14, w1: 23 },  // horizon level
  { count: 48, r0: 2.20, r1: 3.00, y0:  1.5, y1: -0.5, w0: 19, w1: 30 },  // far sky
  // Deep sea, out past where the camera can pull back to. Pulled all the way
  // out and tilted down, the bottom of the frame is the volume *below and in
  // front of* the land — without this it is empty sky with island columns
  // hanging in it.
  { count: 34, r0: 1.70, r1: 2.60, y0: -5.0, y1: -12.0, w0: 18, w1: 30 },
]

function ringSprites(
  ring: CloudRing,
  rng: () => number,
  centre: { x: number; z: number },
  radiusScale: number,
  out: SpriteDef[],
) {
  for (let i = 0; i < ring.count; i++) {
    const angle = (i / ring.count) * Math.PI * 2 + rng() * 0.45 - 0.225
    const radius = (ring.r0 + rng() * (ring.r1 - ring.r0)) * radiusScale
    const y = ring.y0 + rng() * (ring.y1 - ring.y0)
    const width = ring.w0 + rng() * (ring.w1 - ring.w0)
    out.push({
      pos: [centre.x + Math.cos(angle) * radius, y, centre.z + Math.sin(angle) * radius],
      texIdx: Math.floor(rng() * 3),
      width,
    })
  }
}

// Cloud drawn *over* an island the group hasn't earned, rather than under it.
// This is what makes a shrouded island read as veiled instead of as a dark
// shape someone forgot to texture.
//
// The rim ring is the one that matters. Puffs laid only *inside* the disc hide
// the island's contents but leave its outline crisp, which is fine at distance
// — the sky rings in front of it do the work — and reads as a flat grey sticker
// once the camera comes close. Straddling the rim breaks the silhouette itself,
// so the shape dissolves into mist from any range. The canopy hides what's on
// it; the skirt ties the veil down into the island's own collar.
const VEIL_RINGS: CloudRing[] = [
  { count: 15, r0: 0.00, r1: 0.78, y0:  0.4, y1:  2.0, w0: 7, w1: 13 },  // canopy — has to cover the disc from straight above
  { count: 13, r0: 0.82, r1: 1.14, y0: -1.1, y1:  1.0, w0: 6, w1: 11 },  // rim — breaks the outline
  { count:  6, r0: 0.45, r1: 0.95, y0: -2.4, y1: -0.9, w0: 6, w1: 10 },  // skirt, down into the collar
]
// Veil radii are fractions of an island's true reach: a full-size squircle
// bulges to ≈15.9 at its diagonals, not FSIZE/2.
const VEIL_REACH = 16

/**
 * Every cloud in the scene: a mist collar around each island — earned or not,
 * so the count doesn't change as the group progresses — a veil over the ones
 * still to come, and a shell of sky rings scaled to hold the whole archipelago.
 * Each sprite is its own draw call, so the collars are deliberately small; the
 * sea below carries the rest.
 */
function makeSpriteDefs(
  centres: readonly { x: number; z: number }[],
  reach: number,
  veiled: readonly { x: number; z: number }[] = [],
): SpriteDef[] {
  const rng = seededRandom(42)
  const defs: SpriteDef[] = []
  for (const centre of centres) {
    for (const ring of COLLAR_RINGS) ringSprites(ring, rng, centre, 1, defs)
  }
  for (const centre of veiled) {
    for (const ring of VEIL_RINGS) ringSprites(ring, rng, centre, VEIL_REACH, defs)
  }
  for (const ring of SKY_RINGS) ringSprites(ring, rng, { x: 0, z: 0 }, reach, defs)
  return defs
}

// Multiply the alpha channel by a soft elliptical falloff (normalized to the
// canvas so it matches the 2:1 aspect). The centre 72% keeps its full puff
// detail; the outer band fades to fully transparent so puffs clipped by the
// canvas border don't leave a hard rectangular sprite seam.
function fadeCloudEdges(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H)
  const data = img.data
  for (let y = 0; y < H; y++) {
    const ny = (y / (H - 1)) * 2 - 1
    for (let x = 0; x < W; x++) {
      const nx = (x / (W - 1)) * 2 - 1
      const dist = Math.hypot(nx, ny)
      if (dist <= 0.72) continue
      const f = Math.max(0, 1 - (dist - 0.72) / 0.28)
      data[(y * W + x) * 4 + 3] *= f
    }
  }
  ctx.putImageData(img, 0, 0)
}

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

  fadeCloudEdges(ctx, W, H)
  return new THREE.CanvasTexture(cv)
}

// Full-sphere billboard via THREE.Sprite — always faces the camera on every axis, no visible edges
function CloudSprite({ pos, texture, width }: {
  pos: [number, number, number]
  texture: THREE.Texture
  width: number
}) {
  const ref    = useRef<THREE.Sprite>(null)
  // Deterministic per-sprite drift offset (render must stay pure)
  const driftT = (Math.abs(pos[0] * 12.9898 + pos[2] * 78.233) % (Math.PI * 2))
  const height = width * 0.5  // 2:1 aspect matches canvas texture

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.05 + driftT
    ref.current.position.x = pos[0] + Math.sin(t)        * 4.0
    ref.current.position.z = pos[2] + Math.cos(t * 0.65) * 3.0
  })

  return (
    <sprite ref={ref} position={pos} scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.01} depthWrite={false} />
    </sprite>
  )
}

function Clouds({ centres, reach, veiled }: {
  centres: readonly { x: number; z: number }[]
  reach: number
  /** Islands still to be earned — clouds hang over these, not just around them. */
  veiled: readonly { x: number; z: number }[]
}) {
  const [tex1, tex2, tex3] = useMemo(() => [
    makeCloudTex(101), makeCloudTex(202), makeCloudTex(303),
  ], [])

  const sprites = useMemo(() => makeSpriteDefs(centres, reach, veiled), [centres, reach, veiled])

  const fadeTex = useMemo(() => {
    const size = 1024, c = size / 2
    const cv   = document.createElement('canvas')
    cv.width   = cv.height = size
    const ctx  = cv.getContext('2d')!
    const g    = ctx.createRadialGradient(c, c, c * 0.05, c, c, c)
    // Near-opaque under the land and holding that most of the way out: this is
    // the floor that stops you seeing the columns hanging beneath the islands
    // when the camera is pulled back and tilted down. It still reaches zero at
    // the rim so the plane's own edge never shows.
    g.addColorStop(0.00, 'rgba(244,244,244,0.94)')
    g.addColorStop(0.45, 'rgba(244,244,244,0.86)')
    g.addColorStop(0.72, 'rgba(244,244,244,0.52)')
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
      {sprites.map((def, i) => (
        <CloudSprite key={i} pos={def.pos} texture={texArr[def.texIdx]} width={def.width} />
      ))}
    </>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────

// A member is "online" when their presence heartbeat (60s while the plaza is
// open) is recent. Shown in the presence tab, not on the characters.
const PRESENCE_TIMEOUT_MS = 150_000

// Compact a vector for a plaza-event doc
function plazaVec(v: THREE.Vector3): PlazaVec {
  return {
    x: Math.round(v.x * 1000) / 1000,
    y: Math.round(v.y * 1000) / 1000,
    z: Math.round(v.z * 1000) / 1000,
  }
}

function Scene({
  members,
  groupId,
  currentUid,
  selectedUid,
  focusPos,
  cameraLocked,
  onUnlock,
  onSelect,
  animatingUid,
  animationType,
  mobile,
  lowerGraphics,
  reducedMotion,
  gardenObjects,
  islandFrames,
  visit,
  groupVitality,
  pointsGiven,
  nowMs,
  dormant,
  plantMode,
  takenTiles,
  onPlantSelect,
  onTileSelect,
  walkMode,
  walkControl,
  walkerProbe,
  walkerRef,
  walkPaused,
  walkTargetUid,
  returnNonce,
  onWalkInteract,
  onWalkTargetChange,
  onWalkLockChange,
  onWalkCardAnchor,
  onWalkExit,
}: {
  members: GroupMember[]
  groupId: string
  currentUid: string
  selectedUid: string | null
  focusPos: [number, number, number] | null
  cameraLocked: boolean
  onUnlock: () => void
  onSelect: (member: GroupMember, pos: [number, number, number]) => void
  animatingUid: string | null
  animationType: 'celebrate' | 'shame' | null
  mobile: boolean
  lowerGraphics: boolean
  reducedMotion: boolean
  gardenObjects: PlazaObject[]
  islandFrames: IslandFrame[]
  visit: IslandVisit | null
  groupVitality: number
  pointsGiven: number
  nowMs: number
  dormant: boolean
  plantMode: boolean
  takenTiles: Set<string>
  onPlantSelect: (o: PlazaObject) => void
  onTileSelect: (t: Tile) => void
  walkMode: boolean
  walkControl: 'keyboard' | 'touch'
  walkerProbe?: React.RefObject<Locomotion | null>
  /** Filled with the live walker so the plaza can read where they stopped. */
  walkerRef: React.RefObject<Locomotion | null>
  walkPaused: boolean
  walkTargetUid: string | null
  returnNonce: number
  onWalkInteract: (uid: string) => void
  onWalkTargetChange: (uid: string | null) => void
  onWalkLockChange: (locked: boolean) => void
  onWalkCardAnchor: (anchor: { x: number; y: number; halfWidth: number } | null) => void
  onWalkExit: () => void
}) {
  const orbitRef     = useRef<OrbitControlsImpl | null>(null)
  const { gl }       = useThree()
  const locomotion   = useRef(makeLocomotion())
  // Read inside subscription callbacks that are registered once
  const walkModeRef  = useRef(walkMode)
  walkModeRef.current = walkMode

  // The plaza needs the walker's position when walk mode ends, to frame the
  // island they finished on. `walkerProbe` is the same ref handed to the
  // development-only /walkharness route as a test seam — the walker's position
  // lives in a ref that changes 60× a second and never reaches the DOM, so an
  // end-to-end test has no other way to see whether a tap moved anybody.
  useEffect(() => {
    walkerRef.current = locomotion.current
    if (walkerProbe) walkerProbe.current = locomotion.current
  }, [walkerProbe, walkerRef])

  // Pull back far enough to hold the whole archipelago — including the islands
  // still to be earned, which are in the scene as shrouds. Deriving this from
  // what's *unlocked* capped a new group at 40 units and put its own future out
  // of view, which is the one thing the shrouds exist to show.
  const camReach = useMemo(() => Math.max(40, archipelagoRadius(ALL_UNLOCKED_POINTS) * 2.1), [])

  // Every island the group has earned gets grass; the field is thinned by
  // distance so five of them cost about what one used to.
  const grassIslands = useMemo<GrassIsland[]>(
    () => unlockedIslands(pointsGiven).map((i) => ({ id: i.id, center: i.center, edge: i.edge })),
    [pointsGiven],
  )
  // The cloud shell has to hold whatever land exists, and each island needs its
  // own mist to float in.
  // Every island gets a collar, earned or not, so the cloud count — and with it
  // the draw-call cost — is the same however far along the group is.
  const islandCentres = useMemo(() => ISLANDS.map((i) => i.center), [])
  const veiledCentres = useMemo(
    () => ISLANDS.filter((i) => pointsGiven < i.unlockAtPoints).map((i) => i.center),
    [pointsGiven],
  )
  // Scaled to *every* island, not the earned ones — same reasoning as camReach
  // above. Derived from what's unlocked, a new group's whole cloud shell shrank
  // to the 16 units of the home island while the camera pulled back to 113 and
  // four shrouds sat at 38 with columns hanging under them: the sea was a puff
  // around home and the rest of the sky was bare, so zooming out showed the
  // undersides of islands the group hasn't even earned.
  const archipelagoReach = useMemo(() => archipelagoRadius(ALL_UNLOCKED_POINTS), [])
  // Everything that can be stood on, thrown onto, or cast a shadow over.
  const groundIslands = useMemo(() => unlockedIslands(pointsGiven), [pointsGiven])

  // While the camera is gliding to an island, OrbitControls must let go — its
  // own update() would otherwise pull the camera straight back to its target.
  const [flying, setFlying] = useState(false)
  // Orbiting happens around whichever island is being visited.
  const orbitTarget = useMemo<[number, number, number]>(() => {
    if (!visit) return [DEFAULT_CAM_LOOK.x, DEFAULT_CAM_LOOK.y, DEFAULT_CAM_LOOK.z]
    const { target } = islandView(getIsland(visit.id))
    return [target.x, target.y, target.z]
  }, [visit])

  const charGroups    = useRef<Map<string, THREE.Group>>(new Map())
  const physicsMap    = useRef<Map<string, PhysState>>(new Map())
  const draggingUid   = useRef<string | null>(null)
  const pendingPickup = useRef<{ uid: string; member: GroupMember; pos: [number, number, number] } | null>(null)
  // Set when a touch lands on a character, read and cleared by the walk-mode
  // touch handler. A tap on a buddy belongs to their card, not to the floor.
  const tapOnCharacter = useRef(false)
  const holdTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragCursor    = useRef(new THREE.Vector3())
  const dragCursorVel = useRef(new THREE.Vector3())
  const [dragModeMap, setDragModeMap] = useState<Map<string, DragMode>>(new Map())

  // (Spawn positions are computed inside MiiCharacter on mount: each character
  // appears at its current shared wander waypoint, so a client that joins late
  // renders everyone where other clients already have them.)

  // Live drag streaming: who is holding whom (for the ✋ pill) and where
  // remote-held characters should glide to. Local sends are throttled.
  const remoteHolds = useRef<Map<string, RemoteHold>>(new Map())
  const [heldByMap, setHeldByMap] = useState<Map<string, string>>(new Map())
  const holdSentAt = useRef(0)
  const setHeldBy = useCallback((uid: string, by: string | null) => {
    setHeldByMap(prev => {
      const next = new Map(prev)
      if (by === null) next.delete(uid)
      else next.set(uid, by)
      return next
    })
  }, [])
  const onHeldMove = useCallback((pos: THREE.Vector3) => {
    const uid = draggingUid.current
    if (!uid) return
    const now = Date.now()
    if (now - holdSentAt.current < 150) return
    holdSentAt.current = now
    updatePlazaHold(groupId, uid, currentUid, plazaVec(pos))
  }, [groupId, currentUid])

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
        bounceCount: 0,
        heading: 0,
        landRoll: 0,
        prone: false,
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
    // Walk mode owns the mouse (pointer lock), so carrying and throwing stay in
    // the orbit-camera mode. On touch there's no lock to fight over, and a tap
    // on a buddy still opens their card — so record the pending tap, but don't
    // arm the hold. You're a character down there, not a hand.
    if (walkMode && walkControl !== 'touch') return

    // Always use the character's live position, not the stale spawn position
    const group = charGroups.current.get(member.uid)
    const pos: [number, number, number] = group
      ? [group.position.x, group.position.y, group.position.z]
      : [0, 0, 0]

    pendingPickup.current = { uid: member.uid, member, pos }
    // Claim the gesture, so touch walk mode doesn't also read it as a tap on the
    // ground behind them and go marching off while the card opens.
    tapOnCharacter.current = true
    if (walkMode) return   // touch walk mode: the tap can open a card, not a hand

    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      const pickup = pendingPickup.current
      if (!pickup) return
      // Re-checked rather than trusted from the closure: walk mode may have been
      // entered in the 250ms since the finger landed.
      if (walkModeRef.current) { pendingPickup.current = null; return }
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
        bounceCount: 0,
        heading: 0,
        landRoll: 0,
        prone: false,
      })
      draggingUid.current = pickup.uid

      setDragModeMap(prev => {
        const next = new Map(prev)
        next.set(pickup.uid, 'held')
        return next
      })

      playPickup()
      buzz(10)
      setHeldBy(pickup.uid, currentUid)

      updatePlazaHold(groupId, pickup.uid, currentUid, plazaVec(startPos))
      holdSentAt.current = Date.now()
      sendPlazaEvent(groupId, {
        type: 'pickup', uid: pickup.uid, by: currentUid,
        pos: plazaVec(startPos),
      })
    }, 250)
  }, [walkMode, walkControl, cameraLocked, groupId, currentUid, setHeldBy])

  // Walked off the island in walk mode. Rather than reimplementing the fall,
  // put the body into the same 'flying' physics a thrown character gets: it
  // already tumbles into the clouds, despawns, and drops back in from the sky
  // at the shared waypoint. When it finishes it sets the mode back to null,
  // and the controller picks the walker up again.
  //
  // Local-only, like the rest of walk mode — no plaza event is broadcast, so
  // other members keep seeing this character on the wander schedule.
  const handleFellOff = useCallback((pos: THREE.Vector3, vel: THREE.Vector3) => {
    setCharMode(currentUid, 'flying')
    const phys = physicsMap.current.get(currentUid)
    if (!phys) return
    phys.pos.copy(pos)
    phys.vel.set(vel.x, Math.min(vel.y, 0), vel.z)
    phys.angVel.set(
      (Math.random() - 0.5) * 3.2,
      (Math.random() - 0.5) * 2.0,
      (Math.random() - 0.5) * 3.2,
    )
    playWhoosh(6)
  }, [currentUid, setCharMode])

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
            Math.max(1, speed * 0.13),
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
          playWhoosh(speed)
          buzz(18)
          clearPlazaHold(groupId, uid)
          sendPlazaEvent(groupId, {
            type: 'throw', uid, by: currentUid,
            pos: plazaVec(phys.pos), vel: plazaVec(phys.vel), angVel: plazaVec(phys.angVel),
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
          clearPlazaHold(groupId, uid)
          // Carry vel/angVel so remote clients replay the identical drop
          // instead of inventing their own random spin
          sendPlazaEvent(groupId, {
            type: 'drop', uid, by: currentUid,
            pos: plazaVec(phys.pos), vel: plazaVec(phys.vel), angVel: plazaVec(phys.angVel),
          })
        }
      }

      setHeldBy(draggingUid.current, null)
      draggingUid.current = null
    }
  }, [onSelect, groupId, currentUid, setHeldBy])

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

    // Everything below exists to feed OrbitControls and the carry raycaster, by
    // re-dispatching synthetic pointer and wheel events. Walk mode disables both
    // of those and registers its own touch handling in ThirdPersonController, so
    // while it's active this block stands down entirely rather than shadowing it
    // with synthetic traffic.
    function onTouchStart(e: TouchEvent) {
      if (walkModeRef.current) return
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
      if (walkModeRef.current) return
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
      if (walkModeRef.current) return
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

  // Apply other members' pickup/throw/drop broadcasts so every open plaza
  // shows the same manhandling. Our own events echo back and are skipped.
  const seenEventIds = useRef(new Set<string>())
  useEffect(() => {
    if (!groupId || !currentUid) return
    const unsub = subscribeToPlazaEvents(groupId, (ev) => {
      if (ev.by === currentUid) return                 // our own broadcast
      if (draggingUid.current === ev.uid) return       // we're holding them locally
      // Walking: the controller owns our transform. Another member grabbing us
      // on their client must not fight it for control of the same group.
      if (walkModeRef.current && ev.uid === currentUid) return
      if (seenEventIds.current.has(ev.id)) return
      seenEventIds.current.add(ev.id)

      const group = charGroups.current.get(ev.uid)
      if (!group) return

      setCharMode(ev.uid, ev.type === 'pickup' ? 'held' : 'flying')
      const phys = physicsMap.current.get(ev.uid)
      if (!phys) return

      phys.pos.set(ev.pos.x, ev.pos.y, ev.pos.z)
      if (ev.type === 'pickup') {
        phys.pos.y = HOLD_HEIGHT - HEAD_HEIGHT
        playPickup()
        setHeldBy(ev.uid, ev.by)
        // Seed the hold at the pickup point so the staleness rescue applies
        // even if the holder's plazaHolds stream never reaches us (e.g. their
        // writes are being denied) — without this the character would hang
        // frozen in mid-air until the release event.
        remoteHolds.current.set(ev.uid, {
          target: new THREE.Vector3(ev.pos.x, HOLD_HEIGHT - HEAD_HEIGHT, ev.pos.z),
          lastAt: Date.now(),
        })
      } else if (ev.type === 'throw') {
        phys.vel.set(ev.vel?.x ?? 0, ev.vel?.y ?? 0, ev.vel?.z ?? 0)
        phys.angVel.set(ev.angVel?.x ?? 0, ev.angVel?.y ?? 0, ev.angVel?.z ?? 0)
        playWhoosh(phys.vel.length())
        remoteHolds.current.delete(ev.uid)
        setHeldBy(ev.uid, null)
      } else {
        phys.gentleDrop = true
        // New events carry the drop physics; fall back to the legacy local
        // randoms for events written by older clients
        phys.vel.set(ev.vel?.x ?? 0, ev.vel?.y ?? -2, ev.vel?.z ?? 0)
        if (ev.angVel) phys.angVel.set(ev.angVel.x, ev.angVel.y, ev.angVel.z)
        else phys.angVel.set(0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5)
        remoteHolds.current.delete(ev.uid)
        setHeldBy(ev.uid, null)
      }
      group.visible = true
      group.position.copy(phys.pos)
    })
    return unsub
  }, [groupId, currentUid, setCharMode, setHeldBy])

  // Live drag positions: other members' holds stream through plazaHolds docs.
  // The initial snapshot is applied too, so opening the plaza mid-drag shows
  // the character already in the holder's hand.
  useEffect(() => {
    if (!groupId || !currentUid) return
    const unsub = subscribeToPlazaHolds(groupId, (change) => {
      if (walkModeRef.current && change.uid === currentUid) return   // see above
      if (change.removed) {
        remoteHolds.current.delete(change.uid)
        // The matching throw/drop event usually handles the release; if it
        // hasn't arrived shortly after, let the character down gently.
        setTimeout(() => {
          const p = physicsMap.current.get(change.uid)
          if (p && p.mode === 'held' && draggingUid.current !== change.uid) {
            p.gentleDrop = true
            p.vel.set(0, -2, 0)
            p.angVel.set(0, 0, 0)
            setCharMode(change.uid, 'flying')
            const sp = physicsMap.current.get(change.uid)
            if (sp) sp.gentleDrop = true
            setHeldBy(change.uid, null)
          }
        }, 400)
        return
      }

      if (change.by === currentUid) return             // our own stream
      if (draggingUid.current === change.uid) return   // we're holding them locally

      const phys = physicsMap.current.get(change.uid)
      if (!phys || phys.mode !== 'held') {
        setCharMode(change.uid, 'held')
        const p = physicsMap.current.get(change.uid)
        if (p) p.pos.set(change.pos.x, change.pos.y, change.pos.z)
      }
      let hold = remoteHolds.current.get(change.uid)
      if (!hold) {
        hold = { target: new THREE.Vector3(), lastAt: 0 }
        remoteHolds.current.set(change.uid, hold)
      }
      hold.target.set(change.pos.x, change.pos.y, change.pos.z)
      hold.lastAt = Date.now()
      setHeldBy(change.uid, change.by)
    })
    return unsub
  }, [groupId, currentUid, setCharMode, setHeldBy])

  // Resolve holder uids to display names for the ✋ pill
  const heldByNames = useMemo(() => {
    const map = new Map<string, string>()
    heldByMap.forEach((byUid, uid) => {
      map.set(uid, byUid === currentUid ? 'You' : (members.find((m) => m.uid === byUid)?.displayName ?? '…'))
    })
    return map
  }, [heldByMap, members, currentUid])

  return (
    <>
      {/* sky is transparent — CSS gradient on the container div shows through */}
      <CameraController
        focusPos={focusPos}
        visit={visit}
        orbitRef={orbitRef}
        onUnlock={onUnlock}
        onFlying={setFlying}
        mobile={mobile}
        disabled={walkMode}
        returnNonce={returnNonce}
      />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Clouds centres={islandCentres} reach={archipelagoReach} veiled={veiledCentres} />
      </Suspense>
      <GrassFloor
        islands={grassIslands}
        mobile={mobile}
        lowerGraphics={lowerGraphics}
        reducedMotion={reducedMotion}
        characterGroups={charGroups}
      />
      <PlazaArchipelago pointsGiven={pointsGiven} lowerGraphics={lowerGraphics} />
      <PlazaGarden
        objects={gardenObjects}
        frames={islandFrames}
        groupVitality={groupVitality}
        nowMs={nowMs}
        dormant={dormant}
        plantMode={plantMode}
        takenTiles={takenTiles}
        lowerGraphics={lowerGraphics}
        onPlantSelect={onPlantSelect}
        onTileSelect={onTileSelect}
      />
      <BlobShadows members={members} charGroups={charGroups} islands={groundIslands} />
      {members.map((member) => (
        <MiiCharacter
          key={member.uid}
          member={member}
          bounds={WANDER_BOUNDS}
          isSelected={selectedUid === member.uid}
          celebrationType={member.uid === animatingUid ? animationType : null}
          dragMode={dragModeMap.get(member.uid) ?? null}
          heldBy={heldByNames.get(member.uid) ?? null}
          controlled={walkMode && member.uid === currentUid && !dragModeMap.get(currentUid)}
          locomotion={locomotion}
          noticing={walkMode && member.uid === walkTargetUid}
          onPickupStart={() => handlePickupStart(member)}
          onGroupMount={(uid, g) => {
            if (g) charGroups.current.set(uid, g)
            else   charGroups.current.delete(uid)
          }}
        />
      ))}
      <ThirdPersonController
        active={walkMode}
        islands={groundIslands}
        control={walkControl}
        paused={walkPaused}
        reducedMotion={reducedMotion}
        suspended={walkMode && !!dragModeMap.get(currentUid)}
        playerUid={currentUid}
        members={members}
        charGroups={charGroups}
        locomotion={locomotion}
        tapOnCharacter={tapOnCharacter}
        onInteract={onWalkInteract}
        onTargetChange={onWalkTargetChange}
        onLockChange={onWalkLockChange}
        onCardAnchor={onWalkCardAnchor}
        onFellOff={handleFellOff}
        onExit={onWalkExit}
      />
      <PhysicsUpdater
        draggingUid={draggingUid}
        dragCursor={dragCursor}
        dragCursorVel={dragCursorVel}
        charGroups={charGroups}
        physicsMap={physicsMap}
        remoteHolds={remoteHolds}
        orbitRef={orbitRef}
        cameraLocked={cameraLocked}
        cameraFlying={flying}
        walkMode={walkMode}
        islands={groundIslands}
        setCharMode={setCharMode}
        onHeldMove={onHeldMove}
        onHoldStale={(uid) => {
          setHeldBy(uid, null)
          // Delete the abandoned hold doc (rules allow any member) so it
          // doesn't replay a phantom hold to every future joiner
          clearPlazaHold(groupId, uid)
        }}
      />
      <OrbitControls
        ref={orbitRef}
        enabled={!cameraLocked && !flying && !walkMode}
        target={orbitTarget}
        minDistance={3}
        maxDistance={camReach}
        enableRotate={true}
        enablePan={false}
        minPolarAngle={POLAR_MIN}
        maxPolarAngle={POLAR_MAX}
        makeDefault
      />
    </>
  )
}

// ─── Presence tab ─────────────────────────────────────────────────────────────

// Slim tab on the left edge showing who's in the plaza right now.
function PresenceTab({ members, currentUid }: { members: GroupMember[]; currentUid: string }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const isOnline = (m: GroupMember) =>
    m.uid === currentUid ||
    (m.lastSeen !== undefined && now - m.lastSeen.getTime() < PRESENCE_TIMEOUT_MS)

  const sorted = [...members].sort(
    (a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.displayName.localeCompare(b.displayName)
  )
  const onlineCount = members.reduce((n, m) => n + (isOnline(m) ? 1 : 0), 0)

  const glass: React.CSSProperties = {
    background: 'rgba(15,15,25,0.78)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: '#fff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  }

  return (
    <div style={{ position: 'absolute', left: 0, top: '38%', zIndex: 10 }}>
      {open ? (
        <div style={{ ...glass, borderRadius: '0 14px 14px 0', padding: '8px 12px 10px 10px', maxWidth: 190 }}>
          <button
            onClick={() => setOpen(false)}
            aria-label="Hide who's online"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
              font: 'inherit', fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
              textTransform: 'uppercase', opacity: 0.85, padding: '2px 0 6px',
            }}
          >
            Online {onlineCount}/{members.length}
            <span aria-hidden style={{ marginLeft: 'auto', fontSize: 13 }}>‹</span>
          </button>
          {sorted.map((m) => {
            const online = isOnline(m)
            return (
              <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 13 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: online ? '#34d399' : '#6b7280',
                    boxShadow: online ? '0 0 6px rgba(52,211,153,0.8)' : 'none',
                  }}
                />
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  opacity: online ? 1 : 0.55,
                }}>
                  {m.displayName}{m.uid === currentUid ? ' (you)' : ''}
                </span>
                {!online && <span aria-label="offline" style={{ fontSize: 11, flexShrink: 0 }}>💤</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Show who's online (${onlineCount} of ${members.length})`}
          style={{
            ...glass,
            display: 'flex', alignItems: 'center', gap: 6,
            border: 'none', borderRadius: '0 12px 12px 0', cursor: 'pointer',
            padding: '8px 10px 8px 8px', font: 'inherit', fontSize: 13, fontWeight: 700,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.8)',
            }}
          />
          {onlineCount}
        </button>
      )}
    </div>
  )
}

// ─── Living plaza overlays ─────────────────────────────────────────────────────


// ── Growth preview ────────────────────────────────────────────────────────────
// Watching a plant mature normally takes a week of real check-ins, and the
// islands beyond home take thousands of points the group hasn't given yet, so
// preview mode fast-forwards the *rendering* — it writes nothing and never
// touches Firestore. It can raise any island and fly the camera out to stand on
// it, which is the only way to see a satellite up close before it is earned.
// Opt in by adding `?preview=1` to the plaza URL (short enough to type on a
// phone); everything after that is tap-driven, which matters when testing on
// mobile where editing query strings is painful.
export type PlazaPreview = { on: boolean; days: number; vitality: number; points: number | null }

export const PREVIEW_OFF: PlazaPreview = { on: false, days: 0, vitality: 0, points: null }

export function readPlazaPreview(): PlazaPreview {
  if (typeof window === 'undefined') return PREVIEW_OFF
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('preview') !== '1') return PREVIEW_OFF
    const days = Number(p.get('plazaDays'))
    const vit = Number(p.get('plazaVitality'))
    const pts = p.get('plazaPoints')
    const ptsN = Number(pts)
    return {
      on: true,
      days: Number.isFinite(days) && days > 0 ? days : 0,
      vitality: Number.isFinite(vit) && vit > 0 ? vit : 0,
      points: pts !== null && Number.isFinite(ptsN) && ptsN >= 0 ? ptsN : null,
    }
  } catch {
    return PREVIEW_OFF
  }
}

// Smallest (days, vitality) that reaches each stage, derived from the real
// thresholds so the presets can't drift out of sync with the growth rules.
export function presetForStage(stage: number): { days: number; vitality: number } {
  const i = Math.max(0, Math.min(stage, TIME_DAYS.length - 1))
  return { days: TIME_DAYS[i], vitality: NOURISH_DAYS[i] }
}

// "The Garden" → "Garden", so island chips stay narrow on a phone.
function shortName(island: { label: string }): string {
  return island.label.replace(/^The /, '')
}

// ─── Collapsing HUD cards ─────────────────────────────────────────────────────
// The plaza is the point, and on a phone these cards cover a quarter of it. So
// they say their piece and then get out of the way, sliding out to a pill you
// can tap to bring them back. Nothing becomes unreachable — the check-in button
// and the island list are both one tap from the collapsed state — and the same
// numbers live permanently in the Info tab for anyone who wants to read rather
// than glance.
const HUD_LINGER_MS = 7000

function HudCard({ pill, dot = false, children }: {
  /** What's left once the card slides away. Keep it to an emoji and a number. */
  pill: React.ReactNode
  /** Draw attention to the collapsed pill — something is waiting for you. */
  dot?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  // Whether the user closed it themselves. An auto-collapse should feel like
  // the card getting out of the way; a reopen should then stay open.
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (!open || pinned) return
    const t = setTimeout(() => setOpen(false), HUD_LINGER_MS)
    return () => clearTimeout(t)
  }, [open, pinned])

  if (!open) {
    return (
      <button
        onClick={() => { setPinned(true); setOpen(true) }}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(12,16,22,0.72)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999,
          padding: '7px 12px', cursor: 'pointer', color: '#cdd6df',
          fontSize: 12, fontWeight: 700,
        }}
      >
        {pill}
        {dot && (
          <span
            aria-hidden
            style={{
              position: 'absolute', top: 4, right: 4, width: 7, height: 7,
              borderRadius: '50%', background: '#f87171',
            }}
          />
        )}
      </button>
    )
  }

  return (
    <div className="hud-card" style={{ position: 'relative' }}>
      {children}
      <button
        onClick={() => { setPinned(false); setOpen(false) }}
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: -6, right: -6, width: 22, height: 22,
          borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(12,16,22,0.92)', color: '#cdd6df',
          fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

/**
 * The island list, and the only way to look at another island outside preview
 * mode. Panning is off (it strands the camera in open sky with no way back), so
 * without this the camera is nailed to wherever it last settled — you could walk
 * to the observatory, leave walk mode, and have no way to look at your own
 * character.
 */
function IslandJumper({ pointsGiven, visitIsland, onVisit }: {
  pointsGiven: number
  visitIsland: string | null
  onVisit: (islandId: string) => void
}) {
  const earned = unlockedIslands(pointsGiven)
  const p = progressToNext(pointsGiven)
  const here = visitIsland ?? HOME_ISLAND.id

  return (
    <div style={{
      background: 'rgba(12,16,22,0.72)', backdropFilter: 'blur(6px)',
      borderRadius: 14, padding: '10px 12px', minWidth: 200, maxWidth: 260,
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cdd6df' }}>
        <span style={{ fontSize: 14 }}>🏝️</span>
        <strong style={{ color: '#fff' }}>{earned.length}</strong>
        <span>island{earned.length === 1 ? '' : 's'}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.65, fontSize: 11 }}>
          {pointsGiven.toLocaleString()} given
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {earned.map((isl) => (
          <button
            key={isl.id}
            onClick={() => onVisit(isl.id)}
            title={`Look at ${isl.label}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 8px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.14)',
              background: here === isl.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
              color: here === isl.id ? '#14181f' : '#e6ecf1',
            }}
          >
            <span style={{ fontSize: 13 }}>{isl.emoji}</span>
            {shortName(isl)}
          </button>
        ))}
      </div>

      {p.next ? (
        <>
          <div style={{
            height: 6, borderRadius: 999, marginTop: 10, overflow: 'hidden',
            background: 'rgba(255,255,255,0.1)',
          }}>
            <div style={{
              width: `${Math.round(p.fraction * 100)}%`, height: '100%',
              background: 'linear-gradient(90deg,#43b05f,#7fd694)', borderRadius: 999,
              transition: 'width 400ms ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#9aa6b1', marginTop: 6, lineHeight: 1.4 }}>
            <strong style={{ color: '#e6ecf1' }}>{p.next.emoji} {p.next.label}</strong>
            {' '}rises in {p.remaining.toLocaleString()} more points given
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#8fd19e', marginTop: 8 }}>
          Every island earned 🎉
        </div>
      )}
    </div>
  )
}

// Tap-driven growth preview: jump straight to a stage, or nudge days/vitality
// independently to check the min(time, care) rule behaves. The island rows do
// the same for the archipelago — raise land the group hasn't earned yet, then
// fly out and stand on it.
function PreviewPanel({
  preview, previewCount, pointsGiven, visitIsland, onChange, onVisit, onFillOneOfEach, onClearPreviewPlants, onExit,
}: {
  preview: PlazaPreview
  previewCount: number
  /** Points the scene is actually drawing with (preview override or real). */
  pointsGiven: number
  visitIsland: string | null
  onChange: (p: PlazaPreview) => void
  onVisit: (islandId: string) => void
  onFillOneOfEach: () => void
  onClearPreviewPlants: () => void
  onExit: () => void
}) {
  const [open, setOpen] = useState(false)
  const stage = growthStage(0, 0, preview.days * 86_400_000, preview.vitality)

  const btn = (label: string, onClick: () => void, wide = false): React.ReactElement => (
    <button
      onClick={onClick}
      style={{
        minWidth: wide ? 0 : 30, flex: wide ? 1 : undefined,
        padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
        background: 'rgba(255,255,255,0.12)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.18)', fontSize: 12, fontWeight: 700,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      background: 'rgba(150,95,15,0.94)', color: '#fff', borderRadius: 12,
      padding: open ? 10 : '5px 10px', maxWidth: 250,
      border: '1px solid rgba(255,255,255,0.2)',
    }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
      >
        ⏩ preview · +{preview.days}d · vit {preview.vitality}
        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.4 }}>
            Render-only — nothing is saved. Showing <strong>{STAGE_LABELS[stage]}</strong>.
            {' '}Seeds are unlimited here and planting stays on this device.
          </div>

          <div style={{ display: 'flex', gap: 5 }}>
            {btn(`🌿 One of each · ${shortName(getIsland(visitIsland ?? undefined))}`, onFillOneOfEach, true)}
            {previewCount > 0 && btn(`✕ ${previewCount}`, onClearPreviewPlants)}
          </div>

          <div style={{ display: 'flex', gap: 5 }}>
            {STAGE_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => onChange({ ...preview, on: true, ...presetForStage(i) })}
                style={{
                  flex: 1, padding: '7px 2px', borderRadius: 8, cursor: 'pointer', fontSize: 10,
                  fontWeight: 800, border: '1px solid rgba(255,255,255,0.18)',
                  background: i === stage ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: i === stage ? '#8a5a10' : '#fff',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 52 }}>Days</span>
            {btn('−', () => onChange({ ...preview, days: Math.max(0, preview.days - 1) }))}
            <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 800 }}>{preview.days}</span>
            {btn('+', () => onChange({ ...preview, days: preview.days + 1 }))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 52 }}>Vitality</span>
            {btn('−', () => onChange({ ...preview, vitality: Math.max(0, preview.vitality - 1) }))}
            <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 800 }}>{preview.vitality}</span>
            {btn('+', () => onChange({ ...preview, vitality: preview.vitality + 1 }))}
          </div>

          <div style={{ fontSize: 10, opacity: 0.85, paddingTop: 2 }}>
            Raise land — set the group&apos;s points given:
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ISLANDS.map((isl) => (
              <button
                key={isl.id}
                onClick={() => onChange({ ...preview, on: true, points: isl.unlockAtPoints })}
                title={`${isl.label} · ${isl.unlockAtPoints} pts`}
                style={{
                  padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: pointsGiven >= isl.unlockAtPoints ? '#fff' : 'rgba(255,255,255,0.12)',
                }}
              >
                {isl.emoji}
              </button>
            ))}
            {btn('all', () => onChange({ ...preview, on: true, points: ALL_UNLOCKED_POINTS }))}
            {preview.points !== null && btn('reset', () => onChange({ ...preview, points: null }))}
          </div>

          <div style={{ fontSize: 10, opacity: 0.85, paddingTop: 2 }}>
            Fly to — visit an island up close:
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ISLANDS.map((isl) => {
              const reachable = isUnlocked(isl.id, pointsGiven)
              const here = (visitIsland ?? HOME_ISLAND.id) === isl.id
              return (
                <button
                  key={isl.id}
                  onClick={() => { if (reachable) onVisit(isl.id) }}
                  disabled={!reachable}
                  title={reachable ? `Fly to ${isl.label}` : `${isl.label} — raise it first`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    cursor: reachable ? 'pointer' : 'default', opacity: reachable ? 1 : 0.35,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: here && reachable ? '#fff' : 'rgba(255,255,255,0.12)',
                    color: here && reachable ? '#8a5a10' : '#fff',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{isl.emoji}</span>
                  {shortName(isl)}
                </button>
              )
            })}
          </div>

          {btn('Exit preview', onExit, true)}
        </div>
      )}
    </div>
  )
}

// Daily check-in card: the heartbeat of the living plaza. Shows how many members
// have shown up today, and (until you have) a button to check in with an
// optional note.
function CheckinCard({
  checkedIn, checkedInCount, memberCount, streak, dormant, busy, onCheckin,
}: {
  checkedIn: boolean
  checkedInCount: number
  memberCount: number
  streak: number
  dormant: boolean
  busy: boolean
  onCheckin: (note?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch',
      background: 'rgba(12,16,22,0.72)', backdropFilter: 'blur(6px)',
      borderRadius: 14, padding: '10px 12px', minWidth: 200, maxWidth: 260,
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cdd6df' }}>
        <span style={{ fontSize: 15 }}>{dormant ? '🌫️' : '🌱'}</span>
        <strong style={{ color: '#fff' }}>{checkedInCount}/{memberCount}</strong>
        <span>checked in today</span>
      </div>

      {checkedIn ? (
        <div style={{ fontSize: 12, color: '#8fd19e', display: 'flex', alignItems: 'center', gap: 6 }}>
          ✅ You&apos;re in{streak > 1 ? ` · ${streak}-day streak 🔥` : ''}
        </div>
      ) : (
        <>
          {open && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              placeholder="What did you show up for? (optional)"
              rows={2}
              style={{
                width: '100%', resize: 'none', borderRadius: 8, padding: '6px 8px',
                fontSize: 12, background: 'rgba(255,255,255,0.06)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)', outline: 'none',
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onCheckin(note.trim() || undefined)}
              disabled={busy}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10, border: 'none',
                background: busy ? '#3a6b45' : '#43b05f', color: '#fff', fontWeight: 700,
                fontSize: 13, cursor: busy ? 'default' : 'pointer',
              }}
            >
              {busy ? '…' : '✅ Check in for today'}
            </button>
            {!open && (
              <button
                onClick={() => setOpen(true)}
                style={{
                  padding: '8px 10px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)', color: '#cdd6df',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                title="Add a note"
              >
                ✏️
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Choose a species and (optionally) a dedication for a tapped tile.
function SpeciesPicker({
  busy, onCancel, onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: (species: string, dedication?: string) => void
}) {
  const [species, setSpecies] = useState(PLAZA_SPECIES[0].id)
  const [dedication, setDedication] = useState('')
  const chosen = getSpecies(species)

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', pointerEvents: 'auto',
    }} onClick={onCancel}>
      <div
        className="sheet-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#14181f',
          borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Plant a seed 🌱</div>
        <div style={{ color: '#9aa6b1', fontSize: 12, marginBottom: 14 }}>{chosen.blurb}</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {PLAZA_SPECIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSpecies(s.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                width: 72, padding: '10px 4px', borderRadius: 12, cursor: 'pointer',
                background: s.id === species ? 'rgba(67,176,95,0.22)' : 'rgba(255,255,255,0.05)',
                border: s.id === species ? '2px solid #43b05f' : '2px solid transparent',
                color: '#e6ecf1',
              }}
            >
              <span style={{ fontSize: 24 }}>{s.emoji}</span>
              <span style={{ fontSize: 11 }}>{s.label}</span>
            </button>
          ))}
        </div>

        <input
          value={dedication}
          onChange={(e) => setDedication(e.target.value.slice(0, 80))}
          placeholder="Dedication (optional) — e.g. “For our first 30-day streak”"
          style={{
            width: '100%', borderRadius: 10, padding: '10px 12px', fontSize: 13,
            background: 'rgba(255,255,255,0.06)', color: '#fff', marginBottom: 14,
            border: '1px solid rgba(255,255,255,0.12)', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', color: '#cdd6df', border: 'none',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(species, dedication.trim() || undefined)}
            disabled={busy}
            style={{
              flex: 2, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800,
              cursor: busy ? 'default' : 'pointer', border: 'none',
              background: busy ? '#3a6b45' : '#43b05f', color: '#fff',
            }}
          >
            {busy ? 'Planting…' : `Plant ${chosen.label}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// The "shared artifact" payoff: tap a plant to read its history.
function PlantPlaque({
  obj, groupVitality, nowMs, canRemove, busy, mobile, onClose, onRemove,
}: {
  obj: PlazaObject
  groupVitality: number
  nowMs: number
  canRemove: boolean
  busy: boolean
  mobile: boolean
  onClose: () => void
  onRemove: (o: PlazaObject) => void
}) {
  const species = getSpecies(obj.species)
  const stage = growthStage(obj.plantedAt.getTime(), obj.plantedAtVitality, nowMs, groupVitality)
  const grownThrough = Math.max(0, groupVitality - obj.plantedAtVitality)

  return (
    <div
      className="sheet-rise"
      style={mobile ? {
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, pointerEvents: 'auto',
      } : {
        position: 'absolute', left: 16, bottom: 16, zIndex: 20, width: 280, pointerEvents: 'auto',
      }}
    >
      <div style={{
        background: '#14181f', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: mobile ? '20px 20px 0 0' : 16, padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 30 }}>{species.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{species.label}</div>
            <div style={{ color: '#8fd19e', fontSize: 12 }}>{stageLabel(species.form, stage)}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#7c8894', fontSize: 20, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {obj.dedication && (
          <div style={{
            fontStyle: 'italic', color: '#e6ecf1', fontSize: 13, marginBottom: 10,
            padding: '8px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 10,
            borderLeft: '3px solid #43b05f',
          }}>
            “{obj.dedication}”
          </div>
        )}

        <div style={{ fontSize: 12, color: '#b6c0ca', lineHeight: 1.7 }}>
          <div>🌱 Planted by <strong style={{ color: '#fff' }}>{obj.plantedByName}</strong></div>
          <div>🕰️ {timeAgo(obj.plantedAt)}</div>
          <div>🌤️ Grown through {grownThrough} active group-{grownThrough === 1 ? 'day' : 'days'}</div>
        </div>

        {canRemove && (
          <button
            onClick={() => onRemove(obj)}
            disabled={busy}
            style={{
              marginTop: 12, width: '100%', padding: '9px', borderRadius: 10, fontSize: 13,
              cursor: busy ? 'default' : 'pointer', border: '1px solid rgba(255,120,120,0.3)',
              background: 'rgba(255,80,80,0.12)', color: '#ff9a9a',
            }}
          >
            {busy ? '…' : 'Remove plant'}
          </button>
        )}
      </div>
    </div>
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
  inviteCode?: string
  remainingGive: number
  remainingTake: number
  lowerGraphics?: boolean
  reducedMotion?: boolean
  /** Height of any chrome floating over the bottom of the plaza (the app's tab
      bar). The plaza fills the viewport and the bar is fixed on top of it, so
      every bottom-anchored overlay has to be lifted clear of it. */
  bottomInset?: number
  presets?: PlazaPreset[]
  timezone?: string
  plazaActiveDays?: number
  plazaLastActiveDay?: string
  plazaPointsGiven?: number
  /** Test seam — see the Scene effect that fills it. */
  walkerProbe?: React.RefObject<Locomotion | null>
  onPointsSubmitted?: () => void
  onAvatarUpdated?: () => void
  onReady?: () => void
}

export default function MiiPlaza({
  members, currentUid, groupId, inviteCode, remainingGive, remainingTake, lowerGraphics = false, reducedMotion = false, bottomInset = 0, presets, timezone, plazaActiveDays = 0, plazaLastActiveDay, plazaPointsGiven = 0, walkerProbe, onPointsSubmitted, onAvatarUpdated, onReady,
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
  // How this device can drive walk mode, if at all. 'keyboard' wants WASD and a
  // lockable pointer; 'touch' taps a destination and walks there. 'none' is a
  // narrow desktop window — a mouse with nowhere near enough room.
  const [walkInput, setWalkInput]           = useState<'none' | 'keyboard' | 'touch'>('none')
  const [walkMode, setWalkMode]             = useState(false)
  const [walkTarget, setWalkTarget]         = useState<string | null>(null)
  const [pointerLocked, setPointerLocked]   = useState(false)
  const [returnNonce, setReturnNonce]       = useState(0)
  // Where the card's character is on screen, and how big the card currently is
  // — both needed to place the card beside them instead of over them.
  const [walkCardAnchor, setWalkCardAnchor] = useState<{ x: number; y: number; halfWidth: number } | null>(null)
  const [walkCardSize, setWalkCardSize]     = useState({ width: 270, height: 420 })
  const [viewSize, setViewSize]             = useState({ width: 0, height: 0 })
  const walkCardRef = useRef<HTMLDivElement>(null)

  // ── Living plaza state ──
  const [gardenObjects, setGardenObjects] = useState<PlazaObject[]>([])
  const [todayCheckins, setTodayCheckins] = useState<Checkin[]>([])
  const [plantMode, setPlantMode]         = useState(false)
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null)
  const [pendingTile, setPendingTile]     = useState<Tile | null>(null)
  const [busy, setBusy]                   = useState(false)
  // Tap-driven growth preview (opt in with ?preview=1). Render-only.
  //
  // Read on mount rather than in the initializer. The server has no URL to
  // read, so deriving it during the first client render makes that render
  // disagree with the server's HTML ("1 island" vs "5"), and React responds by
  // throwing the whole tree away and rebuilding it — an expensive way to start
  // when there's a WebGL canvas in it.
  // A one-shot read of a browser-only value on mount is exactly what this rule's
  // own guidance says an effect is for, so the cascade it warns about is the
  // intent here rather than an accident.
  const [preview, setPreview] = useState<PlazaPreview>(PREVIEW_OFF)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPreview(readPlazaPreview()) }, [])
  // A slowly-advancing clock so growth stages recompute without calling the
  // impure Date.now() during render. Ticks once a minute; the preview offset is
  // applied as a derived value so tapping updates the scene immediately.
  const [clockMs, setClockMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setClockMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const nowMs = clockMs + (preview.on ? preview.days * 86_400_000 : 0)
  const effectiveVitality = preview.on ? preview.vitality : plazaActiveDays
  const effectivePoints = preview.on && preview.points !== null ? preview.points : plazaPointsGiven
  // Placement frames for every island the group has earned
  const islandFrames = useMemo<IslandFrame[]>(
    () => unlockedIslands(effectivePoints).map((i) => ({
      id: i.id, center: i.center, scale: i.scale, edge: i.edge,
    })),
    [effectivePoints],
  )
  // Plants placed while previewing live only on this device — they are never
  // written to Firestore, so testing never litters the group's real island.
  const [previewPlants, setPreviewPlants] = useState<PlazaObject[]>([])
  // Island the camera has been sent to (preview sightseeing). null = the
  // plaza's own camera, untouched. The nonce lets a repeat tap re-centre a view
  // the user has since orbited away from.
  const [visit, setVisit] = useState<IslandVisit | null>(null)
  // Filled by the Scene with the live walker, so exiting walk mode can frame
  // whichever island they stopped on.
  const walkerRef = useRef<Locomotion | null>(null)
  // Islands as *ground* — what the walker can be standing on when they stop.
  const groundIslands = useMemo(() => unlockedIslands(effectivePoints), [effectivePoints])
  const visitTo = useCallback((id: string) => {
    setVisit((v) => ({ id, nonce: (v?.nonce ?? 0) + 1 }))
  }, [])
  // If the island being visited sinks back into the clouds — points lowered, or
  // preview switched off — come home rather than orbit empty sky. Memoised so
  // the camera only reacts when the destination actually changes.
  const visitTarget = useMemo<IslandVisit | null>(
    () => (visit && !isUnlocked(visit.id, effectivePoints) ? { id: HOME_ISLAND.id, nonce: visit.nonce } : visit),
    [visit, effectivePoints],
  )

  const today = useMemo(() => dayKey(timezone), [timezone])
  const currentMember = useMemo(() => members.find((m) => m.uid === currentUid), [members, currentUid])
  const seeds = currentMember?.seeds ?? 0
  const checkedInToday = currentMember?.lastCheckinDate === today
  // Preview mode hands out unlimited seeds so every species can be inspected.
  const canPlant = preview.on || seeds > 0
  const isMayor = currentMember?.isAdmin === true

  // Real plants plus any local preview plants
  const allObjects = useMemo(
    () => (preview.on && previewPlants.length ? [...gardenObjects, ...previewPlants] : gardenObjects),
    [gardenObjects, previewPlants, preview.on],
  )

  const takenTiles = useMemo(
    () => new Set([
      ...allObjects.map((o) => tileKey(o.tile)),
      // Where an island's own centrepiece stands. Planting inside the monument
      // would grow a tree through it.
      ...groundIslands.flatMap((i) => reservedTiles(i).map(tileKey)),
    ]),
    [allObjects, groundIslands],
  )
  const dormant = useMemo(
    () => isDormant(plazaLastActiveDay, [today, dayKey(timezone, -1)]),
    [plazaLastActiveDay, today, timezone],
  )
  // Derive the open plaque from live data — if the plant is removed, it vanishes.
  const selectedPlant = useMemo(
    () => allObjects.find((o) => o.id === selectedPlantId) ?? null,
    [allObjects, selectedPlantId],
  )

  // Subscribe to the garden and to today's check-ins
  useEffect(() => subscribeToPlazaObjects(groupId, setGardenObjects), [groupId])
  useEffect(() => subscribeToCheckins(groupId, today, setTodayCheckins), [groupId, today])

  async function handleCheckin(note?: string) {
    if (busy || checkedInToday) return
    setBusy(true)
    try {
      await recordCheckin(groupId, currentUid, note)
    } catch (err) {
      console.warn('[plaza] check-in failed', err)
    } finally {
      setBusy(false)
    }
  }

  // Build a local-only plant. Planted "now" against the base clock and at zero
  // vitality, so the preview's Days/Vitality controls drive its growth directly.
  function makePreviewPlant(species: string, tile: Tile, dedication?: string): PlazaObject {
    return {
      id: `preview_${species}_${tileKey(tile)}_${clockMs}`,
      kind: 'plant',
      species,
      tile,
      plantedBy: currentUid,
      plantedByName: currentMember?.displayName ?? 'You',
      plantedAt: new Date(clockMs),
      plantedAtVitality: 0,
      dedication,
    }
  }

  async function handlePlant(species: string, dedication?: string) {
    if (busy || !pendingTile) return
    // In preview, planting is local and seeds are unlimited — nothing is saved.
    if (preview.on) {
      setPreviewPlants((prev) => [...prev, makePreviewPlant(species, pendingTile, dedication)])
      setPendingTile(null)
      setPlantMode(false)
      return
    }
    setBusy(true)
    try {
      await plantSeed(groupId, currentUid, { species, tile: pendingTile, dedication })
      setPendingTile(null)
      setPlantMode(false)
    } catch (err) {
      console.warn('[plaza] plant failed', err)
    } finally {
      setBusy(false)
    }
  }

  // Drop one of every species on the free tiles closest to the middle, so all
  // the forms can be compared side by side at any growth stage. Fills whichever
  // island is being visited, so a satellite can be dressed and judged too.
  function handleFillOneOfEach() {
    const frame = islandFrames.find((f) => f.id === visitTarget?.id) ?? islandFrames[0]
    const free = tilesOnIsland(frame)
      .filter((t) => !takenTiles.has(tileKey(t)))
      .sort((a, b) => {
        const wa = tileToWorld(a, frame), wb = tileToWorld(b, frame)
        return Math.hypot(wa.x - frame.center.x, wa.z - frame.center.z)
             - Math.hypot(wb.x - frame.center.x, wb.z - frame.center.z)
      })
    setPreviewPlants((prev) => [
      ...prev,
      ...PLAZA_SPECIES.flatMap((s, i) =>
        free[i] ? [makePreviewPlant(s.id, free[i], `Preview · ${s.label}`)] : [],
      ),
    ])
    setPlantMode(false)
  }

  async function handleRemovePlant(obj: PlazaObject) {
    if (busy) return
    // Preview plants only exist locally — drop them without touching Firestore.
    if (obj.id.startsWith('preview_')) {
      setPreviewPlants((prev) => prev.filter((p) => p.id !== obj.id))
      setSelectedPlantId(null)
      return
    }
    setBusy(true)
    try {
      await removePlazaObject(groupId, obj.id)
      setSelectedPlantId(null)
    } catch (err) {
      console.warn('[plaza] remove failed', err)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768)
      const el = containerRef.current
      if (el) setViewSize({ width: el.clientWidth, height: el.clientHeight })

      // A fine pointer rules out touch-only devices regardless of viewport, and
      // pointer lock is what mouse-look depends on.
      const keyboard =
        window.innerWidth >= 768 &&
        window.matchMedia('(pointer: fine)').matches &&
        'requestPointerLock' in HTMLElement.prototype
      // Touch capability belongs to the device, not the viewport: a narrow
      // window on a desktop is still a mouse, and gets no walk mode at all.
      const touch =
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches

      // Keyboard is tested first and its predicate is unchanged, so a
      // touchscreen laptop still lands on the desktop scheme exactly as before.
      setWalkInput(keyboard ? 'keyboard' : touch ? 'touch' : 'none')
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Never leave walk mode running on a device that can no longer drive it.
  // Through a ref, the way the rest of this file reaches a live callback from an
  // effect that shouldn't re-run when the callback is re-created.
  const exitWalkModeRef = useRef(exitWalkMode)
  exitWalkModeRef.current = exitWalkMode
  useEffect(() => {
    if (walkInput === 'none' && walkMode) exitWalkModeRef.current()
  }, [walkInput, walkMode])

  // The card's height changes as you page through presets / confirm / stats, and
  // the placement clamp needs the live value to keep it on screen.
  useEffect(() => {
    const el = walkCardRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setWalkCardSize((prev) =>
        Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1
          ? { width, height }
          : prev,
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [walkMode, selectedMember])

  function enterWalkMode() {
    setSelectedMember(null)
    setFocusPos(null)
    setCameraLocked(false)
    setWalkMode(true)
  }

  function exitWalkMode() {
    setWalkMode(false)
    setWalkTarget(null)
    setPointerLocked(false)
    // Leave the camera looking at the island you actually finished on. Walking
    // to the observatory and then being yanked back to the plaza loses your
    // character completely: the orbit camera can't pan, so there'd be no way to
    // find them again.
    const walkerPos = walkerRef.current?.pos
    const landedOn = walkerPos ? islandAt(walkerPos.x, walkerPos.z, groundIslands) : null
    if (landedOn && landedOn.id !== HOME_ISLAND.id) {
      visitTo(landedOn.id)
      return
    }
    // Home: hand back to the same eased return-to-default path a closing card
    // uses, so the view glides back to the plaza framing instead of cutting.
    setCameraLocked(true)
    setReturnNonce((n) => n + 1)
  }

  useEffect(() => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current) }, [])

  function handleSelect(member: GroupMember, pos: [number, number, number]) {
    // In walk mode the spring arm stays put — no zoom-to-focus, no camera lock.
    // The card is positioned from the target's live projected screen position
    // (see walkPlacement), so there's no framing to precompute here.
    if (walkMode) {
      setSelectedMember(member)
      return
    }
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

  // Orbit mode can hard-code the card's offset from centre because zooming to a
  // character always frames them identically. Walk mode can't — the spring arm
  // could have the character anywhere — so place it against their live
  // projected screen position instead.
  const walkPlacement = walkMode && walkCardAnchor && viewSize.width > 0
    ? placeCardBeside(walkCardAnchor.x, walkCardAnchor.y, walkCardSize, viewSize, walkCardAnchor.halfWidth)
    : null

  const cardWrapperStyle: React.CSSProperties = isMobile
    ? { position: 'absolute', bottom: bottomInset, left: 0, right: 0, zIndex: 10, pointerEvents: 'auto' }
    : walkMode
      ? {
          position: 'absolute',
          left: walkPlacement?.left ?? 0,
          top:  walkPlacement?.top  ?? 0,
          zIndex: 10,
          pointerEvents: 'auto',
          // The anchor lands on the first frame after E; stay hidden until then
          // rather than flashing the card in the top-left corner.
          visibility: walkPlacement ? 'visible' : 'hidden',
        }
      : { position: 'absolute', left: 'calc(50% + 150px)', top: cardTop, zIndex: 10, pointerEvents: 'auto' }

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
        dpr={lowerGraphics ? 1 : [1, 2]}
        gl={{ antialias: !lowerGraphics, alpha: true, powerPreference: lowerGraphics ? 'low-power' : 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => { if (selectedMember) handleClose() }}
      >
        <Suspense fallback={null}>
          <Scene
            members={members}
            groupId={groupId}
            currentUid={currentUid}
            selectedUid={selectedMember?.uid ?? null}
            focusPos={focusPos}
            cameraLocked={cameraLocked}
            onUnlock={() => setCameraLocked(false)}
            onSelect={handleSelect}
            animatingUid={animatingUid}
            animationType={animationType}
            mobile={isMobile}
            lowerGraphics={lowerGraphics}
            reducedMotion={reducedMotion}
            gardenObjects={allObjects}
            islandFrames={islandFrames}
            visit={visitTarget}
            groupVitality={effectiveVitality}
            pointsGiven={effectivePoints}
            nowMs={nowMs}
            dormant={dormant}
            plantMode={plantMode}
            takenTiles={takenTiles}
            onPlantSelect={(o) => { setSelectedPlantId(o.id); handleClose() }}
            onTileSelect={(t) => setPendingTile(t)}
            walkMode={walkMode}
            walkControl={walkInput === 'touch' ? 'touch' : 'keyboard'}
            walkerProbe={walkerProbe}
            walkerRef={walkerRef}
            walkPaused={!!selectedMember}
            walkTargetUid={walkTarget}
            returnNonce={returnNonce}
            onWalkInteract={(uid) => {
              // handleSelect short-circuits on walkMode and ignores the
              // position — the camera stays where the spring arm has it.
              const member = members.find((m) => m.uid === uid)
              if (member) handleSelect(member, [0, 0, 0])
            }}
            onWalkTargetChange={setWalkTarget}
            onWalkLockChange={setPointerLocked}
            onWalkCardAnchor={setWalkCardAnchor}
            onWalkExit={exitWalkMode}
          />
        </Suspense>
        {onReady && <ReadySignal onReady={onReady} />}
      </Canvas>

      <PresenceTab members={members} currentUid={currentUid} />

      {/* Living plaza: daily check-in heartbeat + the island list (top-right).
          Both slide away to pills so they stop covering the plaza; the same
          numbers live permanently in the Info tab. Hidden in walk mode, where
          the camera is over the walker's shoulder and every pixel counts. */}
      {!walkMode && (
        <div style={{
          position: 'absolute', top: 64, right: 12, zIndex: 12, pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
        }}>
          <HudCard
            dot={!checkedInToday}
            pill={<>🌱 {todayCheckins.length}/{members.length}</>}
          >
            <CheckinCard
              checkedIn={checkedInToday}
              checkedInCount={todayCheckins.length}
              memberCount={members.length}
              streak={currentMember?.checkinStreak ?? 0}
              dormant={dormant}
              busy={busy}
              onCheckin={handleCheckin}
            />
          </HudCard>
          <HudCard pill={<>🏝️ {unlockedIslands(effectivePoints).length}</>}>
            <IslandJumper
              pointsGiven={effectivePoints}
              visitIsland={visitTarget?.id ?? null}
              onVisit={visitTo}
            />
          </HudCard>
        </div>
      )}

      {/* Plant controls (hidden while another card or picker is open).
          Not offered in walk mode: planting is a tap on a glowing tile, and on
          touch that is the same gesture that walks you somewhere. */}
      {!selectedMember && !selectedPlant && !pendingTile && !walkMode && (
        <div style={{
          // Stacked above the walk-mode button, which owns the bottom-right
          // corner — overlapping it would swallow its clicks.
          position: 'absolute', right: 12, zIndex: 12,
          bottom: 96 + bottomInset,
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
          pointerEvents: 'auto',
        }}>
          {plantMode && (
            <div style={{
              background: 'rgba(67,176,95,0.9)', color: '#fff', fontSize: 12, fontWeight: 700,
              padding: '6px 12px', borderRadius: 20,
            }}>
              Tap a glowing spot to plant
            </div>
          )}
          {plantMode ? (
            <button
              onClick={() => setPlantMode(false)}
              style={{
                padding: '10px 16px', borderRadius: 22, border: 'none', cursor: 'pointer',
                background: 'rgba(20,24,31,0.85)', color: '#cdd6df', fontWeight: 700, fontSize: 13,
              }}
            >
              ✕ Cancel
            </button>
          ) : (
            <button
              onClick={() => { if (canPlant) { handleClose(); setPlantMode(true) } }}
              disabled={!canPlant}
              title={canPlant ? 'Plant a seed' : 'Check in to earn seeds'}
              style={{
                padding: '10px 16px', borderRadius: 22, border: 'none',
                cursor: canPlant ? 'pointer' : 'default', opacity: canPlant ? 1 : 0.5,
                background: '#43b05f', color: '#fff', fontWeight: 800, fontSize: 14,
                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
              }}
            >
              🌱 Plant{preview.on ? ' · ∞' : seeds > 0 ? ` · ${seeds}` : ''}
            </button>
          )}
        </div>
      )}

      {/* Growth preview controls (?preview=1) */}
      {preview.on && (
        <div style={{ position: 'absolute', top: 64, left: 12, zIndex: 14, pointerEvents: 'auto' }}>
          <PreviewPanel
            preview={preview}
            previewCount={previewPlants.length}
            pointsGiven={effectivePoints}
            visitIsland={visitTarget?.id ?? null}
            onChange={setPreview}
            onVisit={visitTo}
            onFillOneOfEach={handleFillOneOfEach}
            onClearPreviewPlants={() => { setPreviewPlants([]); setSelectedPlantId(null) }}
            onExit={() => { setPreview(PREVIEW_OFF); setPreviewPlants([]); setSelectedPlantId(null) }}
          />
        </div>
      )}

      {/* Species picker (after tapping a tile) */}
      {pendingTile && (
        <SpeciesPicker
          busy={busy}
          onCancel={() => setPendingTile(null)}
          onConfirm={handlePlant}
        />
      )}

      {/* Plant history plaque */}
      {selectedPlant && (
        <PlantPlaque
          obj={selectedPlant}
          groupVitality={effectiveVitality}
          nowMs={nowMs}
          canRemove={selectedPlant.plantedBy === currentUid || isMayor}
          busy={busy}
          mobile={isMobile}
          onClose={() => setSelectedPlantId(null)}
          onRemove={handleRemovePlant}
        />
      )}

      {/* Card overlay — avatar editor for self, give/take for others */}
      {selectedMember && (
        <div ref={walkCardRef} className="sheet-rise" style={cardWrapperStyle}>
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
              presets={presets}
              mobile={isMobile}
              onClose={handleClose}
              onSubmitted={(type) => {
                onPointsSubmitted?.()
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

      {/* Walk mode: enter / exit control (desktop only).
          While the pointer is locked the browser routes every click to the
          canvas, so a button here would be visible but dead. In that state we
          render a plain badge pointing at the key that actually works. */}
      {walkInput !== 'none' && !selectedMember && (
        walkMode && pointerLocked ? (
          <div style={{
            position: 'absolute',
            right: 16,
            bottom: 52 + bottomInset,
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            color: '#ccc',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 20,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <kbd style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: 5,
              padding: '1px 6px',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
            }}>Esc</kbd>
            to release cursor
          </div>
        ) : (
          <button
            onClick={() => (walkMode ? exitWalkMode() : enterWalkMode())}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 52 + bottomInset,
              zIndex: 10,
              background: walkMode ? 'rgba(99,102,241,0.92)' : 'rgba(0,0,0,0.5)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 20,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            }}
          >
            {walkMode ? '✕ Exit walk mode' : '🚶 Walk mode'}
          </button>
        )
      )}

      {/* Interact prompt — only while someone is actually in range */}
      {walkMode && walkTarget && !selectedMember && (
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: 92 + bottomInset,
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(15,15,25,0.82)',
          color: '#fff',
          borderRadius: 999,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}>
          <kbd style={{
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: 5,
            padding: '1px 6px',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
          }}>E</kbd>
          Talk to {members.find((m) => m.uid === walkTarget)?.displayName ?? '…'}
        </div>
      )}

      {/* Hint */}
      {!selectedMember && (
        <div style={{
          position: 'absolute',
          bottom: 12 + bottomInset,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.5)',
          color: '#ccc',
          fontSize: 11,
          padding: '4px 12px',
          borderRadius: 20,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {walkMode
            ? (walkInput === 'touch'
                // No Esc, no jump, no backflip — none of them exist on touch,
                // and the exit control is the button in the corner.
                ? 'Tap to walk · Double-tap to run · Drag to look · Pinch to zoom'
                : pointerLocked
                  ? 'WASD move · Shift sprint · Space jump (×2 backflip) · E interact · Esc release cursor'
                  : 'Click to look · WASD move · Shift sprint · Space jump (×2 backflip) · Esc exit')
            : isMobile
              ? 'Hold to carry · Pinch to zoom · Swipe to rotate'
              : 'Hold to carry · Scroll to zoom · Tap a Mii to interact'}
          {inviteCode && !walkMode && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>Code: <strong style={{ color: '#fff', letterSpacing: 1 }}>{inviteCode}</strong></span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
