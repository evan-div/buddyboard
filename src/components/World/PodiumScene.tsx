'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { SKIN_TONES } from '@/lib/avatarDefaults'
import { useBeanDims } from '@/lib/beanDims'
import { BeanFace } from '@/components/Avatar/BeanFace'
import { BeanBody, BeanHair, BeanAccessory, outlineShade } from '@/components/Avatar/BeanParts'
import type { GroupMember } from '@/lib/types'

export type Period = 'daily' | 'weekly' | 'monthly' | 'alltime'
export type RankedMember = GroupMember & { periodPoints: number }

// The ranks stage is a tiny, blank version of the plaza: the same sky, drifting
// clouds, checkerboard grass and dirt-column ground — just small enough to hold
// three pedestals and the winning beans. Palette + lighting mirror MiiPlaza so
// the two views read as the same world.

const GRASS_LIGHT = '#6dc957'
const GRASS_DARK  = '#246b24'

// ─── Small grass island ───────────────────────────────────────────────────────
// A rounded rectangle (matches the plaza's soft-cornered footprint) just big
// enough to seat the podium row.

const ISLE_HX   = 4.0   // half-width  (x)
const ISLE_HZ   = 2.15  // half-depth  (z)
const ISLE_CR   = 0.9   // corner radius
const DIRT_DEPTH = 3.0  // how far the tapered dirt underside drops below the grass
const DIRT_TAPER = 0.52 // how sharply the underside pinches toward a point

// Scale factor for the dirt cross-section at a given depth (0 = grass, 1 = tip),
// so the column narrows into a rounded floating-island point.
function dirtTaperAt(depthFrac: number): number {
  return 1 - Math.pow(Math.min(1, Math.max(0, depthFrac)), 1.5) * DIRT_TAPER
}

const TILE     = 1.05                       // checker square size (world units)
const CHK_TILES = 8                          // tiles per checker canvas
const CHK_SPAN  = TILE * CHK_TILES           // world units one canvas covers
const BLADE_H   = 0.15
const BLADE_W   = 0.021
const N_BLADE_TRIES = 4200

function insideIsle(x: number, z: number): boolean {
  const qx = Math.abs(x) - (ISLE_HX - ISLE_CR)
  const qz = Math.abs(z) - (ISLE_HZ - ISLE_CR)
  if (Math.abs(x) > ISLE_HX || Math.abs(z) > ISLE_HZ) return false
  if (qx > 0 && qz > 0) return qx * qx + qz * qz <= ISLE_CR * ISLE_CR
  return true
}

function makeIsleShape(): THREE.Shape {
  const s = new THREE.Shape()
  const x0 = ISLE_HX - ISLE_CR
  const z0 = ISLE_HZ - ISLE_CR
  s.moveTo(-x0, -ISLE_HZ)
  s.lineTo(x0, -ISLE_HZ)
  s.quadraticCurveTo(ISLE_HX, -ISLE_HZ, ISLE_HX, -z0)
  s.lineTo(ISLE_HX, z0)
  s.quadraticCurveTo(ISLE_HX, ISLE_HZ, x0, ISLE_HZ)
  s.lineTo(-x0, ISLE_HZ)
  s.quadraticCurveTo(-ISLE_HX, ISLE_HZ, -ISLE_HX, z0)
  s.lineTo(-ISLE_HX, -z0)
  s.quadraticCurveTo(-ISLE_HX, -ISLE_HZ, -x0, -ISLE_HZ)
  return s
}

// Which checker cell a world point lands in, and its parity (must match the
// canvas texture so blades sit on their own colour).
function cellIsLight(x: number, z: number): boolean {
  const tx = Math.floor((x / CHK_SPAN + 0.5) * CHK_TILES)
  const tz = Math.floor((z / CHK_SPAN + 0.5) * CHK_TILES)
  return (((tx % 2) + 2) % 2) === (((tz % 2) + 2) % 2)
}

