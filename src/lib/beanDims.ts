import { useMemo } from 'react'
import type { AvatarConfig } from './types'

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export type BeanDims = {
  radius: number
  capLen: number
  armLen: number
  legLen: number
  groundY: number
  bodyTop: number
  legAttachY: number
  armAttachY: number
  legSpread: number
}

function computeDims(config: AvatarConfig): BeanDims {
  const shape = config.bodyShape ?? 'classic'
  const bh = shape === 'round' ? 0.15 : shape === 'pear' ? 0.65 : shape === 'egg' ? 0.80 : (config.bodyHeight ?? 0.5)
  const bw = shape === 'round' ? 0.85 : shape === 'pear' ? 0.65 : shape === 'egg' ? 0.35 : (config.bodyWidth  ?? 0.5)
  const al = config.armLength ?? 0.5
  const ll = config.legLength ?? 0.5
  const legSpread = shape === 'pear' ? 1.6 : 1.0
  const radius  = lerp(0.18, 0.80, bw)
  const capLen  = lerp(0.15, 2.40, bh)
  const armLen  = lerp(0.18, 1.50, al)
  const legLen  = lerp(0.12, 1.40, ll)
  const groundY = legLen + 0.07 + radius
  const bodyTop = groundY + capLen / 2 + radius
  const legAttachY = groundY - capLen * 0.5 - radius * 0.6
  const armAttachY = groundY + capLen * 0.15
  return { radius, capLen, armLen, legLen, groundY, bodyTop, legAttachY, armAttachY, legSpread }
}

export function useBeanDims(config: AvatarConfig): BeanDims {
  return useMemo(() => computeDims(config), [
    config.bodyHeight, config.bodyWidth, config.armLength, config.legLength, config.bodyShape,
  ])
}

export function computeBeanDims(config: AvatarConfig): BeanDims {
  return computeDims(config)
}
