'use client'

// Curated grid of extra reaction emoji, opened from ReactionBar's "+" button
// when the six presets don't cover it. No external picker dependency.
const EMOJI_GRID = [
  '😀', '😁', '😆', '😅', '🥹', '😊', '😍', '🥰', '😘', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😴',
  '🤔', '🙄', '😬', '😱', '😭', '😡', '🤯', '🥵', '🥶', '🤢', '🤮', '🤠', '😇', '🤗', '🫠', '🫡',
  '👍', '👎', '🙌', '👏', '🤝', '💪', '🙏', '✌️', '🤙', '👀', '🫶', '💯', '🔥', '✨', '🎉', '🎊',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '💔', '⭐', '🌟', '☀️', '🌈', '⚡', '💧', '🎯', '👑',
  '🐶', '🐱', '🐸', '🦄', '🐢', '🍕', '🍔', '🍩', '☕', '🍺', '🎮', '🏆', '💰', '🚀', '🧠', '💩',
]

export default function EmojiPickerPopover({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
      <div
        style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 91,
          background: '#1a1a22', border: '1px solid #2d2d3a', borderRadius: 14,
          padding: 8, width: 232, maxHeight: 176, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}
      >
        {EMOJI_GRID.map((e) => (
          <button
            key={e}
            onClick={(ev) => { ev.stopPropagation(); onSelect(e) }}
            style={{
              background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
              padding: 4, borderRadius: 8, lineHeight: 1,
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  )
}
