/**
 * @file Plaza plant species
 * @description Data-only definitions for the plants members can grow. Shared by
 * the 3D renderer (PlazaGarden) and the plant-picker UI (MiiPlaza). Rendering is
 * procedural — each species is a palette + a form, no external assets.
 */

import type { SeedRarity } from '@/lib/types'

export type PlantForm = 'tree' | 'blossom' | 'flower' | 'bush'

export type PlazaSpecies = {
  id: string
  label: string
  emoji: string
  blurb: string
  form: PlantForm
  foliage: string     // primary canopy / petal color
  foliageAlt: string  // secondary tint for variation
  trunk: string       // trunk / stem color
  rarity: SeedRarity  // which seed grows this; gates the planting picker
}

// The five originals are commons — every seed earned by checking in grows one of
// these, and every plant that existed before commitments reads as one. Rarer
// species can only come from holding up a longer commitment, which is what makes
// them legible as an achievement rather than a preference.
export const PLAZA_SPECIES: PlazaSpecies[] = [
  {
    id: 'oak',
    label: 'Oak',
    emoji: '🌳',
    blurb: 'A steady, broad-canopied tree. Grows tall on consistency.',
    form: 'tree',
    foliage: '#4c9a4c',
    foliageAlt: '#3d7f3d',
    trunk: '#7a5230',
    rarity: 'common',
  },
  {
    id: 'pine',
    label: 'Pine',
    emoji: '🌲',
    blurb: 'An evergreen that keeps its color through the quiet seasons.',
    form: 'tree',
    foliage: '#2f7d4f',
    foliageAlt: '#256541',
    trunk: '#6b4a2b',
    rarity: 'common',
  },
  {
    id: 'cherry',
    label: 'Cherry Blossom',
    emoji: '🌸',
    blurb: 'Bursts into pink bloom. A soft mark for a milestone.',
    form: 'blossom',
    foliage: '#f4a8c8',
    foliageAlt: '#e888b3',
    trunk: '#8a5a3c',
    rarity: 'common',
  },
  {
    id: 'sunflower',
    label: 'Sunflower',
    emoji: '🌻',
    blurb: 'Cheerful and quick. Turns to face the group.',
    form: 'flower',
    foliage: '#f6c744',
    foliageAlt: '#e0a92e',
    trunk: '#4c9a4c',
    rarity: 'common',
  },
  {
    id: 'fern',
    label: 'Fern Bush',
    emoji: '🌿',
    blurb: 'A low, leafy cluster that fills the island with green.',
    form: 'bush',
    foliage: '#5aa85a',
    foliageAlt: '#478f47',
    trunk: '#4a7a3a',
    rarity: 'common',
  },

  // ── Uncommon — a 14-day commitment ──
  {
    id: 'maple',
    label: 'Maple',
    emoji: '🍁',
    blurb: 'Turns amber at the edges. Two weeks of showing up, made visible.',
    form: 'tree',
    foliage: '#e07a3a',
    foliageAlt: '#c25a28',
    trunk: '#6f4826',
    rarity: 'uncommon',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    emoji: '💜',
    blurb: 'A haze of purple that settles the whole plot around it.',
    form: 'flower',
    foliage: '#9b7ede',
    foliageAlt: '#7f61c4',
    trunk: '#5f8a4a',
    rarity: 'uncommon',
  },
  {
    id: 'bamboo',
    label: 'Bamboo',
    emoji: '🎍',
    blurb: 'Grows in patient segments. Nothing hurries it.',
    form: 'tree',
    foliage: '#7fbf5a',
    foliageAlt: '#63a441',
    trunk: '#b7c96a',
    rarity: 'uncommon',
  },

  // ── Rare — a 30-day commitment ──
  {
    id: 'willow',
    label: 'Silver Willow',
    emoji: '🌾',
    blurb: 'Long silver fronds that move before the wind does.',
    form: 'tree',
    foliage: '#a8c4a0',
    foliageAlt: '#8aa886',
    trunk: '#5c5347',
    rarity: 'rare',
  },
  {
    id: 'lotus',
    label: 'Moon Lotus',
    emoji: '🪷',
    blurb: 'Opens once and stays open. A month of doing what you said.',
    form: 'blossom',
    foliage: '#f2e6ff',
    foliageAlt: '#d9c2f0',
    trunk: '#6d8f6a',
    rarity: 'rare',
  },

  // ── Legendary — a 90-day commitment ──
  {
    id: 'worldtree',
    label: 'World Tree',
    emoji: '🌟',
    blurb: 'Ninety days. It is the tallest thing on the island and everyone knows why.',
    form: 'tree',
    foliage: '#ffd977',
    foliageAlt: '#e8b64a',
    trunk: '#8a6a3f',
    rarity: 'legendary',
  },
  {
    id: 'auroravine',
    label: 'Aurora Vine',
    emoji: '✨',
    blurb: 'Holds a slow light of its own, long after the group has logged off.',
    form: 'blossom',
    foliage: '#7fe6d4',
    foliageAlt: '#4fb8d8',
    trunk: '#4a6a72',
    rarity: 'legendary',
  },
]

