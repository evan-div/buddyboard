/**
 * @file Plaza plant species
 * @description Data-only definitions for the plants members can grow. Shared by
 * the 3D renderer (PlazaGarden) and the plant-picker UI (MiiPlaza). Rendering is
 * procedural — each species is a palette + a form, no external assets.
 */

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
}

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
  },
]

export const SPECIES_MAP: Record<string, PlazaSpecies> = Object.fromEntries(
  PLAZA_SPECIES.map((s) => [s.id, s]),
)

export const DEFAULT_SPECIES = PLAZA_SPECIES[0]

export function getSpecies(id: string): PlazaSpecies {
  return SPECIES_MAP[id] ?? DEFAULT_SPECIES
}
