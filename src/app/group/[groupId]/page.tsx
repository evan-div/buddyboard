'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import CloudWipe from '@/components/World/CloudWipe'
import type { WipePhase } from '@/components/World/CloudWipe'
import Avatar3D from '@/components/Avatar/Avatar3D'
import FeedItem from '@/components/Feed/FeedItem'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import {
  getUser,
  subscribeToGroup,
  subscribeToGroupMembers,
  subscribeToFeed,
  getTransactionsSince,
  addReaction,
  postToWall,
  subscribeToWall,
  reactToPost,
  addWallComment,
  subscribeToWallComments,
  updateUserAvatar,
  updateMemberAvatar,
} from '@/lib/firestore'
import type { WallPost, WallComment } from '@/lib/types'
import type { Group, GroupMember, Transaction, GroupNotification } from '@/lib/types'
import { highestBadge } from '@/lib/badges'
import { timeAgo } from '@/lib/utils'
import { subscribeToNotifications, fileAppeal, subscribeToCases } from '@/lib/appeals'

import PointsToastContainer, { type PointsToastItem } from '@/components/Toast/PointsToast'
import { requestPushPermission } from '@/lib/fcm'
import NotificationPanel from '@/components/Notifications/NotificationPanel'

const MiiPlaza = dynamic(() => import('@/components/World/MiiPlaza'), { ssr: false })
const PodiumScene = dynamic(() => import('@/components/World/PodiumScene'), { ssr: false })
const CourtTab = dynamic(() => import('@/components/Court/CourtTab'), { ssr: false })
const AdminPanel = dynamic(() => import('@/components/Group/AdminPanel'), { ssr: false })
const AvatarBuilder = dynamic(() => import('@/components/Avatar/AvatarBuilder'), { ssr: false })

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

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

type FeedTabProps = {
  groupId: string
  members: GroupMember[]
  currentUid: string
}

const CARD_ROTATIONS = [-7, 4, -9, 6, -3, 8, -5, 2, 10, -6]
const CARD_OFFSETS  = [10, -20, 25, -10, 30, -25, 5, -30, 15, -15]
const CARD_OVERLAP  = '-60px'