// Ground cover and flowers are small enough that four distinct silhouettes read
// as noise — they use just two: seedling, then mature once the plant is
// established (growth stage 2). Trees keep the full four-stage arc.
export function isTwoStage(form: PlantForm): boolean {
  return form === 'bush' || form === 'flower'
}

export const STAGE_LABELS = ['Seedling', 'Sprout', 'Young', 'Mature']

// The stage name to show for a given species — two-stage plants only ever read
// as "Seedling" or "Mature".
export function stageLabel(form: PlantForm, stage: number): string {
  if (isTwoStage(form)) return stage >= 2 ? 'Mature' : 'Seedling'
  return STAGE_LABELS[Math.max(0, Math.min(stage, STAGE_LABELS.length - 1))]
}

// Footprint of the turned soil under each form, relative to a tree's.
export function soilScale(form: PlantForm): number {
  if (form === 'flower') return 0.42
  if (form === 'bush') return 0.5
  return 1
}

export const SPECIES_MAP: Record<string, PlazaSpecies> = Object.fromEntries(
  PLAZA_SPECIES.map((s) => [s.id, s]),
)

export const DEFAULT_SPECIES = PLAZA_SPECIES[0]

export function getSpecies(id: string): PlazaSpecies {
  return SPECIES_MAP[id] ?? DEFAULT_SPECIES
}

// ── Rarity ───────────────────────────────────────────────────────────────────

// The species a seed of this rarity may grow. A seed unlocks exactly its own
// tier — spending a legendary on an oak would be a trap, not a choice.
export function speciesForRarity(rarity: SeedRarity): PlazaSpecies[] {
  return PLAZA_SPECIES.filter((s) => s.rarity === rarity)
}

export const RARITY_LABEL: Record<SeedRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
}

// Accent used for seed pills, plaques and the picker. Deliberately not the
// user's theme accent — rarity has to read the same on everyone's screen.
export const RARITY_COLOR: Record<SeedRarity, string> = {
  common: '#8aa886',
  uncommon: '#5aa9e6',
  rare: '#a878e8',
  legendary: '#f0b429',
}

export type RarityTreatment = {
  scale: number      // multiplies the plant's final size
  emissive: number   // foliage glow intensity, 0 = inert
  particles: number  // drifting motes around the canopy, 0 = none
}

// How grand the plant reads at a glance. A rare should be visibly a rare from
// across the island, without needing to tap the plaque.
const RARITY_TREATMENT: Record<SeedRarity, RarityTreatment> = {
  common: { scale: 1, emissive: 0, particles: 0 },
  uncommon: { scale: 1.1, emissive: 0.08, particles: 0 },
  rare: { scale: 1.25, emissive: 0.2, particles: 6 },
  legendary: { scale: 1.45, emissive: 0.45, particles: 14 },
}

export function rarityTreatment(rarity: SeedRarity | undefined): RarityTreatment {
  return RARITY_TREATMENT[rarity ?? 'common']
}
