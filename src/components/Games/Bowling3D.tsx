'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Constants ───────────────────────────────────────────────────────────────

const LANE_HALF_W = 0.85
const BALL_R      = 0.22
const PIN_R       = 0.115
const PIN_CYL_H   = 0.30
const BALL_SPEED  = 10.0
const KNOCK_H     = 7.5
const KNOCK_V     = 3.0
const CHAIN_R     = 0.30
const GRAVITY     = -16
const SETTLE_TIME = 2.0
const BETWEEN_MS  = 1500
const MAX_AIM     = Math.PI / 5   // ±36°
const PIN_DECK_Z  = 4.8
const BALL_Z0     = -5.2

const PIN_XZ: [number, number][] = (
  [
    [0,     0   ],
    [-0.19, 0.33], [0.19, 0.33],
    [-0.38, 0.66], [0,    0.66], [0.38, 0.66],
    [-0.57, 0.99], [-0.19,0.99], [0.19, 0.99], [0.57, 0.99],
  ] as [number, number][]
).map(([x, dz]) => [x, PIN_DECK_Z + dz])

// ─── Types ───────────────────────────────────────────────────────────────────

type BowlPhase = 'aiming' | 'rolling' | 'settling' | 'between' | 'gameover'

interface PinPhys {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  rotX: number; rotZ: number
  angX: number; angZ: number
  standing: boolean
  visible: boolean
}

interface BallPhys {
  x: number; z: number
  vx: number; vz: number
  rotX: number
  inGutter: boolean
}

// ─── Factories ───────────────────────────────────────────────────────────────

function makePins(): PinPhys[] {
  return PIN_XZ.map(([x, z]) => ({
    x, y: 0, z,
    vx: 0, vy: 0, vz: 0,
    rotX: 0, rotZ: 0, angX: 0, angZ: 0,
    standing: true, visible: true,
  }))
}

function makeBall(aimAngle: number): BallPhys {
  return {
    x: 0, z: BALL_Z0,
    vx: Math.sin(aimAngle) * BALL_SPEED,
    vz: Math.cos(aimAngle) * BALL_SPEED,
    rotX: 0, inGutter: false,
  }
}

