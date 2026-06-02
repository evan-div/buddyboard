'use client'

import { useEffect, useState } from 'react'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { subscribeToCases, castVote, resolveExpiredCase } from '@/lib/appeals'
import type { CourtCase, GroupMember } from '@/lib/types'

type Props = {
  groupId: string
  currentUid: string
  memberUids: string[]
  chiefUid?: string | null
  members: GroupMember[]
}

function timeLeft(deadline: Date): string {
  const ms = deadline.getTime() - Date.now()
  if (ms <= 0) return 'Voting closed'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

function cardBg(status: string): string {
  if (status === 'resolved_innocent' || status === 'accepted') return '#16a34a'
  if (status === 'resolved_guilty') return '#dc2626'
  if (status === 'in_court') return '#f59e0b'
  return '#374151'
}

function CaseCard({
  c,
  caseNumber,
  currentUid,
  memberUids,
  groupId,
  chiefUid,
  members,
}: {
  c: CourtCase
  caseNumber: number
  currentUid: string
  memberUids: string[]
  groupId: string
  chiefUid?: string | null
  members: GroupMember[]
}) {
  const [voting, setVoting] = useState(false)

  const bg = cardBg(c.status)
  const isActive = c.status === 'in_court'
  const isPending = c.status === 'pending_review'
  const isResolved = ['resolved_innocent', 'resolved_guilty', 'accepted', 'dismissed'].includes(c.status)

  const userVote = c.votes[currentUid]
  const isParty = currentUid === c.defendantUid || currentUid === c.accuserUid
  const canVote = isActive && !userVote && !isParty
  const showProgress = (isActive && (!!userVote || isParty)) || isResolved

  const accuserMember  = members.find((m) => m.uid === c.accuserUid)
  const defendantMember = members.find((m) => m.uid === c.defendantUid)

  const innocentCount = Object.values(c.votes).filter((v) => v === 'innocent').length
  const guiltyCount   = Object.values(c.votes).filter((v) => v === 'guilty').length
  const totalVotes    = innocentCount + guiltyCount
  const eligibleVoters = Math.max(0, memberUids.length - 2)
  const innocentPct   = totalVotes > 0 ? Math.round((innocentCount / totalVotes) * 100) : 50

  let statusLabel = ''
  if (c.status === 'accepted')          statusLabel = '✅ Appeal accepted — points restored'
  if (c.status === 'resolved_innocent') statusLabel = '✅ Ruled innocent — points restored'
  if (c.status === 'resolved_guilty')   statusLabel = '⚖️ Ruled guilty'
  if (c.status === 'dismissed')         statusLabel = 'Case dismissed'

  async function vote(v: 'innocent' | 'guilty') {
    setVoting(true)
    try {
      await castVote(groupId, c.id, currentUid, v, memberUids, chiefUid ?? undefined)
    } catch (e) {
      console.error(e)
    } finally {
      setVoting(false)
    }
  }

  return (
    <div style={{
      background: bg,
      borderRadius: 24,
      padding: '22px 20px 20px',
      marginBottom: 16,
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
    }}>
      {/* Case number */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <p style={{ fontWeight: 900, fontSize: 17, color: 'white', letterSpacing: '0.07em', margin: 0 }}>
          CASE #{String(caseNumber).padStart(4, '0')}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0', fontWeight: 600 }}>
          {c.points} pts at stake
          {isActive && c.courtDeadline && ` · ${timeLeft(c.courtDeadline)}`}
        </p>
        {statusLabel && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', margin: '4px 0 0', fontWeight: 700 }}>
            {statusLabel}
          </p>
        )}
      </div>

      {/* VS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '18px 0' }}>
        {/* Accuser */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
          }}>
            <AvatarDisplay config={accuserMember?.avatar ?? DEFAULT_AVATAR} size={58} />
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 13, textAlign: 'center', lineHeight: 1.3 }}>
            {c.accuserName}
          </span>
        </div>

        <span style={{ color: 'white', fontWeight: 900, fontSize: 26, letterSpacing: '0.04em', flexShrink: 0 }}>
          VS.
        </span>

        {/* Defendant */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
          }}>
            <AvatarDisplay config={defendantMember?.avatar ?? DEFAULT_AVATAR} size={58} />
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 13, textAlign: 'center', lineHeight: 1.3 }}>
            {c.defendantName}
          </span>
        </div>
      </div>

      {/* Quote */}
      <div style={{ position: 'relative', padding: '4px 32px 20px', textAlign: 'center' }}>
        <span style={{
          position: 'absolute', top: -10, left: 4,
          fontSize: 52, color: 'rgba(255,255,255,0.3)',
          lineHeight: 1, fontFamily: 'Georgia, serif', userSelect: 'none',
        }}>"</span>
        <p style={{
          color: 'white', fontSize: 15, fontStyle: 'italic',
          fontWeight: 600, lineHeight: 1.55, margin: 0,
        }}>
          {c.appealComment}
        </p>
        <span style={{
          position: 'absolute', bottom: 0, right: 4,
          fontSize: 52, color: 'rgba(255,255,255,0.3)',
          lineHeight: 1, fontFamily: 'Georgia, serif', userSelect: 'none',
        }}>"</span>
      </div>

      {/* Pending: waiting on accuser */}
      {isPending && (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
          Waiting for {c.accuserName} to review this appeal
        </p>
      )}

      {/* Vote buttons */}
      {canVote && (
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            disabled={voting}
            onClick={() => vote('innocent')}
            style={{
              flex: 1, padding: '13px', borderRadius: 99,
              background: '#15803d', border: 'none',
              cursor: voting ? 'default' : 'pointer',
              color: 'white', fontWeight: 900, fontSize: 13,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              opacity: voting ? 0.7 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            INNOCENT
          </button>
          <button
            disabled={voting}
            onClick={() => vote('guilty')}
            style={{
              flex: 1, padding: '13px', borderRadius: 99,
              background: '#b91c1c', border: 'none',
              cursor: voting ? 'default' : 'pointer',
              color: 'white', fontWeight: 900, fontSize: 13,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              opacity: voting ? 0.7 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            GUILTY
          </button>
        </div>
      )}

      {/* Progress bar — shown after voting or for parties/resolved */}
      {showProgress && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 700 }}>
              ✅ {innocentCount} Innocent
            </span>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 700 }}>
              ⚖️ {guiltyCount} Guilty
            </span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${innocentPct}%`,
              background: 'white', borderRadius: 99,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 11, margin: '5px 0 0' }}>
            {totalVotes}/{eligibleVoters} voted
            {userVote && <span> · you voted {userVote}</span>}
          </p>
        </div>
      )}
    </div>
  )
}

export default function CourtTab({ groupId, currentUid, memberUids, chiefUid, members }: Props) {
  const [cases, setCases] = useState<CourtCase[]>([])

  useEffect(() => {
    const unsub = subscribeToCases(groupId, (cs) => {
      setCases(cs)
      cs
        .filter((c) => c.status === 'in_court' && c.courtDeadline && c.courtDeadline < new Date())
        .forEach((c) => resolveExpiredCase(groupId, c.id, memberUids))
    })
    return unsub
  }, [groupId, memberUids])

  // Sequential case numbers: oldest case = #0001
  const caseNumberMap = new Map(
    [...cases].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((c, i) => [c.id, i + 1])
  )

  const active   = cases.filter((c) => c.status === 'in_court')
  const pending  = cases.filter((c) => c.status === 'pending_review')
  const resolved = cases.filter((c) => ['accepted', 'resolved_innocent', 'resolved_guilty', 'dismissed'].includes(c.status))

  function section(title: string, list: CourtCase[]) {
    if (list.length === 0) return null
    return (
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
          {title}
        </p>
        {list.map((c) => (
          <CaseCard
            key={c.id}
            c={c}
            caseNumber={caseNumberMap.get(c.id) ?? 0}
            currentUid={currentUid}
            memberUids={memberUids}
            groupId={groupId}
            chiefUid={chiefUid}
            members={members}
          />
        ))}
      </div>
    )
  }

  if (cases.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏛️</div>
        <p style={{ color: '#f9fafb', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>No cases</p>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Appeals that can&apos;t be settled go to court for a group vote.
        </p>
      </div>
    )
  }

  return (
    <div>
      {section('🔴 Active', active)}
      {section('⏳ Pending Review', pending)}
      {section('📜 Resolved', resolved)}
    </div>
  )
}
