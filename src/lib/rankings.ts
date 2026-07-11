import type { GroupMember, Transaction } from './types'

// Pure leaderboard ranking logic, kept free of React so it can be unit-tested.

export type Period = 'daily' | 'weekly' | 'monthly' | 'alltime'

export type RankedMember = GroupMember & { periodPoints: number }

export function getPeriodStart(period: Period): Date | null {
  if (period === 'alltime') return null
  const now = new Date()
  if (period === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  if (period === 'weekly') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    return d
  }
  const d = new Date(now)
  d.setDate(d.getDate() - 30)
  return d
}

export function computeRankings(members: GroupMember[], transactions: Transaction[], period: Period): RankedMember[] {
  if (period === 'alltime') {
    return [...members]
      .map((m) => ({ ...m, periodPoints: m.totalPoints }))
      .sort((a, b) => b.periodPoints - a.periodPoints)
  }
  const pointMap: Record<string, number> = {}
  members.forEach((m) => { pointMap[m.uid] = 0 })
  transactions.forEach((tx) => {
    if (pointMap[tx.toUid] !== undefined) pointMap[tx.toUid] += tx.points
  })
  return [...members]
    .map((m) => ({ ...m, periodPoints: pointMap[m.uid] ?? 0 }))
    .sort((a, b) => b.periodPoints - a.periodPoints)
}

export const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Today',
  weekly: 'Week',
  monthly: 'Month',
  alltime: 'All Time',
}
