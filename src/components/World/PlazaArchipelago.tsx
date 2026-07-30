'use client'

import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { FSIZE } from './plazaMath'
import { plazaEdgeRadius } from './plazaMath'
import { makePlazaShape, makeCheckerTexture, makeDirtTexture } from './plazaTextures'
import { ISLANDS, HOME_ISLAND, bridgeFor, unlockedIslands, type IslandDef } from './plazaIslands'

/**
 * The islands beyond home. Each unlocked milestone raises a smaller chunk of
 * land out of the clouds, joined to the plaza by a plank bridge.
 *
 * Satellites deliberately skip the home island's instanced grass blades (~100k
 * per island) and use the checker surface alone — they are seen from a
 * distance, and the blades are by far the most expensive thing in the scene.
 * Geometry is shared: one plaza shape, scaled per island, so every chunk keeps
 * the same rounded silhouette and texture mapping.
 */

const LIGHT_COLOR = '#6dc957'
const DARK_COLOR = '#57b344'
const PATCH_GRID = 10
const N_ROCKS = 34

// A satellite: checker grass top, extruded dirt column, rocks in the rim.
function SatelliteIsland({ island, dirtTex, grassTex, shape }: {
  island: IslandDef
  dirtTex: THREE.Texture
  grassTex: THREE.Texture
  shape: THREE.Shape
}) {
  const rocksRef = useRef<THREE.InstancedMesh>(null)

  const topGeo = useMemo(() => new THREE.ShapeGeometry(shape), [shape])
  // Shallower than home's column — these sit further from the camera.
  const dirtGeo = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 90, bevelEnabled: false }),
    [shape],
  )

  useEffect(() => {
    const mesh = rocksRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    // Seeded per island so each one's rim is different but stable across loads.
    let seed = 9973 + island.id.length * 613
    const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
    for (let i = 0; i < N_ROCKS; i++) {
      const th = rng() * Math.PI * 2
      const y = -(0.3 + Math.pow(rng(), 1.7) * 6.5)
      const size = 0.18 + rng() * 0.5
      const rOut = plazaEdgeRadius(th) - size * 0.35
      dummy.position.set(Math.cos(th) * rOut, y, Math.sin(th) * rOut)
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
  }, [island.id])

  // Scaling X/Z only keeps the dirt column vertical and the rocks upright.
  return (
    <group position={[island.center.x, 0, island.center.z]} scale={[island.scale, 1, island.scale]}>
      <mesh geometry={topGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <meshStandardMaterial map={grassTex} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={dirtGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <meshStandardMaterial map={dirtTex} roughness={0.95} />
      </mesh>
      <instancedMesh ref={rocksRef} args={[undefined, undefined, N_ROCKS]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

// A plank deck with side rails, spanning rim to rim.
function Bridge({ island }: { island: IslandDef }) {
  const bridge = useMemo(() => bridgeFor(island), [island])
  if (!bridge) return null

  const { from, to, angle, length } = bridge
  const midX = (from.x + to.x) / 2
  const midZ = (from.z + to.z) / 2
  const planks = Math.max(3, Math.round(length / 0.75))
  const postCount = Math.max(2, Math.round(length / 3))
  const width = 2.6

  return (
    // -angle because three.js Y rotation runs opposite to atan2's Z convention
    <group position={[midX, -0.08, midZ]} rotation={[0, -angle, 0]}>
      {/* deck planks, laid across the span */}
      {Array.from({ length: planks }, (_, i) => {
        const t = (i + 0.5) / planks - 0.5
        return (
          <mesh key={i} position={[t * length, 0, 0]}>
            <boxGeometry args={[(length / planks) * 0.82, 0.14, width]} />
            <meshStandardMaterial color={i % 2 ? '#8a6039' : '#7d5533'} roughness={0.95} flatShading />
          </mesh>
        )
      })}
      {/* rails */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.42, (side * width) / 2]}>
          <boxGeometry args={[length, 0.12, 0.12]} />
          <meshStandardMaterial color="#6b4a2b" roughness={0.95} flatShading />
        </mesh>
      ))}
      {/* posts */}
      {Array.from({ length: postCount }, (_, i) => {
        const t = postCount === 1 ? 0 : i / (postCount - 1) - 0.5
        return [-1, 1].map((side) => (
          <mesh key={`${i}-${side}`} position={[t * length * 0.96, 0.2, (side * width) / 2]}>
            <boxGeometry args={[0.14, 0.55, 0.14]} />
            <meshStandardMaterial color="#6b4a2b" roughness={0.95} flatShading />
          </mesh>
        ))
      })}
    </group>
  )
}

export default function PlazaArchipelago({ pointsGiven }: { pointsGiven: number }) {
  // Shared across every satellite — one shape, one pair of textures.
  const shape = useMemo(() => makePlazaShape(), [])
  const grassTex = useMemo(() => makeCheckerTexture(PATCH_GRID, LIGHT_COLOR, DARK_COLOR), [])
  const dirtTex = useMemo(() => makeDirtTexture(), [])

  const satellites = useMemo(
    () => unlockedIslands(pointsGiven).filter((i) => i.id !== HOME_ISLAND.id),
    [pointsGiven],
  )

  if (!satellites.length) return null

  return (
    <group>
      {satellites.map((island) => (
        <group key={island.id}>
          <SatelliteIsland island={island} shape={shape} grassTex={grassTex} dirtTex={dirtTex} />
          <Bridge island={island} />
        </group>
      ))}
    </group>
  )
}

// Re-exported so callers can frame the camera without importing the layout.
export { ISLANDS, FSIZE }
