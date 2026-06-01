'use client'

import { useEffect, useState } from 'react'
import { timeAgo } from '@/lib/utils'
import { subscribeToCases, castVote, resolveExpiredCase } from '@/lib/appeals'
import type { CourtCase } from '@/lib/types'

type Props = {
  groupId: string
  currentUid: string
  memberUids: string[]
}

function timeLeft(deadline: Date): string {
  const ms = deadline.getTime() - Date.now()
  if (ms <= 0) return 'Voting closed'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending_review: { text: 'Awaiting review',    color: '#fbbf24' },
  accepted:       { text: 'Appeal accepted',     color: '#4ade80' },
  denied:         { text: 'Denied — in court',  color: '#f87171' },
  in_court:       { text: 'Voting open',         color: '#818cf8' },
  resolved_innocent: { text: '✅ Innocent',      color: '#4ade80' },
  resolved_guilty:   { text: '⚖️ Guilty',        color: '#f87171' },
}

function CaseCard({
  c,
  currentUid,
  memberUids,
  groupId,
}: {
  c: CourtCase
  currentUid: string
  memberUids: string[]
  groupId: string
}) {
  const [voting, setVoting] = useState(false)
  const userVote = c.votes[currentUid]
  const total = memberUids.length
  const innocentCount = Object.values(c.votes).filter((v) => v === 'innocent').length
  const guiltyCount = Object.values(c.votes).filter((v) => v === 'guilty').length
  const innocentPct = total > 0 ? Math.round((innocentCount / total) * 100) : 0
  const guiltyPct   = total > 0 ? Math.round((guiltyCount / total) * 100) : 0
  const status = STATUS_LABEL[c.status] ?? { text: c.status, color: '#9ca3af' }
  const isActive = c.status === 'in_court'
  const isResolved = c.status === 'resolved_innocent' || c.status === 'resolved_guilty'
  const canVote = isActive && !userVote && currentUid !== c.defendantUid && currentUid !== c.accuserUid

  async function vote(v: 'innocent' | 'guilty') {
    setVoting(true)
    try {
      await castVote(groupId, c.id, currentUid, v, memberUids)
    } catch (e) {
      console.error(e)
    } finally {
      setVoting(false)
    }
  }

  return (
    <div style={{
      background: '#1a1a22',
      borderRadius: '16px',
      padding: '16px',
      marginBottom: '12px',
      border: `1px solid ${isActive ? '#3730a3' : '#1f2937'}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 800, color: '#f9fafb', margin: 0 }}>
            {c.defendantName}
            <span style={{ color: '#6b7280', fontWeight: 400 }}> vs </span>
            {c.accuserName}
          </p>
          <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>
            {timeAgo(c.createdAt)}
          </p>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: status.color,
          background: `${status.color}18`,
          borderRadius: '20px',
          padding: '3px 10px',
          flexShrink: 0,
        }}>
          {status.text}
        </span>
      </div>

      {/* Points at stake */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '10px',
        padding: '8px 12px',
        background: '#111827',
        borderRadius: '10px',
      }}>
        <span style={{ fontSize: '20px', fontWeight: 900, color: '#f87171' }}>
          -{c.points}
        </span>
        <div>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>pts at stake</p>
          <p style={{ fontSize: '11px', color: '#4b5563', margin: 0 }}>
            accused by {c.accuserName}
          </p>
        </div>
      </div>

      {/* Appeal comment */}
      <div style={{
        background: '#1f1f30',
        borderRadius: '8px',
        padding: '8px 12px',
        marginBottom: '10px',
      }}>
        <p style={{ fontSize: '10px', color: '#6366f1', fontWeight: 700, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Defense
        </p>
        <p style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic', margin: 0, lineHeight: 1.45 }}>
          &ldquo;{c.appealComment}&rdquo;
        </p>
      </div>

      {/* Vote tally bar */}
      {(isActive || isResolved) && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 700 }}>
              Innocent {innocentCount}
            </span>
            <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 700 }}>
              {guiltyCount} Guilty
            </span>
          </div>
          <div style={{ height: '6px', borderRadius: '99px', background: '#1f2937', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${innocentPct}%`,
              background: 'linear-gradient(90deg, #4ade80, #22c55e)',
              borderRadius: '99px',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <p style={{ fontSize: '10px', color: '#4b5563', margin: '4px 0 0', textAlign: 'center' }}>
            {Object.keys(c.votes).length}/{total} voted
            {isActive && c.courtDeadline && ` · ${timeLeft(c.courtDeadline)}`}
          </p>
        </div>
      )}

      {/* Vote buttons */}
      {canVote && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            disabled={voting}
            onClick={() => vote('innocent')}
            style={{
              flex: 1,
              background: '#14532d',
              border: '1px solid #166534',
              borderRadius: '10px',
              color: '#4ade80',
              fontSize: '13px',
              fontWeight: 700,
              padding: '10px',
              cursor: voting ? 'default' : 'pointer',
              opacity: voting ? 0.6 : 1,
            }}
          >
            ✅ Innocent
          </button>
          <button
            disabled={voting}
            onClick={() => vote('guilty')}
            style={{
              flex: 1,
              background: '#450a0a',
              border: '1px solid #7f1d1d',
              borderRadius: '10px',
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 700,
              padding: '10px',
              cursor: voting ? 'default' : 'pointer',
              opacity: voting ? 0.6 : 1,
            }}
          >
            ⚖️ Guilty
          </button>
        </div>
      )}

      {/* Already voted */}
      {isActive && userVote && (
        <p style={{
          fontSize: '12px',
          color: userVote === 'innocent' ? '#4ade80' : '#f87171',
          textAlign: 'center',
          fontWeight: 600,
          margin: 0,
        }}>
          You voted {userVote}
        </p>
      )}

      {/* Parties can't vote */}
      {isActive && (currentUid === c.defendantUid || currentUid === c.accuserUid) && (
        <p style={{ fontSize: '11px', color: '#4b5563', textAlign: 'center', margin: 0, fontStyle: 'italic' }}>
          You are a party in this case and cannot vote
        </p>
      )}
    </div>
  )
}

export default function CourtTab({ groupId, currentUid, memberUids }: Props) {
  const [cases, setCases] = useState<CourtCase[]>([])

  useEffect(() => {
    const unsub = subscribeToCases(groupId, (cs) => {
      setCases(cs)
      // Resolve any expired in_court cases
      cs
        .filter((c) => c.status === 'in_court' && c.courtDeadline && c.courtDeadline < new Date())
        .forEach((c) => resolveExpiredCase(groupId, c.id, memberUids))
    })
    return unsub
  }, [groupId, memberUids])

  const active   = cases.filter((c) => c.status === 'in_court')
  const pending  = cases.filter((c) => c.status === 'pending_review' || c.status === 'denied')
  const resolved = cases.filter((c) => ['accepted', 'resolved_innocent', 'resolved_guilty'].includes(c.status))

  function section(title: string, list: CourtCase[]) {
    if (list.length === 0) return null
    return (
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
          {title}
        </h3>
        {list.map((c) => (
          <CaseCard key={c.id} c={c} currentUid={currentUid} memberUids={memberUids} groupId={groupId} />
        ))}
      </div>
    )
  }

  if (cases.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '64px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏛️</div>
        <p style={{ color: '#f9fafb', fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>No cases</p>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
          Appeals that can&apos;t be settled go to court for a group vote.
        </p>
      </div>
    )
  }

  return (
    <div>
      {section('🔴 Active Cases', active)}
      {section('⏳ Pending Review', pending)}
      {section('📜 Resolved', resolved)}
    </div>
  )
}
