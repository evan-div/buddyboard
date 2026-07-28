'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PlazaObject } from '@/lib/types'
import { growthStage } from '@/lib/plazaGrowth'
import { tileToWorld, tileKey, tilesInsidePlaza, type Tile } from './plazaMath'
import { getSpecies, type PlazaSpecies } from './plazaSpecies'

/**
 * Each growth stage is its own model, not a scaled copy of the mature plant —
 * a seedling is two seed leaves in the dirt, a sapling is a bare whip, and only
 * the last two stages carry a real canopy. Growth should read as a change in
 * *shape*, not just size, so a glance at the island tells you how far along it is.
 *
 * Heights (world units; a character is ~1.4 tall):
 *   seedling ≈ 0.5 · sapling ≈ 1.7 · young ≈ 3.6 · mature ≈ 5–7.5 by species
 */

const DORMANT_TINT = new THREE.Color('#6f7f8c')
const SOIL_COLOR = '#6b4b32'

// Soil footprint and sway amplitude per stage — big trees barely move.
const SOIL_R = [0.42, 0.55, 0.78, 1.05]
const SWAY = [0.07, 0.055, 0.03, 0.016]

type Palette = { foliage: string; foliageAlt: string; trunk: string }

function mute(hex: string, dormant: boolean): string {
  if (!dormant) return hex
  return new THREE.Color(hex).lerp(DORMANT_TINT, 0.55).getStyle()
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Trunk({
  h, rb, rt, color, y = 0, seg = 7,
}: { h: number; rb: number; rt: number; color: string; y?: number; seg?: number }) {
  return (
    <mesh position={[0, y + h / 2, 0]}>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

// Flared root collar — makes a mature trunk sit in the ground instead of on it.
function RootFlare({ r, color }: { r: number; color: string }) {
  return (
    <mesh position={[0, 0.22, 0]}>
      <cylinderGeometry args={[r * 0.62, r, 0.44, 8]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Branch({
  from, len, tilt, yaw, r, color,
}: { from: number; len: number; tilt: number; yaw: number; r: number; color: string }) {
  return (
    <group position={[0, from, 0]} rotation={[0, yaw, tilt]}>
      <mesh position={[0, len / 2, 0]}>
        <cylinderGeometry args={[r * 0.6, r, len, 5]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

type Blob = { p: [number, number, number]; r: number; alt?: boolean; flat?: number }

function Canopy({ blobs, colors }: { blobs: Blob[]; colors: Palette }) {
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} scale={[1, b.flat ?? 1, 1]}>
          <icosahedronGeometry args={[b.r, 0]} />
          <meshStandardMaterial color={b.alt ? colors.foliageAlt : colors.foliage} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// A single leaf: a squashed sphere on a short angled stalk.
function Leaf({
  p, yaw, tilt, size, color,
}: { p: [number, number, number]; yaw: number; tilt: number; size: number; color: string }) {
  return (
    <group position={p} rotation={[0, yaw, tilt]}>
      <mesh position={[size * 0.7, 0, 0]} scale={[1.5, 0.32, 0.85]}>
        <sphereGeometry args={[size, 7, 5]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

// ─── Stage 0 — seedling ───────────────────────────────────────────────────────
// Two cotyledons pushing out of the dirt beside the cracked seed. No stem yet.

function Seedling({ colors }: { colors: Palette }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 0.3, 5]} />
        <meshStandardMaterial color={colors.trunk} flatShading />
      </mesh>
      <Leaf p={[0, 0.3, 0]} yaw={0.5} tilt={0.55} size={0.15} color={colors.foliage} />
      <Leaf p={[0, 0.28, 0]} yaw={Math.PI + 0.4} tilt={0.5} size={0.13} color={colors.foliageAlt} />
      {/* seed husk still clinging on */}
      <mesh position={[0.1, 0.12, 0.08]} rotation={[0.4, 0, 0.3]} scale={[1, 0.55, 0.8]}>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshStandardMaterial color="#8a6b4a" flatShading />
      </mesh>
    </group>
  )
}

// ─── Stage 1 — sapling ────────────────────────────────────────────────────────
// A bare, slightly bent whip with a few leaves up its length. Deliberately
// sparse: no canopy mass, so it never reads as a small mature tree.

function Sapling({ colors, species }: { colors: Palette; species: PlazaSpecies }) {
  const lean = 0.05
  if (species.form === 'bush') {
    return (
      <group>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2
          return (
            <group key={i} position={[Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16]} rotation={[0, 0, (i - 1) * 0.22]}>
              <Trunk h={0.75} rb={0.05} rt={0.035} color={colors.trunk} />
              <Leaf p={[0, 0.72, 0]} yaw={a} tilt={0.35} size={0.19} color={i % 2 ? colors.foliageAlt : colors.foliage} />
            </group>
          )
        })}
      </group>
    )
  }
  return (
    <group rotation={[0, 0, lean]}>
      <Trunk h={1.45} rb={0.085} rt={0.05} color={colors.trunk} seg={6} />
      <Leaf p={[0, 0.62, 0]} yaw={0.3} tilt={0.42} size={0.2} color={colors.foliage} />
      <Leaf p={[0, 0.92, 0]} yaw={Math.PI + 0.2} tilt={0.38} size={0.18} color={colors.foliageAlt} />
      <Leaf p={[0, 1.18, 0]} yaw={2.2} tilt={0.34} size={0.17} color={colors.foliage} />
      {/* growing tip */}
      {species.form === 'flower' ? (
        <mesh position={[0, 1.55, 0]} scale={[1, 1.5, 1]}>
          <icosahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color={colors.foliageAlt} flatShading />
        </mesh>
      ) : (
        <Canopy colors={colors} blobs={[{ p: [0, 1.55, 0], r: 0.24 }]} />
      )}
    </group>
  )
}

// ─── Stage 2 — young ──────────────────────────────────────────────────────────
// First real structure: a proper trunk, a couple of branches, a modest canopy.

function Young({ colors, species }: { colors: Palette; species: PlazaSpecies }) {
  switch (species.form) {
    case 'bush':
      return (
        <Canopy
          colors={colors}
          blobs={[
            { p: [0, 0.72, 0], r: 0.66 },
            { p: [0.6, 0.5, 0.16], r: 0.48, alt: true },
            { p: [-0.55, 0.46, -0.12], r: 0.44 },
            { p: [0.08, 0.5, -0.58], r: 0.42, alt: true },
          ]}
        />
      )
    case 'flower':
      return (
        <group>
          <Trunk h={2.1} rb={0.11} rt={0.08} color={colors.trunk} seg={6} />
          <Leaf p={[0, 0.9, 0]} yaw={0.4} tilt={0.4} size={0.3} color={colors.trunk} />
          <Leaf p={[0, 1.35, 0]} yaw={Math.PI + 0.3} tilt={0.36} size={0.26} color={colors.trunk} />
          <FlowerHead y={2.25} r={0.42} colors={colors} petals={10} open={0.75} />
        </group>
      )
    case 'blossom':
      return (
        <group>
          <Trunk h={1.7} rb={0.24} rt={0.16} color={colors.trunk} />
          <Branch from={1.25} len={0.7} tilt={0.7} yaw={0.6} r={0.09} color={colors.trunk} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 2.5, 0], r: 0.95, flat: 0.8 },
              { p: [0.75, 2.1, 0.25], r: 0.6, alt: true, flat: 0.8 },
              { p: [-0.6, 2.2, -0.3], r: 0.55, flat: 0.8 },
            ]}
          />
        </group>
      )
    case 'tree':
    default:
      if (species.id === 'pine') {
        return (
          <group>
            <Trunk h={2.6} rb={0.2} rt={0.13} color={colors.trunk} seg={6} />
            <PineTier y={1.0} r={0.95} h={1.15} color={colors.foliage} />
            <PineTier y={1.85} r={0.72} h={1.0} color={colors.foliageAlt} />
            <PineTier y={2.6} r={0.48} h={0.85} color={colors.foliage} />
          </group>
        )
      }
      return (
        <group>
          <Trunk h={1.9} rb={0.26} rt={0.17} color={colors.trunk} />
          <Branch from={1.35} len={0.75} tilt={-0.75} yaw={2.1} r={0.09} color={colors.trunk} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 2.7, 0], r: 0.95 },
              { p: [0.7, 2.3, 0.3], r: 0.62, alt: true },
              { p: [-0.65, 2.35, -0.25], r: 0.58 },
            ]}
          />
        </group>
      )
  }
}

