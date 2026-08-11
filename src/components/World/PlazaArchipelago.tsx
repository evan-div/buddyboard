'use client'

import { useMemo, useRef, useEffect, type ReactNode } from 'react'
import * as THREE from 'three'
import { FSIZE, edgeRadius } from './plazaMath'
import { makePlazaShape, makeCheckerTexture, makeDirtTexture } from './plazaTextures'
import { ISLANDS, HOME_ISLAND, BRIDGE_WIDTH, bridgeFor, unlockedIslands, type IslandDef } from './plazaIslands'
import { hashUid } from './plazaWalk'
import IslandScenery from './IslandScenery'

/**
 * The islands beyond home. Each collective milestone raises another chunk of
 * land out of the clouds, joined to the plaza by a plank bridge.
 *
 * Every island is the plaza's size and carries its own seeded outline, so
 * geometry is built per island rather than shared — the textures still are.
 * Grass is not drawn here: StylizedGrassSurface lays a field on every island,
 * and the checker top below is only the low-graphics fallback for when it
 * isn't running.
 */

const LIGHT_COLOR = '#6dc957'
const DARK_COLOR = '#57b344'
const PATCH_GRID = 10
const N_ROCKS = 60

/**
 * One island's body: the dirt column under the grass and the rocks in its rim.
 * `children` is where an island's own scenery goes — it renders in the island's
 * local frame, so a prop placed at (0, 0, 0) sits at the island's centre.
 */
export function IslandGround({
  island, dirtTex, grassTex, dirtDepth = 90, rockCount = N_ROCKS, showGrassTop = false, children,
}: {
  island: IslandDef
  dirtTex: THREE.Texture
  grassTex?: THREE.Texture
  dirtDepth?: number
  rockCount?: number
  /** Draw the flat checker grass — only when the stylized field is off. */
  showGrassTop?: boolean
  children?: ReactNode
}) {
  const rocksRef = useRef<THREE.InstancedMesh>(null)

  const shape = useMemo(() => makePlazaShape(island.edge), [island.edge])
  const topGeo = useMemo(() => new THREE.ShapeGeometry(shape), [shape])
  const dirtGeo = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: dirtDepth, bevelEnabled: false }),
    [shape, dirtDepth],
  )
  useEffect(() => () => { topGeo.dispose(); dirtGeo.dispose() }, [topGeo, dirtGeo])

  useEffect(() => {
    const mesh = rocksRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    // Seeded from the id so each rim is different but stable across loads and
    // clients. (It used to be seeded from the id's *length*, which gave 'hill'
    // and 'home' — and any two same-length ids — the same rocks.)
    let seed = hashUid(island.id)
    const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
    for (let i = 0; i < rockCount; i++) {
      const th = rng() * Math.PI * 2
      const y = -(0.3 + Math.pow(rng(), 1.7) * 9.5)
      const size = 0.18 + rng() * 0.55
      const rOut = edgeRadius(th, island.edge) - size * 0.35
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
  }, [island.id, island.edge, rockCount])

  return (
    <group position={[island.center.x, 0, island.center.z]}>
      {showGrassTop && grassTex && (
        <mesh geometry={topGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <meshStandardMaterial map={grassTex} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh geometry={dirtGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <meshStandardMaterial map={dirtTex} roughness={0.95} />
      </mesh>
      <instancedMesh ref={rocksRef} args={[undefined, undefined, rockCount]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      {children}
    </group>
  )
}

/**
 * An island the group hasn't earned yet: its silhouette, dark and half-lost in
 * the clouds. You can see that something is out there and roughly how big, but
 * not what it holds — the scenery is the reveal.
 *
 * Deliberately not solid. Ground is decided from the *unlocked* islands, so a
 * shroud is a view of a place, not a place: you can't walk to it, land on it, or
 * plant on it, and there is no bridge until it is earned.
 */
function ShroudedIsland({ island }: { island: IslandDef }) {
  const shape = useMemo(() => makePlazaShape(island.edge), [island.edge])
  const topGeo = useMemo(() => new THREE.ShapeGeometry(shape), [shape])
  const dirtGeo = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 60, bevelEnabled: false }),
    [shape],
  )
  useEffect(() => () => { topGeo.dispose(); dirtGeo.dispose() }, [topGeo, dirtGeo])

  return (
    <group position={[island.center.x, 0, island.center.z]}>
      {/* Unlit, so it stays a flat shape against the sky however the sun moves
          — a lit dark surface reads as an island at dusk rather than a mystery. */}
      <mesh geometry={topGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <meshBasicMaterial color="#36435c" transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={dirtGeo} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <meshBasicMaterial color="#232d3d" transparent opacity={0.78} depthWrite={false} />
      </mesh>
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
  // Shared with the ground test, so what you can walk on is what you can see.
  const width = BRIDGE_WIDTH

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

export default function PlazaArchipelago({
  pointsGiven, lowerGraphics = false,
}: {
  pointsGiven: number
  /** With the stylized field off, each island draws the flat checker instead. */
  lowerGraphics?: boolean
}) {
  // Shapes are per island now; the textures are still shared.
  const grassTex = useMemo(() => makeCheckerTexture(PATCH_GRID, LIGHT_COLOR, DARK_COLOR), [])
  const dirtTex = useMemo(() => makeDirtTexture(), [])

  const satellites = useMemo(
    () => unlockedIslands(pointsGiven).filter((i) => i.id !== HOME_ISLAND.id),
    [pointsGiven],
  )
  // Everything still to come, shown as a shape in the clouds.
  const shrouded = useMemo(
    () => ISLANDS.filter((i) => i.id !== HOME_ISLAND.id && pointsGiven < i.unlockAtPoints),
    [pointsGiven],
  )

  return (
    <group>
      {shrouded.map((island) => (
        <ShroudedIsland key={island.id} island={island} />
      ))}
      {satellites.map((island) => (
        <group key={island.id}>
          <IslandGround
            island={island}
            grassTex={grassTex}
            dirtTex={dirtTex}
            showGrassTop={lowerGraphics}
          >
            <IslandScenery island={island} lowerGraphics={lowerGraphics} />
          </IslandGround>
          <Bridge island={island} />
        </group>
      ))}
    </group>
  )
}

// Re-exported so callers can frame the camera without importing the layout.
export { ISLANDS, FSIZE }
