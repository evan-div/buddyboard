'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Vec2 = readonly [number, number]
type Wall = readonly [Vec2, Vec2]
type GamePhase = 'idle' | 'aiming' | 'rolling' | 'sunk'

interface BallState {
  x: number
  y: number
  vx: number
  vy: number
}

interface CourseData {
  polyPts: Vec2[]
  tee: Vec2
  cup: Vec2
  par: number
  obstacles: Array<{ x: number; y: number; w: number; h: number }>
  walls: Wall[]
  templateName: string
}

interface GameState {
  phase: GamePhase
  ball: BallState
  strokes: number
  aim: [number, number] | null
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MiniGolfProps {
  dateStr: string
  onComplete: (strokes: number) => void
  onClose: () => void
  membersCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CW = 340
const CH = 520
const BALL_R = 8
const CUP_R = 11
const FRICTION = 0.987
const BOUNCE = 0.62
const STOP_SPEED = 1.0
const SINK_SPEED = 100
const MAX_DRAG = 140
const POWER_SCALE = 5.5

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function mkRng(seed: string) {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (Math.imul(31, s) + seed.charCodeAt(i)) | 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}

// ─── Wall Helpers ─────────────────────────────────────────────────────────────

function polyToWalls(pts: Vec2[]): Wall[] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as Wall)
}

function rectToWalls(x: number, y: number, w: number, h: number): Wall[] {
  const tl: Vec2 = [x, y]
  const tr: Vec2 = [x + w, y]
  const br: Vec2 = [x + w, y + h]
  const bl: Vec2 = [x, y + h]
  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ]
}

// ─── Wall Collision ───────────────────────────────────────────────────────────

function resolveWall(ball: BallState, [a, b]: Wall): boolean {
  const [ax, ay] = a
  const [bx, by] = b
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  if (len2 < 0.001) return false
  const t = Math.max(0, Math.min(1, ((ball.x - ax) * abx + (ball.y - ay) * aby) / len2))
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = ball.x - cx
  const dy = ball.y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < BALL_R && dist > 0.001) {
    const nx = dx / dist
    const ny = dy / dist
    ball.x = cx + nx * BALL_R
    ball.y = cy + ny * BALL_R
    const dot = ball.vx * nx + ball.vy * ny
    if (dot < 0) {
      ball.vx = (ball.vx - 2 * dot * nx) * BOUNCE
      ball.vy = (ball.vy - 2 * dot * ny) * BOUNCE
    }
    return true
  }
  return false
}

// ─── Course Templates ─────────────────────────────────────────────────────────

function templateStraight(rng: () => number): CourseData {
  const polyPts: Vec2[] = [
    [105, 20],
    [235, 20],
    [235, 500],
    [105, 500],
  ]
  const tee: Vec2 = [170, 455]
  const cup: Vec2 = [170, 62]
  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = []
  for (let i = 0; i < 2; i++) {
    const w = 70 + Math.floor(rng() * 21)
    const x = 105 + Math.floor(rng() * (130 - w))
    const yBase = 120 + i * 140
    const y = yBase + Math.floor(rng() * 60)
    obstacles.push({ x, y, w, h: 16 })
  }
  const walls: Wall[] = [
    ...polyToWalls(polyPts),
    ...obstacles.flatMap((o) => rectToWalls(o.x, o.y, o.w, o.h)),
  ]
  return { polyPts, tee, cup, par: 3, obstacles, walls, templateName: 'STRAIGHT' }
}

function templateDoglegRight(rng: () => number): CourseData {
  const polyPts: Vec2[] = [
    [85, 20],
    [205, 20],
    [205, 255],
    [315, 255],
    [315, 390],
    [85, 390],
  ]
  const tee: Vec2 = [145, 350]
  const cup: Vec2 = [260, 305]
  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = []
  const w = 60 + Math.floor(rng() * 31)
  const x = 85 + Math.floor(rng() * (120 - w))
  const y = 80 + Math.floor(rng() * 120)
  obstacles.push({ x, y, w, h: 16 })
  const walls: Wall[] = [
    ...polyToWalls(polyPts),
    ...obstacles.flatMap((o) => rectToWalls(o.x, o.y, o.w, o.h)),
  ]
  return { polyPts, tee, cup, par: 3, obstacles, walls, templateName: 'DOGLEG_RIGHT' }
}

