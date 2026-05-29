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
        borderRadius: '20px',
        padding: '16px 20px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.20)',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        position: 'relative',
        width: '220px',
        margin: '0 auto',
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
        <div style={{ position: 'relative', width: '100%', padding: '0 6px', marginBottom: '6px' }}>
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
    </div>
  )
}
