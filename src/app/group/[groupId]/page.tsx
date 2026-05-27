'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import FeedItem from '@/components/Feed/FeedItem'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import {
  getGroup,
  getGroupMembers,
  subscribeToFeed,
  giveOrTakePoints,
  getGroupDailyStats,
} from '@/lib/firestore'
import { copyToClipboard } from '@/lib/utils'
import type { Group, GroupMember, Transaction, PointsAllocation } from '@/lib/types'

const MiiPlaza = dynamic(() => import('@/components/World/MiiPlaza'), { ssr: false })

// ─── Points Modal ─────────────────────────────────────────────────────────────

type PointsModalProps = {
  groupId: string
  currentUid: string
  members: GroupMember[]
  remainingGive: number
  remainingTake: number
  onClose: () => void
  onSubmitted: () => void
}

type AllocationEntry = {
  points: string
  reason: string
}

function PointsModal({
  groupId,
  currentUid,
  members,
  remainingGive,
  remainingTake,
  onClose,
  onSubmitted,
}: PointsModalProps) {
  const [mode, setMode] = useState<'give' | 'take'>('give')
  const [allocations, setAllocations] = useState<Record<string, AllocationEntry>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const otherMembers = members.filter((m) => m.uid !== currentUid)

  const dailyLimit = mode === 'give' ? remainingGive : remainingTake

  const totalAllocated = otherMembers.reduce((sum, m) => {
    const val = parseInt(allocations[m.uid]?.points ?? '0', 10)
    return sum + (isNaN(val) || val < 0 ? 0 : val)
  }, 0)

  function updateAllocation(uid: string, field: 'points' | 'reason', value: string) {
    setAllocations((prev) => ({
      ...prev,
      [uid]: {
        points: prev[uid]?.points ?? '0',
        reason: prev[uid]?.reason ?? '',
        [field]: value,
      },
    }))
  }

  function handleModeChange(newMode: 'give' | 'take') {
    setMode(newMode)
    setAllocations({})
    setError('')
  }

  async function handleSubmit() {
    setError('')

    const allocs: PointsAllocation[] = otherMembers
      .map((m) => {
        const raw = parseInt(allocations[m.uid]?.points ?? '0', 10)
        const pts = isNaN(raw) || raw <= 0 ? 0 : raw
        return {
          toUid: m.uid,
          points: mode === 'give' ? pts : -pts,
          reason: allocations[m.uid]?.reason?.trim() ?? '',
        }
      })
      .filter((a) => a.points !== 0)

    if (allocs.length === 0) {
      setError('Please allocate at least 1 point to someone.')
      return
    }

    if (totalAllocated > dailyLimit) {
      setError(
        `Total exceeds your daily ${mode} limit. You have ${dailyLimit} pts remaining.`
      )
      return
    }

    setSubmitting(true)
    try {
      await giveOrTakePoints(groupId, currentUid, allocs)
      onSubmitted()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit points.')
    } finally {
      setSubmitting(false)
    }
  }

  const isOverLimit = totalAllocated > dailyLimit
  const hasAllocations = totalAllocated > 0

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-800 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Give / Take Points</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => handleModeChange('give')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'give'
                  ? 'bg-green-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Give Points
            </button>
            <button
              onClick={() => handleModeChange('take')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'take'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Take Points
            </button>
          </div>

          <p className="text-gray-500 text-xs mt-2 text-center">
            {mode === 'give'
              ? `You can give up to ${remainingGive} pts today`
              : `You can take up to ${remainingTake} pts today`}
          </p>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {otherMembers.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No other members in this group yet.
            </p>
          )}
          {otherMembers.map((member) => {
            const rawVal = allocations[member.uid]?.points ?? '0'
            const numVal = parseInt(rawVal, 10)
            const pts = isNaN(numVal) || numVal < 0 ? 0 : numVal

            return (
              <div
                key={member.uid}
                className="bg-gray-800 rounded-xl p-3 border border-gray-700"
              >
                <div className="flex items-center gap-3 mb-2">
                  <AvatarDisplay config={member.avatar ?? DEFAULT_AVATAR} size={32} />
                  <span className="text-white font-medium text-sm flex-1 truncate">
                    {member.displayName}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rawVal === '0' ? '' : rawVal}
                      placeholder="0"
                      onChange={(e) => updateAllocation(member.uid, 'points', e.target.value || '0')}
                      className="w-16 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                    <span
                      className={`text-xs font-medium ${
                        mode === 'give' ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      pts
                    </span>
                  </div>
                </div>
                {pts > 0 && (
                  <input
                    type="text"
                    value={allocations[member.uid]?.reason ?? ''}
                    onChange={(e) => updateAllocation(member.uid, 'reason', e.target.value)}
                    placeholder="Reason (optional)"
                    maxLength={100}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-800 flex-shrink-0 space-y-3">
          {/* Running total */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Total allocated</span>
            <span
              className={`font-bold ${
                isOverLimit
                  ? 'text-red-400'
                  : totalAllocated > 0
                  ? mode === 'give'
                    ? 'text-green-400'
                    : 'text-red-400'
                  : 'text-gray-500'
              }`}
            >
              {totalAllocated} / {dailyLimit} pts
            </span>
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || isOverLimit || !hasAllocations}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'give'
                ? 'bg-green-600 hover:bg-green-500 shadow-green-500/20'
                : 'bg-red-600 hover:bg-red-500 shadow-red-500/20'
            }`}
          >
            {submitting
              ? 'Submitting...'
              : mode === 'give'
              ? `Give ${totalAllocated} pts`
              : `Take ${totalAllocated} pts`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

type LeaderboardTabProps = {
  members: GroupMember[]
  currentUid: string
  remainingGive: number
  remainingTake: number
}

function LeaderboardTab({ members, currentUid, remainingGive, remainingTake }: LeaderboardTabProps) {
  const sorted = [...members].sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div className="space-y-2">
      {/* Daily remaining hint */}
      <div className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 mb-4">
        <span className="text-gray-400 text-sm">Today remaining</span>
        <div className="flex gap-3 text-sm font-semibold">
          <span className="text-green-400">{remainingGive} give</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{remainingTake} take</span>
        </div>
      </div>

      {sorted.map((member, index) => {
        const isCurrentUser = member.uid === currentUid
        const rank = index + 1

        return (
          <div
            key={member.uid}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              isCurrentUser
                ? 'bg-indigo-500/10 border-indigo-500/30'
                : 'bg-gray-900 border-gray-800'
            }`}
          >
            {/* Rank */}
            <div className="w-8 flex-shrink-0 text-center">
              {rank === 1 ? (
                <span className="text-xl">🥇</span>
              ) : rank === 2 ? (
                <span className="text-xl">🥈</span>
              ) : rank === 3 ? (
                <span className="text-xl">🥉</span>
              ) : (
                <span className="text-gray-500 font-bold text-sm">#{rank}</span>
              )}
            </div>

            {/* Avatar */}
            <AvatarDisplay config={member.avatar ?? DEFAULT_AVATAR} size={40} />

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm truncate ${isCurrentUser ? 'text-indigo-300' : 'text-white'}`}>
                {member.displayName}
                {isCurrentUser && (
                  <span className="text-indigo-500 text-xs font-normal ml-1">(you)</span>
                )}
              </p>
            </div>

            {/* Points */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-yellow-400 text-base">⭐</span>
              <span
                className={`font-bold text-sm ${
                  member.totalPoints >= 0 ? 'text-white' : 'text-red-400'
                }`}
              >
                {member.totalPoints.toLocaleString()}
              </span>
              <span className="text-gray-500 text-xs">pts</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

type FeedTabProps = {
  groupId: string
  members: GroupMember[]
}

function FeedTab({ groupId, members }: FeedTabProps) {
  const [feed, setFeed] = useState<Transaction[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  useEffect(() => {
    setFeedLoading(true)
    const unsubscribe = subscribeToFeed(groupId, (transactions) => {
      setFeed(transactions)
      setFeedLoading(false)
    })
    return () => unsubscribe()
  }, [groupId])

  if (feedLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-700 rounded w-3/4" />
                <div className="h-2.5 bg-gray-800 rounded w-1/2" />
                <div className="h-2 bg-gray-800 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">✨</div>
        <h3 className="text-white font-bold text-base mb-1">No activity yet</h3>
        <p className="text-gray-400 text-sm">Be the first to award some points!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {feed.map((tx) => (
        <FeedItem key={tx.id} transaction={tx} members={members} />
      ))}
    </div>
  )
}

// ─── Group Page ───────────────────────────────────────────────────────────────

export default function GroupPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.groupId as string

  const { user, userProfile, loading: authLoading } = useAuth()

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'plaza' | 'feed'>('plaza')
  const [showPointsModal, setShowPointsModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dailyStats, setDailyStats] = useState({ remainingGive: 100, remainingTake: 20 })

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  // Load group data
  const loadGroupData = useCallback(async () => {
    if (!user || !groupId) return
    setLoading(true)
    try {
      const [groupData, membersData, stats] = await Promise.all([
        getGroup(groupId),
        getGroupMembers(groupId),
        getGroupDailyStats(groupId, user.uid),
      ])
      setGroup(groupData)
      setMembers(membersData)
      setDailyStats({
        remainingGive: stats.remainingGive,
        remainingTake: stats.remainingTake,
      })
    } catch (err) {
      console.error('Error loading group:', err)
    } finally {
      setLoading(false)
    }
  }, [user, groupId])

  useEffect(() => {
    if (user) loadGroupData()
  }, [user, loadGroupData])

  async function handleCopyInviteCode() {
    if (!group) return
    await copyToClipboard(group.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handlePointsSubmitted() {
    setShowPointsModal(false)
    // Refresh data
    await loadGroupData()
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">BB</span>
          </div>
          <p className="text-gray-400 text-sm">Loading group...</p>
        </div>
      </div>
    )
  }

  if (!user || !userProfile) return null

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
        <div className="text-center">
          <p className="text-white font-bold text-lg mb-2">Group not found</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f13] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f0f13]/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-3">
          {/* Top row: back + group name + invite code */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-white transition-colors text-xl leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800"
              aria-label="Back"
            >
              ←
            </button>

            <h1 className="text-white font-bold text-base flex-1 truncate">
              {group.name}
            </h1>

            {/* Invite code chip */}
            <button
              onClick={handleCopyInviteCode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold tracking-widest transition-all flex-shrink-0 ${
                copied
                  ? 'bg-green-500/15 border-green-500/40 text-green-400'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'
              }`}
            >
              {copied ? '✓ Copied!' : group.inviteCode}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-3">
            <button
              onClick={() => setActiveTab('plaza')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'plaza'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Plaza
            </button>
            <button
              onClick={() => setActiveTab('feed')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'feed'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Feed
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-5">
        {activeTab === 'plaza' ? (
          <MiiPlaza
            members={members}
            currentUid={user.uid}
            groupId={groupId}
            remainingGive={dailyStats.remainingGive}
            remainingTake={dailyStats.remainingTake}
            onPointsSubmitted={loadGroupData}
          />
        ) : (
          <FeedTab groupId={groupId} members={members} />
        )}
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#0f0f13]/90 backdrop-blur-md border-t border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-3">
          <button
            onClick={() => setShowPointsModal(true)}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-indigo-500/25 text-base"
          >
            ⭐ Give / Take Points
          </button>
        </div>
      </div>

      {/* Points Modal */}
      {showPointsModal && (
        <PointsModal
          groupId={groupId}
          currentUid={user.uid}
          members={members}
          remainingGive={dailyStats.remainingGive}
          remainingTake={dailyStats.remainingTake}
          onClose={() => setShowPointsModal(false)}
          onSubmitted={handlePointsSubmitted}
        />
      )}
    </div>
  )
}
