import { describe, it, expect, vi, afterEach } from 'vitest'
import { dayKey, timeAgo } from './utils'

afterEach(() => {
  vi.useRealTimers()
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
