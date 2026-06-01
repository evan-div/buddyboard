'use client'

import { useEffect, useState } from 'react'

export type PointsToastItem = {
  id: string
  fromName: string
  points: number
  reason?: string
}

function ToastCard({ toast, onDismiss }: { toast: PointsToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const isPos = toast.points > 0
  const pts = Math.abs(toast.points)
  const accentColor = isPos ? '#16a34a' : '#dc2626'
  const borderColor = isPos ? '#4ade80' : '#f87171'

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      borderLeft: `4px solid ${borderColor}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      padding: '12px 36px 12px 16px',
      width: '272px',
      position: 'relative',
      transform: visible ? 'translateX(0)' : 'translateX(28px)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
    }}>
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: '8px',
          right: '10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#9ca3af',
          fontSize: '18px',
          lineHeight: 1,
          padding: '2px 4px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontSize: '26px',
          fontWeight: 900,
          color: accentColor,
          lineHeight: 1,
          letterSpacing: '-0.5px',
          flexShrink: 0,
        }}>
          {isPos ? `+${pts}` : `-${pts}`}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: 0 }}>
            {isPos ? '🎉 You got points!' : '😬 Points taken'}
          </p>
          <p style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.3, margin: 0 }}>
            from <strong style={{ color: '#374151' }}>{toast.fromName}</strong>
          </p>
        </div>
      </div>

      {toast.reason && (
        <p style={{
          fontSize: '11px',
          color: '#6b7280',
          fontStyle: 'italic',
          lineHeight: 1.4,
          borderTop: '1px solid #f3f4f6',
          paddingTop: '6px',
          margin: '8px 0 0',
        }}>
          &ldquo;{toast.reason}&rdquo;
        </p>
      )}
    </div>
  )
}

export default function PointsToastContainer({ toasts, onDismiss }: {
  toasts: PointsToastItem[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '88px',
      right: '16px',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastCard toast={t} onDismiss={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  )
}
