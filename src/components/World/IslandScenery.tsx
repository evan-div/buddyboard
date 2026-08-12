'use client'

import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { themeFor, scatterPlacements, ringPlacements, clampInsideRim, type Placement } from './plazaScenery'
import { type IslandDef } from './plazaIslands'
import { hashUid, mix, makeRng } from './plazaWalk'

/**
 * What each earned island holds. The Garden is a meadow, the Orchard grows
 * apples, Monument Hill keeps standing stones around a monument, and the
 * Observatory points a telescope at the sky.
 *
 * Built from primitives with flat shading, the way the plants and the rim rocks
 * are — the charm of this world is that everything in it is the same handful of
 * shapes, and a downloaded model would read as a visitor. Anything repeated
 * more than a few times is one InstancedMesh; the two centrepieces are a dozen
 * meshes each and carry a back-face outline shell, the treatment the podium uses
 * to separate things that were *built* from things that grew.
 *
 * Placement lives in plazaScenery.ts, which keeps scenery off the planting grid
 * and out of the bridge's way.
 */

// A character is ~1.4 tall and a mature plant 5–7.5, so a tree at ~5.5 sits in
// the canopy layer and the monument at ~4.5 reads as a landmark without
// dwarfing the island.
const APPLE_RED = '#cc3b31'
const BARK = '#7a5230'
const BARK_DARK = '#634127'
const LEAF = '#4f9c46'
const LEAF_ALT = '#3f8039'
const STONE = '#9b978c'
const STONE_DARK = '#6f6c64'
const BRASS = '#b98a3c'
const BRASS_BRIGHT = '#e0aa46'

function outlineOf(color: string): string {
  return `#${new THREE.Color(color).multiplyScalar(0.32).getHexString()}`
}

/** A built surface: the shape, plus a slightly larger back-face shell as a line. */
function Built({ color, outline, scale = 1.04, children }: {
  color: string
  outline?: string
  scale?: number
  children: React.ReactNode
}) {
  return (
    <>
      <mesh scale={scale}>
        {children}
        <meshBasicMaterial color={outline ?? outlineOf(color)} side={THREE.BackSide} />
      </mesh>
      <mesh>
        {children}
        <meshStandardMaterial color={color} roughness={0.72} flatShading />
      </mesh>
    </>
  )
}

// ─── The Garden — a flower meadow ─────────────────────────────────────────────

const PETAL_COLORS = ['#f2a3c7', '#f6c744', '#f4f0fb', '#c79bef', '#ef8f7a']

function Meadow({ island, detail }: { island: IslandDef; detail: number }) {
  const stemsRef = useRef<THREE.InstancedMesh>(null)
  const headsRef = useRef<THREE.InstancedMesh>(null)
  const count = detail > 0 ? 260 : 120
  const spots = useMemo(() => scatterPlacements(island, count), [island, count])

  useEffect(() => {
    const stems = stemsRef.current
    const heads = headsRef.current
    if (!stems || !heads) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const rng = makeRng(mix(hashUid(island.id), 0xf10a))
    spots.forEach((p, i) => {
      const height = 0.34 + rng() * 0.26
      // The stem's own geometry is a unit cylinder centred on its middle, so it
      // is raised by half its height to stand on the ground.
      dummy.position.set(p.x, (height / 2) * p.scale, p.z)
      dummy.rotation.set((rng() - 0.5) * 0.3, p.yaw, (rng() - 0.5) * 0.3)
      dummy.scale.set(p.scale, height * p.scale, p.scale)
      dummy.updateMatrix()
      stems.setMatrixAt(i, dummy.matrix)

      dummy.position.set(p.x, height * p.scale + 0.04, p.z)
      dummy.rotation.set(rng() * 0.6, p.yaw, rng() * 0.6)
      const head = (0.1 + rng() * 0.06) * p.scale
      dummy.scale.set(head, head * 0.7, head)
      dummy.updateMatrix()
      heads.setMatrixAt(i, dummy.matrix)
      color.set(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)])
      heads.setColorAt(i, color)
    })
    stems.count = spots.length
    heads.count = spots.length
    stems.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  }, [island.id, spots])

  return (
    <group>
      <instancedMesh ref={stemsRef} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.022, 0.03, 1, 4]} />
        <meshStandardMaterial color="#4c8f43" roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={headsRef} args={[undefined, undefined, count]}>
        <icosahedronGeometry args={[1, detail > 0 ? 1 : 0]} />
        <meshStandardMaterial roughness={0.75} flatShading />
      </instancedMesh>
    </group>
  )
}