function templateDoglegLeft(rng: () => number): CourseData {
  const polyPts: Vec2[] = [
    [135, 20],
    [255, 20],
    [255, 390],
    [25, 390],
    [25, 255],
    [135, 255],
  ]
  const tee: Vec2 = [195, 350]
  const cup: Vec2 = [80, 305]
  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = []
  const w = 60 + Math.floor(rng() * 31)
  const x = 135 + Math.floor(rng() * (120 - w))
  const y = 60 + Math.floor(rng() * 140)
  obstacles.push({ x, y, w, h: 16 })
  const walls: Wall[] = [
    ...polyToWalls(polyPts),
    ...obstacles.flatMap((o) => rectToWalls(o.x, o.y, o.w, o.h)),
  ]
  return { polyPts, tee, cup, par: 3, obstacles, walls, templateName: 'DOGLEG_LEFT' }
}

function templateSBend(rng: () => number): CourseData {
  const polyPts: Vec2[] = [
    [130, 20],
    [280, 20],
    [280, 190],
    [240, 190],
    [240, 320],
    [210, 320],
    [210, 480],
    [60, 480],
    [60, 290],
    [100, 290],
    [100, 160],
    [130, 160],
  ]
  const tee: Vec2 = [135, 440]
  const cup: Vec2 = [205, 60]
  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = []
  // top section obstacle
  const w1 = 50 + Math.floor(rng() * 31)
  const x1 = 130 + Math.floor(rng() * (150 - w1))
  const y1 = 40 + Math.floor(rng() * 100)
  obstacles.push({ x: x1, y: y1, w: w1, h: 14 })
  // bottom section obstacle
  const w2 = 50 + Math.floor(rng() * 31)
  const x2 = 60 + Math.floor(rng() * (150 - w2))
  const y2 = 340 + Math.floor(rng() * 100)
  obstacles.push({ x: x2, y: y2, w: w2, h: 14 })
  const walls: Wall[] = [
    ...polyToWalls(polyPts),
    ...obstacles.flatMap((o) => rectToWalls(o.x, o.y, o.w, o.h)),
  ]
  return { polyPts, tee, cup, par: 4, obstacles, walls, templateName: 'S_BEND' }
}

function templateNarrowGate(rng: () => number): CourseData {
  const polyPts: Vec2[] = [
    [50, 20],
    [290, 20],
    [290, 200],
    [190, 200],
    [190, 310],
    [290, 310],
    [290, 490],
    [50, 490],
    [50, 310],
    [150, 310],
    [150, 200],
    [50, 200],
  ]
  const tee: Vec2 = [170, 450]
  const cup: Vec2 = [170, 60]
  const obstacles: Array<{ x: number; y: number; w: number; h: number }> = []
  // top chamber
  const w1 = 60 + Math.floor(rng() * 31)
  const x1 = 50 + Math.floor(rng() * (240 - w1))
  const y1 = 40 + Math.floor(rng() * 120)
  obstacles.push({ x: x1, y: y1, w: w1, h: 14 })
  // bottom chamber
  const w2 = 60 + Math.floor(rng() * 31)
  const x2 = 50 + Math.floor(rng() * (240 - w2))
  const y2 = 330 + Math.floor(rng() * 120)
  obstacles.push({ x: x2, y: y2, w: w2, h: 14 })
  const walls: Wall[] = [
    ...polyToWalls(polyPts),
    ...obstacles.flatMap((o) => rectToWalls(o.x, o.y, o.w, o.h)),
  ]
  return { polyPts, tee, cup, par: 3, obstacles, walls, templateName: 'NARROW_GATE' }
}