// ─── Stage 3 — mature ─────────────────────────────────────────────────────────
// Full grown: thick flared trunk, branches, a deep multi-lobed canopy. Each
// species commits to its own outline — round, conical, weeping, or low+wide.

function PineTier({ y, r, h, color }: { y: number; r: number; h: number; color: string }) {
  return (
    <mesh position={[0, y + h / 2, 0]}>
      <coneGeometry args={[r, h, 8]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function FlowerHead({
  y, r, colors, petals, open = 1,
}: { y: number; r: number; colors: Palette; petals: number; open?: number }) {
  const ring = useMemo(() => Array.from({ length: petals }, (_, i) => (i / petals) * Math.PI * 2), [petals])
  return (
    <group position={[0, y, 0]} rotation={[0.35, 0, 0]}>
      {ring.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * r * open, 0, Math.sin(a) * r * open]}
          rotation={[0, -a, 0]}
          scale={[1.6, 0.35, 0.7]}
        >
          <sphereGeometry args={[r * 0.5, 7, 5]} />
          <meshStandardMaterial color={colors.foliage} flatShading />
        </mesh>
      ))}
      <mesh scale={[1, 0.55, 1]}>
        <icosahedronGeometry args={[r * 0.72, 0]} />
        <meshStandardMaterial color={colors.foliageAlt} flatShading />
      </mesh>
    </group>
  )
}

