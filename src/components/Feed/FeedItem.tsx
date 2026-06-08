'use client'

import { useState } from 'react'
import type { Transaction, GroupMember } from '@/lib/types'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { timeAgo } from '@/lib/utils'

type FeedItemProps = {
  transaction: Transaction
  members: GroupMember[]
  rotation?: number
  currentUid?: string
  onReact?: (txId: string, emoji: string) => void
}

const REACTION_EMOJIS = ['🔥', '💀', '😂', '👀', '🫡', '🫣']

export default function FeedItem({ transaction, members, rotation = 0, currentUid, onReact }: FeedItemProps) {
  const isPositive = transaction.points > 0
  const pts = Math.abs(transaction.points)

  const recipientMember = members.find((m) => m.uid === transaction.toUid)
  const emoji = isPositive ? '😊' : '😬'

  const reactions = transaction.reactions ?? {}
  const hasReactions = Object.values(reactions).some((uids) => uids.length > 0)
  const [showPicker, setShowPicker] = useState(false)

  function handleCardClick() {
    if (onReact) setShowPicker((p) => !p)
  }

  function handleReact(e: string) {
    onReact?.(transaction.id, e)
    setShowPicker(false)
  }

  return (
    <div
      style={{ width: '220px', margin: '0 auto' }}
      onClick={handleCardClick}
    >
    <div
      style={{
        background: 'white',
        borderRadius: '20px',
        padding: '16px 20px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.20)',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        position: 'relative',
        cursor: onReact ? 'pointer' : 'default',
      }}
    >
      {/* Recipient avatar with emoji badge */}
      <div style={{ position: 'relative', marginBottom: '8px' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid #f3f4f6',
          }}
        >
          <AvatarDisplay config={recipientMember?.avatar ?? DEFAULT_AVATAR} size={52} />
        </div>
        <span
          style={{
            position: 'absolute',
            bottom: -3,
            right: -6,
            fontSize: '16px',
            lineHeight: 1,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
          }}
        >
          {emoji}
        </span>
      </div>

      {/* Points */}
      <div
        style={{
          fontSize: '30px',
          fontWeight: 900,
          color: isPositive ? '#16a34a' : '#dc2626',
          lineHeight: 1,
          marginBottom: '4px',
          letterSpacing: '-0.5px',
        }}
      >
        {isPositive ? `+${pts}` : `-${pts}`}
      </div>

      {/* From line */}
      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
        <em>from</em>{' '}
        <strong style={{ color: '#111827' }}>{transaction.fromName}</strong>
      </p>

      {/* Time */}
      <p style={{ fontSize: '10px', color: '#d1d5db', marginBottom: transaction.reason ? '10px' : '0' }}>
        {timeAgo(transaction.createdAt)}
      </p>

      {/* Quote */}
      {transaction.reason && (
        <div style={{ position: 'relative', width: '100%', padding: '0 6px', marginBottom: transaction.caption ? '4px' : '6px' }}>
          <span
            style={{
              position: 'absolute',
              top: -10,
              left: -2,
              fontSize: '36px',
              color: '#e5e7eb',
              lineHeight: 1,
              fontFamily: 'Georgia, serif',
              userSelect: 'none',
            }}
          >
            &ldquo;
          </span>
          <p
            style={{
              fontSize: '11px',
              color: '#374151',
              textAlign: 'center',
              fontStyle: 'italic',
              lineHeight: 1.4,
              padding: '2px 16px',
            }}
          >
            {transaction.reason}
          </p>
          <span
            style={{
              position: 'absolute',
              bottom: -18,
              right: -2,
              fontSize: '36px',
              color: '#e5e7eb',
              lineHeight: 1,
              fontFamily: 'Georgia, serif',
              userSelect: 'none',
            }}
          >
            &rdquo;
          </span>
        </div>
      )}

      {/* Caption */}
      {transaction.caption && (
        <p style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', marginTop: transaction.reason ? '14px' : '4px', marginBottom: 0 }}>
          {transaction.caption}
        </p>
      )}
    </div>

    {/* Emoji picker — appears below the card */}
    {showPicker && (
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap',
      }}>
        {REACTION_EMOJIS.map((e) => {
          const uids = reactions[e] ?? []
          const isMine = currentUid ? uids.includes(currentUid) : false
          return (
            <button
              key={e}
              onClick={(ev) => { ev.stopPropagation(); handleReact(e) }}
              style={{
                background: isMine ? '#ede9fe' : '#f9fafb',
                border: isMine ? '2px solid #8b5cf6' : '2px solid #e5e7eb',
                borderRadius: 20, padding: '4px 8px', cursor: 'pointer',
                fontSize: 18, display: 'flex', alignItems: 'center', gap: 4,
                fontWeight: 700,
              }}
            >
              {e}{uids.length > 0 && <span style={{ fontSize: 11, color: '#6b7280' }}>{uids.length}</span>}
            </button>
          )
        })}
      </div>
    )}

    {/* Reaction counts (always visible when there are reactions) */}
    {!showPicker && hasReactions && (
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
        {REACTION_EMOJIS.filter((e) => (reactions[e]?.length ?? 0) > 0).map((e) => {
          const uids = reactions[e]!
          const isMine = currentUid ? uids.includes(currentUid) : false
          return (
            <button
              key={e}
              onClick={(ev) => { ev.stopPropagation(); onReact?.(transaction.id, e) }}
              style={{
                background: isMine ? '#ede9fe' : 'rgba(0,0,0,0.35)',
                border: isMine ? '1.5px solid #8b5cf6' : '1.5px solid transparent',
                borderRadius: 20, padding: '2px 7px', cursor: 'pointer',
                fontSize: 14, display: 'flex', alignItems: 'center', gap: 3,
                color: 'white', fontWeight: 700,
              }}
            >
              {e} <span style={{ fontSize: 11 }}>{uids.length}</span>
            </button>
          )
        })}
      </div>
    )}
    </div>
  )
}
