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

  return (
    <div>
      {/* Period selector */}
      <div style={{
        display: 'flex', background: '#d4d4d4', borderRadius: 14,
        padding: 4, gap: 4, marginBottom: 20,
      }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
              background: period === p ? '#42b842' : 'transparent',
              color: period === p ? '#fff' : '#555',
              boxShadow: period === p ? '0 2px 6px rgba(66,184,66,0.3)' : 'none',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{
          height: '400px', borderRadius: '16px', marginBottom: '20px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
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
                      padding: '12px 14px', borderRadius: 16,
                      background: isCurrentUser ? '#e8f5e8' : '#efefef',
                      border: isCurrentUser ? '2px solid #42b842' : '2px solid #d4d4d4',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#999', width: 22, textAlign: 'center' }}>#{rank}</span>
                    <Avatar3D config={member.avatar ?? DEFAULT_AVATAR} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.displayName}
                        </span>
                        {isCurrentUser && <span style={{ fontSize: 11, color: '#42b842', fontWeight: 600 }}>(you)</span>}
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
                      color: isPositive ? '#42b842' : isNegative ? '#ef4444' : '#888',
                    }}>
                      {period !== 'alltime'
                        ? (isPositive ? `+${member.periodPoints}` : isNegative ? `${member.periodPoints}` : '–')
                        : `${member.periodPoints.toLocaleString()} pts`}
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
