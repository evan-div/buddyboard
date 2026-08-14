import { describe, it, expect, vi, afterEach } from 'vitest'
import { dayKey, formatCountdown, formatRemaining, timeAgo } from './utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('formatCountdown', () => {
  const now = 1_800_000_000_000

  it('zero-pads to HH:MM:SS', () => {
    expect(formatCountdown(new Date(now + 3_661_000), now).text).toBe('01:01:01')
  })

  it('reads as expired at and past the deadline', () => {
    expect(formatCountdown(new Date(now), now)).toEqual({
      text: '00:00:00', isLow: true, expired: true,
    })
    expect(formatCountdown(new Date(now - 5000), now).expired).toBe(true)
  })

  it('flags the last hour as low but not the hour before it', () => {
    expect(formatCountdown(new Date(now + 59 * 60_000), now).isLow).toBe(true)
    expect(formatCountdown(new Date(now + 61 * 60_000), now).isLow).toBe(false)
  })

  it('does not clamp hours at 24, since commitments run for months', () => {
    // 90 days is 2160 hours — it must not wrap or roll into a day field.
    expect(formatCountdown(new Date(now + 90 * 86_400_000), now).text).toBe('2160:00:00')
  })
})

describe('formatRemaining', () => {
  const now = 1_800_000_000_000

  it('counts whole days once there are at least two', () => {
    expect(formatRemaining(new Date(now + 5 * 86_400_000), now)).toBe('5 days left')
    expect(formatRemaining(new Date(now + 2 * 86_400_000), now)).toBe('2 days left')
  })

  it('drops to hours inside the last two days', () => {
    expect(formatRemaining(new Date(now + 30 * 3_600_000), now)).toBe('30h left')
  })

  it('drops to minutes inside the last hour, never showing zero', () => {
    expect(formatRemaining(new Date(now + 30 * 60_000), now)).toBe('30m left')
    expect(formatRemaining(new Date(now + 5_000), now)).toBe('1m left')
  })

  it('reads as ended at the deadline', () => {
    expect(formatRemaining(new Date(now), now)).toBe('Ended')
  })
})

describe('dayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dayKey('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('respects the timezone across the UTC date line', () => {
    // 2026-07-11 03:00 UTC is still 2026-07-10 in Los Angeles
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T03:00:00Z'))
    expect(dayKey('UTC')).toBe('2026-07-11')
    expect(dayKey('America/Los_Angeles')).toBe('2026-07-10')
    expect(dayKey('Australia/Sydney')).toBe('2026-07-11')
  })

  it('offsets days for streak checks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
    expect(dayKey('UTC', -1)).toBe('2026-02-28')
  })

  it('falls back to UTC on an invalid timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T03:00:00Z'))
    expect(dayKey('Not/AZone')).toBe('2026-07-11')
  })

  it('defaults to UTC when no timezone is set', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T23:30:00Z'))
    expect(dayKey()).toBe('2026-07-11')
    expect(dayKey(undefined)).toBe(dayKey('UTC'))
  })
})

describe('timeAgo', () => {
  it('buckets into now/minutes/hours/days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'))
    const at = (msAgo: number) => new Date(Date.now() - msAgo)
    expect(timeAgo(at(30_000))).toBe('just now')
    expect(timeAgo(at(5 * 60_000))).toBe('5m ago')
    expect(timeAgo(at(3 * 3_600_000))).toBe('3h ago')
    expect(timeAgo(at(2 * 86_400_000))).toBe('2d ago')
  })
})
