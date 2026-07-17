'use client'

import type { ReactNode } from 'react'

type Props = {
  kicker: string       // small letterspaced label above the title, e.g. "GROUP WALL"
  title: string
  emoji?: string
  right?: ReactNode    // optional action slot (Edit button, code chip, …)
}

export default function PageHeader({ kicker, title, emoji, right }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, margin: '18px 0 16px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)', marginBottom: 4, fontFamily: 'ui-monospace, monospace',
        }}>
          {kicker}
        </div>
        <h1 style={{
          fontSize: 24, fontWeight: 800, color: '#f9fafb', margin: 0, lineHeight: 1.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {emoji ? `${emoji} ` : ''}{title}
        </h1>
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}
