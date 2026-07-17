'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Avatar3D from '@/components/Avatar/Avatar3D'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { getTransactionsSince } from '@/lib/firestore'
import { highestBadge } from '@/lib/badges'
import { computeRankings, getPeriodStart, PERIOD_LABELS, type Period } from '@/lib/rankings'
import type { GroupMember, Transaction } from '@/lib/types'

const PodiumScene = dynamic(() => import('@/components/World/PodiumScene'), { ssr: false })

export default function LeaderboardTab({ members, currentUid, groupId, chiefUid, creatorUid }: { members: GroupMember[], currentUid: string, groupId: string, chiefUid?: string | null, creatorUid?: string }) {
  const [period, setPeriod] = useState<Period>('alltime')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  // Which period the loaded transactions belong to; 'alltime' needs no fetch
  const [loadedPeriod, setLoadedPeriod] = useState<Period>('alltime')
  const loading = period !== 'alltime' && loadedPeriod !== period

  useEffect(() => {
    const since = getPeriodStart(period)
    if (!since) return
    let stale = false
    getTransactionsSince(groupId, since).then((txs) => {
      if (stale) return
      setTransactions(txs)
      setLoadedPeriod(period)
    })
    return () => { stale = true }
  }, [period, groupId])

  const ranked = computeRankings(members, transactions, period)
  const rest   = ranked.slice(3)

  const myIndex = ranked.findIndex((m) => m.uid === currentUid)
  const me = myIndex >= 0 ? ranked[myIndex] : null

  function fmtPoints(pts: number): string {
    if (period === 'alltime') return `${pts.toLocaleString()} pts`
    return pts > 0 ? `+${pts}` : pts < 0 ? `${pts}` : '–'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
      {/* Your rank */}
      {me && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 18,
          padding: 'var(--card-pad)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Avatar3D config={me.avatar ?? DEFAULT_AVATAR} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Your rank</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#f9fafb', lineHeight: 1.2 }}>
              #{myIndex + 1} <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>in group</span>
            </div>
          </div>
          <span style={{
            fontSize: 14, fontWeight: 800, color: 'var(--accent)',
            background: 'var(--accent-soft)', borderRadius: 999, padding: '5px 13px',
          }}>
            {fmtPoints(me.periodPoints)}
          </span>
        </div>
      )}

      {/* Period selector */}
      <div style={{
        display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 4, gap: 4,
      }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
              background: period === p ? 'var(--accent-soft)' : 'transparent',
              color: period === p ? '#f9fafb' : 'rgba(255,255,255,0.45)',
              outline: period === p ? '1.5px solid var(--accent)' : 'none',
              outlineOffset: -1.5,
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{
          height: '400px', borderRadius: '16px',
          background: 'linear-gradient(to bottom, #1e4fa0, #c8e8f8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          <PodiumScene
            first={ranked[0]}
            second={ranked[1]}
            third={ranked[2]}
            period={period}
          />

          {rest.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
              {rest.map((member, i) => {
                const isCurrentUser = member.uid === currentUid
                const rank = i + 4
                const isPositive = period !== 'alltime' && member.periodPoints > 0
                const isNegative = period !== 'alltime' && member.periodPoints < 0
                const badge = highestBadge(member.badges ?? [])
                return (
                  <div
                    key={member.uid}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: 'var(--card-pad)', borderRadius: 16,
                      background: isCurrentUser ? 'var(--accent-soft)' : 'var(--surface)',
                      border: isCurrentUser ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'rgba(255,255,255,0.35)', width: 26, textAlign: 'center' }}>#{rank}</span>
                    <Avatar3D config={member.avatar ?? DEFAULT_AVATAR} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.displayName}
                        </span>
                        {isCurrentUser && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>(you)</span>}
                        {member.uid === chiefUid && <span title="Chief" style={{ fontSize: 13 }}>⭐</span>}
                        {member.uid === creatorUid && <span title="Mayor" style={{ fontSize: 13 }}>👑</span>}
                        {(member.currentStreak ?? 0) >= 3 && (
                          <span title={`${member.currentStreak} day streak`} style={{ fontSize: 12, color: '#f97316', fontWeight: 700 }}>
                            🔥{member.currentStreak}
                          </span>
                        )}
                        {badge && <span title={badge.label} style={{ fontSize: 13 }}>{badge.emoji}</span>}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 14, fontWeight: 800,
                      color: isPositive ? '#4ade80' : isNegative ? '#f87171' : period === 'alltime' ? '#f3f4f6' : 'rgba(255,255,255,0.35)',
                    }}>
                      {fmtPoints(member.periodPoints)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
