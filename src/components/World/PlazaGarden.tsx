'use client'

import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PlazaObject } from '@/lib/types'
import { growthStage } from '@/lib/plazaGrowth'
import { tileToWorld, tileKey, tileIslandId, tilesOnIsland, HOME_FRAME, type IslandFrame, type Tile } from './plazaMath'
import { getSpecies, isTwoStage, soilScale, type PlazaSpecies } from './plazaSpecies'

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
const SOIL_R = [0.42, 0.58, 0.85, 1.25]
const SWAY = [0.07, 0.055, 0.028, 0.013]

type Palette = { foliage: string; foliageAlt: string; trunk: string; shade: string; bark: string }

function mute(hex: string, dormant: boolean): string {
  if (!dormant) return hex
  return new THREE.Color(hex).lerp(DORMANT_TINT, 0.55).getStyle()
}

function darken(hex: string, amount: number): string {
  return new THREE.Color(hex).multiplyScalar(1 - amount).getStyle()
}

// Subdivision level for canopy spheres. 1 gives ~80 faces per lobe (rounded but
// still faceted); dropped to 0 on low-graphics devices to keep mobile smooth.
const DetailCtx = createContext(1)
const useDetail = () => useContext(DetailCtx)

// ─── Shared primitives ────────────────────────────────────────────────────────

