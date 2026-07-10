export type SkinsPlayer = {
  id: string
  name: string
}

export type SkinsRound = {
  id: string
  name: string
  createdAt: number
  players: SkinsPlayer[]
  holeCount: number
  skinValue: number
  // scores[holeIndex][playerIndex] = strokes, or null if not yet entered
  scores: (number | null)[][]
}

export type HoleResult = {
  pot: number
  winnerId: string | null // null = tied, carries to next hole
  complete: boolean // all players have entered a score for this hole
}

const STORAGE_KEY = 'buddyboard.skinsRounds'

export function loadRounds(): SkinsRound[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRounds(rounds: SkinsRound[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds))
}

export function createRound(opts: {
  name: string
  playerNames: string[]
  holeCount: number
  skinValue: number
}): SkinsRound {
  const players = opts.playerNames.map((name, i) => ({
    id: `p${i}-${Date.now()}`,
    name,
  }))
  return {
    id: `round-${Date.now()}`,
    name: opts.name,
    createdAt: Date.now(),
    players,
    holeCount: opts.holeCount,
    skinValue: opts.skinValue,
    scores: Array.from({ length: opts.holeCount }, () => players.map(() => null)),
  }
}

/**
 * Walks the round hole by hole, accumulating the pot across ties
 * (standard Skins carryover) until a single low score wins it outright.
 */
export function computeHoleResults(round: SkinsRound): HoleResult[] {
  const results: HoleResult[] = []
  let carryPot = 0

  for (let h = 0; h < round.holeCount; h++) {
    const holeScores = round.scores[h] ?? []
    const complete =
      round.players.length > 0 &&
      round.players.every((_, i) => holeScores[i] != null)

    const pot = carryPot + round.skinValue * round.players.length

    if (!complete) {
      results.push({ pot, winnerId: null, complete: false })
      continue
    }

    const min = Math.min(...round.players.map((_, i) => holeScores[i] as number))
    const lowPlayers = round.players.filter((_, i) => holeScores[i] === min)

    if (lowPlayers.length === 1) {
      results.push({ pot, winnerId: lowPlayers[0].id, complete: true })
      carryPot = 0
    } else {
      results.push({ pot, winnerId: null, complete: true })
      carryPot = pot
    }
  }

  return results
}

export type PlayerStanding = {
  player: SkinsPlayer
  skinsWon: number
  net: number
  totalStrokes: number
}

export function computeStandings(round: SkinsRound, holeResults: HoleResult[]): PlayerStanding[] {
  const net: Record<string, number> = {}
  const skinsWon: Record<string, number> = {}
  const totalStrokes: Record<string, number> = {}
  for (const p of round.players) {
    net[p.id] = 0
    skinsWon[p.id] = 0
    totalStrokes[p.id] = 0
  }

  round.scores.forEach((holeScores, h) => {
    const result = holeResults[h]
    if (!result.complete) return

    for (const p of round.players) {
      net[p.id] -= round.skinValue
    }
    if (result.winnerId) {
      net[result.winnerId] += result.pot
      skinsWon[result.winnerId] += 1
    }

    round.players.forEach((p, i) => {
      const score = holeScores[i]
      if (score != null) totalStrokes[p.id] += score
    })
  })

  return round.players
    .map((player) => ({
      player,
      skinsWon: skinsWon[player.id],
      net: net[player.id],
      totalStrokes: totalStrokes[player.id],
    }))
    .sort((a, b) => b.net - a.net)
}
