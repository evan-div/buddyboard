/**
 * @file Utility functions for dates and time formatting
 * @mobile-shareable ✅ - Copy as-is to React Native projects
 * @description Timezone-aware day key generation and human-readable time formatting.
 * No Firebase dependencies. Fully unit-tested.
 */

// Calendar-day key (YYYY-MM-DD) in the given IANA timezone, used for daily
// give/take limit resets. offsetDays shifts the reference day (e.g. -1 for
// "yesterday" in streak checks).
export function dayKey(timeZone?: string, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    // Unknown timezone string — fall back to UTC
    return d.toISOString().split('T')[0]
  }
}

// Countdown to a deadline as HH:MM:SS. `isLow` drives the urgent styling once
// under an hour. Shared by the court's 24h voting window and commitment
// deadlines, which can be days or months out — hours are not clamped.
export function formatCountdown(
  deadline: Date,
  now: number,
): { text: string; isLow: boolean; expired: boolean } {
  const ms = deadline.getTime() - now
  if (ms <= 0) return { text: '00:00:00', isLow: true, expired: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return {
    text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    isLow: h < 1,
    expired: false,
  }
}

// Coarse "3 days left" phrasing for deadlines far enough out that a ticking
// HH:MM:SS reads as noise rather than urgency.
export function formatRemaining(deadline: Date, now: number): string {
  const ms = deadline.getTime() - now
  if (ms <= 0) return 'Ended'
  const days = Math.floor(ms / 86_400_000)
  if (days >= 2) return `${days} days left`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours}h left`
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`
}

export function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}
