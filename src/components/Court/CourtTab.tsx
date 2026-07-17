'use client'

import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import Avatar3D from '@/components/Avatar/Avatar3D'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { db } from '@/lib/firebase'
import { subscribeToCases, castVote, resolveExpiredCase } from '@/lib/appeals'
import { timeAgo } from '@/lib/utils'
import type { CourtCase, GroupMember } from '@/lib/types'

type Props = {
  groupId: string
  currentUid: string
  memberUids: string[]
  members: GroupMember[]
}

const GUILTY_COLOR   = '#fb6d5d'
const INNOCENT_COLOR = '#14d8b0'

function formatCountdown(deadline: Date, now: number): { text: string; isLow: boolean; expired: boolean } {
  const ms = deadline.getTime() - now
  if (ms <= 0) return { text: '00:00:00', isLow: true, expired: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return {
    text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    isLow: h < 1,
    expired: false,
  }
}

// Status chip label + colors per case state
function statusChip(c: CourtCase): { label: string; color: string } {
  switch (c.status) {
    case 'in_court':          return { label: 'Voting open', color: GUILTY_COLOR }
    case 'pending_review':    return { label: 'Pending review', color: '#fbc22d' }
    case 'accepted':          return { label: 'Appeal accepted', color: INNOCENT_COLOR }
    case 'resolved_innocent': return { label: 'Innocent', color: INNOCENT_COLOR }
    case 'resolved_guilty':   return { label: 'Guilty', color: GUILTY_COLOR }
    default:                  return { label: 'Dismissed', color: 'rgba(255,255,255,0.4)' }
  }
}

function CaseCard({
  c, caseNumber, currentUid, memberUids, groupId, members,
}: {
  c: CourtCase
  caseNumber: number
  currentUid: string
  memberUids: string[]
  groupId: string
  members: GroupMember[]
}) {
  const [voting, setVoting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const autoResolved = useRef(false)
  const [txReason, setTxReason] = useState<string | null>(null)

  // Fetch reason from the original transaction for cases filed before the reason field was added
  useEffect(() => {
    if (c.reason || !c.transactionId) return
    getDoc(doc(db, 'groups', groupId, 'transactions', c.transactionId)).then((snap) => {
      if (snap.exists()) setTxReason(snap.data().reason ?? null)
    })
  }, [c.reason, c.transactionId, groupId])

  const isActive = c.status === 'in_court'
  const eligibleVoters = members.filter(m => m.uid !== c.accuserUid && m.uid !== c.defendantUid).length

  useEffect(() => {
    if (!isActive || !c.courtDeadline) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [isActive, c.courtDeadline])

  useEffect(() => {
    if (!isActive || !c.courtDeadline || autoResolved.current) return
    if (now >= c.courtDeadline.getTime()) {
      autoResolved.current = true
      resolveExpiredCase(groupId, c.id)
    }
  }, [now, isActive, c.courtDeadline, groupId, c.id, memberUids])

  // Resolve immediately if all eligible voters have already voted (handles votes
  // recorded before the server-side auto-resolve logic was deployed)
  useEffect(() => {
    if (!isActive || autoResolved.current || eligibleVoters === 0) return
    const nonPartyVotes = Object.keys(c.votes).filter(
      uid => uid !== c.accuserUid && uid !== c.defendantUid
    ).length
    if (nonPartyVotes >= eligibleVoters) {
      autoResolved.current = true
      resolveExpiredCase(groupId, c.id)
    }
  }, [isActive, eligibleVoters, c.votes, c.accuserUid, c.defendantUid, groupId, c.id, memberUids])

  const isPending = c.status === 'pending_review'
  const isResolved = ['resolved_innocent', 'resolved_guilty', 'accepted', 'dismissed'].includes(c.status)

  const userVote = c.votes[currentUid]
  const isParty = currentUid === c.defendantUid || currentUid === c.accuserUid
  const canVote = isActive && !userVote && !isParty
  const showProgress = (isActive && (!!userVote || isParty)) || isResolved

  const defendantMember = members.find((m) => m.uid === c.defendantUid)

  const innocentCount = Object.values(c.votes).filter((v) => v === 'innocent').length
  const guiltyCount   = Object.values(c.votes).filter((v) => v === 'guilty').length
  const totalVotes    = innocentCount + guiltyCount
  const guiltyPct     = totalVotes > 0 ? (guiltyCount / totalVotes) * 100 : 50

  const chip = statusChip(c)
  const edgeColor =
    c.status === 'resolved_guilty' ? GUILTY_COLOR
    : c.status === 'resolved_innocent' || c.status === 'accepted' ? INNOCENT_COLOR
    : isActive ? GUILTY_COLOR
    : 'rgba(255,255,255,0.15)'

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
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${edgeColor}`,
      borderRadius: 16,
      padding: 'var(--card-pad)',
    }}>
      {/* Header: defendant + status chip + points */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>
          <Avatar3D config={defendantMember?.avatar ?? DEFAULT_AVATAR} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#f9fafb' }}>{c.defendantName}</span>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.03em',
              color: chip.color, background: 'var(--surface-2)',
              border: `1px solid ${chip.color}`, borderRadius: 999, padding: '2px 8px',
            }}>
              {chip.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Case #{String(caseNumber).padStart(4, '0')} · Filed by {c.accuserName} · {timeAgo(c.createdAt)}
          </div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fbc22d',
          background: 'rgba(251,194,45,0.12)', border: '1px solid rgba(251,194,45,0.3)',
          borderRadius: 999, padding: '3px 10px',
        }}>
          {c.points} pts
        </span>
      </div>

      {/* Accusation + defense */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '0 0 10px 48px' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700, color: GUILTY_COLOR }}>Accusation:</span>{' '}
          <span style={{ fontStyle: 'italic' }}>&ldquo;{c.reason ?? txReason ?? `Took ${c.points} points`}&rdquo;</span>
        </p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700, color: INNOCENT_COLOR }}>Defense:</span>{' '}
          <span style={{ fontStyle: 'italic' }}>&ldquo;{c.appealComment}&rdquo;</span>
        </p>
      </div>

      {/* Countdown */}
      {isActive && c.courtDeadline && (() => {
        const { text, isLow } = formatCountdown(c.courtDeadline!, now)
        return (
          <p style={{
            fontSize: 12, fontWeight: 800, margin: '0 0 10px 48px',
            fontFamily: 'ui-monospace, monospace',
            color: isLow ? GUILTY_COLOR : 'rgba(255,255,255,0.55)',
            animation: isLow ? 'countdownPulse 1s ease-in-out infinite' : undefined,
          }}>
            ⏱ {text} left to vote
          </p>
        )
      })()}

      {/* Pending: waiting on accuser */}
      {isPending && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', margin: '0 0 2px 48px' }}>
          Waiting for {c.accuserName} to review this appeal
        </p>
      )}

      {/* Vote split bar */}
      {(isActive || isResolved) && totalVotes > 0 && (
        <div style={{ margin: '0 0 10px' }}>
          <div style={{ height: 7, borderRadius: 99, overflow: 'hidden', display: 'flex', background: 'var(--surface-2)' }}>
            <div style={{ width: `${guiltyPct}%`, background: GUILTY_COLOR, transition: 'width 0.5s ease' }} />
            <div style={{ flex: 1, background: INNOCENT_COLOR }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GUILTY_COLOR }}>🔴 Guilty: {guiltyCount}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: INNOCENT_COLOR }}>🟢 Innocent: {innocentCount}</span>
          </div>
        </div>
      )}

      {/* Vote buttons */}
      {canVote && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            disabled={voting}
            onClick={() => vote('guilty')}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: GUILTY_COLOR, border: 'none',
              cursor: voting ? 'default' : 'pointer',
              color: '#1a0c0a', fontWeight: 800, fontSize: 13,
              opacity: voting ? 0.7 : 1,
            }}
          >
            Vote Guilty
          </button>
          <button
            disabled={voting}
            onClick={() => vote('innocent')}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              background: INNOCENT_COLOR, border: 'none',
              cursor: voting ? 'default' : 'pointer',
              color: '#04211a', fontWeight: 800, fontSize: 13,
              opacity: voting ? 0.7 : 1,
            }}
          >
            Vote Innocent
          </button>
        </div>
      )}

      {/* Vote tally footnote */}
      {showProgress && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, textAlign: 'center' }}>
          {isActive
            ? <>{totalVotes}/{eligibleVoters} voted{userVote && <span> · you voted {userVote}</span>}</>
            : <>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast{userVote && <span> · you voted {userVote}</span>}</>
          }
          {c.status === 'accepted' && ' · points restored'}
          {c.status === 'resolved_innocent' && ' · points restored'}
        </p>
      )}
    </div>
  )
}

export default function CourtTab({ groupId, currentUid, memberUids, members }: Props) {
  const [cases, setCases] = useState<CourtCase[]>([])
  const [filter, setFilter] = useState<'active' | 'closed'>('active')

  // Inject CSS for countdown pulse animation
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@keyframes countdownPulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }`
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  useEffect(() => {
    const unsub = subscribeToCases(groupId, (cs) => {
      setCases(cs)
      cs
        .filter((c) => c.status === 'in_court' && c.courtDeadline && c.courtDeadline < new Date())
        .forEach((c) => resolveExpiredCase(groupId, c.id))
    })
    return unsub
  }, [groupId, memberUids])

  // Sequential case numbers: oldest case = #0001
  const caseNumberMap = new Map(
    [...cases].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((c, i) => [c.id, i + 1])
  )

  const active = cases.filter((c) => ['in_court', 'pending_review'].includes(c.status))
  const closed = cases.filter((c) => ['accepted', 'resolved_innocent', 'resolved_guilty', 'dismissed'].includes(c.status))
  const inCourtCount = cases.filter((c) => c.status === 'in_court').length
  const shown = filter === 'active' ? active : closed

  if (cases.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏛️</div>
        <p style={{ color: '#f9fafb', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>No cases</p>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0 }}>
          Appeals that can&apos;t be settled go to court for a group vote.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--stack-gap)' }}>
        {([
          { value: inCourtCount, label: 'Voting', color: GUILTY_COLOR },
          { value: active.length - inCourtCount, label: 'Pending', color: '#fbc22d' },
          { value: closed.length, label: 'Closed', color: INNOCENT_COLOR },
        ] as const).map(({ value, label, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '12px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Active / Closed filter */}
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, gap: 4 }}>
        {(['active', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: filter === f ? 'var(--accent-soft)' : 'transparent',
              color: filter === f ? '#f9fafb' : 'rgba(255,255,255,0.45)',
              outline: filter === f ? '1.5px solid var(--accent)' : 'none',
              outlineOffset: -1.5,
            }}
          >
            {f === 'active' ? `🔴 Active${active.length > 0 ? ` (${active.length})` : ''}` : `✅ Closed${closed.length > 0 ? ` (${closed.length})` : ''}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '28px 0' }}>
          {filter === 'active' ? 'No active cases right now.' : 'No closed cases yet.'}
        </p>
      ) : (
        shown.map((c) => (
          <CaseCard
            key={c.id}
            c={c}
            caseNumber={caseNumberMap.get(c.id) ?? 0}
            currentUid={currentUid}
            memberUids={memberUids}
            groupId={groupId}
            members={members}
          />
        ))
      )}
    </div>
  )
}
