/**
 * @file Badge definitions and lookup logic
 * @mobile-shareable ✅ - Copy as-is to React Native projects
 * @description Badge system for achievements: points, streaks, court wins, generosity.
 * No Firebase dependencies. Pure data structures and functions.
 */

export type BadgeDef = {
  id: string
  emoji: string
  label: string
  description: string
  coinReward: number
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_100',  emoji: '💯', label: 'Century',      description: 'Reached 100 total points',  coinReward: 50  },
  { id: 'first_500',  emoji: '🚀', label: 'Rocketship',   description: 'Reached 500 total points',  coinReward: 150 },
  { id: 'first_1000', emoji: '💎', label: 'Diamond',      description: 'Reached 1000 total points', coinReward: 250 },
  { id: 'court_win',  emoji: '⚖️', label: 'Not Guilty',   description: 'Won a court case',          coinReward: 75  },
  { id: 'streak_7',   emoji: '🏆', label: 'Week Warrior', description: '7-day giving streak',       coinReward: 100 },
  { id: 'streak_30',  emoji: '👑', label: 'Legend',       description: '30-day giving streak',      coinReward: 500 },
  { id: 'generous',   emoji: '🤝', label: 'Generous',     description: 'Gave points to all members',coinReward: 75  },
]

export const BADGE_MAP = Object.fromEntries(BADGE_DEFS.map((b) => [b.id, b]))

export function highestBadge(badgeIds: string[]): BadgeDef | null {
  const priority = ['streak_30', 'first_1000', 'first_500', 'streak_7', 'court_win', 'generous', 'first_100']
  for (const id of priority) {
    if (badgeIds.includes(id)) return BADGE_MAP[id] ?? null
  }
  return null
}