// ─── The Orchard — apple trees ────────────────────────────────────────────────

function AppleTree({ placement, detail }: { placement: Placement; detail: number }) {
  const { x, z, yaw, scale } = placement
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]} scale={scale}>
      {/* Trunk in two kinked sections, the way the plaza's own trees are built */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.28, 0.4, 1.7, 8]} />
        <meshStandardMaterial color={BARK} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.08, 2.05, 0]} rotation={[0, 0.7, 0.07]}>
        <cylinderGeometry args={[0.2, 0.29, 0.95, 8]} />
        <meshStandardMaterial color={BARK_DARK} roughness={0.95} flatShading />
      </mesh>
      {/* Canopy: three lobes, flattened, so the silhouette reads as an orchard
          tree rather than a lollipop */}
      <mesh position={[0, 3.15, 0]} scale={[1, 0.78, 1]}>
        <icosahedronGeometry args={[1.5, detail]} />
        <meshStandardMaterial color={LEAF} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.95, 2.6, 0.3]} rotation={[0.5, 0.9, 0]} scale={[1, 0.8, 1]}>
        <icosahedronGeometry args={[0.95, detail]} />
        <meshStandardMaterial color={LEAF_ALT} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.85, 2.75, -0.35]} rotation={[0.2, 2.1, 0]} scale={[1, 0.82, 1]}>
        <icosahedronGeometry args={[0.85, detail]} />
        <meshStandardMaterial color={LEAF} roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

