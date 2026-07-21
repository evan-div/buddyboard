import { useMemo } from 'react'
import type { AvatarConfig } from './types'

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export type BodyShape = NonNullable<AvatarConfig['bodyShape']>

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
  // Shape-specific rendering
  shape: BodyShape
  faceCenterY: number  // Y position of eye center
  faceZ: number        // Z (radius) at the face surface
  armX: number         // X offset for arm attachment
  headRadius: number   // radius of the head sphere the hair wraps
}

function shapeExtras(
  shape: BodyShape,
  radius: number,
  capLen: number,
  groundY: number,
): Pick<BeanDims, 'bodyTop' | 'armAttachY' | 'faceCenterY' | 'faceZ' | 'armX' | 'headRadius'> {
  switch (shape) {
    case 'peanut': {
      const topR = radius * 0.72
      const topY = groundY + capLen * 0.60
      return {
        bodyTop:     topY + topR,
        armAttachY:  groundY + capLen * 0.50,
        faceCenterY: topY,
        faceZ:       topR,
        armX:        topR + 0.02,
        headRadius:  topR,
      }
    }
    case 'gourd': {
      const topR = radius * 0.60
      const topY = groundY + capLen * 0.70
      return {
        bodyTop:     topY + topR,
        armAttachY:  groundY + capLen * 0.20,
        faceCenterY: topY,
        faceZ:       topR,
        armX:        radius + 0.02,
        headRadius:  topR,
      }
    }
    case 'strawberry': {
      const topR = radius * 1.12
      const topY = groundY + capLen * 0.42
      return {
        bodyTop:     topY + topR,
        armAttachY:  topY,
        faceCenterY: topY,
        faceZ:       topR,
        armX:        topR + 0.02,
        headRadius:  topR,
      }
    }
    default: { // bean
      return {
        bodyTop:     groundY + capLen / 2 + radius,
        armAttachY:  groundY + capLen * 0.15,
        faceCenterY: groundY + capLen * 0.22,
        faceZ:       radius,
        armX:        radius + 0.02,
        headRadius:  radius,
      }
    }
  }
}

function computeDims(config: AvatarConfig): BeanDims {
  const bh    = config.bodyHeight ?? 0.5
  const bw    = config.bodyWidth  ?? 0.5
  const al    = config.armLength  ?? 0.5
  const ll    = config.legLength  ?? 0.5
  const shape: BodyShape = config.bodyShape ?? 'bean'

  const radius = lerp(0.18, 0.40, bw)
  const capLen = lerp(0.15, 0.75, bh)
  const armLen = lerp(0.18, 0.50, al)
  const legLen = lerp(0.12, 0.38, ll)
  const groundY    = legLen + 0.07 + radius
  const legAttachY = groundY - capLen * 0.5 - radius * 0.6

  const extras = shapeExtras(shape, radius, capLen, groundY)

  return { radius, capLen, armLen, legLen, groundY, legAttachY, legSpread: 1.0, shape, ...extras }
}

export function useBeanDims(config: AvatarConfig): BeanDims {
  return useMemo(
    () => computeDims(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.bodyHeight, config.bodyWidth, config.armLength, config.legLength, config.bodyShape],
  )
}
