'use client'

import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

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

// Open-sky cloud rings — no spire, wide horizon view
const SPRITE_DEFS: SpriteDef[] = (() => {
  const r    = seededRandom(99)
  const defs: SpriteDef[] = []
  const rings = [
    { count: 28, r0: 10, r1: 22, y0: -2, y1:  2, w0:  8, w1: 16 },
    { count: 32, r0: 18, r1: 36, y0:  1, y1:  6, w0: 12, w1: 22 },
    { count: 26, r0: 32, r1: 55, y0:  2, y1:  8, w0: 16, w1: 28 },
    { count: 24, r0: 50, r1: 85, y0: -1, y1:  6, w0: 22, w1: 38 },
    { count: 20, r0: 80, r1:130, y0: -2, y1:  5, w0: 30, w1: 50 },
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

// ─── Cloud Sprite ─────────────────────────────────────────────────────────────

function CloudSprite({ pos, texture, width }: {
  pos: [number, number, number]
  texture: THREE.Texture
  width: number
}) {
  const ref    = useRef<THREE.Sprite>(null)
  const driftT = useRef(Math.random() * Math.PI * 2)
  const height = width * (1080 / 1920)

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

// ─── Scene ────────────────────────────────────────────────────────────────────

function CloudsScene() {
  const [tex1, tex2, tex3] = useTexture(['/Cloud1.svg', '/Cloud2.svg', '/Cloud3.svg'])
  const texArr = [tex1, tex2, tex3]

  return (
    <>
      <ambientLight intensity={1.2} />
      {SPRITE_DEFS.map((def, i) => (
        <CloudSprite key={i} pos={def.pos} texture={texArr[def.texIdx]} width={def.width} />
      ))}
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function CloudScene() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to bottom, #1e4fa0 0%, #3476c8 28%, #5ca8e0 58%, #90caf0 80%, #c8e8f8 100%)',
    }}>
      <Canvas
        camera={{ position: [0, 4, 22], fov: 65 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <CloudsScene />
        </Suspense>
      </Canvas>
    </div>
  )
}