function knockPin(pin: PinPhys, fromX: number, fromZ: number, scale = 1) {
  const dx = pin.x - fromX
  const dz = pin.z - fromZ
  const d  = Math.sqrt(dx * dx + dz * dz) || 0.01
  pin.standing = false
  pin.vx = (dx / d) * KNOCK_H * scale * (0.85 + Math.random() * 0.3)
  pin.vz = (dz / d) * KNOCK_H * scale * (0.85 + Math.random() * 0.3)
  pin.vy = KNOCK_V * (0.8 + Math.random() * 0.4)
  pin.angX = -(dz / d) * 12 * scale + (Math.random() - 0.5) * 4
  pin.angZ =  (dx / d) * 12 * scale + (Math.random() - 0.5) * 4
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function computeFrameScores(rolls: number[]): (number | null)[] {
  const out: (number | null)[] = []
  let i = 0; let cum = 0
  for (let f = 0; f < 10; f++) {
    if (i >= rolls.length) break
    if (f < 9) {
      if (rolls[i] === 10) {
        if (i + 2 >= rolls.length) { out.push(null); i++; break }
        cum += 10 + rolls[i + 1] + rolls[i + 2]; i++
      } else if ((rolls[i] ?? 0) + (rolls[i + 1] ?? 0) === 10) {
        if (i + 2 >= rolls.length) { out.push(null); i += 2; break }
        cum += 10 + rolls[i + 2]; i += 2
      } else {
        if (i + 1 >= rolls.length) break
        cum += (rolls[i] ?? 0) + (rolls[i + 1] ?? 0); i += 2
      }
    } else {
      if (i + 1 >= rolls.length) break
      const r1 = rolls[i] ?? 0, r2 = rolls[i + 1] ?? 0
      const need3 = r1 === 10 || r1 + r2 === 10
      if (need3 && i + 2 >= rolls.length) { out.push(null); break }
      cum += r1 + r2 + (need3 ? (rolls[i + 2] ?? 0) : 0)
    }
    out.push(cum)
  }
  return out
}

// Returns the index in rolls[] where the nth frame starts
function frame10Start(rolls: number[]): number {
  let i = 0
  for (let f = 0; f < 9 && i < rolls.length; f++) {
    if (rolls[i] === 10) i++; else i += 2
  }
  return i
}

// ─── ScoreCard ────────────────────────────────────────────────────────────────

function ScoreCard({ rolls, currentFrame, rollInFrame }: {
  rolls: number[]
  currentFrame: number
  rollInFrame: number
}) {
  const frameScores = computeFrameScores(rolls)

  // Build per-frame roll indices
  const frameRolls: number[][] = []
  let ri = 0
  for (let f = 0; f < 10 && ri < rolls.length; f++) {
    if (f < 9 && rolls[ri] === 10) { frameRolls.push([ri]); ri++ }
    else {
      const cnt = f === 9
        ? ((rolls[ri] === 10 || (rolls[ri] + (rolls[ri + 1] ?? 0)) === 10) ? 3 : 2)
        : 2
      const end = Math.min(ri + cnt, rolls.length)
      frameRolls.push(Array.from({ length: end - ri }, (_, j) => ri + j))
      ri = end
    }
  }

  function d1Str(f: number): string {
    const idxs = frameRolls[f]
    if (!idxs || idxs.length === 0) return ''
    const r = rolls[idxs[0]]
    if (r === undefined) return ''
    if (f < 9 && r === 10) return 'X'
    return r === 0 ? '-' : String(r)
  }

  function d2Str(f: number): string {
    const idxs = frameRolls[f]
    if (!idxs || idxs.length < 2) return ''
    const r1 = rolls[idxs[0]], r2 = rolls[idxs[1]]
    if (r2 === undefined) return ''
    if (f < 9) return r1 + r2 === 10 ? '/' : r2 === 0 ? '-' : String(r2)
    // 10th frame roll 2
    if (r1 === 10) return r2 === 10 ? 'X' : r2 === 0 ? '-' : String(r2)
    return r1 + r2 === 10 ? '/' : r2 === 0 ? '-' : String(r2)
  }

  function d3Str(f: number): string {
    if (f !== 9) return ''
    const idxs = frameRolls[f]
    if (!idxs || idxs.length < 3) return ''
    const r1 = rolls[idxs[0]], r2 = rolls[idxs[1]], r3 = rolls[idxs[2]]
    if (r3 === undefined) return ''
    if (r2 === 10 || (r1 === 10 && r2 === 10)) return r3 === 10 ? 'X' : r3 === 0 ? '-' : String(r3)
    return r1 + r2 === 10 ? (r3 === 10 ? 'X' : r3 === 0 ? '-' : String(r3)) : String(r3)
  }

  return (
    <div style={{
      display: 'flex', gap: 1, padding: '6px 4px',
      background: '#0d0d0d', overflowX: 'auto',
    }}>
      {Array.from({ length: 10 }, (_, f) => {
        const active = f === currentFrame
        const score  = frameScores[f]
        const r1 = d1Str(f), r2 = d2Str(f), r3 = d3Str(f)
        return (
          <div key={f} style={{
            flex: f === 9 ? 1.5 : 1,
            minWidth: f === 9 ? 44 : 28,
            background: active ? '#1e1b4b' : '#161616',
            border: `1px solid ${active ? '#6366f1' : '#2a2a2a'}`,
            borderRadius: 3, padding: '3px 2px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 8, color: '#444', lineHeight: 1, marginBottom: 1 }}>{f + 1}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 1, minHeight: 13 }}>
              {f < 9 ? (
                <>
                  <span style={{ fontSize: 9, color: r1 === 'X' ? '#fbbf24' : '#bbb', fontWeight: r1 === 'X' ? 800 : 400 }}>{r1}</span>
                  <span style={{ fontSize: 9, color: r2 === '/' ? '#4ade80' : '#bbb' }}>{r2}</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 9, color: r1 === 'X' ? '#fbbf24' : '#bbb', fontWeight: r1 === 'X' ? 800 : 400 }}>{r1}</span>
                  <span style={{ fontSize: 9, color: r2 === '/' ? '#4ade80' : r2 === 'X' ? '#fbbf24' : '#bbb' }}>{r2}</span>
                  <span style={{ fontSize: 9, color: r3 === 'X' ? '#fbbf24' : '#bbb' }}>{r3}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#fff', fontWeight: 700, minHeight: 13, lineHeight: '13px' }}>
              {score ?? ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Camera setup ─────────────────────────────────────────────────────────────

function CameraSetup() {
  const { camera } = useThree()
  useEffect(() => { camera.lookAt(0, 0.5, 2) }, [camera])
  return null
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

interface SceneProps {
  phaseRef:   React.MutableRefObject<BowlPhase>
  aimRef:     React.MutableRefObject<number>
  pinsRef:    React.MutableRefObject<PinPhys[]>
  ballRef:    React.MutableRefObject<BallPhys>
  onSettledRef: React.MutableRefObject<(k: number) => void>
}

function BowlingScene({ phaseRef, aimRef, pinsRef, ballRef, onSettledRef }: SceneProps) {
  const ballMesh    = useRef<THREE.Mesh>(null)
  const pinGroups   = useRef<(THREE.Group | null)[]>(Array(10).fill(null))
  const aimGroup    = useRef<THREE.Group>(null)
  const settleTimer = useRef(0)
  const reportedRef = useRef(false)

  const gradMap = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([80, 200]), 2, 1, THREE.RedFormat)
    t.minFilter = t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }, [])

  const PIN_MESH_Y = PIN_R + PIN_CYL_H * 0.5  // offset within group so base = y=0

  useFrame((_, dt) => {
    const phase = phaseRef.current
    const ball  = ballRef.current
    const pins  = pinsRef.current

    // Aim arrow
    if (aimGroup.current) {
      aimGroup.current.visible = phase === 'aiming'
      aimGroup.current.rotation.y = aimRef.current
    }

    // Ball mesh
    if (ballMesh.current) {
      ballMesh.current.position.set(ball.x, BALL_R, ball.z)
      ballMesh.current.rotation.x = ball.rotX
    }

    // Pin meshes
    pins.forEach((p, i) => {
      const g = pinGroups.current[i]
      if (!g) return
      g.visible = p.visible
      if (!p.visible) return
      g.position.set(p.x, p.y, p.z)
      g.rotation.x = p.rotX
      g.rotation.z = p.rotZ
    })

    if (phase !== 'rolling' && phase !== 'settling') return

    if (phase === 'rolling') {
      ball.x += ball.vx * dt
      ball.z += ball.vz * dt
      ball.rotX += (ball.vz * dt) / BALL_R

      if (!ball.inGutter && (ball.x < -LANE_HALF_W || ball.x > LANE_HALF_W)) {
        ball.inGutter = true; ball.vx = 0
      }
      const cx = LANE_HALF_W + 0.28
      if (ball.x < -cx) ball.x = -cx
      if (ball.x >  cx) ball.x =  cx

      if (!ball.inGutter) {
        pins.forEach(p => {
          if (!p.visible || !p.standing) return
          const dx = ball.x - p.x, dz = ball.z - p.z
          if (dx * dx + dz * dz < (BALL_R + PIN_R) * (BALL_R + PIN_R)) {
            knockPin(p, ball.x, ball.z)
            const d = Math.sqrt(dx * dx + dz * dz) || 0.01
            ball.vx += (dx / d) * 0.4
          }
        })
      }

      const gutter = ball.inGutter && ball.z > PIN_DECK_Z - 1.5
      const past   = ball.z > PIN_DECK_Z + 1.8
      if (gutter || past) {
        phaseRef.current = 'settling'
        settleTimer.current = 0
        reportedRef.current = false
      }
    }

    // Pin physics (rolling + settling)
    pins.forEach((p, i) => {
      if (!p.visible || p.standing) return
      p.vy += GRAVITY * dt
      p.x  += p.vx * dt
      p.z  += p.vz * dt
      p.y  += p.vy * dt
      p.rotX += p.angX * dt
      p.rotZ += p.angZ * dt
      p.angX *= 0.97; p.angZ *= 0.97
      p.vx   *= 0.93; p.vz   *= 0.93
      if (p.y < -2.0) p.visible = false

      // Chain knock
      if (phase === 'rolling' && p.y > -0.25) {
        pins.forEach((p2, j) => {
          if (i === j || !p2.visible || !p2.standing) return
          const dx = p.x - p2.x, dz = p.z - p2.z
          if (dx * dx + dz * dz < CHAIN_R * CHAIN_R) {
            knockPin(p2, p.x, p.z, 0.65)
          }
        })
      }
    })

    if (phase === 'settling') {
      settleTimer.current += dt
      if (settleTimer.current > SETTLE_TIME && !reportedRef.current) {
        reportedRef.current = true
        onSettledRef.current(pins.filter(p => !p.standing).length)
      }
    }
  })

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[0, 8, -3]} intensity={0.9} />
      <directionalLight position={[2, 5, 5]}  intensity={0.35} />

      {/* Lane floor */}
      <mesh position={[0, -0.022, 0.5]} receiveShadow>
        <boxGeometry args={[2.1, 0.044, 14]} />
        <meshToonMaterial color="#C9A85C" gradientMap={gradMap} />
      </mesh>

      {/* Pin deck (lighter) */}
      <mesh position={[0, -0.018, PIN_DECK_Z + 0.55]}>
        <boxGeometry args={[2.1, 0.04, 2.1]} />
        <meshToonMaterial color="#D8BA72" gradientMap={gradMap} />
      </mesh>

      {/* Gutters */}
      {[-1.2, 1.2].map((gx, gi) => (
        <mesh key={gi} position={[gx, -0.05, 0.5]}>
          <boxGeometry args={[0.28, 0.04, 14]} />
          <meshToonMaterial color="#7a5e14" gradientMap={gradMap} />
        </mesh>
      ))}

      {/* Lane arrows */}
      {[-0.36, -0.18, 0, 0.18, 0.36].map((ax, ai) => (
        <mesh key={ai} position={[ax, 0.003, 1.3]} rotation={[0, Math.PI / 4, Math.PI / 2]}>
          <boxGeometry args={[0.07, 0.004, 0.07]} />
          <meshBasicMaterial color="#7a5e14" />
        </mesh>
      ))}

      {/* Foul line */}
      <mesh position={[0, 0.002, -4.8]}>
        <boxGeometry args={[2.1, 0.003, 0.04]} />
        <meshBasicMaterial color="#cc2222" />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 1.5, 6.6]}>
        <boxGeometry args={[2.6, 3.5, 0.14]} />
        <meshToonMaterial color="#1c1c1c" gradientMap={gradMap} />
      </mesh>

      {/* Side walls */}
      {[-1.48, 1.48].map((wx, wi) => (
        <mesh key={wi} position={[wx, 1.0, 0.5]}>
          <boxGeometry args={[0.12, 2.2, 14]} />
          <meshToonMaterial color="#161616" gradientMap={gradMap} />
        </mesh>
      ))}

      {/* Ball */}
      <mesh ref={ballMesh} castShadow>
        <sphereGeometry args={[BALL_R, 20, 20]} />
        <meshToonMaterial color="#1a1a2e" gradientMap={gradMap} />
      </mesh>

      {/* Pins */}
      {PIN_XZ.map(([px, pz], i) => (
        <group
          key={i}
          ref={el => { pinGroups.current[i] = el }}
          position={[px, 0, pz]}
        >
          <mesh position={[0, PIN_MESH_Y, 0]}>
            <capsuleGeometry args={[PIN_R, PIN_CYL_H, 4, 8]} />
            <meshToonMaterial color="#f2f0eb" gradientMap={gradMap} />
          </mesh>
          {/* Red neck stripe */}
          <mesh position={[0, PIN_MESH_Y + PIN_CYL_H * 0.18, 0]}>
            <cylinderGeometry args={[PIN_R * 0.86, PIN_R * 0.86, 0.048, 8]} />
            <meshToonMaterial color="#cc1111" gradientMap={gradMap} />
          </mesh>
          {/* Shoulder stripe */}
          <mesh position={[0, PIN_MESH_Y - PIN_CYL_H * 0.1, 0]}>
            <cylinderGeometry args={[PIN_R + 0.002, PIN_R + 0.002, 0.038, 8]} />
            <meshToonMaterial color="#cc1111" gradientMap={gradMap} />
          </mesh>
        </group>
      ))}

      {/* Aim arrow */}
      <group ref={aimGroup} position={[0, 0.012, BALL_Z0 + 0.3]}>
        <mesh position={[0, 0, 3.6]}>
          <boxGeometry args={[0.028, 0.006, 7.2]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.72} />
        </mesh>
        <mesh position={[0, 0, 7.35]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.24, 6]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.72} />
        </mesh>
      </group>
    </>
  )
}

// ─── Aim indicator (HTML) ─────────────────────────────────────────────────────

function AimIndicator({ angle }: { angle: number }) {
  const deg = (angle * 180) / Math.PI
  return (
    <div style={{ width: 72, height: 46, position: 'relative', margin: '0 auto 2px' }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 4, right: 4, height: 46,
        borderRadius: '36px 36px 0 0',
        border: '1.5px solid #2a2a2a', borderBottom: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: '50%',
        width: 2, height: 40, background: '#6366f1',
        transformOrigin: 'bottom center',
        transform: `translateX(-50%) rotate(${deg}deg)`,
        borderRadius: 2,
      }} />
      <div style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 8, color: '#444' }}>L</div>
      <div style={{ position: 'absolute', bottom: 5, right: 6, fontSize: 8, color: '#444' }}>R</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  dateStr:       string
  membersCount?: number
  onComplete:    (score: number) => void
  onClose:       () => void
}

export default function Bowling3D({ onComplete, onClose }: Props) {
  const [phase,       setPhase]       = useState<BowlPhase>('aiming')
  const [aimAngle,    setAimAngle]    = useState(0)
  const [rolls,       setRolls]       = useState<number[]>([])
  const [frameIdx,    setFrameIdx]    = useState(0)
  const [rollInFrame, setRollInFrame] = useState(0)
  const [lastKnocked, setLastKnocked] = useState<number | null>(null)
  const [submitted,   setSubmitted]   = useState(false)

  const phaseRef      = useRef<BowlPhase>('aiming')
  const aimRef        = useRef(0)
  const pinsRef       = useRef<PinPhys[]>(makePins())
  const ballRef       = useRef<BallPhys>(makeBall(0))
  const rollStartRef  = useRef<boolean[]>(Array(10).fill(true))
  const onSettledRef  = useRef<(k: number) => void>(() => {})

  function syncPhase(p: BowlPhase) { setPhase(p); phaseRef.current = p }
  function syncAim(a: number)      { setAimAngle(a); aimRef.current = a }

  // Drag-to-aim
  const dragX0   = useRef<number | null>(null)
  const dragAim0 = useRef(0)

  function onAimDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phaseRef.current !== 'aiming') return
    dragX0.current = e.clientX; dragAim0.current = aimAngle
    ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
  }
  function onAimMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragX0.current === null) return
    const a = dragAim0.current + ((e.clientX - dragX0.current) / 110) * (Math.PI / 12)
    syncAim(Math.max(-MAX_AIM, Math.min(MAX_AIM, a)))
  }
  function onAimUp() { dragX0.current = null }

  function handleThrow() {
    if (phaseRef.current !== 'aiming') return
    rollStartRef.current = pinsRef.current.map(p => p.visible && p.standing)
    ballRef.current = makeBall(aimRef.current)
    syncPhase('rolling')
  }

  // Called by useFrame after pins settle
  onSettledRef.current = (totalKnocked: number) => {
    void totalKnocked
    const knockedThisRoll = pinsRef.current.reduce((n, p, i) =>
      n + (rollStartRef.current[i] && !p.standing ? 1 : 0), 0)

    setLastKnocked(knockedThisRoll)
    const newRolls = [...rolls, knockedThisRoll]
    setRolls(newRolls)
    const isF10 = frameIdx === 9

    function clearFallen() {
      pinsRef.current.forEach(p => { if (!p.standing) p.visible = false })
    }
    function resetAll() { pinsRef.current = makePins() }

    function doNext(pinAction: () => void, nextRIF: number, advanceFrame?: boolean) {
      syncPhase('between')
      pinAction()
      setTimeout(() => {
        syncAim(0)
        ballRef.current = makeBall(0)
        if (advanceFrame) {
          setFrameIdx(f => f + 1); setRollInFrame(0)
        } else {
          setRollInFrame(nextRIF)
        }
        syncPhase('aiming')
      }, BETWEEN_MS)
    }

    if (!isF10) {
      if (rollInFrame === 0 && knockedThisRoll === 10) doNext(resetAll, 0, true)
      else if (rollInFrame === 0)                      doNext(clearFallen, 1)
      else                                             doNext(resetAll, 0, true)
    } else {
      if (rollInFrame === 0) {
        if (knockedThisRoll === 10) doNext(resetAll, 1)
        else                        doNext(clearFallen, 1)
      } else if (rollInFrame === 1) {
        const f10s   = frame10Start(rolls)
        const roll1  = rolls[f10s] ?? 0
        const need3  = roll1 === 10 || roll1 + knockedThisRoll === 10
        if (need3) {
          const pinAct = () => {
            if (roll1 === 10 && knockedThisRoll === 10) resetAll()
            else if (roll1 === 10)                      clearFallen()
            else                                        resetAll()
          }
          doNext(pinAct, 2)
        } else {
          clearFallen(); syncPhase('gameover')
        }
      } else {
        syncPhase('gameover')
      }
    }
  }

  const frameScores  = computeFrameScores(rolls)
  const currentScore = frameScores.filter(s => s !== null).pop() ?? 0
  const isGameover   = phase === 'gameover'

  // Final bowling score
  const finalScore = useMemo(() => {
    if (!isGameover) return 0
    return frameScores.filter(s => s !== null).pop() as number ?? 0
  }, [isGameover]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#080810',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#0f0f18',
        borderBottom: '1px solid #1a1a2e',
      }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
        >←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>🎳 Bowling</div>
          <div style={{ fontSize: 10, color: '#555' }}>
            {frameIdx < 9 ? `Frame ${frameIdx + 1}` : '10th Frame'}
            {' · '}
            {phase === 'aiming' ? 'Aim & Throw' : phase === 'rolling' ? 'Rolling…' : phase === 'settling' ? 'Counting…' : phase === 'between' ? (lastKnocked === 10 ? 'STRIKE! 🎉' : `${lastKnocked} down`) : 'Game Over'}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#6366f1', minWidth: 36, textAlign: 'right' }}>
          {currentScore}
        </div>
      </div>

      {/* Scorecard */}
      <ScoreCard rolls={rolls} currentFrame={frameIdx} rollInFrame={rollInFrame} />

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Aim drag overlay (above canvas, below gameover) */}
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: phase === 'aiming' ? 'ew-resize' : 'default' }}
          onPointerDown={onAimDown}
          onPointerMove={onAimMove}
          onPointerUp={onAimUp}
        />

        <Canvas
          camera={{ position: [0, 4, -8], fov: 56 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true }}
        >
          <CameraSetup />
          <BowlingScene
            phaseRef={phaseRef}
            aimRef={aimRef}
            pinsRef={pinsRef}
            ballRef={ballRef}
            onSettledRef={onSettledRef}
          />
        </Canvas>

        {/* "Between" flash message */}
        {phase === 'between' && (
          <div style={{
            position: 'absolute', top: '40%', left: 0, right: 0,
            textAlign: 'center', zIndex: 8, pointerEvents: 'none',
          }}>
            {lastKnocked === 10 ? (
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fbbf24', textShadow: '0 0 20px #f59e0b' }}>
                STRIKE! 🎉
              </div>
            ) : rollInFrame === 1 && knockedAll(lastKnocked, rolls) ? (
              <div style={{ fontSize: 30, fontWeight: 900, color: '#4ade80', textShadow: '0 0 20px #22c55e' }}>
                SPARE! ✨
              </div>
            ) : (
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>
                {lastKnocked === 0 ? 'Gutter 😬' : `${lastKnocked} pin${lastKnocked !== 1 ? 's' : ''}!`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{
        padding: '10px 20px 14px',
        background: '#0f0f18', borderTop: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <AimIndicator angle={aimAngle} />
          <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>drag to aim</div>
        </div>

        <button
          onClick={handleThrow}
          disabled={phase !== 'aiming'}
          style={{
            background: phase === 'aiming' ? '#6366f1' : '#222',
            border: 'none', borderRadius: 16,
            color: phase === 'aiming' ? '#fff' : '#444',
            padding: '13px 28px', fontSize: 16, fontWeight: 900,
            cursor: phase === 'aiming' ? 'pointer' : 'default',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          🎳 Throw!
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>
            Roll {rollInFrame + 1}
            {frameIdx === 9 && rollInFrame === 2 ? ' (3rd)' : ''}
            <br />
            Frame {frameIdx + 1}/10
          </div>
        </div>
      </div>

      {/* Gameover overlay */}
      {isGameover && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(8,8,16,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 56 }}>🎳</div>
          <div style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>Final Score</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{finalScore}</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>
            {finalScore === 300 ? 'PERFECT GAME! 🏆' :
             finalScore >= 250 ? 'Elite! 🔥' :
             finalScore >= 200 ? 'Excellent game!' :
             finalScore >= 150 ? 'Great game!' :
             finalScore >= 100 ? 'Nice game!' : 'Keep practicing!'}
          </div>
          {!submitted ? (
            <button
              onClick={() => { setSubmitted(true); onComplete(finalScore) }}
              style={{
                background: '#6366f1', border: 'none', borderRadius: 14,
                color: '#fff', padding: '13px 36px', fontSize: 16, fontWeight: 800,
                cursor: 'pointer', marginTop: 8,
              }}
            >Submit Score</button>
          ) : (
            <div style={{ color: '#4ade80', fontSize: 14, fontWeight: 700 }}>Score submitted! ✓</div>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #333', borderRadius: 12,
              color: '#666', padding: '9px 22px', fontSize: 13, cursor: 'pointer',
            }}
          >Back to Leaderboard</button>
        </div>
      )}
    </div>
  )
}

// Helper used in the "between" flash
function knockedAll(lastKnocked: number | null, rolls: number[]): boolean {
  if (lastKnocked === null) return false
  const prev = rolls[rolls.length - 1] ?? 0
  return prev + lastKnocked === 10
}
