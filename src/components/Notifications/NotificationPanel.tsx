'use client'

import { useState } from 'react'
import { timeAgo } from '@/lib/utils'
import {
  clearNotification,
  markNotificationRead,
  saveComment,
  reviewAppeal,
  sendThanks,
} from '@/lib/appeals'
import { giveOrTakePoints } from '@/lib/firestore'
import type { GroupNotification } from '@/lib/types'

type Props = {
  groupId: string
  notifications: GroupNotification[]
  memberUids: string[]
  currentUid: string
  onClose: () => void
  onAppeal: (notif: GroupNotification) => void
}

const TYPE_ICON: Record<string, string> = {
  points_received: '🎉',
  points_taken: '😬',
  appeal_filed: '⚖️',
  appeal_accepted: '✅',
  appeal_denied: '🏛️',
  court_opened: '🗳️',
  court_resolved: '📜',
  wall_comment: '💬',
  member_joined: '👋',
  feed_reaction: '😂',
  thanks_received: '🙏',
}

function NotifItem({
  notif,
  groupId,
  memberUids,
  currentUid,
  onAppeal,
  onCleared,
}: {
  notif: GroupNotification
  groupId: string
  memberUids: string[]
  currentUid: string
  onAppeal: (n: GroupNotification) => void
  onCleared: () => void
}) {
  const [commenting, setCommenting] = useState(false)
  const [commentText, setCommentText] = useState(notif.userComment ?? '')
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [welcoming, setWelcoming] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [thanked, setThanked] = useState(notif.thanked ?? false)
  const [thanking, setThanking] = useState(false)

  const pts = Math.abs(notif.points)
  const isNeg = notif.points < 0

  function headline() {
    switch (notif.type) {
      case 'points_received': return `+${pts} pts from ${notif.fromName}`
      case 'points_taken':    return `-${pts} pts taken by ${notif.fromName}`
      case 'appeal_filed':    return `${notif.fromName} appealed your deduction`
      case 'appeal_accepted': return `${notif.fromName} accepted your appeal`
      case 'appeal_denied':   return `Appeal denied — case goes to court`
      case 'court_opened':    return `Court case: ${notif.toName} vs ${notif.fromName}`
      case 'court_resolved':  return notif.outcome === 'innocent'
        ? `Court ruled: ${notif.toName} is innocent`
        : `Court ruled: ${notif.toName} is guilty`
      case 'wall_comment':    return `${notif.fromName} commented on your post`
      case 'member_joined':   return `${notif.fromName} joined the plaza! 👋`
      case 'feed_reaction':   return `${notif.fromName} reacted ${notif.reason} to your transaction`
      case 'thanks_received': return `${notif.fromName} said thanks 🙏`
      default: return 'Notification'
    }
  }

  async function handleWelcome() {
    if (welcomed || welcoming) return
    setWelcoming(true)
    try {
      await giveOrTakePoints(groupId, currentUid, [{
        toUid: notif.fromUid,
        points: 10,
        reason: `Welcome to the plaza, ${notif.fromName}! 🎉`,
      }])
      setWelcomed(true)
      await clearNotification(groupId, notif.id)
    } finally {
      setWelcoming(false)
    }
  }

  async function handleClear() {
    await clearNotification(groupId, notif.id)
    onCleared()
  }

  async function handleThanks() {
    if (thanked || thanking) return
    setThanking(true)
    try {
      // For a points_received notif, toName is the recipient — i.e. the thanker
      await sendThanks(groupId, notif, notif.toName)
      setThanked(true)
    } finally {
      setThanking(false)
    }
  }

  async function handleSaveComment() {
    setSaving(true)
    await saveComment(groupId, notif.id, commentText)
    setSaving(false)
    setCommenting(false)
  }

  async function handleReviewAppeal(decision: 'accept' | 'deny') {
    setReviewing(true)
    try {
      await reviewAppeal(groupId, notif.caseId!, notif.id, decision, memberUids)
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div
      style={{
        background: notif.read ? '#1a1a22' : '#1e1e30',
        borderRadius: '12px',
        padding: '14px 16px',
        borderLeft: `3px solid ${notif.read ? '#374151' : '#6366f1'}`,
        marginBottom: '8px',
      }}
      onClick={() => !notif.read && markNotificationRead(groupId, notif.id)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>
          {TYPE_ICON[notif.type] ?? '🔔'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '13px',
            fontWeight: notif.read ? 500 : 700,
            color: '#f9fafb',
            margin: '0 0 2px',
            lineHeight: 1.35,
          }}>
            {headline()}
          </p>
          {notif.reason && (
            <p style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic', margin: '0 0 2px' }}>
              &ldquo;{notif.reason}&rdquo;
            </p>
          )}
          {notif.type === 'appeal_filed' && notif.appealComment && (
            <p style={{
              fontSize: '11px',
              color: '#a78bfa',
              fontStyle: 'italic',
              background: '#2d1f4e',
              borderRadius: '6px',
              padding: '4px 8px',
              margin: '4px 0',
            }}>
              Their case: &ldquo;{notif.appealComment}&rdquo;
            </p>
          )}
          {notif.userComment && (
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
              Your note: <em>{notif.userComment}</em>
            </p>
          )}
          <p style={{ fontSize: '10px', color: '#4b5563', margin: '4px 0 0' }}>
            {timeAgo(notif.createdAt)}
          </p>
        </div>
      </div>

      {/* Appeal review buttons (accuser sees this) */}
      {notif.type === 'appeal_filed' && notif.caseId && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            disabled={reviewing}
            onClick={() => handleReviewAppeal('accept')}
            style={{
              flex: 1,
              background: '#14532d',
              border: '1px solid #166534',
              borderRadius: '8px',
              color: '#4ade80',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px',
              cursor: reviewing ? 'default' : 'pointer',
              opacity: reviewing ? 0.6 : 1,
            }}
          >
            ✓ Accept
          </button>
          <button
            disabled={reviewing}
            onClick={() => handleReviewAppeal('deny')}
            style={{
              flex: 1,
              background: '#450a0a',
              border: '1px solid #7f1d1d',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px',
              cursor: reviewing ? 'default' : 'pointer',
              opacity: reviewing ? 0.6 : 1,
            }}
          >
            ✗ Deny → Court
          </button>
        </div>
      )}

      {/* Action row for points_taken and points_received */}
      {(notif.type === 'points_taken' || notif.type === 'points_received') && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          {notif.type === 'points_received' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleThanks() }}
              disabled={thanked || thanking}
              style={{
                flex: 1,
                background: thanked ? '#14532d' : '#166534',
                border: `1px solid ${thanked ? '#166534' : '#22c55e'}`,
                borderRadius: '8px',
                color: thanked ? '#86efac' : '#dcfce7',
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px',
                cursor: thanked || thanking ? 'default' : 'pointer',
              }}
            >
              {thanked ? '🙏 Thanked' : thanking ? '…' : '🙏 Say thanks'}
            </button>
          )}
          <button
            onClick={() => setCommenting((v) => !v)}
            style={{
              flex: 1,
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '11px',
              fontWeight: 600,
              padding: '6px',
              cursor: 'pointer',
            }}
          >
            💬 Comment
          </button>
          <button
            onClick={handleClear}
            style={{
              flex: 1,
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '11px',
              fontWeight: 600,
              padding: '6px',
              cursor: 'pointer',
            }}
          >
            ✕ Clear
          </button>
          {isNeg && !notif.caseId && (
            <button
              onClick={() => onAppeal(notif)}
              style={{
                flex: 1,
                background: '#450a0a',
                border: '1px solid #7f1d1d',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              ⚖️ Appeal
            </button>
          )}
        </div>
      )}

      {/* Welcome button for member_joined */}
      {notif.type === 'member_joined' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            disabled={welcoming || welcomed}
            onClick={handleWelcome}
            style={{
              flex: 1,
              background: welcomed ? '#14532d' : '#1a3a1a',
              border: `1px solid ${welcomed ? '#166534' : '#2d5a2d'}`,
              borderRadius: '8px',
              color: welcomed ? '#4ade80' : '#86efac',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px',
              cursor: welcoming || welcomed ? 'default' : 'pointer',
              opacity: welcoming ? 0.6 : 1,
            }}
          >
            {welcomed ? '✓ Welcomed!' : welcoming ? '…' : '🎉 Give +10 welcome pts'}
          </button>
          <button
            onClick={handleClear}
            style={{
              flex: 0,
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '11px',
              fontWeight: 600,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Clear button for other notification types */}
      {notif.type !== 'points_taken' && notif.type !== 'points_received' && notif.type !== 'appeal_filed' && notif.type !== 'member_joined' && (
        <button
          onClick={handleClear}
          style={{
            marginTop: '10px',
            width: '100%',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#9ca3af',
            fontSize: '11px',
            fontWeight: 600,
            padding: '6px',
            cursor: 'pointer',
          }}
        >
          ✕ Clear
        </button>
      )}

      {/* Inline comment box */}
      {commenting && (
        <div style={{ marginTop: '8px' }}>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            style={{
              width: '100%',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f9fafb',
              fontSize: '12px',
              padding: '8px 10px',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              onClick={handleSaveComment}
              disabled={saving || !commentText.trim()}
              style={{
                flex: 1,
                background: '#4f46e5',
                border: 'none',
                borderRadius: '7px',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px',
                cursor: saving || !commentText.trim() ? 'default' : 'pointer',
                opacity: saving || !commentText.trim() ? 0.5 : 1,
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setCommenting(false); setCommentText(notif.userComment ?? '') }}
              style={{
                flex: 1,
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '7px',
                color: '#9ca3af',
                fontSize: '11px',
                fontWeight: 600,
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NotificationPanel({ groupId, notifications, memberUids, currentUid, onClose, onAppeal }: Props) {
  const unread = notifications.filter((n) => !n.read).length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="overlay-fade"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 300,
        }}
      />

      {/* Panel */}
      <div className="panel-slide" style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(360px, 100vw)',
        background: '#0f0f13',
        borderLeft: '1px solid #1f2937',
        zIndex: 301,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #1f2937',
          position: 'sticky',
          top: 0,
          background: '#0f0f13',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f9fafb', margin: 0 }}>
              Notifications
            </h2>
            {unread > 0 && (
              <p style={{ fontSize: '11px', color: '#6366f1', margin: '2px 0 0' }}>
                {unread} unread
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#1f2937',
              border: 'none',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '18px',
              width: '34px',
              height: '34px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* List */}
        <div style={{ padding: '12px 16px', flex: 1 }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔔</div>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotifItem
                key={n.id}
                notif={n}
                groupId={groupId}
                memberUids={memberUids}
                currentUid={currentUid}
                onAppeal={onAppeal}
                onCleared={() => {}}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}
