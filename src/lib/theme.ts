import type { AccentId, StylePrefs } from './types'

// Accent palette for the Style tab. `soft` is the translucent fill used for
// selected/active states so every accent works on the dark surfaces.
export const ACCENTS: Record<AccentId, { label: string; color: string; soft: string }> = {
  violet: { label: 'Violet', color: '#8b5cf6', soft: 'rgba(139,92,246,0.20)' },
  coral:  { label: 'Coral',  color: '#fb6d5d', soft: 'rgba(251,109,93,0.20)' },
  teal:   { label: 'Teal',   color: '#14d8b0', soft: 'rgba(20,216,176,0.20)' },
  lime:   { label: 'Lime',   color: '#a8e638', soft: 'rgba(168,230,56,0.20)' },
  amber:  { label: 'Amber',  color: '#fbc22d', soft: 'rgba(251,194,45,0.20)' },
  pink:   { label: 'Pink',   color: '#fb5f9e', soft: 'rgba(251,95,158,0.20)' },
}

export const DEFAULT_STYLE_PREFS: Required<StylePrefs> = {
  accent: 'violet',
  textSize: 'medium',
  compact: false,
}

// Content zoom per text size — applied to the scrollable tab content only
// (never the plaza canvas or the fixed bars).
export const TEXT_ZOOM: Record<NonNullable<StylePrefs['textSize']>, number> = {
  small: 0.92,
  medium: 1,
  large: 1.08,
}

// Push the user's prefs into CSS variables consumed by the design system.
export function applyTheme(prefs: StylePrefs): void {
  if (typeof document === 'undefined') return
  const accent = ACCENTS[prefs.accent ?? 'violet'] ?? ACCENTS.violet
  const compact = prefs.compact ?? false
  const root = document.documentElement
  root.style.setProperty('--accent', accent.color)
  root.style.setProperty('--accent-soft', accent.soft)
  root.style.setProperty('--card-pad', compact ? '10px 12px' : '14px 16px')
  root.style.setProperty('--stack-gap', compact ? '6px' : '10px')
}
