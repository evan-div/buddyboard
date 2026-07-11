'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudWipe from '@/components/World/CloudWipe'
import type { WipePhase } from '@/components/World/CloudWipe'
import Avatar3D from '@/components/Avatar/Avatar3D'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import {
  getUser,
  subscribeToGroup,
  subscribeToGroupMembers,
  subscribeToFeed,
  updateUserAvatar,
  updateMemberAvatar,
  ensureInviteDoc,
  touchPresence,
} from '@/lib/firestore'
import type { Group, GroupMember, GroupNotification } from '@/lib/types'
import { dayKey } from '@/lib/utils'
import { subscribeToNotifications, fileAppeal, subscribeToCases } from '@/lib/appeals'

import PointsToastContainer, { type PointsToastItem } from '@/components/Toast/PointsToast'
import { requestPushPermission } from '@/lib/fcm'
import NotificationPanel from '@/components/Notifications/NotificationPanel'

import FeedTab from './tabs/FeedTab'
import WallTab from './tabs/WallTab'
import LeaderboardTab from './tabs/LeaderboardTab'

const MiiPlaza = dynamic(() => import('@/components/World/MiiPlaza'), { ssr: false })
const CourtTab = dynamic(() => import('@/components/Court/CourtTab'), { ssr: false })
const AdminPanel = dynamic(() => import('@/components/Group/AdminPanel'), { ssr: false })
const AvatarBuilder = dynamic(() => import('@/components/Avatar/AvatarBuilder'), { ssr: false })

// ─── Group Page ───────────────────────────────────────────────────────────────

