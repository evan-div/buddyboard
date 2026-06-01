'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudWipe from '@/components/World/CloudWipe'
import type { WipePhase } from '@/components/World/CloudWipe'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import FeedItem from '@/components/Feed/FeedItem'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import {
  getGroup,
  getGroupMembers,
  subscribeToFeed,
  giveOrTakePoints,
  getGroupDailyStats,
  getTransactionsSince,
} from '@/lib/firestore'
import type { Group, GroupMember, Transaction, PointsAllocation, GroupNotification, PlazaPreset } from '@/lib/types'
import { subscribeToNotifications, fileAppeal, subscribeToCases } from '@/lib/appeals'

import PointsToastContainer, { type PointsToastItem } from '@/components/Toast/PointsToast'
import NotificationPanel from '@/components/Notifications/NotificationPanel'

const MiiPlaza = dynamic(() => import('@/components/World/MiiPlaza'), { ssr: false })
const PodiumScene = dynamic(() => import('@/components/World/PodiumScene'), { ssr: false })
const CourtTab = dynamic(() => import('@/components/Court/CourtTab'), { ssr: false })
const AdminPanel = dynamic(() => import('@/components/Group/AdminPanel'), { ssr: false })

// ─── Points Modal ─────────────────────────────────────────────────────────────

type PointsModalProps = {
  groupId: string
  currentUid: string
  members: GroupMember[]
  remainingGive: number
  remainingTake: number
  isChief?: boolean
  presets?: PlazaPreset[]
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
  isChief,
  presets,
  onClose,
  onSubmitted,
}: PointsModalProps) {
  const [mode, setMode] = useState<'give' | 'take'>('give')
  const [allocations, setAllocations] = useState<Record<string, AllocationEntry>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const otherMembers = members.filter((m) => m.uid !== currentUid)

  const dailyLimit = mode === 'give' ? remainingGive + (isChief ? 25 : 0) : remainingTake
  const modePresets = (presets ?? []).filter((p) => mode === 'give' ? p.points > 0 : p.points < 0)

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
      await giveOrTakePoints(groupId, currentUid, allocs, isChief ?? false)
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
                {modePresets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {modePresets.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          updateAllocation(member.uid, 'points', String(Math.abs(p.points)))
                          updateAllocation(member.uid, 'reason', p.label)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-400 hover:border-indigo-500 hover:text-white transition-all"
                      >
                        {p.emoji} {p.label}
                        <span className={`ml-1 font-bold ${p.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {p.points > 0 ? `+${p.points}` : p.points}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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

type Period = 'daily' | 'weekly' | 'monthly' | 'alltime'

type RankedMember = GroupMember & { periodPoints: number }

function getPeriodStart(period: Period): Date | null {
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

function computeRankings(members: GroupMember[], transactions: Transaction[], period: Period): RankedMember[] {
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

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Today',
  weekly: 'Week',
  monthly: 'Month',
  alltime: 'All Time',
}

function LeaderboardTab({ members, currentUid, groupId, chiefUid, creatorUid }: { members: GroupMember[], currentUid: string, groupId: string, chiefUid?: string | null, creatorUid?: string }) {
  const [period, setPeriod] = useState<Period>('alltime')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const since = getPeriodStart(period)
    if (!since) { setTransactions([]); return }
    setLoading(true)
    getTransactionsSince(groupId, since)
      .then(setTransactions)
      .finally(() => setLoading(false))
  }, [period, groupId])

  const ranked = computeRankings(members, transactions, period)
  const top3 = ranked.slice(0, 3) as (RankedMember | undefined)[]
  const rest  = ranked.slice(3)

  const first  = top3[0]
  const second = top3[1]
  const third  = top3[2]

  return (
    <div>
      {/* Period selector */}
      <div className="flex bg-gray-900 rounded-xl p-1 gap-1 mb-6 border border-gray-800">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === p ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
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
          <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* 3D Podium */}
          <PodiumScene
            first={ranked[0]}
            second={ranked[1]}
            third={ranked[2]}
            period={period}
          />

          {/* Ranks 4+ */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {rest.map((member, i) => {
                const isCurrentUser = member.uid === currentUid
                const rank = i + 4
                const isPositive = period !== 'alltime' && member.periodPoints > 0
                const isNegative = period !== 'alltime' && member.periodPoints < 0
                return (
                  <div
                    key={member.uid}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                      isCurrentUser ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <span className="text-gray-500 font-bold text-sm w-6 text-center">#{rank}</span>
                    <AvatarDisplay config={member.avatar ?? DEFAULT_AVATAR} size={36} />
                    <p className={`flex-1 font-semibold text-sm truncate ${isCurrentUser ? 'text-indigo-300' : 'text-white'}`}>
                      {member.displayName}
                      {isCurrentUser && <span className="text-indigo-500 text-xs font-normal ml-1">(you)</span>}
                      {member.uid === chiefUid && <span className="text-yellow-400 text-xs ml-1" title="Chief">⭐</span>}
                      {member.uid === creatorUid && <span className="text-violet-400 text-xs ml-1" title="Mayor">👑</span>}
                    </p>
                    <span className={`text-sm font-bold ${isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-gray-400'}`}>
                      {period !== 'alltime'
                        ? (isPositive ? `↑ +${member.periodPoints}` : isNegative ? `↓ ${member.periodPoints}` : '–')
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

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

type FeedTabProps = {
  groupId: string
  members: GroupMember[]
}

const CARD_ROTATIONS = [-7, 4, -9, 6, -3, 8, -5, 2, 10, -6]
const CARD_OFFSETS  = [10, -20, 25, -10, 30, -25, 5, -30, 15, -15]
const CARD_OVERLAP  = '-60px'

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
      <div style={{ position: 'relative', paddingBottom: '32px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 0 : CARD_OVERLAP,
              position: 'relative',
              zIndex: 3 - i,
              background: 'white',
              borderRadius: '24px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
              transform: `rotate(${CARD_ROTATIONS[i]}deg)`,
              opacity: 0.7,
            }}
          >
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#f3f4f6' }} />
            <div style={{ width: 80, height: 36, borderRadius: '8px', background: '#f3f4f6' }} />
            <div style={{ width: 120, height: 16, borderRadius: '6px', background: '#f3f4f6' }} />
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
    <div style={{ position: 'relative', paddingBottom: '32px' }}>
      {feed.map((tx, i) => (
        <div
          key={tx.id}
          style={{
            marginTop: i === 0 ? 0 : CARD_OVERLAP,
            position: 'relative',
            zIndex: feed.length - i,
            transform: `translateX(${CARD_OFFSETS[i % CARD_OFFSETS.length]}px)`,
          }}
        >
          <FeedItem
            transaction={tx}
            members={members}
            rotation={CARD_ROTATIONS[i % CARD_ROTATIONS.length]}
          />
        </div>
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
  const [activeTab, setActiveTab] = useState<'plaza' | 'feed' | 'leaderboard' | 'court'>('plaza')
  const [wipePhase, setWipePhase] = useState<WipePhase>('covered')
  const [dailyStats, setDailyStats] = useState({ remainingGive: 100, remainingTake: 20 })
  const [toasts, setToasts] = useState<PointsToastItem[]>([])
  const [unreadFeedCount, setUnreadFeedCount] = useState(0)
  const [activeCaseCount, setActiveCaseCount] = useState(0)
  const seenTxIds = useRef(new Set<string>())
  const notifInitialized = useRef(false)
  const activeTabRef = useRef(activeTab)
  const [notifications, setNotifications] = useState<GroupNotification[]>([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [pendingAppeal, setPendingAppeal] = useState<{
    transactionId: string
    fromUid: string
    fromName: string
    toName: string
    points: number
    reason?: string
  } | null>(null)
  const [appealComment, setAppealComment] = useState('')
  const [filingAppeal, setFilingAppeal] = useState(false)

  // Keep ref in sync so feed subscription can read current tab without deps
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  const handlePlazaReady = useCallback(() => {
    setWipePhase('exiting')
  }, [])

  // Load group data (shows loading spinner — use only on initial load)
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

  // Silent background refresh — does not trigger the loading screen,
  // so components like MiiPlaza stay mounted and animations can finish
  const refreshGroupData = useCallback(async () => {
    if (!user || !groupId) return
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
      console.error('Error refreshing group:', err)
    }
  }, [user, groupId])

  useEffect(() => {
    if (user) loadGroupData()
  }, [user, loadGroupData])

  // Real-time notification subscription — shows toasts when current user receives/loses points
  useEffect(() => {
    if (!user || !groupId) return

    const seenIds = seenTxIds.current

    const unsubscribe = subscribeToFeed(groupId, (txs) => {
      if (!notifInitialized.current) {
        // First snapshot: record all existing IDs, no toasts
        txs.forEach((tx) => seenIds.add(tx.id))
        notifInitialized.current = true
        return
      }

      for (const tx of txs) {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id)
          // Badge for Feed tab when user isn't looking at it
          if (activeTabRef.current !== 'feed') {
            setUnreadFeedCount((prev) => prev + 1)
          }
          if (tx.toUid === user.uid) {
            const item: PointsToastItem = {
              id: tx.id,
              fromUid: tx.fromUid,
              fromName: tx.fromName,
              toName: tx.toName,
              points: tx.points,
              reason: tx.reason,
            }
            setToasts((prev) => [...prev, item])
            setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== tx.id)), 4500)
          }
        }
      }
    })

    return () => {
      unsubscribe()
      notifInitialized.current = false
      seenIds.clear()
    }
  }, [user?.uid, groupId])

  // Subscribe to persistent notifications
  useEffect(() => {
    if (!user || !groupId) return
    const unsub = subscribeToNotifications(groupId, user.uid, setNotifications)
    return unsub
  }, [user?.uid, groupId])

  async function handleFileAppeal() {
    if (!pendingAppeal || !userProfile || !appealComment.trim()) return
    setFilingAppeal(true)
    try {
      await fileAppeal(
        groupId,
        pendingAppeal.transactionId,
        user!.uid,
        userProfile.displayName,
        pendingAppeal.fromUid,
        pendingAppeal.fromName,
        Math.abs(pendingAppeal.points),
        appealComment.trim(),
        pendingAppeal.reason
      )
      setPendingAppeal(null)
      setAppealComment('')
    } finally {
      setFilingAppeal(false)
    }
  }

  // Court cases count for badge
  useEffect(() => {
    if (!groupId) return
    const unsub = subscribeToCases(groupId, (cases) => {
      setActiveCaseCount(cases.filter((c) => c.status === 'in_court').length)
    })
    return unsub
  }, [groupId])

  function switchTab(tab: typeof activeTab) {
    setActiveTab(tab)
    if (tab === 'feed') setUnreadFeedCount(0)
  }

  // Derived: Chief = member with highest positive totalPoints
  const chiefMember = members.length > 0
    ? members.reduce((best, m) => m.totalPoints > best.totalPoints ? m : best)
    : null
  const chiefUid: string | null = chiefMember && chiefMember.totalPoints > 0 ? chiefMember.uid : null
  const isCurrentUserChief = !!(user && chiefUid === user.uid)
  const isMayor = !!(user && group && group.createdBy === user.uid)

  return (
    <>
      {/* Loading state */}
      {(authLoading || loading) && (
        <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center animate-pulse">
              <span className="text-white font-bold text-sm">BB</span>
            </div>
            <p className="text-gray-400 text-sm">Loading group...</p>
          </div>
        </div>
      )}

      {/* Not found state */}
      {!authLoading && !loading && !group && (
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
      )}

      {/* Main content — only when data is ready */}
      {!authLoading && !loading && group && user && userProfile && (
        <div className="min-h-screen bg-[#0f0f13]">

          {/* ── Floating nav overlay ── */}
          <div style={{ position: 'fixed', top: 50, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
            <div style={{ maxWidth: '512px', margin: '0 auto', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
              {/* Back */}
              <button
                onClick={() => router.push('/dashboard')}
                style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'white', fontWeight: 800, fontSize: 16, color: '#374151', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', border: 'none', cursor: 'pointer' }}
                aria-label="Back"
              >
                ←
              </button>

              {/* Tab buttons */}
              <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', scrollbarWidth: 'none', paddingTop: 8, paddingRight: 8, marginTop: -8 }}>
                {(
                  [
                    { key: 'plaza',       label: 'PLAZA',       badge: 0              },
                    { key: 'feed',        label: 'FEED',        badge: unreadFeedCount },
                    { key: 'leaderboard', label: 'LEADERBOARD', badge: 0              },
                    { key: 'court',       label: 'COURT',       badge: activeCaseCount },
                  ] as const
                ).map(({ key, label, badge }) => (
                  <button
                    key={key}
                    onClick={() => switchTab(key)}
                    style={{
                      position: 'relative',
                      flexShrink: 0,
                      padding: '9px 14px',
                      borderRadius: 14,
                      background: 'white',
                      fontWeight: 900,
                      fontSize: 11,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: activeTab === key ? '#111827' : '#9ca3af',
                      boxShadow: activeTab === key ? '0 3px 12px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.1)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s, color 0.15s',
                    }}
                  >
                    {label}
                    {badge > 0 && (
                      <span style={{
                        position: 'absolute', top: -6, right: -6,
                        background: '#f35b5a', color: 'white',
                        fontSize: 10, fontWeight: 900,
                        borderRadius: 99, minWidth: 18, height: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', border: '2px solid white',
                      }}>
                        {badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Bell */}
              {(() => {
                const unreadCount = notifications.filter((n) => !n.read).length
                return (
                  <button
                    onClick={() => setShowNotifPanel(true)}
                    className={unreadCount > 0 ? 'bell-wiggle' : ''}
                    style={{
                      flexShrink: 0, width: 40, height: 40,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: unreadCount > 0 ? '#f35b5a' : 'white',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      transition: 'background 0.2s',
                    }}
                    aria-label="Notifications"
                  >
                    <span style={{ fontSize: 18 }}>🔔</span>
                  </button>
                )
              })()}

              {/* Mayor gear */}
              {isMayor && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  style={{
                    flexShrink: 0, width: 40, height: 40,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  }}
                  aria-label="Admin panel"
                >
                  <span style={{ fontSize: 18 }}>⚙️</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Plaza: full-screen, nav floats over it ── */}
          {activeTab === 'plaza' && (
            <MiiPlaza
              members={members}
              currentUid={user.uid}
              groupId={groupId}
              remainingGive={dailyStats.remainingGive}
              remainingTake={dailyStats.remainingTake}
              onPointsSubmitted={refreshGroupData}
              onAvatarUpdated={refreshGroupData}
              onReady={handlePlazaReady}
            />
          )}

          {/* ── Other tabs: scrollable content below the floating nav ── */}
          {activeTab !== 'plaza' && (
            <div style={{ paddingTop: 122, maxWidth: 512, margin: '0 auto', padding: '122px 16px 32px' }}>
              {activeTab === 'feed' && <FeedTab groupId={groupId} members={members} />}
              {activeTab === 'leaderboard' && (
                <LeaderboardTab groupId={groupId} members={members} currentUid={user.uid} chiefUid={chiefUid} creatorUid={group.createdBy} />
              )}
              {activeTab === 'court' && (
                <CourtTab
                  groupId={groupId}
                  currentUid={user.uid}
                  memberUids={members.map((m) => m.uid)}
                  chiefUid={chiefUid}
                />
              )}
            </div>
          )}

        </div>
      )}

      {showAdminPanel && group && (
        <AdminPanel
          group={group}
          members={members}
          currentUid={user!.uid}
          chiefUid={chiefUid}
          onClose={() => setShowAdminPanel(false)}
          onRefresh={refreshGroupData}
        />
      )}

      <PointsToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        onAppeal={(item) => {
          setPendingAppeal({
            transactionId: item.id,
            fromUid: item.fromUid,
            fromName: item.fromName,
            toName: item.toName,
            points: item.points,
            reason: item.reason,
          })
          setAppealComment('')
        }}
      />

      {showNotifPanel && user && (
        <NotificationPanel
          groupId={groupId}
          notifications={notifications}
          memberUids={members.map((m) => m.uid)}
          onClose={() => setShowNotifPanel(false)}
          onAppeal={(notif) => {
            setShowNotifPanel(false)
            setPendingAppeal({
              transactionId: notif.transactionId,
              fromUid: notif.fromUid,
              fromName: notif.fromName,
              toName: notif.toName,
              points: notif.points,
              reason: notif.reason,
            })
            setAppealComment('')
          }}
        />
      )}

      {/* Appeal modal */}
      {pendingAppeal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f0f13',
            borderRadius: '20px 20px 0 0',
            borderTop: '1px solid #1f2937',
            padding: '24px 20px 32px',
            width: '100%',
            maxWidth: '480px',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f9fafb', margin: '0 0 4px' }}>
              ⚖️ File an Appeal
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
              {Math.abs(pendingAppeal.points)} pts taken by {pendingAppeal.fromName}
              {pendingAppeal.reason ? ` · "${pendingAppeal.reason}"` : ''}
            </p>
            <textarea
              value={appealComment}
              onChange={(e) => setAppealComment(e.target.value)}
              placeholder="Explain why this was unfair..."
              rows={4}
              style={{
                width: '100%',
                background: '#1a1a22',
                border: '1px solid #374151',
                borderRadius: '12px',
                color: '#f9fafb',
                fontSize: '14px',
                padding: '12px 14px',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '12px',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setPendingAppeal(null); setAppealComment('') }}
                style={{
                  flex: 1,
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  color: '#9ca3af',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFileAppeal}
                disabled={filingAppeal || !appealComment.trim()}
                style={{
                  flex: 2,
                  background: filingAppeal || !appealComment.trim() ? '#312e81' : '#4f46e5',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '13px',
                  cursor: filingAppeal || !appealComment.trim() ? 'default' : 'pointer',
                  opacity: filingAppeal || !appealComment.trim() ? 0.6 : 1,
                }}
              >
                {filingAppeal ? 'Filing…' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CloudWipe — fixed position in tree so it never remounts mid-animation */}
      <CloudWipe phase={wipePhase} />
    </>
  )
}
