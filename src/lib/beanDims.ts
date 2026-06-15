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
}

export function useBeanDims(config: AvatarConfig): BeanDims {
  return useMemo(() => {
    const bh = config.bodyHeight ?? 0.5
    const bw = config.bodyWidth  ?? 0.5
    const al = config.armLength  ?? 0.5
    const ll = config.legLength  ?? 0.5
    const radius  = lerp(0.18, 0.40, bw)
    const capLen  = lerp(0.15, 0.75, bh)
    const armLen  = lerp(0.18, 0.50, al)
    const legLen  = lerp(0.12, 0.38, ll)
    const groundY = legLen + 0.07 + radius
    const bodyTop = groundY + capLen / 2 + radius
    const legAttachY = groundY - capLen * 0.5 - radius * 0.6
    const armAttachY = groundY + capLen * 0.15
    return { radius, capLen, armLen, legLen, groundY, bodyTop, legAttachY, armAttachY }
  }, [config.bodyHeight, config.bodyWidth, config.armLength, config.legLength])
}

export function computeBeanDims(config: AvatarConfig): BeanDims {
  const bh = config.bodyHeight ?? 0.5
  const bw = config.bodyWidth  ?? 0.5
  const al = config.armLength  ?? 0.5
  const ll = config.legLength  ?? 0.5
  const radius  = lerp(0.18, 0.40, bw)
  const capLen  = lerp(0.15, 0.75, bh)
  const armLen  = lerp(0.18, 0.50, al)
  const legLen  = lerp(0.12, 0.38, ll)
  const groundY = legLen + 0.07 + radius
  const bodyTop = groundY + capLen / 2 + radius
  const legAttachY = groundY - capLen * 0.5 - radius * 0.6
  const armAttachY = groundY + capLen * 0.15
  return { radius, capLen, armLen, legLen, groundY, bodyTop, legAttachY, armAttachY }
}
