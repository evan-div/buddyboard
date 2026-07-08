'use client'

import { useEffect, useMemo, useState } from 'react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useBeanDims } from '@/lib/beanDims'
import type { AvatarConfig } from '@/lib/types'
import { BeanFace } from './BeanFace'
import { BeanBody, BeanHair, BeanAccessory } from './BeanParts'

// Circular headshot of the user's 3D bean avatar. Each unique avatar config is
// rendered once to a shared offscreen WebGL canvas, captured as a PNG data URL,
// and cached — so lists of avatars cost one <img> each, and any appearance
// change (new config → new cache key) regenerates the portrait automatically.

const SHOT_SIZE = 256

// ─── Offscreen snapshot factory ───────────────────────────────────────────────

type Job = { config: AvatarConfig; key: string; resolve: (url: string) => void }

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()
const queue: Job[] = []
let root: ReturnType<typeof createRoot> | null = null
let working = false

function requestHeadshot(config: AvatarConfig): string | Promise<string> {
  const key = JSON.stringify(config)
  const hit = cache.get(key)
  if (hit) return hit
  const pending = inflight.get(key)
  if (pending) return pending
  const p = new Promise<string>((resolve) => {
    queue.push({ config, key, resolve })
  })
  inflight.set(key, p)
  pump()
  return p
}

function pump() {
  if (working) return
  const job = queue.shift()
  if (!job) return
  working = true

  if (!root) {
    // <Canvas> does this automatically; a raw root needs the THREE catalogue
    extend(THREE as unknown as Parameters<typeof extend>[0])
    const canvas = document.createElement('canvas')
    canvas.width = SHOT_SIZE
    canvas.height = SHOT_SIZE
    root = createRoot(canvas)
    root.configure({
      frameloop: 'never',
      dpr: 1,
      size: { width: SHOT_SIZE, height: SHOT_SIZE, top: 0, left: 0 },
      gl: { alpha: true, antialias: true },
      camera: { fov: 30, near: 0.1, far: 20 },
    })
  }

  root.render(
    <Shot
      key={job.key}
      config={job.config}
      onDone={(url) => {
        cache.set(job.key, url)
        inflight.delete(job.key)
        job.resolve(url)
        working = false
        pump()
      }}
    />,
  )
}

function Shot({ config, onDone }: { config: AvatarConfig; onDone: (url: string) => void }) {
  const { gl, scene, camera } = useThree()
  const dims = useBeanDims(config)
  const bodyColor = config.bodyColor ?? config.shirtColor

  const gradientMap = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([80, 140, 230]), 3, 1, THREE.RedFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }, [])

  const eyeY      = dims.faceCenterY
  const eyeZ      = dims.faceZ
  const eyeSpread = Math.min(0.12, dims.faceZ * 0.42)
  const mouthY    = dims.faceCenterY - dims.faceZ * 0.38

  useEffect(() => {
    // Frame from just below the mouth to above the hair/headwear
    const tallHat  = ['wizard_hat', 'bunny_ears'].includes(config.accessory)
    const headwear = ['hat', 'crown', 'horns', 'halo', 'flower_crown'].includes(config.accessory)
    const tallHair = ['mohawk', 'topknot', 'bun', 'afro', 'curly'].includes(config.hairStyle)
    const top    = dims.bodyTop + (tallHat ? 0.8 : headwear || tallHair ? 0.5 : 0.3)
    const bottom = dims.faceCenterY - dims.radius * 1.1
    const cy     = (top + bottom) / 2
    const halfH  = Math.max(0.3, (top - bottom) / 2) * 1.15
    const cam    = camera as THREE.PerspectiveCamera
    const dist   = halfH / Math.tan(((cam.fov / 2) * Math.PI) / 180)
    cam.position.set(0, cy + 0.03, dims.faceZ * 0.6 + dist)
    cam.lookAt(0, cy, 0)
    cam.updateProjectionMatrix()

    gl.render(scene, camera)
    onDone(gl.domElement.toDataURL('image/png'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  return (
    <group>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 6, 5]} intensity={1.05} />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} />
      <BeanBody dims={dims} color={bodyColor} gradientMap={gradientMap} />
      <BeanFace
        eyeStyle={config.eyeStyle ?? 'normal'}
        mouthStyle={config.mouthStyle ?? 'smile'}
        eyeSize={config.eyeSize}
        eyeSpacing={config.eyeSpacing}
        eyeY={eyeY}
        eyeZ={eyeZ}
        mouthY={mouthY}
        mouthZ={eyeZ}
      />
      <BeanHair style={config.hairStyle} color={config.hairColor} bodyTop={dims.bodyTop} radius={dims.radius} />
      <BeanAccessory
        style={config.accessory}
        bodyTop={dims.bodyTop}
        radius={dims.radius}
        eyeY={eyeY}
        eyeZ={eyeZ}
        eyeSpread={eyeSpread}
      />
    </group>
  )
}

// ─── Background (matches the old 2D avatar's backgrounds, incl. shop unlocks) ──

function backgroundFor(bg: string): string {
  switch (bg) {
    case 'fire':
      return 'radial-gradient(circle at 50% 80%, #fbbf24 0%, #f97316 40%, #dc2626 100%)'
    case 'ice':
      return 'radial-gradient(circle at 50% 30%, #e0f2fe 0%, #7dd3fc 50%, #0ea5e9 100%)'
    case 'galaxy':
      return 'radial-gradient(circle at 60% 40%, #6d28d9 0%, #1e1b4b 60%, #0f0a1e 100%)'
    case 'rainbow':
      return 'linear-gradient(135deg, #f87171 0%, #fb923c 20%, #facc15 40%, #4ade80 60%, #60a5fa 80%, #c084fc 100%)'
    default:
      return bg
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  config: AvatarConfig
  size?: number
  className?: string
}

export default function Avatar3D({ config, size = 80, className }: Props) {
  const key = JSON.stringify(config)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    Promise.resolve(requestHeadshot(config)).then((u) => { if (!stale) setUrl(u) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div
      className={className}
      aria-label="Avatar"
      role="img"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: backgroundFor(config.backgroundColor),
        flexShrink: 0,
      }}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL, next/image adds nothing
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          draggable={false}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      )}
    </div>
  )
}
