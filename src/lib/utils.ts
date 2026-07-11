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
