'use client'

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import Avatar3D from '@/components/Avatar/Avatar3D'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import ReactionBar from '@/components/Feed/ReactionBar'
import {
  postToWall,
  subscribeToWall,
  reactToPost,
  addWallComment,
  subscribeToWallComments,
  subscribeToFeed,
  addReaction,
} from '@/lib/firestore'
import { subscribeToCases } from '@/lib/appeals'
import { timeAgo } from '@/lib/utils'
import type { WallPost, WallComment, GroupMember, Transaction, CourtCase } from '@/lib/types'

const FEED_PAGE = 50

// ─── Merged stream item ─────────────────────────────────────────────────────

type WallItem =
  | { kind: 'post'; ts: number; post: WallPost }
  | { kind: 'tx'; ts: number; tx: Transaction }
  | { kind: 'verdict'; ts: number; case: CourtCase }

const cardBase: CSSProperties = {
  borderRadius: 18,
  padding: '14px 16px',
  border: '1px solid rgba(255,255,255,0.08)',
}

// ─── Wall post card ──────────────────────────────────────────────────────────

function WallPostCard({
  post, groupId, currentUid, currentMember,
}: {
  post: WallPost
  groupId: string
  currentUid: string
  currentMember: GroupMember | null
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

  const commentCount = post.commentCount ?? 0

  return (
    <div style={{ ...cardBase, background: '#181820' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2a2a36', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {post.avatarConfig ? <Avatar3D config={post.avatarConfig} size={36} /> : <span style={{ color: '#888', fontSize: 16 }}>👤</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: post.uid === currentUid ? '#4ade80' : '#f3f4f6' }}>{post.displayName}</span>
            <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{timeAgo(post.createdAt)}</span>
          </div>
          <p style={{ fontSize: 14, color: '#e5e7eb', margin: '4px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.text}</p>
        </div>
      </div>

      <div style={{ marginLeft: 46, marginBottom: 8 }}>
        <ReactionBar
          reactions={post.reactions ?? {}}
          currentUid={currentUid}
          onReact={(emoji) => reactToPost(groupId, post.id, emoji, currentUid).catch(console.error)}
        />
      </div>

      <div style={{ marginLeft: 46 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 700, color: '#818cf8' }}
        >
          {expanded ? 'Hide replies' : commentCount > 0 ? `💬 Reply · ${commentCount} comment${commentCount === 1 ? '' : 's'}` : '💬 Reply'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, marginLeft: 46, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2a2a36', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.avatarConfig ? <Avatar3D config={c.avatarConfig} size={28} /> : <span style={{ fontSize: 12 }}>👤</span>}
              </div>
              <div style={{ flex: 1, background: '#22222c', borderRadius: 12, padding: '7px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: c.uid === currentUid ? '#4ade80' : '#f3f4f6' }}>{c.displayName}</span>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{timeAgo(c.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2a2a36', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentMember?.avatar ? <Avatar3D config={currentMember.avatar} size={28} /> : <span style={{ fontSize: 12 }}>👤</span>}
            </div>
            <div style={{ flex: 1, background: '#22222c', borderRadius: 12, padding: '7px 10px', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
                placeholder="Reply…"
                maxLength={200}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#f3f4f6', fontFamily: 'inherit' }}
              />
              <button
                onClick={handleComment}
                disabled={commenting || !commentText.trim()}
                style={{
                  background: commenting || !commentText.trim() ? '#374151' : '#42b842',
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

// ─── Point transaction card ──────────────────────────────────────────────────

function TransactionCard({
  tx, members, groupId, currentUid,
}: {
  tx: Transaction
  members: GroupMember[]
  groupId: string
  currentUid: string
}) {
  const isPositive = tx.points > 0
  const pts = Math.abs(tx.points)
  const recipient = members.find((m) => m.uid === tx.toUid)

  return (
    <div
      style={{
        ...cardBase,
        background: isPositive ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.14)',
        borderColor: isPositive ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#2a2a36' }}>
          <Avatar3D config={recipient?.avatar ?? DEFAULT_AVATAR} size={32} />
        </div>
        <p style={{ fontSize: 14, color: '#f3f4f6', margin: 0, lineHeight: 1.4, flex: 1 }}>
          <strong>{tx.fromName}</strong> {isPositive ? 'awarded' : 'took points from'} <strong>{tx.toName}</strong>
          {' '}
          <span style={{ fontWeight: 800, color: isPositive ? '#4ade80' : '#f87171' }}>
            {isPositive ? `+${pts}` : `−${pts}`}
          </span>
          {tx.reason ? <> for {tx.reason}</> : null}
        </p>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{timeAgo(tx.createdAt)}</span>
      </div>

      {tx.caption && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', margin: '0 0 10px 42px' }}>
          &ldquo;{tx.caption}&rdquo;
        </p>
      )}

      <div style={{ marginLeft: 42 }}>
        <ReactionBar
          reactions={tx.reactions ?? {}}
          currentUid={currentUid}
          onReact={(emoji) => {
            const reactorName = members.find((m) => m.uid === currentUid)?.displayName ?? ''
            addReaction(groupId, tx.id, emoji, currentUid, reactorName).catch(console.error)
          }}
        />
      </div>
    </div>
  )
}

// ─── Court verdict card ──────────────────────────────────────────────────────

function VerdictCard({ case: c }: { case: CourtCase }) {
  const guilty = Object.values(c.votes).filter((v) => v === 'guilty').length
  const innocent = Object.values(c.votes).filter((v) => v === 'innocent').length
  const isGuilty = c.status === 'resolved_guilty'
  const scoreline = isGuilty ? `${guilty}-${innocent}` : `${innocent}-${guilty}`

  return (
    <div
      style={{
        ...cardBase,
        background: isGuilty ? 'rgba(220,38,38,0.18)' : 'rgba(34,197,94,0.16)',
        borderColor: isGuilty ? 'rgba(220,38,38,0.4)' : 'rgba(34,197,94,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>⚖️</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: isGuilty ? '#f87171' : '#4ade80' }}>
          COURT VERDICT
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginLeft: 'auto' }}>
          {timeAgo(c.resolvedAt ?? c.createdAt)}
        </span>
      </div>
      <p style={{ fontSize: 14, color: '#f3f4f6', margin: '0 0 6px', lineHeight: 1.5 }}>
        {isGuilty
          ? <><strong>{c.defendantName}</strong> was found guilty and loses <strong>{c.points}</strong> pts{c.reason ? <> for &ldquo;{c.reason}&rdquo;</> : null}.</>
          : <><strong>{c.defendantName}</strong> was found innocent — <strong>{c.points}</strong> pts restored{c.reason ? <> (accused of &ldquo;{c.reason}&rdquo;)</> : null}.</>}
      </p>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: isGuilty ? '#f87171' : '#4ade80', margin: 0 }}>
        VERDICT: {isGuilty ? 'GUILTY' : 'INNOCENT'} ({scoreline})
      </p>
    </div>
  )
}

// ─── Wall tab (merged: posts + point transactions + court verdicts) ─────────

export default function WallTab({
  groupId, currentUid, currentMember, members,
}: {
  groupId: string
  currentUid: string
  currentMember: GroupMember | null
  members: GroupMember[]
}) {
  const [posts, setPosts] = useState<WallPost[] | null>(null)
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [cases, setCases] = useState<CourtCase[] | null>(null)
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    const unsub = subscribeToWall(groupId, setPosts)
    return unsub
  }, [groupId])

  useEffect(() => {
    const unsub = subscribeToFeed(groupId, setTransactions, feedLimit)
    return unsub
  }, [groupId, feedLimit])

  useEffect(() => {
    const unsub = subscribeToCases(groupId, setCases)
    return unsub
  }, [groupId])

  const loading = posts === null || transactions === null || cases === null

  const items = useMemo<WallItem[]>(() => {
    if (loading) return []
    const merged: WallItem[] = [
      ...posts!.map((post): WallItem => ({ kind: 'post', ts: post.createdAt.getTime(), post })),
      ...transactions!.map((tx): WallItem => ({ kind: 'tx', ts: tx.createdAt.getTime(), tx })),
      ...cases!
        .filter((c) => c.status === 'resolved_innocent' || c.status === 'resolved_guilty')
        .map((c): WallItem => ({ kind: 'verdict', ts: (c.resolvedAt ?? c.createdAt).getTime(), case: c })),
    ]
    return merged.sort((a, b) => b.ts - a.ts)
  }, [loading, posts, transactions, cases])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Composer */}
      <div style={{ background: '#181820', borderRadius: 16, padding: '12px 14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share something with the group…"
          maxLength={500}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'none',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#f3f4f6', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{text.length}/500</span>
          <button
            onClick={handlePost}
            disabled={posting || !text.trim()}
            style={{
              background: posting || !text.trim() ? '#374151' : '#42b842',
              color: posting || !text.trim() ? '#9ca3af' : 'white',
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
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
          <p style={{ color: '#f3f4f6', fontWeight: 700, margin: '0 0 6px' }}>No activity yet</p>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Post something, or award some points!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            if (item.kind === 'post') {
              return <WallPostCard key={`post-${item.post.id}`} post={item.post} groupId={groupId} currentUid={currentUid} currentMember={currentMember} />
            }
            if (item.kind === 'tx') {
              return <TransactionCard key={`tx-${item.tx.id}`} tx={item.tx} members={members} groupId={groupId} currentUid={currentUid} />
            }
            return <VerdictCard key={`verdict-${item.case.id}`} case={item.case} />
          })}
        </div>
      )}

      {!loading && transactions!.length >= feedLimit && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
          <button
            onClick={() => setFeedLimit((n) => n + FEED_PAGE)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#f3f4f6', fontWeight: 700, fontSize: 14,
              borderRadius: 999, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Load older activity
          </button>
        </div>
      )}
    </div>
  )
}
