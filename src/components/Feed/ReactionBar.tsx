'use client'

import { useState } from 'react'
import EmojiPickerPopover from './EmojiPickerPopover'

// One shared reaction set + custom-emoji picker for every card in the merged
// Wall stream (wall posts and point transactions).
export const REACTION_EMOJIS = ['🔥', '💀', '😂', '👀', '🫡', '🫣']

type Props = {
  reactions: Record<string, string[]>
  currentUid: string
  onReact: (emoji: string) => void
}

export default function ReactionBar({ reactions, currentUid, onReact }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)

  const usedEmojis = Object.keys(reactions).filter((e) => (reactions[e]?.length ?? 0) > 0)
  const preset = REACTION_EMOJIS.filter((e) => usedEmojis.includes(e))
  const extra  = usedEmojis.filter((e) => !REACTION_EMOJIS.includes(e))
  const active = [...preset, ...extra]

  function pick(emoji: string) {
    onReact(emoji)
    setPickerOpen(false)
    setCustomOpen(false)
  }

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {active.map((e) => {
          const uids = reactions[e] ?? []
          const mine = uids.includes(currentUid)
          return (
            <button
              key={e}
              onClick={() => pick(e)}
              style={{
                background: mine ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.06)',
                border: mine ? '1.5px solid #6366f1' : '1.5px solid rgba(255,255,255,0.12)',
                borderRadius: 20, padding: '3px 9px', cursor: 'pointer',
                fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 4,
                fontWeight: 700,
              }}
            >
              {e} <span style={{ fontSize: 11, opacity: 0.85 }}>{uids.length}</span>
            </button>
          )
        })}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
            borderRadius: 20, padding: '3px 9px', cursor: 'pointer',
            fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 700,
          }}
        >
          {active.length > 0 ? '＋' : '🙂 +'}
        </button>
      </div>

      {pickerOpen && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => pick(e)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
                borderRadius: 20, padding: '4px 8px', cursor: 'pointer', fontSize: 18,
              }}
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setCustomOpen(true)}
            aria-label="More emoji"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
              borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
              color: 'rgba(255,255,255,0.75)', fontWeight: 700,
            }}
          >
            ➕
          </button>

          {customOpen && (
            <EmojiPickerPopover onSelect={pick} onClose={() => setCustomOpen(false)} />
          )}
        </div>
      )}
    </div>
  )
}