function FeedTab({ groupId, members, currentUid }: FeedTabProps) {
  const [feed, setFeed] = useState<Transaction[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  function handleReact(txId: string, emoji: string) {
    const reactorName = members.find((m) => m.uid === currentUid)?.displayName ?? ''
    addReaction(groupId, txId, emoji, currentUid, reactorName).catch(console.error)
  }

  useEffect(() => {
    // feedLoading starts true; the first snapshot clears it
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
            currentUid={currentUid}
            onReact={handleReact}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Wall Tab ─────────────────────────────────────────────────────────────────

const WALL_REACTION_EMOJIS = ['🔥', '💀', '😂', '👀', '🫡', '🫣']

function WallPostThread({
  post, groupId, currentUid, currentMember, onReact,
}: {
  post: WallPost
  groupId: string
  currentUid: string
  currentMember: GroupMember | null
  onReact: (postId: string, emoji: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [comments, setComments] = useState<WallComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const unsub = subscribeToWallComments(groupId, post.id, setComments)
    return unsub
  }, [expanded, groupId, post.id])

  async function handleComment() {
    if (!commentText.trim() || !currentMember) return
    setCommenting(true)
    try {
      await addWallComment(groupId, post.id, currentUid, currentMember.displayName, currentMember.avatar, commentText.trim(), post.uid, post.displayName)
      setCommentText('')
    } catch (e) {
      console.error(e)
    } finally {
      setCommenting(false)
    }
  }

  const reactions = post.reactions ?? {}
  const hasReactions = Object.values(reactions).some((u) => u.length > 0)
  const commentCount = post.commentCount ?? 0

  return (
    <div style={{ background: '#efefef', borderRadius: 16, padding: '14px 16px', border: '2px solid #d4d4d4' }}>
      {/* Post header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#d4d4d4', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {post.avatarConfig ? (
            <Avatar3D config={post.avatarConfig} size={36} />
          ) : (
            <span style={{ color: '#888', fontSize: 16 }}>👤</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: post.uid === currentUid ? '#42b842' : '#111' }}>{post.displayName}</span>
            <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>{timeAgo(post.createdAt)}</span>
          </div>
          <p style={{ fontSize: 14, color: '#333', margin: '4px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.text}</p>
        </div>
      </div>

      {/* Reactions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginLeft: 46, marginBottom: 8 }}>
        {hasReactions && WALL_REACTION_EMOJIS.filter((e) => (reactions[e]?.length ?? 0) > 0).map((e) => {
          const isMine = reactions[e]!.includes(currentUid)
          return (
            <button key={e} onClick={() => onReact(post.id, e)} style={{
              background: isMine ? '#dcfce7' : '#d4d4d4',
              border: isMine ? '1.5px solid #42b842' : '1.5px solid #c4c4c4',
              borderRadius: 20, padding: '2px 8px', cursor: 'pointer',
              fontSize: 14, color: '#111', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700,
            }}>
              {e} <span style={{ fontSize: 11 }}>{reactions[e]!.length}</span>
            </button>
          )
        })}
        {WALL_REACTION_EMOJIS.map((e) => {
          if ((reactions[e]?.length ?? 0) > 0) return null
          return (
            <button key={e} onClick={() => onReact(post.id, e)} style={{
              background: 'transparent', border: '1.5px solid #d4d4d4',
              borderRadius: 20, padding: '2px 6px', cursor: 'pointer',
              fontSize: 14, color: '#aaa', opacity: 0.7,
            }}>{e}</button>
          )
        })}
      </div>

      {/* Reply toggle */}
      <div style={{ marginLeft: 46 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12, fontWeight: 700, color: '#42b842',
          }}
        >
          {expanded
            ? 'Hide replies'
            : commentCount > 0
              ? `💬 Reply · ${commentCount} comment${commentCount === 1 ? '' : 's'}`
              : '💬 Reply'}
        </button>
      </div>

      {/* Thread */}
      {expanded && (
        <div style={{ marginTop: 10, marginLeft: 46, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#d4d4d4', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.avatarConfig ? <Avatar3D config={c.avatarConfig} size={28} /> : <span style={{ fontSize: 12 }}>👤</span>}
              </div>
              <div style={{ flex: 1, background: '#d4d4d4', borderRadius: 12, padding: '7px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: c.uid === currentUid ? '#42b842' : '#111' }}>{c.displayName}</span>
                  <span style={{ fontSize: 10, color: '#999' }}>{timeAgo(c.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: '#333', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
              </div>
            </div>
          ))}
          {/* Comment composer */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#d4d4d4', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentMember?.avatar ? <Avatar3D config={currentMember.avatar} size={28} /> : <span style={{ fontSize: 12 }}>👤</span>}
            </div>
            <div style={{ flex: 1, background: '#d4d4d4', borderRadius: 12, padding: '7px 10px', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
                placeholder="Reply…"
                maxLength={200}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 13, color: '#111', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleComment}
                disabled={commenting || !commentText.trim()}
                style={{
                  background: commenting || !commentText.trim() ? '#c4c4c4' : '#42b842',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '4px 10px', fontSize: 12, fontWeight: 700,
                  cursor: commenting || !commentText.trim() ? 'default' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {commenting ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WallTab({ groupId, currentUid, currentMember }: { groupId: string; currentUid: string; currentMember: GroupMember | null }) {
  const [posts, setPosts] = useState<WallPost[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    const unsub = subscribeToWall(groupId, (p) => { setPosts(p); setLoading(false) })
    return unsub
  }, [groupId])

  async function handlePost() {
    if (!text.trim() || !currentMember) return
    setPosting(true)
    try {
      await postToWall(groupId, currentUid, currentMember.displayName, currentMember.avatar, text.trim())
      setText('')
    } catch (e) {
      console.error(e)
    } finally {
      setPosting(false)
    }
  }

  function handleReact(postId: string, emoji: string) {
    reactToPost(groupId, postId, emoji, currentUid).catch(console.error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Composer */}
      <div style={{ background: '#efefef', borderRadius: 16, padding: '12px 14px', marginBottom: 16, border: '2px solid #d4d4d4' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something to the group…"
          maxLength={500}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'none',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#111', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#999' }}>{text.length}/500</span>
          <button
            onClick={handlePost}
            disabled={posting || !text.trim()}
            style={{
              background: posting || !text.trim() ? '#d4d4d4' : '#42b842',
              color: posting || !text.trim() ? '#999' : 'white',
              border: 'none', borderRadius: 10,
              padding: '7px 18px', fontSize: 13, fontWeight: 700,
              cursor: posting || !text.trim() ? 'default' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>Loading…</div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
          <p style={{ color: '#111', fontWeight: 700, margin: '0 0 6px' }}>Nothing yet</p>
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>Be the first to post on the group wall!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map((post) => (
            <WallPostThread
              key={post.id}
              post={post}
              groupId={groupId}
              currentUid={currentUid}
              currentMember={currentMember}
              onReact={handleReact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

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

  // Remaining daily budgets derived from the live member/group data
  const dailyStats = useMemo(() => {
    const giveLimit = group?.dailyGiveLimit ?? 100
    const takeLimit = group?.dailyTakeLimit ?? 20
    const me = members.find((m) => m.uid === currentUid)
    // Today's date only detects stale daily counters; drift until the next snapshot is harmless
    const today = new Date().toISOString().split('T')[0]
    const given = me && me.lastResetDate === today ? me.dailyPointsGiven : 0
    const taken = me && me.lastResetDate === today ? me.dailyPointsTaken : 0
    return {
      remainingGive: Math.max(0, giveLimit - given),
      remainingTake: Math.max(0, takeLimit - taken),
    }
  }, [group, members, currentUid])

  // Real-time notification subscription — shows toasts when current user receives/loses points
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
    })

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
