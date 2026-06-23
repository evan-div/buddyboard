import type { AvatarConfig } from './types'

export interface ProgressionTier {
  id:          string
  label:       string
  icon:        string
  accessory:   AvatarConfig['accessory']
  bodyShape?:  AvatarConfig['bodyShape']
  minPoints:   number
}

// Positive tiers — sorted ascending (lowest threshold first)
export const PROGRESSION_TIERS: ProgressionTier[] = [
  { id: 'blooming', label: 'Blooming',  icon: '🌸', accessory: 'flower_crown', minPoints:  200 },
  { id: 'royalty',  label: 'Royalty',   icon: '👑', accessory: 'crown',        minPoints:  500 },
  { id: 'sage',     label: 'Sage',      icon: '🧙', accessory: 'wizard_hat',   minPoints: 1000, bodyShape: 'gourd'    },
  { id: 'legend',   label: 'Legend',    icon: '😇', accessory: 'halo',         minPoints: 2500, bodyShape: 'peanut'   },
]

// Shame tiers — sorted descending (worst threshold first, checked top-down)
export const SHAME_TIERS: ProgressionTier[] = [
  { id: 'villain',  label: 'Villain',   icon: '😈', accessory: 'horns',        minPoints: -200, bodyShape: 'strawberry' },
  { id: 'shamed',   label: 'Shamed',    icon: '😎', accessory: 'sunglasses',   minPoints: -100 },
]

export function getEarnedTier(totalPoints: number): ProgressionTier | null {
  // Check shame tiers first (worst to least-bad)
  for (const tier of SHAME_TIERS) {
    if (totalPoints <= tier.minPoints) return tier
  }
  // Find highest positive tier earned
  let best: ProgressionTier | null = null
  for (const tier of PROGRESSION_TIERS) {
    if (totalPoints >= tier.minPoints) best = tier
  }
  return best
}

export function getEarnedAccessory(totalPoints: number): AvatarConfig['accessory'] | null {
  return getEarnedTier(totalPoints)?.accessory ?? null
}

export function getEarnedBodyShape(totalPoints: number): AvatarConfig['bodyShape'] | null {
  return getEarnedTier(totalPoints)?.bodyShape ?? null
}