function Orchard({ island, detail }: { island: IslandDef; detail: number }) {
  const applesRef = useRef<THREE.InstancedMesh>(null)
  const trees = useMemo(() => ringPlacements(island, 11), [island])
  // Every apple in the orchard, on the trees and fallen under them, in one draw.
  const APPLES_PER_TREE = 8

  useEffect(() => {
    const mesh = applesRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rng = makeRng(mix(hashUid(island.id), 0xa77e))
    let i = 0
    // Which way the island's middle is from each tree. Apples roll inward, not
    // off the edge: the trees stand a unit or so from the rim, so a fall in a
    // uniformly random direction leaves half of them hanging over the clouds.
    for (const tree of trees) {
      const inward = Math.atan2(-tree.z, -tree.x)
      for (let a = 0; a < APPLES_PER_TREE; a++) {
        const fallen = a >= APPLES_PER_TREE - 2
        // Hanging apples sit on the canopy's lower shell; fallen ones lie in the
        // grass a stride from the trunk, on the island side of it.
        const theta = fallen
          ? inward + (rng() - 0.5) * 1.6
          : rng() * Math.PI * 2
        const radius = fallen ? 1.1 + rng() * 1.3 : 0.8 + rng() * 0.7
        const y = fallen ? 0.14 : (2.35 + rng() * 0.95) * tree.scale
        // Belt and braces: a tree on a bulge of the rim can still throw one
        // past the edge, so every apple is pulled back onto the grass.
        const spot = clampInsideRim(
          tree.x + Math.cos(theta) * radius * tree.scale,
          tree.z + Math.sin(theta) * radius * tree.scale,
          island,
          0.4,
        )
        dummy.position.set(spot.x, y, spot.z)
        dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
        const s = (0.15 + rng() * 0.06) * tree.scale
        dummy.scale.set(s, fallen ? s * 0.82 : s, s)
        dummy.updateMatrix()
        mesh.setMatrixAt(i++, dummy.matrix)
      }
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
  }, [island, trees])

  return (
    <group>
      {trees.map((t, i) => <AppleTree key={i} placement={t} detail={detail} />)}
      <instancedMesh ref={applesRef} args={[undefined, undefined, trees.length * APPLES_PER_TREE]}>
        <icosahedronGeometry args={[1, detail]} />
        <meshStandardMaterial color={APPLE_RED} roughness={0.55} flatShading />
      </instancedMesh>
    </group>
  )
}

// ─── Monument Hill — standing stones around a monument ────────────────────────

function Monument() {
  // Taller than the orchard's trees on purpose: this is the thing you should be
  // able to pick out from home, which is 38 units away. It grows upward rather
  // than outward — the footprint has to stay inside the centre tile it reserves,
  // and the neighbouring planting tiles are only 4.6 units off.
  return (
    <group>
      {/* Stepped plinth */}
      <Built color="#5c5952" scale={1.03}>
        <cylinderGeometry args={[2.15, 2.4, 0.5, 8]} />
      </Built>
      <group position={[0, 0.5, 0]}>
        <Built color={STONE} scale={1.04}>
          <cylinderGeometry args={[1.7, 1.95, 0.5, 8]} />
        </Built>
      </group>
      {/* Obelisk — square, tapered */}
      <group position={[0, 1.0, 0]}>
        <Built color={STONE} scale={1.02}>
          <cylinderGeometry args={[0.66, 1.08, 6.2, 4]} />
        </Built>
      </group>
      {/* Cap: a pyramid, rotated to sit square on the shaft */}
      <group position={[0, 7.1, 0]} rotation={[0, Math.PI / 4, 0]}>
        <Built color={BRASS_BRIGHT} scale={1.05}>
          <coneGeometry args={[0.98, 1.5, 4]} />
        </Built>
      </group>
      {/* A plaque face, blank for now — what to carve into it is a decision for
          when there is real group history to put there. */}
      <mesh position={[0, 2.6, 0.78]}>
        <boxGeometry args={[0.85, 1.25, 0.08]} />
        <meshStandardMaterial color="#d8cfae" roughness={0.6} flatShading />
      </mesh>
    </group>
  )
}

function MonumentGrounds({ island, detail }: { island: IslandDef; detail: number }) {
  const stonesRef = useRef<THREE.InstancedMesh>(null)
  const stones = useMemo(() => ringPlacements(island, 12, { seed: mix(hashUid(island.id), 0x5104) }), [island])

  useEffect(() => {
    const mesh = stonesRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const rng = makeRng(mix(hashUid(island.id), 0x5709))
    stones.forEach((p, i) => {
      const height = 2.6 + rng() * 2.2
      const width = 0.55 + rng() * 0.4
      dummy.position.set(p.x, height * 0.42, p.z)
      // Leaning, like standing stones that have been there a while.
      dummy.rotation.set((rng() - 0.5) * 0.22, p.yaw, (rng() - 0.5) * 0.22)
      dummy.scale.set(width, height * 0.5, width * (0.55 + rng() * 0.3))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // The warm grey the rim rocks use, so the stones read as the same rock the
      // island is made of.
      const shade = 0.5 + rng() * 0.28
      color.setRGB(shade, shade * (0.94 + rng() * 0.06), shade * 0.86)
      mesh.setColorAt(i, color)
    })
    mesh.count = stones.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [island.id, stones])

  return (
    <group>
      <Monument />
      <instancedMesh ref={stonesRef} args={[undefined, undefined, stones.length]}>
        <dodecahedronGeometry args={[1, detail > 0 ? 1 : 0]} />
        <meshStandardMaterial roughness={0.92} flatShading />
      </instancedMesh>
    </group>
  )
}

// ─── The Observatory — a telescope on a platform ──────────────────────────────

// Where the tripod's legs meet, in the telescope's own units. Everything else
// is positioned from this, so the legs, the mount and the tube's pivot are the
// same point by construction rather than by three numbers agreeing.
const MOUNT_Y = 1.5
const LEG_LEN = 1.85
const LEG_SPLAY = 0.34   // radians from vertical

function Telescope() {
  return (
    <group position={[0, 0.28, 0]} rotation={[0, 0.6, 0]} scale={1.5}>
      {/* Tripod: each leg hangs from the mount and splays outward, so the top
          of every leg is at the apex instead of somewhere near it. */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[0, MOUNT_Y, 0]} rotation={[0, (i / 3) * Math.PI * 2, LEG_SPLAY]}>
          <mesh position={[0, -LEG_LEN / 2, 0]}>
            <cylinderGeometry args={[0.06, 0.085, LEG_LEN, 6]} />
            <meshStandardMaterial color="#5d4a35" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}

      {/* Mount head, sitting on the apex */}
      <mesh position={[0, MOUNT_Y + 0.06, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.34, 8]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.7} flatShading />
      </mesh>

      {/* The tube pivots on the mount and tips up ~40°. Its geometry runs along
          local Y, and it is slid *along* that axis so it balances on the
          pivot — the eyepiece end hangs back and down, the barrel points up. */}
      <group position={[0, MOUNT_Y + 0.24, 0]} rotation={[0, 0, -0.72]}>
        <group position={[0, 0.42, 0]}>
          <Built color="#2f4f7a" scale={1.04}>
            <cylinderGeometry args={[0.26, 0.32, 2.5, 12]} />
          </Built>
          {/* Brass bands around the barrel */}
          {[0.72, -0.55].map((y, i) => (
            <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[i === 0 ? 0.28 : 0.31, 0.05, 6, 14]} />
              <meshStandardMaterial color={BRASS} roughness={0.5} flatShading />
            </mesh>
          ))}
          {/* Objective lens at the sky end */}
          <mesh position={[0, 1.28, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.1, 12]} />
            <meshStandardMaterial color="#cfe4f5" roughness={0.25} flatShading />
          </mesh>
          {/* Eyepiece at the low end */}
          <mesh position={[0, -1.42, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 0.42, 8]} />
            <meshStandardMaterial color={BRASS} roughness={0.5} flatShading />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function ObservatoryGrounds({ island, detail }: { island: IslandDef; detail: number }) {
  const marksRef = useRef<THREE.InstancedMesh>(null)
  // Waist-high pillars rather than a wall, so the horizon stays visible from
  // the middle — the whole point of the island is looking outward.
  const pillars = useMemo(() => ringPlacements(island, 10, { seed: mix(hashUid(island.id), 0x0b53) }), [island])

  useEffect(() => {
    const mesh = marksRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rng = makeRng(mix(hashUid(island.id), 0x0b71))
    pillars.forEach((p, i) => {
      const height = 1.1 + rng() * 0.5
      dummy.position.set(p.x, height / 2, p.z)
      dummy.rotation.set(0, p.yaw, 0)
      dummy.scale.set(0.34, height / 2, 0.34)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.count = pillars.length
    mesh.instanceMatrix.needsUpdate = true
  }, [island.id, pillars])

  return (
    <group>
      {/* Flagstone platform, a step above the grass */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[2.75, 2.95, 0.3, 12]} />
        <meshStandardMaterial color="#8d8a80" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 2.5, 12]} />
        <meshStandardMaterial color="#6f6c64" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <Telescope />
      <instancedMesh ref={marksRef} args={[undefined, undefined, pillars.length]}>
        <cylinderGeometry args={[0.8, 1, 2, detail > 0 ? 8 : 5]} />
        <meshStandardMaterial color={STONE} roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export default function IslandScenery({ island, lowerGraphics = false }: {
  island: IslandDef
  lowerGraphics?: boolean
}) {
  const theme = themeFor(island.id)
  // Matches PlazaGarden's convention: subdivision 1 is rounded but still
  // faceted, 0 keeps mobile smooth.
  const detail = lowerGraphics ? 0 : 1

  if (!theme) return null
  switch (theme) {
    case 'meadow':      return <Meadow island={island} detail={detail} />
    case 'orchard':     return <Orchard island={island} detail={detail} />
    case 'monument':    return <MonumentGrounds island={island} detail={detail} />
    case 'observatory': return <ObservatoryGrounds island={island} detail={detail} />
  }
}
