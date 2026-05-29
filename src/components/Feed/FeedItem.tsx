'use client'

import type { Transaction, GroupMember } from '@/lib/types'
import AvatarDisplay from '@/components/Avatar/AvatarDisplay'
import { DEFAULT_AVATAR } from '@/lib/avatarDefaults'
import { timeAgo } from '@/lib/utils'

type FeedItemProps = {
  transaction: Transaction
  members: GroupMember[]
  rotation?: number
}

export default function FeedItem({ transaction, members, rotation = 0 }: FeedItemProps) {
  const isPositive = transaction.points > 0
  const pts = Math.abs(transaction.points)

  const recipientMember = members.find((m) => m.uid === transaction.toUid)
  const emoji = isPositive ? '😊' : '😬'

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '24px',
        padding: '24px 24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        position: 'relative',
      }}
    >
      {/* Recipient avatar with emoji badge */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '3px solid #f3f4f6',
          }}
        >
          <AvatarDisplay config={recipientMember?.avatar ?? DEFAULT_AVATAR} size={84} />
        </div>
        <span
          style={{
            position: 'absolute',
            bottom: -4,
            right: -8,
            fontSize: '24px',
            lineHeight: 1,
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
          }}
        >
          {emoji}
        </span>
      </div>

      {/* Points */}
      <div
        style={{
          fontSize: '46px',
          fontWeight: 900,
          color: isPositive ? '#16a34a' : '#dc2626',
          lineHeight: 1,
          marginBottom: '8px',
          letterSpacing: '-1px',
        }}
      >
        {isPositive ? `+${pts}` : `-${pts}`}
      </div>

      {/* From line */}
      <p style={{ fontSize: '15px', color: '#6b7280', marginBottom: '4px' }}>
        <em>from</em>{' '}
        <strong style={{ color: '#111827' }}>{transaction.fromName}</strong>
      </p>

      {/* Time */}
      <p style={{ fontSize: '11px', color: '#d1d5db', marginBottom: transaction.reason ? '16px' : '0' }}>
        {timeAgo(transaction.createdAt)}
      </p>

      {/* Quote */}
      {transaction.reason && (
        <div style={{ position: 'relative', width: '100%', padding: '0 8px', marginBottom: '8px' }}>
          <span
            style={{
              position: 'absolute',
              top: -16,
              left: -2,
              fontSize: '56px',
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
              fontSize: '13px',
              color: '#374151',
              textAlign: 'center',
              fontStyle: 'italic',
              lineHeight: 1.55,
              padding: '4px 20px',
            }}
          >
            {transaction.reason}
          </p>
          <span
            style={{
              position: 'absolute',
              bottom: -26,
              right: -2,
              fontSize: '56px',
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
    </div>
  )
}