function Mature({ colors, species }: { colors: Palette; species: PlazaSpecies }) {
  switch (species.form) {
    // Low and wide — reads as ground cover next to the tall species.
    case 'bush':
      return (
        <group>
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 1.35, 0], r: 1.15 },
              { p: [1.25, 0.95, 0.3], r: 0.95, alt: true },
              { p: [-1.2, 0.9, -0.25], r: 0.9 },
              { p: [0.2, 0.95, -1.2], r: 0.88, alt: true },
              { p: [-0.35, 1.0, 1.2], r: 0.82 },
              { p: [0.6, 1.85, 0.2], r: 0.6, alt: true },
            ]}
          />
          {[0.5, 1.9, 3.3, 4.7, 5.9].map((a, i) => (
            <Leaf
              key={i}
              p={[Math.cos(a) * 0.9, 1.5 + (i % 2) * 0.3, Math.sin(a) * 0.9]}
              yaw={a}
              tilt={0.5}
              size={0.5}
              color={i % 2 ? colors.foliageAlt : colors.foliage}
            />
          ))}
        </group>
      )

    // A single towering bloom on a thick stalk.
    case 'flower':
      return (
        <group>
          <Trunk h={4.1} rb={0.19} rt={0.13} color={colors.trunk} seg={7} />
          <Leaf p={[0, 1.5, 0]} yaw={0.4} tilt={0.36} size={0.62} color={colors.trunk} />
          <Leaf p={[0, 2.3, 0]} yaw={Math.PI + 0.25} tilt={0.32} size={0.56} color={colors.trunk} />
          <Leaf p={[0, 3.05, 0]} yaw={2.4} tilt={0.3} size={0.45} color={colors.trunk} />
          <FlowerHead y={4.35} r={0.95} colors={colors} petals={16} />
        </group>
      )

    // Weeping, wide, flat-topped — with a drift of fallen petals underneath.
    case 'blossom':
      return (
        <group>
          <RootFlare r={0.72} color={colors.trunk} />
          <Trunk h={2.7} rb={0.46} rt={0.3} color={colors.trunk} y={0.3} />
          <Branch from={2.3} len={1.5} tilt={0.85} yaw={0.5} r={0.16} color={colors.trunk} />
          <Branch from={2.5} len={1.35} tilt={-0.9} yaw={2.6} r={0.15} color={colors.trunk} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 4.05, 0], r: 1.95, flat: 0.72 },
              { p: [1.65, 3.6, 0.5], r: 1.35, alt: true, flat: 0.72 },
              { p: [-1.55, 3.7, -0.45], r: 1.3, flat: 0.72 },
              { p: [0.35, 3.65, 1.6], r: 1.2, alt: true, flat: 0.72 },
              { p: [-0.4, 3.6, -1.65], r: 1.15, flat: 0.72 },
              { p: [0.3, 4.85, 0.1], r: 1.0, alt: true, flat: 0.8 },
            ]}
          />
          {[0.4, 1.6, 2.9, 4.2, 5.4].map((a, i) => (
            <mesh key={i} position={[Math.cos(a) * (1.1 + i * 0.15), 0.09, Math.sin(a) * (1.1 + i * 0.15)]} scale={[1, 0.18, 1]}>
              <icosahedronGeometry args={[0.17, 0]} />
              <meshStandardMaterial color={colors.foliageAlt} flatShading />
            </mesh>
          ))}
        </group>
      )

    case 'tree':
    default:
      // Conical, tiered, no visible crown — unmistakable from a distance.
      if (species.id === 'pine') {
        return (
          <group>
            <RootFlare r={0.6} color={colors.trunk} />
            <Trunk h={5.6} rb={0.36} rt={0.16} color={colors.trunk} y={0.3} seg={6} />
            <PineTier y={1.15} r={1.85} h={2.1} color={colors.foliage} />
            <PineTier y={2.55} r={1.5} h={1.9} color={colors.foliageAlt} />
            <PineTier y={3.85} r={1.15} h={1.7} color={colors.foliage} />
            <PineTier y={5.0} r={0.8} h={1.5} color={colors.foliageAlt} />
            <PineTier y={6.0} r={0.5} h={1.3} color={colors.foliage} />
          </group>
        )
      }
      // Broad, round, deep canopy.
      return (
        <group>
          <RootFlare r={0.85} color={colors.trunk} />
          <Trunk h={3.4} rb={0.55} rt={0.36} color={colors.trunk} y={0.3} />
          <Branch from={2.4} len={1.6} tilt={0.8} yaw={0.4} r={0.18} color={colors.trunk} />
          <Branch from={2.7} len={1.45} tilt={-0.85} yaw={2.4} r={0.17} color={colors.trunk} />
          <Branch from={3.0} len={1.2} tilt={0.7} yaw={4.3} r={0.15} color={colors.trunk} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 4.5, 0], r: 2.0 },
              { p: [1.6, 4.0, 0.5], r: 1.45, alt: true },
              { p: [-1.5, 4.15, -0.5], r: 1.4 },
              { p: [0.4, 4.1, 1.55], r: 1.3, alt: true },
              { p: [-0.5, 4.05, -1.6], r: 1.25 },
              { p: [0.25, 5.7, 0.15], r: 1.35, alt: true },
              { p: [-0.9, 5.3, 0.8], r: 0.95 },
            ]}
          />
        </group>
      )
  }
}

