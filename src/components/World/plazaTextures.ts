/**
 * @file Procedural island textures and outline
 * @description The canvas-drawn checker grass and noisy dirt used by the plaza
 * floor, plus the rounded plaza outline. Shared by the home island and the
 * satellite islands of the archipelago so every chunk of land reads as the same
 * world. Browser-only (uses <canvas>) — import from client components.
 */

import * as THREE from 'three'
import { FSIZE, plazaEdgeRadius } from './plazaMath'

// The rounded "squircle" plaza outline, used for the grass top and the
// extruded dirt column beneath it.
export function makePlazaShape(): THREE.Shape {
  const pts: THREE.Vector2[] = []
  const N = 96
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2
    const r = plazaEdgeRadius(th)
    pts.push(new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r))
  }
  return new THREE.Shape(pts)
}

// Canvas-drawn checkerboard — solid full coverage, no gaps between blades.
// Mapped onto the rounded plaza shape via repeat/offset (shape UVs are the raw
// XY coordinates).
export function makeCheckerTexture(
  tiles: number,
  lightColor: string,
  darkColor: string,
): THREE.CanvasTexture {
  const PX = 512
  const TW = PX / tiles
  const cv = document.createElement('canvas')
  cv.width = cv.height = PX
  const ctx = cv.getContext('2d')!
  for (let y = 0; y < tiles; y++)
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? lightColor : darkColor
      ctx.fillRect(x * TW, y * TW, TW, TW)
    }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / FSIZE, 1 / FSIZE)
  tex.offset.set(0.5, 0.5)
  return tex
}

// Noisy dirt: soft earth-tone patches, faint strata, and grit so the column
// reads as soil instead of a flat brown wall.
export function makeDirtTexture(): THREE.CanvasTexture {
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
  tex.repeat.set(0.22, 0.22)
  return tex
}
