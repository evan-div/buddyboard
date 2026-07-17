'use client'

import { useState, useEffect } from 'react'
import Avatar3D from '@/components/Avatar/Avatar3D'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { getGroupStats, type GroupStats } from '@/lib/firestore'
import { subscribeToCases } from '@/lib/appeals'
import type { Group, GroupMember } from '@/lib/types'

function StatTile({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 'var(--card-pad)',
    }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#f9fafb', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function InfoRow({ emoji, label, children }: { emoji: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
      <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{emoji}</span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', width: 92, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#f3f4f6' }}>
        {children}
      </div>
    </div>
  )
}

export default function InfoTab({
  group, members, currentUid,
}: {
  group: Group
  members: GroupMember[]
  currentUid: string
}) {
  const [stats, setStats] = useState<GroupStats | null>(null)
  const [caseCount, setCaseCount] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  // Sampled once on mount — "days active" doesn't need to tick live
  const [nowTs] = useState(() => Date.now())

  useEffect(() => {
    let stale = false
    getGroupStats(group.id).then((s) => { if (!stale) setStats(s) })
    return () => { stale = true }
  }, [group.id])

  useEffect(() => {
    const unsub = subscribeToCases(group.id, (cases) => setCaseCount(cases.length))
    return unsub
  }, [group.id])

  const mayor = members.find((m) => m.uid === group.createdBy)
  const daysActive = Math.max(1, Math.floor((nowTs - group.createdAt.getTime()) / 86_400_000))
  const founded = group.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  async function shareInvite() {
    const url = `${window.location.origin}/dashboard?join=${group.inviteCode}`
    const data = { title: 'Join my BuddyBoard plaza', text: `Join my plaza with code ${group.inviteCode}`, url }
    if (navigator.share) {
      try { await navigator.share(data) } catch { /* cancelled — no-op */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
      {/* Group card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            background: 'var(--accent-soft)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
          }}>
            {group.emoji || '🏠'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#f9fafb', lineHeight: 1.2 }}>{group.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>Founded {founded}</div>
          </div>
        </div>

        {group.description && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: '0 0 14px', lineHeight: 1.5 }}>
            {group.description}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <InfoRow emoji="👑" label="Mayor">{mayor?.displayName ?? '—'}</InfoRow>
          <InfoRow emoji="👥" label="Members">{members.length} {members.length === 1 ? 'person' : 'people'}</InfoRow>
          <InfoRow emoji="🔗" label="Invite Code">
            <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: 1 }}>{group.inviteCode}</span>
            <button
              onClick={shareInvite}
              style={{
                marginLeft: 'auto', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontWeight: 700, fontSize: 12,
                borderRadius: 9, padding: '4px 12px', cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copied' : 'Share'}
            </button>
          </InfoRow>
          <InfoRow emoji="🎯" label="Daily limits">
            <span style={{ color: '#4ade80' }}>+{group.dailyGiveLimit ?? 100}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>/</span>
            <span style={{ color: '#f87171' }}>−{group.dailyTakeLimit ?? 20}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>pts per day</span>
          </InfoRow>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--stack-gap)' }}>
        <StatTile emoji="🎁" value={stats ? stats.totalPointsGiven.toLocaleString() : '…'} label="Points given" />
        <StatTile emoji="🔄" value={stats ? stats.totalTransactions.toLocaleString() : '…'} label="Transactions" />
        <StatTile emoji="⚖️" value={caseCount === null ? '…' : String(caseCount)} label="Court cases filed" />
        <StatTile emoji="📅" value={String(daysActive)} label="Days active" />
      </div>

      {/* Group rules */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: group.rules ? 10 : 0 }}>
          <span style={{ fontSize: 16 }}>📜</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#f3f4f6' }}>Group Rules</span>
        </div>
        {group.rules ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {group.rules}
          </p>
        ) : (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0', fontStyle: 'italic' }}>
            {group.createdBy === currentUid
              ? 'No rules yet — add some from the Edit panel.'
              : 'The mayor hasn’t written any rules yet.'}
          </p>
        )}
      </div>

      {/* Member list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#f3f4f6' }}>Members</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map((m) => (
            <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar3D config={m.avatar ?? DEFAULT_AVATAR} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>
                  {m.displayName}
                  {m.uid === currentUid && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginLeft: 6 }}>You</span>}
                  {m.uid === group.createdBy && <span style={{ fontSize: 12, marginLeft: 6 }} title="Mayor">👑</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{m.totalPoints.toLocaleString()} pts</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
