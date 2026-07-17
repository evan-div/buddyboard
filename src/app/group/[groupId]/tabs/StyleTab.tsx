'use client'

import { useState } from 'react'
import { ACCENTS } from '@/lib/theme'
import { updateNotifPrefs } from '@/lib/firestore'
import type { AccentId, NotifPrefs, StylePrefs } from '@/lib/types'

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 'var(--card-pad)' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)', marginBottom: 14, fontFamily: 'ui-monospace, monospace',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 46, height: 27, borderRadius: 999, border: 'none', padding: 2,
        background: on ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 23, height: 23, borderRadius: '50%', background: 'white',
        transform: on ? 'translateX(19px)' : 'translateX(0)',
        transition: 'transform 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function ToggleRow({
  emoji, label, desc, on, disabled, onChange,
}: {
  emoji: string; label: string; desc: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
      <span style={{ fontSize: 18, width: 26, textAlign: 'center', flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{desc}</div>
      </div>
      <Toggle on={on} disabled={disabled} onChange={onChange} />
    </div>
  )
}

export default function StyleTab({
  uid, stylePrefs, onChangeStyle, notifPrefs: initialNotifPrefs, onCustomizeAvatar,
}: {
  uid: string
  stylePrefs: StylePrefs
  onChangeStyle: (next: StylePrefs) => void
  notifPrefs: NotifPrefs
  onCustomizeAvatar: () => void
}) {
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(initialNotifPrefs)

  const accent = stylePrefs.accent ?? 'violet'
  const textSize = stylePrefs.textSize ?? 'medium'
  const compact = stylePrefs.compact ?? false

  function toggleNotifPref(key: keyof NotifPrefs, on: boolean) {
    const next = { ...notifPrefs, [key]: on }
    setNotifPrefs(next)
    updateNotifPrefs(uid, next).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack-gap)' }}>
      <Section label="Accent Color">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => {
            const a = ACCENTS[id]
            const selected = id === accent
            return (
              <button
                key={id}
                onClick={() => onChangeStyle({ ...stylePrefs, accent: id })}
                aria-label={a.label}
                aria-pressed={selected}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
              >
                <span style={{
                  width: 44, height: 44, borderRadius: 14, background: a.color,
                  border: selected ? '3px solid white' : '3px solid transparent',
                  boxShadow: selected ? `0 0 0 2px ${a.color}` : 'none',
                  display: 'block', boxSizing: 'border-box',
                }} />
                <span style={{ fontSize: 11, fontWeight: selected ? 800 : 600, color: selected ? '#f9fafb' : 'rgba(255,255,255,0.45)' }}>
                  {a.label}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Text Size">
        <div style={{ display: 'flex', gap: 8 }}>
          {([['small', 12], ['medium', 15], ['large', 18]] as const).map(([size, fs]) => {
            const selected = size === textSize
            return (
              <button
                key={size}
                onClick={() => onChangeStyle({ ...stylePrefs, textSize: size })}
                aria-pressed={selected}
                style={{
                  flex: 1, padding: '12px 0 8px', borderRadius: 12, cursor: 'pointer',
                  background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: selected ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                <span style={{ fontSize: fs, fontWeight: 800, color: selected ? '#f9fafb' : 'rgba(255,255,255,0.5)', lineHeight: 1 }}>Aa</span>
                <span style={{ fontSize: 11, color: selected ? '#f9fafb' : 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{size}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section label="Display">
        <ToggleRow
          emoji="📐"
          label="Compact Mode"
          desc="Tighter spacing on cards and feeds"
          on={compact}
          onChange={(on) => onChangeStyle({ ...stylePrefs, compact: on })}
        />
      </Section>

      <Section label="Notifications">
        <ToggleRow
          emoji="🔕" label="Mute everything" desc="Pause all push notifications"
          on={notifPrefs.muteAll === true}
          onChange={(on) => toggleNotifPref('muteAll', on)}
        />
        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
        <ToggleRow
          emoji="🎉" label="Points" desc="When you receive or lose points"
          on={notifPrefs.points !== false} disabled={notifPrefs.muteAll === true}
          onChange={(on) => toggleNotifPref('points', on)}
        />
        <ToggleRow
          emoji="⚖️" label="Court" desc="Cases, appeals, and verdicts"
          on={notifPrefs.court !== false} disabled={notifPrefs.muteAll === true}
          onChange={(on) => toggleNotifPref('court', on)}
        />
        <ToggleRow
          emoji="💬" label="Social" desc="Thanks, comments, and reactions"
          on={notifPrefs.social !== false} disabled={notifPrefs.muteAll === true}
          onChange={(on) => toggleNotifPref('social', on)}
        />
      </Section>

      <Section label="Avatar">
        <button
          onClick={onCustomizeAvatar}
          style={{
            width: '100%', padding: 13, borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: '#f3f4f6', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          🎭 Customize Avatar
        </button>
      </Section>
    </div>
  )
}