function StageForm({ stage, species, colors }: { stage: number; species: PlazaSpecies; colors: Palette }) {
  switch (stage) {
    case 0:  return <Seedling colors={colors} />
    case 1:  return <Sapling colors={colors} species={species} />
    case 2:  return <Young colors={colors} species={species} />
    default: return <Mature colors={colors} species={species} />
  }
}

// ─── Soil ─────────────────────────────────────────────────────────────────────
// Turned earth under every plant — the persistent "something is planted here"
// marker, so a tile never reads as empty even at seedling.

function SoilMound({ stage, dormant }: { stage: number; dormant: boolean }) {
  const r = SOIL_R[stage]
  return (
    <mesh position={[0, 0.03, 0]}>
      <cylinderGeometry args={[r * 0.8, r, 0.09, 12]} />
      <meshStandardMaterial color={mute(SOIL_COLOR, dormant)} flatShading />
    </mesh>
  )
}

// ─── One planted object ────────────────────────────────────────────────────────

function PlantMesh({
  object, groupVitality, nowMs, dormant, onSelect,
}: {
  object: PlazaObject
  groupVitality: number
  nowMs: number
  dormant: boolean
  onSelect: (o: PlazaObject) => void
}) {
  const swayRef = useRef<THREE.Group>(null)
  const species = getSpecies(object.species)

  const stage = useMemo(
    () => growthStage(object.plantedAt.getTime(), object.plantedAtVitality, nowMs, groupVitality),
    [object.plantedAt, object.plantedAtVitality, nowMs, groupVitality],
  )
  const { x, z } = tileToWorld(object.tile)
  // Per-plant offsets so a row of the same species doesn't look stamped out.
  const seed = useMemo(
    () => Math.abs(Math.sin(object.tile.q * 12.9898 + object.tile.r * 78.233) * 43758.5453) % 1,
    [object.tile],
  )
  const colors = useMemo<Palette>(() => ({
    foliage: mute(species.foliage, dormant),
    foliageAlt: mute(species.foliageAlt, dormant),
    trunk: mute(species.trunk, dormant),
  }), [species, dormant])

  useFrame((state) => {
    if (!swayRef.current) return
    const t = state.clock.elapsedTime
    swayRef.current.rotation.z = Math.sin(t * (1.3 - stage * 0.2) + seed * 6.28) * (dormant ? SWAY[stage] * 0.25 : SWAY[stage])
  })

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, seed * Math.PI * 2, 0]}
      scale={0.92 + seed * 0.16}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(object) }}
    >
      <SoilMound stage={stage} dormant={dormant} />
      <group ref={swayRef}>
        <StageForm stage={stage} species={species} colors={colors} />
      </group>
    </group>
  )
}

