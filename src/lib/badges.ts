export type BadgeDef = {
  id: string
  emoji: string
  label: string
  description: string
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_100',    emoji: '💯', label: 'Century',      description: 'Reached 100 total points'              },
  { id: 'first_500',    emoji: '🚀', label: 'Rocketship',   description: 'Reached 500 total points'              },
  { id: 'court_win',    emoji: '⚖️', label: 'Not Guilty',   description: 'Won a court case'                      },
  { id: 'streak_7',     emoji: '🏆', label: 'Week Warrior', description: '7-day giving streak'                   },
  { id: 'streak_30',    emoji: '👑', label: 'Legend',       description: '30-day giving streak'                  },
  { id: 'generous',     emoji: '🤝', label: 'Generous',     description: 'Gave points to all group members'      },
]

export const BADGE_MAP = Object.fromEntries(BADGE_DEFS.map((b) => [b.id, b]))

export function highestBadge(badgeIds: string[]): BadgeDef | null {
  const priority = ['streak_30', 'first_500', 'streak_7', 'court_win', 'generous', 'first_100']
  for (const id of priority) {
    if (badgeIds.includes(id)) return BADGE_MAP[id] ?? null
  }
  return null
}