function generateCourse(dateStr: string): CourseData {
  const rng = mkRng(dateStr)
  const template = Math.floor(rng() * 5)
  switch (template) {
    case 0: return templateStraight(rng)
    case 1: return templateDoglegRight(rng)
    case 2: return templateDoglegLeft(rng)
    case 3: return templateSBend(rng)
    case 4: return templateNarrowGate(rng)
    default: return templateStraight(rng)
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function render(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  course: CourseData,
): void {
  // 1. Background
  ctx.fillStyle = '#1c3d1c'
  ctx.fillRect(0, 0, CW, CH)

  // 2. Fairway polygon
  ctx.beginPath()
  course.polyPts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = '#3a8a3a'
  ctx.fill()
  ctx.strokeStyle = '#2a6a2a'
  ctx.lineWidth = 2
  ctx.stroke()

  // 3. Obstacles
  for (const obs of course.obstacles) {
    ctx.fillStyle = '#5a3a1a'
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h)
    ctx.strokeStyle = '#3a2010'
    ctx.lineWidth = 2
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h)
  }

  // 4. Cup
  const [cx, cy] = course.cup
  ctx.beginPath()
  ctx.arc(cx, cy, CUP_R, 0, Math.PI * 2)
  ctx.fillStyle = '#000'
  ctx.fill()
  // Flag pole
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - 22)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // Flag triangle
  ctx.beginPath()
  ctx.moveTo(cx, cy - 22)
  ctx.lineTo(cx + 10, cy - 16)
  ctx.lineTo(cx, cy - 10)
  ctx.closePath()
  ctx.fillStyle = '#e22'
  ctx.fill()

  // 5. Tee marker
  const [tx, ty] = course.tee
  ctx.beginPath()
  ctx.arc(tx, ty, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#f59e0b'
  ctx.fill()

  // 6. Aim indicator
  if (gs.phase === 'aiming' && gs.aim) {
    const [ax, ay] = gs.aim
    const dx = ax - gs.ball.x
    const dy = ay - gs.ball.y
    const dist = Math.hypot(dx, dy)
    const power = Math.min(dist, MAX_DRAG) / MAX_DRAG
    const aimLen = power * MAX_DRAG
    const ang = Math.atan2(dy, dx)
    // draw in the direction of the aim (away from drag point)
    const ex = gs.ball.x + Math.cos(ang) * aimLen
    const ey = gs.ball.y + Math.sin(ang) * aimLen

    const hue = 120 - power * 120
    ctx.save()
    ctx.setLineDash([8, 4])
    ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(gs.ball.x, gs.ball.y)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    // Arrowhead
    ctx.setLineDash([])
    const headLen = 10
    const headAngle = 0.4
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(
      ex - headLen * Math.cos(ang - headAngle),
      ey - headLen * Math.sin(ang - headAngle),
    )
    ctx.lineTo(
      ex - headLen * Math.cos(ang + headAngle),
      ey - headLen * Math.sin(ang + headAngle),
    )
    ctx.closePath()
    ctx.fillStyle = `hsl(${hue}, 80%, 60%)`
    ctx.fill()
    ctx.restore()
  }

  // 7. Ball (unless sunk)
  if (gs.phase !== 'sunk') {
    const bx = gs.ball.x
    const by = gs.ball.y

    // Shadow
    ctx.beginPath()
    ctx.ellipse(bx + 2, by + 2, BALL_R, BALL_R * 0.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // Ball body
    ctx.beginPath()
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Highlight
    ctx.beginPath()
    ctx.arc(
      bx - BALL_R * 0.25,
      by - BALL_R * 0.3,
      BALL_R * 0.35,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fill()

    // Idle pulse ring
    if (gs.phase === 'idle') {
      const alpha = 0.35 + Math.sin(Date.now() / 350) * 0.25
      ctx.beginPath()
      ctx.arc(bx, by, BALL_R + 4, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 220, 50, ${alpha})`
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // 8. Par label
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`Par ${course.par}`, CW / 2, 16)
}

// ─── Par Score Text ───────────────────────────────────────────────────────────

function parComparisonText(strokes: number, par: number): string {
  const diff = strokes - par
  if (strokes === 1) return 'Hole in one!'
  if (diff === -3) return 'Albatross!'
  if (diff === -2) return 'Eagle!'
  if (diff === -1) return 'Birdie!'
  if (diff === 0) return 'Par!'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Double Bogey'
  return `+${diff} over par`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MiniGolf({ dateStr, onComplete, onClose, membersCount: _membersCount }: MiniGolfProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gsRef = useRef<GameState | null>(null)
  const courseRef = useRef<CourseData | null>(null)
  const strokesRef = useRef<number>(0)
  const aimStartRef = useRef<[number, number] | null>(null)

  const [phase, setPhase] = useState<GamePhase>('idle')
  const [finalStrokes, setFinalStrokes] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = CW * dpr
    canvas.height = CH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const course = generateCourse(dateStr)
    courseRef.current = course

    const gs: GameState = {
      phase: 'idle',
      ball: { x: course.tee[0], y: course.tee[1], vx: 0, vy: 0 },
      strokes: 0,
      aim: null,
    }
    gsRef.current = gs
    strokesRef.current = 0

    let raf = 0
    let lastT = 0

    function loop(t: number) {
      const dt = Math.min((t - lastT) / 1000, 0.05)
      lastT = t

      if (gs.phase === 'rolling') {
        // Apply friction
        gs.ball.vx *= Math.pow(FRICTION, dt * 60)
        gs.ball.vy *= Math.pow(FRICTION, dt * 60)
        // Integrate position
        gs.ball.x += gs.ball.vx * dt
        gs.ball.y += gs.ball.vy * dt
        // Wall collisions (3 iterations)
        for (let i = 0; i < 3; i++) {
          course.walls.forEach((w) => resolveWall(gs.ball, w))
        }
        // Clamp to canvas
        gs.ball.x = Math.max(BALL_R, Math.min(CW - BALL_R, gs.ball.x))
        gs.ball.y = Math.max(BALL_R, Math.min(CH - BALL_R, gs.ball.y))

        // Cup check
        const cdx = gs.ball.x - course.cup[0]
        const cdy = gs.ball.y - course.cup[1]
        const speed = Math.hypot(gs.ball.vx, gs.ball.vy)
        if (Math.hypot(cdx, cdy) < CUP_R && speed < SINK_SPEED) {
          gs.ball.x = course.cup[0]
          gs.ball.y = course.cup[1]
          gs.ball.vx = 0
          gs.ball.vy = 0
          gs.phase = 'sunk'
          setPhase('sunk')
          setFinalStrokes(gs.strokes)
        }

        // Stop check
        if (gs.phase === 'rolling' && speed < STOP_SPEED) {
          gs.ball.vx = 0
          gs.ball.vy = 0
          gs.phase = 'idle'
          setPhase('idle')
        }
      }

      render(ctx, gs, course)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [dateStr])

  function getGameCoords(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const gx = (e.clientX - rect.left) * (CW / rect.width)
    const gy = (e.clientY - rect.top) * (CH / rect.height)
    return [gx, gy]
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const gs = gsRef.current
    if (!gs || gs.phase !== 'idle') return
    const [gx, gy] = getGameCoords(e)
    const dist = Math.hypot(gx - gs.ball.x, gy - gs.ball.y)
    if (dist < BALL_R + 16) {
      gs.phase = 'aiming'
      setPhase('aiming')
      aimStartRef.current = [gx, gy]
      gs.aim = [gx, gy]
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const gs = gsRef.current
    if (!gs || gs.phase !== 'aiming') return
    const [gx, gy] = getGameCoords(e)
    gs.aim = [gx, gy]
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const gs = gsRef.current
    if (!gs || gs.phase !== 'aiming') return
    const [gx, gy] = getGameCoords(e)
    const dx = gx - gs.ball.x
    const dy = gy - gs.ball.y
    const dist = Math.hypot(dx, dy)
    const power = Math.min(dist, MAX_DRAG) / MAX_DRAG
    gs.aim = null

    if (power > 0.05) {
      const ang = Math.atan2(dy, dx)
      gs.ball.vx = Math.cos(ang) * power * MAX_DRAG * POWER_SCALE
      gs.ball.vy = Math.sin(ang) * power * MAX_DRAG * POWER_SCALE
      gs.strokes++
      strokesRef.current = gs.strokes
      gs.phase = 'rolling'
      setPhase('rolling')
    } else {
      gs.phase = 'idle'
      setPhase('idle')
    }
  }

  const course = courseRef.current
  const displayStrokes = phase !== 'sunk' ? strokesRef.current : finalStrokes

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.4)',
          color: '#fff',
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#aaa',
            fontSize: 22,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>⛳ Mini Golf</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>Hole of the Day</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>
          {displayStrokes} 🏌️
        </div>
      </div>

      {/* Canvas wrapper */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 0',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: CW,
            height: CH,
            maxWidth: '100%',
            touchAction: 'none',
            cursor: phase === 'idle' ? 'crosshair' : 'none',
            display: 'block',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {/* Hint text when idle */}
      {phase === 'idle' && (
        <div
          style={{
            textAlign: 'center',
            color: '#888',
            fontSize: 12,
            paddingBottom: 8,
          }}
        >
          Tap the ball and drag to aim
        </div>
      )}

      {/* Completion overlay */}
      {phase === 'sunk' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 48 }}>⛳</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>
            {finalStrokes} stroke{finalStrokes !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 14, color: '#aaa' }}>
            {course ? parComparisonText(finalStrokes, course.par) : ''}
          </div>
          {!submitted ? (
            <button
              onClick={() => {
                setSubmitted(true)
                onComplete(finalStrokes)
              }}
              style={{
                background: '#22c55e',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                padding: '12px 32px',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Submit Score
            </button>
          ) : (
            <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 700 }}>
              Score submitted! ✓
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12,
              color: '#aaa',
              padding: '8px 20px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Back to Leaderboard
          </button>
        </div>
      )}
    </div>
  )
}
