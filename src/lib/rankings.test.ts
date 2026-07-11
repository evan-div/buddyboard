import { describe, it, expect } from 'vitest'
import { computeRankings, getPeriodStart } from './rankings'
import type { GroupMember, Transaction } from './types'

function member(uid: string, totalPoints: number): GroupMember {
  return {
    uid,
    displayName: uid,
    avatar: {} as GroupMember['avatar'],
    totalPoints,
    dailyPointsGiven: 0,
    dailyPointsTaken: 0,
    lastResetDate: '2026-01-01',
    joinedAt: new Date(0),
  }
}

function tx(toUid: string, points: number): Transaction {
  return {
    id: `${toUid}-${points}-${Math.random()}`,
    fromUid: 'someone',
    fromName: 'Someone',
    toUid,
    toName: toUid,
    points,
    reason: '',
    createdAt: new Date(),
  }
}

describe('computeRankings', () => {
  const members = [member('a', 100), member('b', 300), member('c', 200)]

  it('ranks all-time by stored totals, descending', () => {
    const ranked = computeRankings(members, [], 'alltime')
    expect(ranked.map((m) => m.uid)).toEqual(['b', 'c', 'a'])
    expect(ranked[0].periodPoints).toBe(300)
  })

  it('ranks period views by summed transactions, not totals', () => {
    const txs = [tx('a', 50), tx('a', 25), tx('c', 10), tx('b', -5)]
    const ranked = computeRankings(members, txs, 'weekly')
    expect(ranked.map((m) => m.uid)).toEqual(['a', 'c', 'b'])
    expect(ranked[0].periodPoints).toBe(75)
    expect(ranked[2].periodPoints).toBe(-5)
  })

  it('ignores transactions to people no longer in the group', () => {
    const ranked = computeRankings(members, [tx('ghost', 999)], 'daily')
    expect(ranked.every((m) => m.periodPoints === 0)).toBe(true)
  })

  it('gives members with no transactions zero period points', () => {
    const ranked = computeRankings(members, [], 'monthly')
    expect(ranked.every((m) => m.periodPoints === 0)).toBe(true)
  })
})

describe('getPeriodStart', () => {
  it('returns null for all-time (no fetch needed)', () => {
    expect(getPeriodStart('alltime')).toBeNull()
  })

  it('returns local midnight for daily', () => {
    const start = getPeriodStart('daily')!
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getDate()).toBe(new Date().getDate())
  })

  it('returns 7 and 30 days back for weekly/monthly', () => {
    const now = Date.now()
    const week = getPeriodStart('weekly')!.getTime()
    const month = getPeriodStart('monthly')!.getTime()
    expect(Math.abs(now - week - 7 * 86400000)).toBeLessThan(5000)
    expect(Math.abs(now - month - 30 * 86400000)).toBeLessThan(5000)
  })
})
