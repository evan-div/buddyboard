'use client'

import { useState, useEffect } from 'react'
import Avatar3D from '@/components/Avatar/Avatar3D'
import {
  postToWall,
  subscribeToWall,
  reactToPost,
  addWallComment,
  subscribeToWallComments,
} from '@/lib/firestore'
import { timeAgo } from '@/lib/utils'
import type { WallPost, WallComment, GroupMember } from '@/lib/types'

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

export default function WallTab({ groupId, currentUid, currentMember }: { groupId: string; currentUid: string; currentMember: GroupMember | null }) {
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
