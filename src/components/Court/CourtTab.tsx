'use client'

import { useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { db } from '@/lib/firebase'
import { subscribeToCases, castVote, resolveExpiredCase } from '@/lib/appeals'
import type { CourtCase, GroupMember } from '@/lib/types'

type Props = {
  groupId: string
  currentUid: string
  memberUids: string[]
  chiefUid?: string | null
  members: GroupMember[]
}

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
  const [now, setNow] = useState(Date.now())
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
      resolveExpiredCase(groupId, c.id, memberUids)
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
      resolveExpiredCase(groupId, c.id, memberUids)
    }
  }, [isActive, eligibleVoters, c.votes, c.accuserUid, c.defendantUid, groupId, c.id, memberUids])

  const bg = cardBg(c.status)
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
          {isActive && c.courtDeadline && (() => {
            const { text, isLow } = formatCountdown(c.courtDeadline!, now)
            return (
              <span style={{
                marginLeft: 4,
                color: isLow ? '#ef4444' : 'rgba(255,255,255,0.9)',
                fontWeight: 800,
                animation: isLow ? 'countdownPulse 1s ease-in-out infinite' : undefined,
              }}>
                · ⏱ {text}
              </span>
            )
          })()}
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

      {/* Accusation + Defense */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px 16px' }}>
        {/* Accusation */}
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
          padding: '10px 14px',
          borderLeft: '3px solid rgba(255,255,255,0.4)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
            {c.accuserName}&apos;s accusation
          </p>
          <p style={{ color: 'white', fontSize: 13, fontStyle: 'italic', fontWeight: 500, lineHeight: 1.5, margin: 0 }}>
            &ldquo;{c.reason ?? txReason ?? `Took ${c.points} points`}&rdquo;
          </p>
        </div>

        {/* Defense */}
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
          padding: '10px 14px',
          borderLeft: '3px solid rgba(255,255,255,0.4)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
            {c.defendantName}&apos;s defense
          </p>
          <p style={{ color: 'white', fontSize: 13, fontStyle: 'italic', fontWeight: 500, lineHeight: 1.5, margin: 0 }}>
            &ldquo;{c.appealComment}&rdquo;
          </p>
        </div>
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
            {isActive
              ? <>{totalVotes}/{eligibleVoters} voted{userVote && <span> · you voted {userVote}</span>}</>
              : <>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast{userVote && <span> · you voted {userVote}</span>}</>
            }
          </p>
        </div>
      )}
    </div>
  )
}

export default function CourtTab({ groupId, currentUid, memberUids, chiefUid, members }: Props) {
  const [cases, setCases] = useState<CourtCase[]>([])
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
