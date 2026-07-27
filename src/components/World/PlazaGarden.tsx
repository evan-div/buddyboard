'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PlazaObject } from '@/lib/types'
import { growthStage } from '@/lib/plazaGrowth'
import { tileToWorld, tileKey, tilesInsidePlaza, type Tile } from './plazaMath'
import { getSpecies, type PlazaSpecies } from './plazaSpecies'

// Scale per growth stage. Stage 0 draws the Sprout (its own small form) at full
// size; stages 1-3 draw the species form, growing into it.
const STAGE_SCALE = [1.0, 0.62, 0.82, 1.0]
const DORMANT_TINT = new THREE.Color('#6f7f8c')
const SOIL_COLOR = '#6b4b32'

type Palette = { foliage: string; foliageAlt: string; trunk: string }

function mute(hex: string, dormant: boolean): string {
  if (!dormant) return hex
  return new THREE.Color(hex).lerp(DORMANT_TINT, 0.55).getStyle()
}

// ─── Plant forms (procedural, low-poly to match the grass/rocks aesthetic) ─────

// A freshly planted seed: a small but clearly readable sapling. Sized so it is
// visible from the default camera distance — a just-planted seed must never look
// like nothing happened.
function Sprout({ colors }: { colors: Palette }) {
  return (
    <group>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.045, 0.07, 0.52, 6]} />
        <meshStandardMaterial color={colors.trunk} flatShading />
      </mesh>
      <mesh position={[0.15, 0.5, 0]} rotation={[0, 0, -0.7]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.19, 8, 6]} />
        <meshStandardMaterial color={colors.foliage} flatShading />
      </mesh>
      <mesh position={[-0.14, 0.44, 0.03]} rotation={[0, 0, 0.7]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.17, 8, 6]} />
        <meshStandardMaterial color={colors.foliageAlt} flatShading />
      </mesh>
      <mesh position={[0, 0.62, 0]} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial color={colors.foliage} flatShading />
      </mesh>
    </group>
  )
}

// Turned soil under every plant — the persistent "something is planted here"
// marker, so a tile never reads as empty.
function SoilMound({ dormant }: { dormant: boolean }) {
  return (
    <mesh position={[0, 0.03, 0]}>
      <cylinderGeometry args={[0.32, 0.4, 0.08, 12]} />
      <meshStandardMaterial color={mute(SOIL_COLOR, dormant)} flatShading />
    </mesh>
  )
}

function TreeForm({ colors, wide }: { colors: Palette; wide?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.0, 6]} />
        <meshStandardMaterial color={colors.trunk} flatShading />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <icosahedronGeometry args={[wide ? 0.64 : 0.55, 0]} />
        <meshStandardMaterial color={colors.foliage} flatShading />
      </mesh>
      <mesh position={[0.28, 1.42, 0.1]}>
        <icosahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color={colors.foliageAlt} flatShading />
      </mesh>
      <mesh position={[-0.26, 1.44, -0.08]}>
        <icosahedronGeometry args={[0.36, 0]} />
        <meshStandardMaterial color={colors.foliage} flatShading />
      </mesh>
    </group>
  )
}

function FlowerForm({ colors }: { colors: Palette }) {
  const petals = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), [])
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.04, 0.055, 1.1, 5]} />
        <meshStandardMaterial color={colors.trunk} />
      </mesh>
      <mesh position={[0.16, 0.62, 0]} rotation={[0, 0, -0.9]} scale={[1, 0.35, 1]}>
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshStandardMaterial color={colors.trunk} flatShading />
      </mesh>
      <group position={[0, 1.16, 0]}>
        {petals.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]} scale={[0.5, 0.25, 0.5]}>
            <sphereGeometry args={[0.13, 6, 5]} />
            <meshStandardMaterial color={colors.foliage} flatShading />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial color={colors.foliageAlt} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function BushForm({ colors }: { colors: Palette }) {
  const blobs: { p: [number, number, number]; r: number; c: string }[] = [
    { p: [0, 0.3, 0], r: 0.36, c: colors.foliage },
    { p: [0.32, 0.22, 0.1], r: 0.27, c: colors.foliageAlt },
    { p: [-0.3, 0.2, -0.06], r: 0.25, c: colors.foliage },
    { p: [0.05, 0.36, -0.3], r: 0.23, c: colors.foliageAlt },
  ]
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p}>
          <icosahedronGeometry args={[b.r, 0]} />
          <meshStandardMaterial color={b.c} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Form({ species, colors }: { species: PlazaSpecies; colors: Palette }) {
  switch (species.form) {
    case 'blossom': return <TreeForm colors={colors} wide />
    case 'flower':  return <FlowerForm colors={colors} />
    case 'bush':    return <BushForm colors={colors} />
    case 'tree':
    default:        return <TreeForm colors={colors} />
  }
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
  const phase = useMemo(
    () => Math.abs(object.tile.q * 12.9898 + object.tile.r * 78.233) % (Math.PI * 2),
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
    swayRef.current.rotation.z = Math.sin(t * 1.1 + phase) * (dormant ? 0.008 : 0.03)
  })

  return (
    <group
      position={[x, 0, z]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(object) }}
    >
      {/* Soil stays put and unscaled — a stable marker for the planted tile */}
      <SoilMound dormant={dormant} />
      <group ref={swayRef} scale={STAGE_SCALE[stage]}>
        {stage === 0 ? <Sprout colors={colors} /> : <Form species={species} colors={colors} />}
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
      <circleGeometry args={[0.7, 22]} />
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
