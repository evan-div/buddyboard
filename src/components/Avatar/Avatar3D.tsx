'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { BeanScene } from './BeanPreview'
import type { AvatarConfig } from '@/lib/types'

interface Props {
  config: AvatarConfig
  size?: number
  className?: string
  /** Pass true in the avatar builder so the canvas re-renders on every config change */
  live?: boolean
}

export default function Avatar3D({ config, size = 80, className, live = false }: Props) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        background: config.backgroundColor ?? '#e0e7ff',
      }}
    >
      <Canvas
        frameloop={live ? 'always' : 'demand'}
        camera={{ position: [0, 0.85, 3.4], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <BeanScene config={config} rotate={false} />
        </Suspense>
      </Canvas>
    </div>
  )
}
