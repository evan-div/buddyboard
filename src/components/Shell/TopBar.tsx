'use client'

import Avatar3D from '@/components/Avatar/Avatar3D'
import type { AvatarConfig } from '@/lib/types'

export const TOP_BAR_HEIGHT = 56

type Props = {
  unreadCount: number
  onBellClick: () => void
  avatar: AvatarConfig | null
  onAvatarClick: () => void
}

// Fixed app bar: brand on the left, bell + profile chip on the right.
export default function TopBar({ unreadCount, onBellClick, avatar, onAvatarClick }: Props) {
  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        height: TOP_BAR_HEIGHT,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(15,15,19,0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9,
          background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 120%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15,
        }}>
          🥪
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.01em' }}>
          BuddyBoard
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onBellClick}
          className={unreadCount > 0 ? 'bell-wiggle' : ''}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          style={{
            position: 'relative', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'transparent', fontSize: 20,
          }}
        >
          🔔
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 3, right: 3,
              width: 9, height: 9, borderRadius: '50%',
              background: '#f35b5a', border: '2px solid #0f0f13',
            }} />
          )}
        </button>

        <button
          onClick={onAvatarClick}
          aria-label="Your profile"
          style={{
            width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid var(--accent)', padding: 0, cursor: 'pointer',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {avatar ? <Avatar3D config={avatar} size={30} /> : <span style={{ fontSize: 14 }}>👤</span>}
        </button>
      </div>
    </header>
  )
}