function Trunk({
  h, rb, rt, color, y = 0, seg = 8,
}: { h: number; rb: number; rt: number; color: string; y?: number; seg?: number }) {
  return (
    <mesh position={[0, y + h / 2, 0]}>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

// A trunk built from stacked, slightly offset and rotated sections. The kinks
// between sections read as an organic, leaning bole rather than a plain cone.
function TaperedTrunk({
  h, rb, rt, color, bark, y = 0, sections = 4, lean = 0.05,
}: {
  h: number; rb: number; rt: number; color: string; bark: string
  y?: number; sections?: number; lean?: number
}) {
  const segs = useMemo(() => {
    const out: { y: number; h: number; rb: number; rt: number; tilt: number; yaw: number; dark: boolean }[] = []
    const segH = h / sections
    for (let i = 0; i < sections; i++) {
      const t0 = i / sections
      const t1 = (i + 1) / sections
      out.push({
        y: y + i * segH,
        h: segH * 1.06,          // slight overlap hides the seams
        rb: rb + (rt - rb) * t0,
        rt: rb + (rt - rb) * t1,
        tilt: Math.sin(i * 1.7) * lean,
        yaw: i * 1.1,
        dark: i % 2 === 1,
      })
    }
    return out
  }, [h, rb, rt, y, sections, lean])

  return (
    <group>
      {segs.map((s, i) => (
        <group key={i} position={[0, s.y, 0]} rotation={[0, s.yaw, s.tilt]}>
          <mesh position={[0, s.h / 2, 0]}>
            <cylinderGeometry args={[s.rt, s.rb, s.h, 9]} />
            <meshStandardMaterial color={s.dark ? bark : color} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Flared root collar plus buttress roots spreading into the soil.
function RootFlare({ r, color, buttresses = 5 }: { r: number; color: string; buttresses?: number }) {
  const roots = useMemo(
    () => Array.from({ length: buttresses }, (_, i) => (i / buttresses) * Math.PI * 2 + 0.3),
    [buttresses],
  )
  return (
    <group>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[r * 0.6, r, 0.48, 10]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {roots.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * r * 0.78, 0.13, Math.sin(a) * r * 0.78]}
          rotation={[Math.PI / 2 - 0.32, 0, -a + Math.PI / 2]}
          scale={[1, 1, 0.55]}
        >
          <coneGeometry args={[r * 0.3, r * 0.95, 5]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// A branch, optionally sprouting finer twigs at its tip.
function Branch({
  from, len, tilt, yaw, r, color, twigs = 0,
}: {
  from: number; len: number; tilt: number; yaw: number; r: number; color: string; twigs?: number
}) {
  return (
    <group position={[0, from, 0]} rotation={[0, yaw, tilt]}>
      <mesh position={[0, len / 2, 0]}>
        <cylinderGeometry args={[r * 0.55, r, len, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {Array.from({ length: twigs }, (_, i) => (
        <group key={i} position={[0, len * (0.62 + i * 0.16), 0]} rotation={[0, i * 2.1, (i % 2 ? 1 : -1) * 0.6]}>
          <mesh position={[0, len * 0.16, 0]}>
            <cylinderGeometry args={[r * 0.2, r * 0.38, len * 0.32, 5]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

type Blob = { p: [number, number, number]; r: number; alt?: boolean; flat?: number; dark?: boolean }

function Canopy({ blobs, colors }: { blobs: Blob[]; colors: Palette }) {
  const detail = useDetail()
  return (
    <group>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} scale={[1, b.flat ?? 1, 1]} rotation={[i * 0.7, i * 1.3, 0]}>
          <icosahedronGeometry args={[b.r, detail]} />
          <meshStandardMaterial
            color={b.dark ? colors.shade : b.alt ? colors.foliageAlt : colors.foliage}
            flatShading
          />
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
          <TaperedTrunk h={2.4} rb={0.28} rt={0.17} color={colors.trunk} bark={colors.bark} sections={3} lean={0.06} />
          <Branch from={1.75} len={1.1} tilt={0.75} yaw={0.6} r={0.1} color={colors.bark} twigs={1} />
          <Branch from={2.0} len={0.95} tilt={-0.8} yaw={2.8} r={0.09} color={colors.bark} twigs={1} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 3.5, 0], r: 1.2, flat: 0.72 },
              { p: [0.9, 3.05, 0.3], r: 0.78, alt: true, flat: 0.74 },
              { p: [-0.85, 3.1, -0.35], r: 0.72, flat: 0.74 },
              { p: [0.25, 3.0, 0.9], r: 0.6, dark: true, flat: 0.74 },
              { p: [0.1, 4.15, 0.05], r: 0.66, alt: true, flat: 0.8 },
            ]}
          />
        </group>
      )
    case 'tree':
    default:
      if (species.id === 'pine') {
        return (
          <group>
            <TaperedTrunk h={3.6} rb={0.24} rt={0.12} color={colors.trunk} bark={colors.bark} sections={3} lean={0.03} />
            <PineTier y={1.0} r={1.15} h={1.4} color={colors.foliage} />
            <PineTier y={1.95} r={0.9} h={1.25} color={colors.foliageAlt} />
            <PineTier y={2.85} r={0.62} h={1.1} color={colors.foliage} />
            <PineTier y={3.6} r={0.38} h={0.9} color={colors.foliageAlt} />
          </group>
        )
      }
      return (
        <group>
          <TaperedTrunk h={2.7} rb={0.3} rt={0.18} color={colors.trunk} bark={colors.bark} sections={3} lean={0.05} />
          <Branch from={1.9} len={1.0} tilt={-0.75} yaw={2.1} r={0.1} color={colors.bark} twigs={1} />
          <Branch from={2.2} len={0.85} tilt={0.7} yaw={0.5} r={0.09} color={colors.bark} twigs={1} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 3.85, 0], r: 1.15 },
              { p: [0.85, 3.35, 0.35], r: 0.78, alt: true },
              { p: [-0.8, 3.4, -0.3], r: 0.72 },
              { p: [0.2, 3.3, 0.85], r: 0.6, dark: true },
              { p: [0.15, 4.6, 0.1], r: 0.68, alt: true },
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
  const detail = useDetail()
  return (
    <mesh position={[0, y + h / 2, 0]} rotation={[0, y * 0.9, 0]}>
      <coneGeometry args={[r, h, detail > 0 ? 11 : 7]} />
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
    // Low ground cover — knee-high beside a 10-unit tree.
    case 'bush':
      return (
        <group>
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 0.5, 0], r: 0.42 },
              { p: [0.44, 0.35, 0.11], r: 0.34, alt: true },
              { p: [-0.42, 0.33, -0.09], r: 0.32 },
              { p: [0.07, 0.34, -0.43], r: 0.31, alt: true },
              { p: [-0.12, 0.36, 0.42], r: 0.29 },
              { p: [0.21, 0.68, 0.07], r: 0.22, alt: true },
            ]}
          />
          {[0.5, 1.9, 3.3, 4.7, 5.9].map((a, i) => (
            <Leaf
              key={i}
              p={[Math.cos(a) * 0.32, 0.54 + (i % 2) * 0.11, Math.sin(a) * 0.32]}
              yaw={a}
              tilt={0.5}
              size={0.19}
              color={i % 2 ? colors.foliageAlt : colors.foliage}
            />
          ))}
        </group>
      )

    // A single bloom on a slim stalk — waist-high, not tree-scale.
    case 'flower':
      return (
        <group>
          <Trunk h={1.35} rb={0.062} rt={0.045} color={colors.trunk} seg={7} />
          <Leaf p={[0, 0.5, 0]} yaw={0.4} tilt={0.36} size={0.21} color={colors.trunk} />
          <Leaf p={[0, 0.78, 0]} yaw={Math.PI + 0.25} tilt={0.32} size={0.19} color={colors.trunk} />
          <Leaf p={[0, 1.02, 0]} yaw={2.4} tilt={0.3} size={0.15} color={colors.trunk} />
          <FlowerHead y={1.45} r={0.32} colors={colors} petals={14} />
        </group>
      )

    // Weeping, wide, flat-topped — with a drift of fallen petals underneath.
    case 'blossom':
      return (
        <group>
          <RootFlare r={0.8} color={colors.bark} />
          <TaperedTrunk h={4.6} rb={0.5} rt={0.28} color={colors.trunk} bark={colors.bark} y={0.36} sections={4} lean={0.07} />
          <Branch from={3.5} len={2.3} tilt={0.9} yaw={0.5} r={0.17} color={colors.bark} twigs={2} />
          <Branch from={3.9} len={2.1} tilt={-0.95} yaw={2.6} r={0.16} color={colors.bark} twigs={2} />
          <Branch from={4.3} len={1.8} tilt={0.8} yaw={4.5} r={0.14} color={colors.bark} twigs={1} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 6.5, 0], r: 2.15, flat: 0.66 },
              { p: [1.75, 5.9, 0.55], r: 1.5, alt: true, flat: 0.68 },
              { p: [-1.7, 6.0, -0.5], r: 1.45, flat: 0.68 },
              { p: [0.4, 5.95, 1.7], r: 1.35, alt: true, flat: 0.68 },
              { p: [-0.45, 5.85, -1.75], r: 1.3, flat: 0.68 },
              { p: [1.2, 5.4, -1.25], r: 1.05, dark: true, flat: 0.7 },
              { p: [-1.15, 5.35, 1.2], r: 1.0, dark: true, flat: 0.7 },
              { p: [0.35, 7.45, 0.15], r: 1.25, alt: true, flat: 0.75 },
              { p: [-0.7, 7.1, 0.7], r: 0.95 },
              { p: [0.75, 7.05, -0.65], r: 0.9, alt: true },
            ]}
          />
          {/* fallen petals drifted around the base */}
          {[0.4, 1.6, 2.9, 4.2, 5.4, 0.9, 3.6].map((a, i) => (
            <mesh
              key={i}
              position={[Math.cos(a) * (1.2 + (i % 3) * 0.4), 0.09, Math.sin(a) * (1.2 + (i % 3) * 0.4)]}
              scale={[1, 0.16, 1]}
            >
              <icosahedronGeometry args={[0.19, 0]} />
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
            <RootFlare r={0.66} color={colors.bark} buttresses={4} />
            <TaperedTrunk h={8.4} rb={0.42} rt={0.14} color={colors.trunk} bark={colors.bark} y={0.34} sections={5} lean={0.03} />
            <PineTier y={1.15} r={2.15} h={2.3} color={colors.shade} />
            <PineTier y={2.15} r={1.98} h={2.2} color={colors.foliage} />
            <PineTier y={3.25} r={1.72} h={2.1} color={colors.foliageAlt} />
            <PineTier y={4.35} r={1.45} h={1.95} color={colors.foliage} />
            <PineTier y={5.4} r={1.18} h={1.8} color={colors.foliageAlt} />
            <PineTier y={6.4} r={0.92} h={1.6} color={colors.foliage} />
            <PineTier y={7.3} r={0.66} h={1.4} color={colors.foliageAlt} />
            <PineTier y={8.15} r={0.42} h={1.25} color={colors.foliage} />
            {/* leader spike */}
            <mesh position={[0, 9.55, 0]}>
              <coneGeometry args={[0.16, 0.7, 6]} />
              <meshStandardMaterial color={colors.foliage} flatShading />
            </mesh>
          </group>
        )
      }
      // Broad, round, deep canopy on a heavy bole.
      return (
        <group>
          <RootFlare r={0.95} color={colors.bark} />
          <TaperedTrunk h={5.0} rb={0.62} rt={0.34} color={colors.trunk} bark={colors.bark} y={0.38} sections={4} lean={0.05} />
          <Branch from={3.5} len={2.4} tilt={0.82} yaw={0.4} r={0.2} color={colors.bark} twigs={2} />
          <Branch from={4.0} len={2.2} tilt={-0.88} yaw={2.4} r={0.19} color={colors.bark} twigs={2} />
          <Branch from={4.5} len={1.9} tilt={0.72} yaw={4.3} r={0.17} color={colors.bark} twigs={2} />
          <Branch from={3.9} len={1.6} tilt={-0.7} yaw={5.5} r={0.14} color={colors.bark} twigs={1} />
          <Canopy
            colors={colors}
            blobs={[
              { p: [0, 7.0, 0], r: 2.2 },
              { p: [1.75, 6.35, 0.55], r: 1.55, alt: true },
              { p: [-1.7, 6.5, -0.55], r: 1.5 },
              { p: [0.45, 6.4, 1.7], r: 1.42, alt: true },
              { p: [-0.55, 6.3, -1.75], r: 1.38 },
              { p: [1.3, 5.75, -1.3], r: 1.1, dark: true },
              { p: [-1.25, 5.7, 1.25], r: 1.05, dark: true },
              { p: [0.3, 8.35, 0.15], r: 1.5, alt: true },
              { p: [-0.95, 7.95, 0.85], r: 1.1 },
              { p: [0.95, 7.85, -0.8], r: 1.05, alt: true },
              { p: [0.1, 9.25, -0.1], r: 0.85 },
            ]}
          />
        </group>
      )
  }
}

// Two-stage plants (ferns, flowers) show a seedling until they are established,
// then their full form; the intermediate silhouettes are too small to read.
function visualStage(species: PlazaSpecies, stage: number): number {
  if (isTwoStage(species.form)) return stage >= 2 ? 3 : 0
  return stage
}

function StageForm({ stage, species, colors }: { stage: number; species: PlazaSpecies; colors: Palette }) {
  switch (visualStage(species, stage)) {
    case 0:  return <Seedling colors={colors} />
    case 1:  return <Sapling colors={colors} species={species} />
    case 2:  return <Young colors={colors} species={species} />
    default: return <Mature colors={colors} species={species} />
  }
}

// ─── Soil ─────────────────────────────────────────────────────────────────────
// Turned earth under every plant — the persistent "something is planted here"
// marker, so a tile never reads as empty even at seedling.

function SoilMound({ stage, scale, dormant }: { stage: number; scale: number; dormant: boolean }) {
  const r = SOIL_R[stage] * scale
  return (
    <mesh position={[0, 0.03, 0]}>
      <cylinderGeometry args={[r * 0.8, r, 0.09, 12]} />
      <meshStandardMaterial color={mute(SOIL_COLOR, dormant)} flatShading />
    </mesh>
  )
}

// ─── One planted object ────────────────────────────────────────────────────────

function PlantMesh({
  object, frame, groupVitality, nowMs, dormant, onSelect,
}: {
  object: PlazaObject
  frame: IslandFrame
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
  const { x, z } = tileToWorld(object.tile, frame)
  // Per-plant offsets so a row of the same species doesn't look stamped out.
  const seed = useMemo(
    () => Math.abs(Math.sin(object.tile.q * 12.9898 + object.tile.r * 78.233) * 43758.5453) % 1,
    [object.tile],
  )
  const colors = useMemo<Palette>(() => ({
    foliage: mute(species.foliage, dormant),
    foliageAlt: mute(species.foliageAlt, dormant),
    trunk: mute(species.trunk, dormant),
    // Shaded lobes give the canopy depth; darker bark banding breaks up the bole.
    shade: mute(darken(species.foliage, 0.3), dormant),
    bark: mute(darken(species.trunk, 0.22), dormant),
  }), [species, dormant])

  // Soil and sway follow the silhouette actually drawn, not the raw stage.
  const vStage = visualStage(species, stage)
  const soil = soilScale(species.form)

  useFrame((state) => {
    if (!swayRef.current) return
    const t = state.clock.elapsedTime
    swayRef.current.rotation.z = Math.sin(t * (1.3 - vStage * 0.2) + seed * 6.28) * (dormant ? SWAY[vStage] * 0.25 : SWAY[vStage])
  })

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, seed * Math.PI * 2, 0]}
      scale={0.92 + seed * 0.16}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(object) }}
    >
      <SoilMound stage={vStage} scale={soil} dormant={dormant} />
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

function PlacementTiles({ frames, taken, onSelect }: {
  frames: IslandFrame[]
  taken: Set<string>
  onSelect: (t: Tile) => void
}) {
  const free = useMemo(
    () => frames.flatMap((f) =>
      tilesOnIsland(f).filter((t) => !taken.has(tileKey(t))).map((t) => ({ t, f }))),
    [frames, taken],
  )
  return (
    <group>
      {free.map(({ t, f }) => {
        const { x, z } = tileToWorld(t, f)
        return <TileMarker key={tileKey(t)} x={x} z={z} onSelect={() => onSelect(t)} />
      })}
    </group>
  )
}

// Which island a plant sits on. Plants made before the archipelago existed have
// no island on their tile and belong to home.
function frameFor(frames: IslandFrame[], o: PlazaObject): IslandFrame {
  const id = tileIslandId(o.tile)
  return frames.find((f) => f.id === id) ?? HOME_FRAME
}

// ─── Garden ────────────────────────────────────────────────────────────────────

export default function PlazaGarden({
  objects, frames, groupVitality, nowMs, dormant, plantMode, takenTiles, lowerGraphics = false,
  onPlantSelect, onTileSelect,
}: {
  objects: PlazaObject[]
  frames: IslandFrame[]
  groupVitality: number
  nowMs: number
  dormant: boolean
  plantMode: boolean
  takenTiles: Set<string>
  lowerGraphics?: boolean
  onPlantSelect: (o: PlazaObject) => void
  onTileSelect: (t: Tile) => void
}) {
  return (
    <DetailCtx.Provider value={lowerGraphics ? 0 : 1}>
      <group>
        {objects.map((o) => (
          <PlantMesh
            key={o.id}
            object={o}
            frame={frameFor(frames, o)}
            groupVitality={groupVitality}
            nowMs={nowMs}
            dormant={dormant}
            onSelect={onPlantSelect}
          />
        ))}
        {plantMode && <PlacementTiles frames={frames} taken={takenTiles} onSelect={onTileSelect} />}
      </group>
    </DetailCtx.Provider>
  )
}
