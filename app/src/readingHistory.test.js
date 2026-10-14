import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readingStreak } from './readingHistory.js'

const anchorDay = (date) => (Date.parse(`${date}T00:00:00Z`) - Date.UTC(2000, 0, 1)) / 86400000
const summary = (date, bits) => ({
  anchor_day: anchorDay(date), history_b64: btoa(String.fromCharCode(bits)), current_streak: 99,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 30, 12))
})
afterEach(() => vi.useRealTimers())

describe('current reading streak from grid dates', () => {
  it('joins overlapping device and sync dates without counting duplicates', () => {
    expect(readingStreak(summary('2026-09-29', 3), {
      reading_days: ['2026-09-29', '2026-09-30', '2026-09-30'],
    })).toBe(3)
  })

  it('keeps a streak ending yesterday but expires older device snapshots', () => {
    expect(readingStreak(summary('2026-09-29', 7))).toBe(3)
    expect(readingStreak(summary('2026-09-28', 7))).toBe(0)
    expect(readingStreak(summary('2026-09-30', 14))).toBe(3)
  })

  it('stops at gaps without filling the days between chosen dates', () => {
    expect(readingStreak(summary('2026-09-30', 1), {
      reading_days: ['2026-09-26', '2026-09-28'],
    })).toBe(1)
  })

  it('updates when chosen dates are added or removed', () => {
    const device = summary('2026-09-28', 1)
    expect(readingStreak(device, { reading_days: ['2026-09-29', '2026-09-30'] })).toBe(3)
    expect(readingStreak(device, { reading_days: ['2026-09-30'] })).toBe(1)
  })

  it('uses sync-only dates across month and year boundaries and ignores future dates', () => {
    vi.setSystemTime(new Date(2027, 0, 1, 12))
    expect(readingStreak(null, {
      reading_days: ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'],
    })).toBe(3)
  })

  it('uses the device fallback only while dated history is unavailable', () => {
    expect(readingStreak({ current_streak: 8 }, null)).toBe(8)
    expect(readingStreak({ current_streak: 8 }, { reading_days: [] })).toBe(0)
    expect(readingStreak(summary('2026-09-30', 0))).toBe(0)
    expect(readingStreak(null, null)).toBe(0)
  })

  it('uses local calendar dates across daylight saving time changes', () => {
    vi.setSystemTime(new Date(2026, 10, 2, 0, 30))
    expect(readingStreak(null, { reading_days: ['2026-10-31', '2026-11-01', '2026-11-02'] })).toBe(3)
  })
})