// A grass blade material that sways in the wind (same trick as MiiPlaza): each
// compiled shader's uTime uniform is registered so the frame loop can advance it.
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
      float sway = h * sin(uTime * 1.35 + instanceMatrix[3][0] * 0.65 + instanceMatrix[3][2] * 0.52) * 0.045;
      transformed.x += sway;
      transformed.z += sway * 0.22;`,
    )
  }
  return mat
}

const N_ROCKS = 34

function GardenFloor() {
  const lightRef = useRef<THREE.InstancedMesh>(null)
  const darkRef  = useRef<THREE.InstancedMesh>(null)
  const rocksRef = useRef<THREE.InstancedMesh>(null)
  const timeUniforms = useRef<{ value: number }[]>([])

  const isleShape = useMemo(() => makeIsleShape(), [])
  const topGeo  = useMemo(() => new THREE.ShapeGeometry(isleShape), [isleShape])
  const dirtGeo = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(isleShape, { depth: DIRT_DEPTH, bevelEnabled: false })
    // Pinch the cross-section inward with depth (shape XY = world XZ) so the
    // underside tapers to a rounded point instead of a flat-bottomed wall.
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const s = dirtTaperAt(pos.getZ(i) / DIRT_DEPTH)
      pos.setX(i, pos.getX(i) * s)
      pos.setY(i, pos.getY(i) * s)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [isleShape])

  // Canvas checkerboard mapped across the island (shape UVs are raw XY).
  const baseTex = useMemo(() => {
    const PX = 512, TW = PX / CHK_TILES
    const cv  = document.createElement('canvas')
    cv.width  = cv.height = PX
    const ctx = cv.getContext('2d')!
    for (let y = 0; y < CHK_TILES; y++)
      for (let x = 0; x < CHK_TILES; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_LIGHT : GRASS_DARK
        ctx.fillRect(x * TW, y * TW, TW, TW)
      }
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1 / CHK_SPAN, 1 / CHK_SPAN)
    tex.offset.set(0.5, 0.5)
    return tex
  }, [])

  // Noisy soil texture for the column below the grass.
  const dirtTex = useMemo(() => {
    const S = 256
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    const ctx = cv.getContext('2d')!
    let seed = 7
    const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
    ctx.fillStyle = '#6B4226'
    ctx.fillRect(0, 0, S, S)
    const patchShades = ['#5d3a20', '#7a4d2b', '#63401f', '#54331b', '#7d5533']
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = patchShades[Math.floor(rng() * patchShades.length)]
      ctx.globalAlpha = 0.15 + rng() * 0.15
      ctx.beginPath()
      ctx.ellipse(rng() * S, rng() * S, 16 + rng() * 44, 10 + rng() * 30, rng() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 0.09
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#4a2c16' : '#835832'
      ctx.fillRect(0, rng() * S, S, 3 + rng() * 9)
    }
    const gritShades = ['#8a7a68', '#9c8c78', '#55402c', '#3f2a18', '#a3937f']
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = gritShades[Math.floor(rng() * gritShades.length)]
      ctx.globalAlpha = 0.3 + rng() * 0.45
      ctx.beginPath()
      ctx.arc(rng() * S, rng() * S, 0.6 + rng() * 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(0.4, 0.4)
    return tex
  }, [])

  const bladeGeo = useMemo(() => {
    const geo   = new THREE.BufferGeometry()
    const verts = new Float32Array([
      -BLADE_W, 0, 0,
       BLADE_W, 0, 0,
       0, BLADE_H, 0,
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  const lightMat = useMemo(() => makeBladeMat(GRASS_LIGHT, timeUniforms), [])
  const darkMat  = useMemo(() => makeBladeMat(GRASS_DARK, timeUniforms), [])

  useEffect(() => {
    const dummy = new THREE.Object3D()
    let li = 0, di = 0
    for (let n = 0; n < N_BLADE_TRIES; n++) {
      const px = (Math.random() - 0.5) * 2 * ISLE_HX
      const pz = (Math.random() - 0.5) * 2 * ISLE_HZ
      if (!insideIsle(px, pz)) continue
      const isLight = cellIsLight(px, pz)
      dummy.position.set(px, 0, pz)
      dummy.rotation.set(
        isLight ? -0.28 : 0.12,
        (isLight ? 0 : Math.PI / 2) + (Math.random() - 0.5) * 1.2,
        0,
      )
      dummy.scale.setScalar(0.8 + Math.random() * 0.45)
      dummy.updateMatrix()
      if (isLight) lightRef.current?.setMatrixAt(li++, dummy.matrix)
      else          darkRef.current?.setMatrixAt(di++, dummy.matrix)
    }
    if (lightRef.current) { lightRef.current.count = li; lightRef.current.instanceMatrix.needsUpdate = true }
    if (darkRef.current)  { darkRef.current.count = di; darkRef.current.instanceMatrix.needsUpdate = true }
  }, [])

  // Rocks poking out of the dirt wall around the rim.
  useEffect(() => {
    const mesh = rocksRef.current
    if (!mesh) return
    const rim = isleShape.getPoints(N_ROCKS)
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    let seed = 9871
    const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
    for (let i = 0; i < N_ROCKS; i++) {
      const p = rim[i % rim.length]
      const nx = p.x, nz = p.y   // shape Y → world Z
      const len = Math.hypot(nx, nz) || 1
      const size = 0.14 + rng() * 0.4
      const depth = 0.12 + Math.pow(rng(), 1.6) * (DIRT_DEPTH * 0.85)
      const s = dirtTaperAt(depth / DIRT_DEPTH)   // ride the tapered wall
      dummy.position.set(nx * s - (nx / len) * size * 0.3, -depth, nz * s - (nz / len) * size * 0.3)
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
  }, [isleShape])

  useFrame((_, delta) => {
    for (const u of timeUniforms.current) u.value += delta
  })

  return (
    <group>
      {/* Checkerboard grass top */}
      <mesh geometry={topGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <meshStandardMaterial map={baseTex} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Raised grass blades */}
      <instancedMesh ref={lightRef} args={[bladeGeo, lightMat, N_BLADE_TRIES]} frustumCulled={false} />
      <instancedMesh ref={darkRef}  args={[bladeGeo, darkMat,  N_BLADE_TRIES]} frustumCulled={false} />
      {/* Dirt column */}
      <mesh geometry={dirtGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <meshStandardMaterial map={dirtTex} roughness={0.95} />
      </mesh>
      {/* Rocks */}
      <instancedMesh ref={rocksRef} args={[undefined, undefined, N_ROCKS]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

// ─── Drifting clouds ──────────────────────────────────────────────────────────
// A slimmed-down version of MiiPlaza's cloud field — a ring of soft billboard
// puffs around and behind the stage so the sky has the same depth.

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
    g.addColorStop(0.00, `rgba(${bri},${bri},${Math.min(255, bri + 4)},${a})`)
    g.addColorStop(0.55, `rgba(${bri},${Math.min(255, bri + 3)},${Math.min(255, bri + 6)},${(a * 0.65).toFixed(2)})`)
    g.addColorStop(0.85, `rgba(255,255,255,${(a * 0.15).toFixed(2)})`)
    g.addColorStop(1.00, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Fade the whole texture to fully transparent at every edge with an elliptical
  // mask. Puffs near the border would otherwise be clipped by the canvas and
  // leave a hard rectangular seam where the sprite quad ends.
  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2)
  mask.addColorStop(0.00, 'rgba(0,0,0,1)')
  mask.addColorStop(0.60, 'rgba(0,0,0,1)')
  mask.addColorStop(1.00, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.scale(1, H / W)          // squash the circular mask into an ellipse
  ctx.translate(-W / 2, -H / 2)
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'

  return new THREE.CanvasTexture(cv)
}

interface CloudDef { pos: [number, number, number]; texIdx: number; width: number; opacity?: number }

const CLOUD_DEFS: CloudDef[] = (() => {
  let s = 42
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 4294967296 }
  const defs: CloudDef[] = []
  const rings = [
    { count: 12, r0: 12, r1: 20, y0: 4, y1: 9,  w0: 6, w1: 10 },
    { count: 12, r0: 20, r1: 34, y0: 2, y1: 11, w0: 8, w1: 15 },
    { count: 8,  r0: 34, r1: 52, y0: 5, y1: 14, w0: 12, w1: 20 },
  ]
  rings.forEach(({ count, r0, r1, y0, y1, w0, w1 }) => {
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2 + rng() * 0.5 - 0.25
      const radius = r0 + rng() * (r1 - r0)
      defs.push({
        pos: [Math.cos(angle) * radius, y0 + rng() * (y1 - y0), Math.sin(angle) * radius],
        texIdx: Math.floor(rng() * 3),
        width: w0 + rng() * (w1 - w0),
      })
    }
  })
  return defs
})()

// A low band of clouds hugging the island's base, so it reads as floating in a
// cloud layer rather than hanging in empty sky.
const BASE_CLOUD_DEFS: CloudDef[] = (() => {
  let s = 77
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 4294967296 }
  const defs: CloudDef[] = []
  const count = 30
  for (let i = 0; i < count; i++) {
    const angle  = (i / count) * Math.PI * 2 + rng() * 0.45 - 0.225
    // A soft cloud floor at/below the tapered tip that the island dips into,
    // spread wide so it wraps and sits under the base rather than veiling its
    // front. Low and semi-transparent so it reads as drifting mist, not a deck.
    const radius = 3.2 + rng() * 5.4
    defs.push({
      pos: [Math.cos(angle) * radius, -3.3 + rng() * 1.05, Math.sin(angle) * radius],
      texIdx: Math.floor(rng() * 3),
      width: 3.8 + rng() * 3.2,
      opacity: 0.45 + rng() * 0.25,
    })
  }
  return defs
})()

function CloudSprite({ pos, texture, width, opacity = 1 }: { pos: [number, number, number]; texture: THREE.Texture; width: number; opacity?: number }) {
  const ref = useRef<THREE.Sprite>(null)
  const driftT = Math.abs(pos[0] * 12.9898 + pos[2] * 78.233) % (Math.PI * 2)
  const height = width * 0.5
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.05 + driftT
    ref.current.position.x = pos[0] + Math.sin(t) * 3.0
    ref.current.position.z = pos[2] + Math.cos(t * 0.65) * 2.2
  })
  return (
    <sprite ref={ref} position={pos} scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent opacity={opacity} alphaTest={0.01} depthWrite={false} />
    </sprite>
  )
}

function Clouds() {
  const texArr = useMemo(() => [makeCloudTex(101), makeCloudTex(202), makeCloudTex(303)], [])
  return (
    <>
      {CLOUD_DEFS.map((def, i) => (
        <CloudSprite key={`sky-${i}`} pos={def.pos} texture={texArr[def.texIdx]} width={def.width} />
      ))}
      {BASE_CLOUD_DEFS.map((def, i) => (
        <CloudSprite key={`base-${i}`} pos={def.pos} texture={texArr[def.texIdx]} width={def.width} opacity={def.opacity} />
      ))}
    </>
  )
}

// ─── Stylized pedestal ────────────────────────────────────────────────────────

const PODIUM_CFG = {
  1: { x:  0,    height: 1.95, color: '#E8B923', label: '1' }, // gold
  2: { x: -2.1,  height: 1.28, color: '#C7CCD1', label: '2' }, // silver
  3: { x:  2.1,  height: 0.92, color: '#C57A3F', label: '3' }, // bronze
} as const

const PW = 1.55  // column width
const PD = 1.3   // column depth

// A colored column with a toon outline shell, a wider base plinth and a top cap
// the bean stands on, plus a rank medallion on the front face.
function StylizedPodium({ rank }: { rank: 1 | 2 | 3 }) {
  const cfg  = PODIUM_CFG[rank]
  const H    = cfg.height
  const line = outlineShade(cfg.color)

  const colH   = H - 0.14        // main column (base + cap sit around it)
  const colY   = 0.14 + colH / 2
  const capY   = H - 0.07        // top cap centre → cap top at H
  const medalY = colY + 0.05

  const outlineMat = <meshBasicMaterial color={line} side={THREE.BackSide} />

  return (
    <group position={[cfg.x, 0, 0]}>
      {/* Base plinth */}
      <mesh position={[0, 0.07, 0]} scale={1.04}><boxGeometry args={[PW + 0.24, 0.14, PD + 0.24]} />{outlineMat}</mesh>
      <mesh position={[0, 0.07, 0]}><boxGeometry args={[PW + 0.24, 0.14, PD + 0.24]} /><meshStandardMaterial color={line} metalness={0.2} roughness={0.6} /></mesh>

      {/* Main column */}
      <mesh position={[0, colY, 0]} scale={1.03}><boxGeometry args={[PW, colH, PD]} />{outlineMat}</mesh>
      <mesh position={[0, colY, 0]}><boxGeometry args={[PW, colH, PD]} /><meshStandardMaterial color={cfg.color} metalness={0.35} roughness={0.38} /></mesh>

      {/* Top cap (standing platform) */}
      <mesh position={[0, capY, 0]} scale={1.03}><boxGeometry args={[PW + 0.22, 0.14, PD + 0.22]} />{outlineMat}</mesh>
      <mesh position={[0, capY, 0]}><boxGeometry args={[PW + 0.22, 0.14, PD + 0.22]} /><meshStandardMaterial color={cfg.color} metalness={0.4} roughness={0.3} /></mesh>

      {/* Rank medallion on the front face */}
      <group position={[0, medalY, PD / 2 + 0.03]}>
        {/* dark outline ring behind the disc */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.01]}>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 28]} />
          <meshBasicMaterial color={line} />
        </mesh>
        {/* cream face disc */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <cylinderGeometry args={[0.28, 0.28, 0.04, 28]} />
          <meshStandardMaterial color="#fbeecb" metalness={0.3} roughness={0.4} />
        </mesh>
        <Html position={[0, 0, 0.06]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{
            fontSize: '30px', fontWeight: 900, color: line,
            fontFamily: 'system-ui, sans-serif', lineHeight: 1,
            textShadow: '0 1px 1px rgba(255,255,255,0.5)',
          }}>
            {cfg.label}
          </div>
        </Html>
      </group>
    </group>
  )
}

// ─── Podium bean (static bean with a gentle idle) ─────────────────────────────

function PodiumBean({ member, x, podiumH, phaseOffset, period, gradientMap }: {
  member: RankedMember
  x: number
  podiumH: number
  phaseOffset: number
  period: Period
  gradientMap: THREE.DataTexture
}) {
  const bodyRef = useRef<THREE.Group>(null)
  const headBobRef = useRef<THREE.Group>(null)
  const lArmRef = useRef<THREE.Group>(null)
  const rArmRef = useRef<THREE.Group>(null)

  const dims      = useBeanDims(member.avatar)
  const skinColor = SKIN_TONES[member.avatar.skinTone]
  const bodyColor = member.avatar.bodyColor ?? member.avatar.shirtColor

  const eyeY      = dims.faceCenterY
  const eyeZ      = dims.faceZ
  const eyeSpread = Math.min(0.12, dims.faceZ * 0.42)
  const mouthY    = dims.faceCenterY - dims.faceZ * 0.38
  const mouthZ    = dims.faceZ

  // Lift the bean so its feet rest exactly on the cap surface.
  const footBottom = dims.legAttachY - dims.legLen - 0.108
  const baseY = podiumH - footBottom

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.2 + phaseOffset
    if (bodyRef.current)    bodyRef.current.position.y   = Math.abs(Math.sin(t)) * 0.03
    if (lArmRef.current)    lArmRef.current.rotation.x   =  Math.sin(t * 0.9) * 0.10
    if (rArmRef.current)    rArmRef.current.rotation.x   = -Math.sin(t * 0.9 + 0.8) * 0.10
    if (headBobRef.current) headBobRef.current.rotation.z = Math.sin(t * 0.5) * 0.05
  })

  const showChange = period !== 'alltime'
  const pts = member.periodPoints
  const isPos = pts > 0
  const isNeg = pts < 0
  const changeColor = showChange ? (isPos ? '#4ade80' : isNeg ? '#f87171' : '#9ca3af') : '#fbbf24'
  const changeText  = showChange
    ? `${isPos ? '↑ +' : isNeg ? '↓ ' : '– '}${pts === 0 ? '0' : pts}`
    : `${pts.toLocaleString()} pts`

  return (
    <group position={[x, baseY, 0]}>
      {/* Name + score label above head */}
      <Html position={[0, dims.bodyTop + 0.55, 0]} center style={{ pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 800, color: 'white',
            textShadow: '0 1px 5px rgba(0,0,0,0.9)',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis',
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

      <group ref={headBobRef}>
        <group ref={bodyRef}>
          {/* Left leg */}
          <group position={[-dims.radius * 0.4, dims.legAttachY, 0]}>
            <mesh position={[0, -dims.legLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
              <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
              <meshBasicMaterial color={outlineShade(member.avatar.pantsColor ?? '#1e293b')} side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -dims.legLen / 2, 0]}>
              <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
              <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
              <sphereGeometry args={[0.068, 8, 8]} />
              <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
            </mesh>
          </group>

          {/* Right leg */}
          <group position={[dims.radius * 0.4, dims.legAttachY, 0]}>
            <mesh position={[0, -dims.legLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
              <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
              <meshBasicMaterial color={outlineShade(member.avatar.pantsColor ?? '#1e293b')} side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -dims.legLen / 2, 0]}>
              <cylinderGeometry args={[0.055, 0.048, dims.legLen, 8]} />
              <meshToonMaterial color={member.avatar.pantsColor ?? '#1e293b'} gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, -dims.legLen - 0.04, 0.03]}>
              <sphereGeometry args={[0.068, 8, 8]} />
              <meshToonMaterial color={member.avatar.shoesColor ?? '#111'} gradientMap={gradientMap} />
            </mesh>
          </group>

          {/* Body */}
          <BeanBody dims={dims} color={bodyColor} gradientMap={gradientMap} />

          <BeanFace
            eyeStyle={member.avatar.eyeStyle ?? 'normal'}
            mouthStyle={member.avatar.mouthStyle ?? 'smile'}
            eyeSize={member.avatar.eyeSize}
            eyeSpacing={member.avatar.eyeSpacing}
            eyeY={eyeY}
            eyeZ={eyeZ}
            mouthY={mouthY}
            mouthZ={mouthZ}
          />

          {/* Left arm */}
          <group ref={lArmRef} position={[-dims.armX, dims.armAttachY, 0]} rotation={[0, 0, -Math.PI * 0.15]}>
            <mesh position={[0, -dims.armLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
              <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
              <meshBasicMaterial color={outlineShade(bodyColor)} side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -dims.armLen / 2, 0]}>
              <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
              <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, -(dims.armLen + 0.04), 0]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
            </mesh>
          </group>

          {/* Right arm */}
          <group ref={rArmRef} position={[dims.armX, dims.armAttachY, 0]} rotation={[0, 0, Math.PI * 0.15]}>
            <mesh position={[0, -dims.armLen / 2, 0]} scale={[1.1, 1.06, 1.1]}>
              <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
              <meshBasicMaterial color={outlineShade(bodyColor)} side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -dims.armLen / 2, 0]}>
              <cylinderGeometry args={[0.04, 0.035, dims.armLen, 8]} />
              <meshToonMaterial color={bodyColor} gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, -(dims.armLen + 0.04), 0]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshToonMaterial color={skinColor} gradientMap={gradientMap} />
            </mesh>
          </group>

          {/* Hair */}
          <BeanHair
            style={member.avatar.hairStyle}
            color={member.avatar.hairColor}
            bodyTop={dims.bodyTop}
            radius={dims.radius}
          />

          {/* Accessory */}
          <BeanAccessory
            style={member.avatar.accessory}
            bodyTop={dims.bodyTop}
            radius={dims.radius}
            eyeY={eyeY}
            eyeZ={eyeZ}
            eyeSpread={eyeSpread}
          />
        </group>
      </group>
    </group>
  )
}

// A soft contact shadow blob on the cap under a bean.
function CapShadow({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, y + 0.005, 0]}>
      {[{ r: 0.4, o: 0.18 }, { r: 0.28, o: 0.2 }, { r: 0.16, o: 0.22 }].map((ring, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, i * 0.002, 0]}>
          <circleGeometry args={[ring.r, 20]} />
          <meshBasicMaterial color="#000" transparent opacity={ring.o} depthWrite={false} />
        </mesh>
      ))}
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
  // Shared toon gradient ramp (matches MiiCharacter).
  const gradientMap = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([80, 140, 230]), 3, 1, THREE.RedFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [])

  return (
    <>
      {/* Lighting mirrors MiiPlaza */}
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 6]}  intensity={1.1} />
      <directionalLight position={[-4, 6, -4]} intensity={0.35} />

      <Suspense fallback={null}>
        <Clouds />
      </Suspense>

      <GardenFloor />

      <StylizedPodium rank={1} />
      <StylizedPodium rank={2} />
      <StylizedPodium rank={3} />

      {first  && <CapShadow x={PODIUM_CFG[1].x} y={PODIUM_CFG[1].height} />}
      {second && <CapShadow x={PODIUM_CFG[2].x} y={PODIUM_CFG[2].height} />}
      {third  && <CapShadow x={PODIUM_CFG[3].x} y={PODIUM_CFG[3].height} />}

      {first  && <PodiumBean member={first}  x={PODIUM_CFG[1].x} podiumH={PODIUM_CFG[1].height} phaseOffset={0}   period={period} gradientMap={gradientMap} />}
      {second && <PodiumBean member={second} x={PODIUM_CFG[2].x} podiumH={PODIUM_CFG[2].height} phaseOffset={1.5} period={period} gradientMap={gradientMap} />}
      {third  && <PodiumBean member={third}  x={PODIUM_CFG[3].x} podiumH={PODIUM_CFG[3].height} phaseOffset={2.9} period={period} gradientMap={gradientMap} />}
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
        camera={{ position: [0, 3.2, 10.0], fov: 50 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <Scene first={first} second={second} third={third} period={period} />
        </Suspense>
      </Canvas>
    </div>
  )
}