export default function GroupPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.groupId as string

  const { user, userProfile, loading: authLoading } = useAuth()

  // undefined = still loading, null = group not found
  const [group, setGroup] = useState<Group | null | undefined>(undefined)
  const [membersData, setMembersData] = useState<GroupMember[] | null>(null)
  const [activeTab, setActiveTab] = useState<'plaza' | 'feed' | 'leaderboard' | 'court' | 'wall'>('plaza')
  const [wipePhase, setWipePhase] = useState<WipePhase>('covered')
  const [toasts, setToasts] = useState<PointsToastItem[]>([])
  const [unreadFeedCount, setUnreadFeedCount] = useState(0)
  const [activeCaseCount, setActiveCaseCount] = useState(0)
  const seenTxIds = useRef(new Set<string>())
  const notifInitialized = useRef(false)
  const activeTabRef = useRef(activeTab)
  const [notifications, setNotifications] = useState<GroupNotification[]>([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showNav, setShowNav] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [appearanceDraft, setAppearanceDraft] = useState(DEFAULT_AVATAR)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [appearanceUnlocked, setAppearanceUnlocked] = useState<string[]>([])
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

  const currentUid = user?.uid

  // Live group + member subscriptions. Listeners emit from the local cache
  // immediately and recover from stale connections on their own, so the
  // loading screen can't get stuck the way one-shot reads could. They also
  // keep the plaza, limits, and admin views current without manual refreshes.
  useEffect(() => {
    if (!currentUid || !groupId) return
    const unsubGroup = subscribeToGroup(groupId, setGroup, (err) => {
      console.error('Error loading group:', err)
      setGroup(null)
    })
    const unsubMembers = subscribeToGroupMembers(groupId, setMembersData, (err) => {
      console.error('Error loading members:', err)
      setMembersData([])
    })
    return () => {
      unsubGroup()
      unsubMembers()
    }
  }, [currentUid, groupId])

  const loading = group === undefined || membersData === null
  const members = useMemo(() => membersData ?? [], [membersData])

  // Legacy groups predate the invites/{code} lookup collection; the mayor's
  // client backfills it so invite codes keep working under the new rules.
  const inviteBackfilled = useRef(false)
  useEffect(() => {
    if (!group || !currentUid || group.createdBy !== currentUid) return
    if (inviteBackfilled.current) return
    inviteBackfilled.current = true
    ensureInviteDoc(group)
  }, [group, currentUid])

  // Presence heartbeat: mark this member as active while the plaza is open so
  // other clients can show inactive members as asleep.
  useEffect(() => {
    if (!currentUid || !groupId) return
    const beat = () => {
      if (document.visibilityState === 'visible') touchPresence(groupId, currentUid)
    }
    beat()
    const interval = setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [currentUid, groupId])

  // Remaining daily budgets derived from the live member/group data
  const dailyStats = useMemo(() => {
    const giveLimit = group?.dailyGiveLimit ?? 100
    const takeLimit = group?.dailyTakeLimit ?? 20
    const me = members.find((m) => m.uid === currentUid)
    // Today's date only detects stale daily counters; drift until the next snapshot is harmless
    const today = dayKey(group?.timezone)
    const given = me && me.lastResetDate === today ? me.dailyPointsGiven : 0
    const taken = me && me.lastResetDate === today ? me.dailyPointsTaken : 0
    return {
      remainingGive: Math.max(0, giveLimit - given),
      remainingTake: Math.max(0, takeLimit - taken),
    }
  }, [group, members, currentUid])

  // Real-time notification subscription — shows toasts when current user
  // receives/loses points. Only needs a small window of recent transactions
  // to spot new arrivals, not the full feed.
  useEffect(() => {
    if (!currentUid || !groupId) return

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
          if (tx.toUid === currentUid) {
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
    }, 15)

    return () => {
      unsubscribe()
      notifInitialized.current = false
      seenIds.clear()
    }
  }, [currentUid, groupId])

  // Subscribe to persistent notifications
  useEffect(() => {
    if (!currentUid || !groupId) return
    const unsub = subscribeToNotifications(groupId, currentUid, setNotifications)
    return unsub
  }, [currentUid, groupId])

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

  // Request push permission once after the group loads (fire-and-forget)
  useEffect(() => {
    if (user && !loading) {
      requestPushPermission(user.uid).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading])

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
          <div style={{ position: 'fixed', top: 50, right: 16, zIndex: 30 }}>
            {/* Row of circular buttons: Bell → Settings (mayor) → Hamburger */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {/* Bell */}
                {(() => {
                  const unreadCount = notifications.filter((n) => !n.read).length
                  return (
                    <button
                      onClick={() => setShowNotifPanel(true)}
                      className={unreadCount > 0 ? 'bell-wiggle' : ''}
                      style={{
                        position: 'relative',
                        width: 44, height: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: unreadCount > 0 ? '#f35b5a' : 'rgba(255,255,255,0.9)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        transition: 'background 0.2s',
                        touchAction: 'manipulation',
                      }}
                      aria-label="Notifications"
                    >
                      <span style={{ fontSize: 20 }}>🔔</span>
                      {unreadCount > 0 && (
                        <span style={{
                          position: 'absolute', top: -2, right: -2,
                          background: '#111', color: 'white',
                          fontSize: 10, fontWeight: 900,
                          borderRadius: '50%', width: 16, height: 16,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '2px solid white',
                        }}>
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  )
                })()}

                {/* Mayor gear */}
                {isMayor && (
                  <button
                    onClick={() => setShowAdminPanel(true)}
                    style={{
                      width: 44, height: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.9)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      touchAction: 'manipulation',
                    }}
                    aria-label="Admin panel"
                  >
                    <span style={{ fontSize: 20 }}>⚙️</span>
                  </button>
                )}

                {/* Hamburger */}
                <button
                  onClick={() => setShowNav((v) => !v)}
                  style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: showNav ? '#42b842' : 'rgba(255,255,255,0.9)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    transition: 'background 0.2s',
                    touchAction: 'manipulation',
                  }}
                  aria-label="Navigation menu"
                  aria-expanded={showNav}
                >
                  <span style={{ fontSize: 18, color: showNav ? 'white' : '#333', lineHeight: 1, fontWeight: 700 }}>
                    {showNav ? '✕' : '☰'}
                  </span>
                </button>
              </div>

              {/* Nav dropdown */}
              {showNav && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  {(
                    [
                      { key: 'plaza',       label: 'Plaza',  badge: 0               },
                      { key: 'feed',        label: 'Feed',   badge: unreadFeedCount  },
                      { key: 'leaderboard', label: 'Ranks',  badge: 0               },
                      { key: 'court',       label: 'Court',  badge: activeCaseCount  },
                      { key: 'wall',        label: 'Wall',   badge: 0               },
                    ] as const
                  ).map(({ key, label, badge }, navIdx) => (
                    <button
                      key={key}
                      onClick={() => { switchTab(key); setShowNav(false) }}
                      className="nav-cascade"
                      style={{
                        position: 'relative',
                        animationDelay: `${navIdx * 45}ms`,
                        padding: '10px 18px',
                        borderRadius: 9999,
                        background: activeTab === key ? '#42b842' : 'rgba(255,255,255,0.9)',
                        fontWeight: 800,
                        fontSize: 14,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: activeTab === key ? 'white' : '#333',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        border: 'none',
                        cursor: 'pointer',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        touchAction: 'manipulation',
                        minWidth: 90,
                      }}
                    >
                      {label}
                      {badge > 0 && (
                        <span style={{
                          position: 'absolute', top: -5, right: -5,
                          background: '#f35b5a', color: 'white',
                          fontSize: 10, fontWeight: 900,
                          borderRadius: '50%', width: 18, height: 18,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '2px solid white',
                        }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  ))}

                  {/* INFO button */}
                  <button
                    onClick={() => { setShowGroupInfo(true); setShowNav(false) }}
                    className="nav-cascade"
                    style={{
                      animationDelay: '225ms',
                      padding: '10px 18px',
                      borderRadius: 9999,
                      background: 'rgba(255,255,255,0.9)',
                      fontWeight: 800,
                      fontSize: 14,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: '#333',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      border: 'none',
                      cursor: 'pointer',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      touchAction: 'manipulation',
                      minWidth: 90,
                    }}
                  >
                    Info
                  </button>

                  {/* APPEARANCE button */}
                  <button
                    onClick={async () => {
                      const me = members.find(m => m.uid === user.uid)
                      setAppearanceDraft(me ? { ...me.avatar } : DEFAULT_AVATAR)
                      setShowAppearance(true)
                      setShowNav(false)
                      const userData = await getUser(user.uid)
                      setAppearanceUnlocked(userData?.unlockedItems ?? [])
                    }}
                    className="nav-cascade"
                    style={{
                      animationDelay: '270ms',
                      padding: '10px 18px',
                      borderRadius: 9999,
                      background: 'rgba(255,255,255,0.9)',
                      fontWeight: 800,
                      fontSize: 14,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: '#333',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      border: 'none',
                      cursor: 'pointer',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      touchAction: 'manipulation',
                      minWidth: 90,
                    }}
                  >
                    Appearance
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Plaza: full-screen, nav floats over it ── */}
          {activeTab === 'plaza' && (
            <MiiPlaza
              members={members}
              currentUid={user.uid}
              groupId={groupId}
              inviteCode={group.inviteCode}
              remainingGive={dailyStats.remainingGive}
              remainingTake={dailyStats.remainingTake}
              isChief={isCurrentUserChief}
              presets={group.presets}
              onReady={handlePlazaReady}
            />
          )}

          {/* ── Other tabs: scrollable content below the floating nav ── */}
          {activeTab !== 'plaza' && (
            <div style={{ paddingTop: 122, maxWidth: 512, margin: '0 auto', padding: '122px 16px 32px' }}>
              {activeTab === 'feed' && <FeedTab groupId={groupId} members={members} currentUid={user.uid} />}
              {activeTab === 'leaderboard' && (
                <LeaderboardTab groupId={groupId} members={members} currentUid={user.uid} chiefUid={chiefUid} creatorUid={group.createdBy} />
              )}
              {activeTab === 'court' && (
                <CourtTab
                  groupId={groupId}
                  currentUid={user.uid}
                  memberUids={members.map((m) => m.uid)}
                  chiefUid={chiefUid}
                  members={members}
                />
              )}
              {activeTab === 'wall' && (
                <WallTab
                  groupId={groupId}
                  currentUid={user.uid}
                  currentMember={members.find((m) => m.uid === user.uid) ?? null}
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

      {showGroupInfo && group && (
        <div
          className="overlay-fade"
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGroupInfo(false) }}
        >
          <div className="sheet-rise" style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)', padding: '28px 24px 20px', textAlign: 'center', position: 'relative' }}>
              <button
                onClick={() => setShowGroupInfo(false)}
                aria-label="Close"
                style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
              <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>{group.emoji || '🏠'}</div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{group.name}</div>
              {group.description && (
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 }}>{group.description}</div>
              )}
            </div>

            <div style={{ padding: '20px 24px 24px', overflowY: 'auto', maxHeight: 400 }}>
              {/* Daily limits */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>+{group.dailyGiveLimit ?? 100}</div>
                  <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 2 }}>pts/day to give</div>
                </div>
                <div style={{ flex: 1, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>−{group.dailyTakeLimit ?? 20}</div>
                  <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, marginTop: 2 }}>pts/day to take</div>
                </div>
              </div>

              {/* Members */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  {members.length} {members.length === 1 ? 'Member' : 'Members'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map((m) => (
                    <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar3D config={m.avatar} size={36} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                          {m.displayName}
                          {m.uid === user?.uid && (
                            <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginLeft: 6 }}>You</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{m.totalPoints} pts</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowGroupInfo(false)}
                style={{ width: '100%', padding: 14, background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 16, borderRadius: 14, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Appearance modal ── */}
      {showAppearance && user && (() => {
        const uid = user.uid
        async function saveAppearance() {
          setAppearanceSaving(true)
          try {
            await Promise.all([
              updateUserAvatar(uid, appearanceDraft),
              updateMemberAvatar(groupId, uid, appearanceDraft),
            ])
            setShowAppearance(false)
          } finally {
            setAppearanceSaving(false)
          }
        }
        return (
          <div
            onClick={() => setShowAppearance(false)}
            className="overlay-fade"
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="sheet-rise"
              style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#f5f5f5', borderRadius: '24px 24px 0 0', padding: '20px 16px 32px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#111' }}>Customize Avatar</span>
                <button onClick={() => setShowAppearance(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', lineHeight: 1 }}>✕</button>
              </div>
              <AvatarBuilder value={appearanceDraft} onChange={setAppearanceDraft} unlockedItems={appearanceUnlocked} />
              <button
                onClick={saveAppearance}
                disabled={appearanceSaving}
                style={{ width: '100%', marginTop: 20, padding: 15, background: '#42b842', color: 'white', fontWeight: 800, fontSize: 16, borderRadius: 14, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(66,184,66,0.35)', opacity: appearanceSaving ? 0.7 : 1 }}
              >
                {appearanceSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )
      })()}


      {showNotifPanel && user && (
        <NotificationPanel
          groupId={groupId}
          notifications={notifications}
          memberUids={members.map((m) => m.uid)}
          currentUid={user.uid}
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
        <div className="overlay-fade" style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div className="sheet-rise" style={{
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