// ─── Placement targets (only rendered in plant mode) ───────────────────────────

function TileMarker({ x, z, onSelect }: { x: number; z: number; onSelect: () => void }) {
  const ref = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(false)
  useFrame((state) => {
    if (!ref.current) return
    const mat = ref.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.24 + (hover ? 0.4 : 0) + Math.sin(state.clock.elapsedTime * 5) * 0.1
  })
  return (
    <mesh
      ref={ref}
      position={[x, 0.06, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect() }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true) }}
      onPointerOut={() => setHover(false)}
    >
      <circleGeometry args={[0.95, 24]} />
      <meshBasicMaterial color={hover ? '#ffe08a' : '#ffffff'} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  )
}

function PlacementTiles({ taken, onSelect }: { taken: Set<string>; onSelect: (t: Tile) => void }) {
  const free = useMemo(() => tilesInsidePlaza().filter((t) => !taken.has(tileKey(t))), [taken])
  return (
    <group>
      {free.map((t) => {
        const { x, z } = tileToWorld(t)
        return <TileMarker key={tileKey(t)} x={x} z={z} onSelect={() => onSelect(t)} />
      })}
    </group>
  )
}

// ─── Garden ────────────────────────────────────────────────────────────────────

export default function PlazaGarden({
  objects, groupVitality, nowMs, dormant, plantMode, takenTiles, onPlantSelect, onTileSelect,
}: {
  objects: PlazaObject[]
  groupVitality: number
  nowMs: number
  dormant: boolean
  plantMode: boolean
  takenTiles: Set<string>
  onPlantSelect: (o: PlazaObject) => void
  onTileSelect: (t: Tile) => void
}) {
  return (
    <group>
      {objects.map((o) => (
        <PlantMesh
          key={o.id}
          object={o}
          groupVitality={groupVitality}
          nowMs={nowMs}
          dormant={dormant}
          onSelect={onPlantSelect}
        />
      ))}
      {plantMode && <PlacementTiles taken={takenTiles} onSelect={onTileSelect} />}
    </group>
  )
}
