import { useMemo } from 'react'
import * as THREE from 'three'
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
}

function shapeExtras(
  shape: BodyShape,
  radius: number,
  capLen: number,
  groundY: number,
): Pick<BeanDims, 'bodyTop' | 'armAttachY' | 'faceCenterY' | 'faceZ' | 'armX'> {
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
      }
    }
    case 'strawberry': {
      // Three overlapping spheres: tiny tip → medium waist → big round top
      const legAttachY = groundY - capLen * 0.5 - radius * 0.6
      const tipR = radius * 0.26
      const midR = radius * 0.66
      const topR = radius * 1.04
      const tipY = legAttachY + tipR
      const midY = tipY + (tipR + midR) * 0.78
      const topY = midY + (midR + topR) * 0.78
      return {
        bodyTop:     topY + topR,
        armAttachY:  midY,
        faceCenterY: topY,
        faceZ:       topR,
        armX:        midR + 0.03,
      }
    }
    default: { // bean
      return {
        bodyTop:     groundY + capLen / 2 + radius,
        armAttachY:  groundY + capLen * 0.15,
        faceCenterY: groundY + capLen * 0.22,
        faceZ:       radius,
        armX:        radius + 0.02,
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
  const capLen = lerp(0.15, 0.75, shape === 'strawberry' ? 0.5 : bh)
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

export function computeBeanDims(config: AvatarConfig): BeanDims {
  return computeDims(config)
}

// ─── Lathe profile builder ────────────────────────────────────────────────────
// Returns a 2D profile (radius, worldY) that LatheGeometry revolves around Y.
// Each shape is defined by a handful of control points run through a
// CatmullRom spline so the silhouette is smooth and organic.

export function buildBodyProfile(shape: BodyShape, dims: BeanDims): THREE.Vector2[] {
  const botY = dims.legAttachY
  const topY = dims.bodyTop
  const h    = topY - botY
  const r    = dims.radius

  type CP = [number, number] // [radius, worldY]
  let cps: CP[]

  switch (shape) {
    case 'peanut':
      cps = [
        [0.005, botY],
        [r * 0.65, botY + h * 0.09],
        [r * 1.00, botY + h * 0.26],
        [r * 0.28, botY + h * 0.50],
        [r * 0.72, botY + h * 0.74],
        [r * 0.55, botY + h * 0.91],
        [0.005, topY],
      ]
      break
    case 'gourd':
      cps = [
        [0.005, botY],
        [r * 0.75, botY + h * 0.10],
        [r * 1.18, botY + h * 0.32],
        [r * 1.12, botY + h * 0.50],
        [r * 0.44, botY + h * 0.64],
        [r * 0.60, botY + h * 0.78],
        [r * 0.50, botY + h * 0.91],
        [0.005, topY],
      ]
      break
    case 'strawberry':
      cps = [
        [0.005, botY],
        [r * 0.18, botY + h * 0.08],
        [r * 0.48, botY + h * 0.26],
        [r * 0.80, botY + h * 0.46],
        [r * 1.04, botY + h * 0.68],
        [r * 0.90, botY + h * 0.86],
        [0.005, topY],
      ]
      break
    default: // bean — organic pill, slightly pear-shaped
      cps = [
        [0.005, botY],
        [r * 0.60, botY + h * 0.10],
        [r * 1.00, botY + h * 0.30],
        [r * 0.98, botY + h * 0.55],
        [r * 0.82, botY + h * 0.75],
        [r * 0.52, botY + h * 0.91],
        [0.005, topY],
      ]
  }

  const curve = new THREE.CatmullRomCurve3(
    cps.map(([x, y]) => new THREE.Vector3(x, y, 0))
  )
  return curve.getPoints(40).map(p => new THREE.Vector2(Math.max(0.001, p.x), p.y))
}
