// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import Stats, { decodeHistory } from './Stats.jsx'

const day = (s) => Date.parse(`${s}T00:00:00Z`)
const anchorDay = (s) => (day(s) - Date.UTC(2000, 0, 1)) / 86400000
const activity = {
  books: [], pages_total: 0, days: [], reading_days: ['2026-08-11', '2026-08-16'],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('daily reading time', () => {
  const summary = {
    devices: [{ device: 'CrossInk' }], history_b64: '', anchor_day: anchorDay('2026-09-30'),
    seconds: 3600, pages: 10, sessions: 1, completed: 0, current_streak: 0, streak: 0,
    tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
  }

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', []],
  ])('hides both tiles when daily history is %s', (_, daily) => {
    const { queryByText, getByText } = render(<Stats session={{}} books={[]} summary={{ ...summary, daily }} />)
    expect(queryByText('Today')).toBeNull()
    expect(queryByText('7-day average')).toBeNull()
    expect(getByText('Time read').nextElementSibling.textContent).toBe('1h')
  })

  it('shows zero for Today when only earlier days have reading time', () => {
    const daily = [{ date: '2026-09-24', seconds: 4200 }]
    const { getByText } = render(<Stats session={{}} books={[]} summary={{ ...summary, daily }} />)
    expect(getByText('Today').nextElementSibling.textContent).toBe('0m')
    expect(getByText('7-day average').nextElementSibling.textContent).toBe('10m')
  })

  it.each(['2026-09-23', '2026-10-01'])('shows both zero tiles when history exists outside the past week: %s', (date) => {
    const daily = [{ date, seconds: 4200 }]
    const { getByText } = render(<Stats session={{}} books={[]} summary={{ ...summary, daily }} />)
    expect(getByText('Today').nextElementSibling.textContent).toBe('0m')
    expect(getByText('7-day average').nextElementSibling.textContent).toBe('0m')
  })

  it('reveals both tiles when the first daily record arrives and keeps them after it ages out', () => {
    const props = { session: {}, books: [] }
    const { queryByText, getByText, rerender } = render(<Stats {...props} summary={{ ...summary, daily: [] }} />)
    expect(queryByText('Today')).toBeNull()
    expect(queryByText('7-day average')).toBeNull()

    const daily = [{ date: '2026-09-30', seconds: 4200 }]
    rerender(<Stats {...props} summary={{ ...summary, daily }} />)
    expect(getByText('Today').nextElementSibling.textContent).toBe('1h 10m')
    expect(getByText('7-day average').nextElementSibling.textContent).toBe('10m')

    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
    rerender(<Stats {...props} summary={{ ...summary, daily }} />)
    expect(getByText('Today').nextElementSibling.textContent).toBe('0m')
    expect(getByText('7-day average').nextElementSibling.textContent).toBe('0m')
  })

  it.each([0, 4200])('shows both tiles for a recorded Today value of %s seconds', (seconds) => {
    const daily = [{ date: '2026-09-30', seconds }]
    const { getByText } = render(<Stats session={{}} books={[]} summary={{ ...summary, daily }} />)
    expect(getByText('Today').nextElementSibling.textContent).toBe(seconds ? '1h 10m' : '0m')
    expect(getByText('7-day average').nextElementSibling.textContent).toBe(seconds ? '10m' : '0m')
  })
})

describe('reading grids', () => {
  it('updates the current streak from the same dates that fill the grid', () => {
    const summary = {
      devices: [{ device: 'CrossInk' }], current_streak: 8, streak: 12,
      seconds: 0, pages: 0, sessions: 0, completed: 0,
      tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
    }
    const { getByText, rerender, container } = render(<Stats session={{}} books={[]} summary={summary} />)
    expect(getByText('Current streak').nextElementSibling.textContent).toBe('8 days')
    const combined = { ...summary, anchor_day: anchorDay('2026-09-28'), history_b64: btoa(String.fromCharCode(1)) }
    const synced = { books: [], days: [], reading_days: ['2026-09-29', '2026-09-30'] }
    rerender(<Stats session={{}} books={[]} summary={combined} activity={synced} />)
    expect(getByText('Current streak').nextElementSibling.textContent).toBe('3 days')
    expect(container.querySelectorAll('[data-tip$=": read"]').length).toBe(3)
    expect(getByText('Longest streak').nextElementSibling.textContent).toBe('12 days')
    rerender(<Stats session={{}} books={[]} summary={combined} activity={{ ...synced, reading_days: [] }} />)
    expect(getByText('Current streak').nextElementSibling.textContent).toBe('0 days')
  })

  it('shows recorded daily time on hover and touch without inventing time for other dates', () => {
    const summary = {
      devices: [{ device: 'CrossInk' }], history_b64: btoa(String.fromCharCode(7)),
      anchor_day: anchorDay('2026-09-30'), seconds: 4200, pages: 10, sessions: 1,
      completed: 0, current_streak: 3, streak: 3,
      tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
      daily: [{ date: '2026-09-30', seconds: 4200 }, { date: '2026-09-29', seconds: 0 }],
    }
    const { container, getByRole, queryByRole, rerender } = render(<Stats session={{}} books={[]} summary={summary} />)
    const cell = (date) => [...container.querySelectorAll('[data-tip]')]
      .find((el) => el.dataset.tip.startsWith(date))
    // jsdom does not implement PointerEvent; preserve pointerType for React's handlers.
    const pointer = (el, type, pointerType) => {
      const event = new Event(type, { bubbles: true })
      Object.assign(event, { pointerType })
      fireEvent(el, event)
    }
    pointer(cell('Wed, Sep 30'), 'pointerover', 'mouse')
    expect(getByRole('tooltip').textContent).toBe('Wed, Sep 30: 1h 10m reading time')
    pointer(cell('Tue, Sep 29'), 'pointerover', 'mouse')
    expect(getByRole('tooltip').textContent).toBe('Tue, Sep 29: 0m reading time')
    pointer(cell('Mon, Sep 28'), 'pointerover', 'mouse')
    expect(getByRole('tooltip').textContent).toBe('Mon, Sep 28: read')
    pointer(cell('Sun, Sep 27'), 'pointerover', 'mouse')
    expect(getByRole('tooltip').textContent).toBe('Sun, Sep 27: no reading')
    pointer(cell('Wed, Sep 30'), 'pointerdown', 'touch')
    expect(getByRole('tooltip').textContent).toContain('1h 10m reading time')
    pointer(cell('Wed, Sep 30'), 'pointerup', 'touch')
    expect(queryByRole('tooltip')).toBeNull()
    rerender(<Stats session={{}} books={[]} summary={{ ...summary, daily: undefined }} />)
    pointer(cell('Wed, Sep 30'), 'pointerover', 'mouse')
    expect(getByRole('tooltip').textContent).toBe('Wed, Sep 30: read')
  })

  it('adds chosen dates to device history and preserves existing bits when the anchor moves', () => {
    // Device history says Aug 11 was read. Manual finish is Aug 16.
    const history = decodeHistory(btoa(String.fromCharCode(1)), anchorDay('2026-08-11'), activity.reading_days)
    expect(history.anchor.toISOString().slice(0, 10)).toBe('2026-08-16')
    expect(history.read(0)).toBe(true)
    expect(history.read(5)).toBe(true)
    for (let n = 1; n < 5; n++) expect(history.read(n)).toBe(false)
    expect(history.read(-1)).toBe(false)
    // The device day survives even when no longer supplied by the date overlay.
    expect(decodeHistory(btoa(String.fromCharCode(1)), anchorDay('2026-08-11'), ['2026-08-16']).read(5)).toBe(true)
  })

  it.each([false, true])('shows only chosen days with CrossInk stats present: %s', (hasTime) => {
    const summary = hasTime ? {
      devices: [{ device: 'CrossInk' }], history_b64: '', anchor_day: anchorDay('2026-08-16'),
      seconds: 0, pages: 0, sessions: 0, completed: 0, current_streak: 0, streak: 0,
      tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
    } : null
    const props = { session: {}, books: [], activity, summary }
    const { container, rerender } = render(<Stats {...props} />)
    const tip = (date) => [...container.querySelectorAll('[data-tip]')]
      .find((el) => el.getAttribute('data-tip').startsWith(date))?.getAttribute('data-tip')
    expect(tip('Tue, Aug 11')).toMatch(/: read$/)
    expect(tip('Sun, Aug 16')).toMatch(/: read$/)
    expect(tip('Wed, Aug 12')).toMatch(/: no reading$/)
    // Date edits immediately remove the previous extra marker.
    rerender(<Stats {...props} activity={{ ...activity, reading_days: ['2026-08-11', '2026-08-18'] }} />)
    expect(tip('Sun, Aug 16')).toMatch(/: no reading$/)
    expect(tip('Tue, Aug 18')).toMatch(/: read$/)
  })

  it('shades device calendar days against the median day and gives unknown time the median shade', () => {
    const summary = {
      devices: [{ device: 'CrossInk' }], history_b64: btoa(String.fromCharCode(15)),
      anchor_day: anchorDay('2026-09-30'), seconds: 0, pages: 0, sessions: 0, completed: 0,
      current_streak: 4, streak: 4, tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
      daily: [{ date: '2026-09-30', seconds: 600 }, { date: '2026-09-29', seconds: 1800 }, { date: '2026-09-28', seconds: 7200 }],
    }
    const { container } = render(<Stats session={{}} books={[]} summary={summary} />)
    const cls = (date) => [...container.querySelectorAll('[data-tip]')].find((el) => el.dataset.tip.startsWith(date)).className
    expect(cls('Wed, Sep 30')).toContain('bg-brand-200')
    expect(cls('Tue, Sep 29')).toContain('bg-brand-300')
    expect(cls('Mon, Sep 28')).toContain('bg-brand-500')
    expect(cls('Sun, Sep 27')).toContain('bg-brand-300')
    expect(cls('Sat, Sep 26')).toContain('bg-stone-100')
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(5)
  })

  it('gives the device view the month, 3 month and year scales with time tooltips', () => {
    const summary = {
      devices: [{ device: 'CrossInk' }], history_b64: btoa(String.fromCharCode(3)),
      anchor_day: anchorDay('2026-09-30'), seconds: 0, pages: 0, sessions: 0, completed: 0,
      current_streak: 2, streak: 2, tod: [0, 0, 0, 0], dow: [0, 0, 0, 0, 0, 0, 0],
      daily: [{ date: '2026-09-30', seconds: 4200 }],
    }
    const { container, getByText, getByLabelText } = render(<Stats session={{}} books={[]} summary={summary} />)
    expect(getByText('3 months')).toBeTruthy()
    expect(getByLabelText('Share your reading days')).toBeTruthy()
    fireEvent.click(getByText('Month'))
    const tips = [...container.querySelectorAll('[data-tip]')].map((el) => el.dataset.tip)
    expect(tips).toContain('Wed, Sep 30: 1h 10m reading time')
    expect(tips).toContain('Tue, Sep 29: read')
    expect(tips).toContain('Mon, Sep 28: no reading')
    expect(tips.length).toBe(30)
  })

  it('shades the sync calendar by pages against the median day', () => {
    const days = [
      { day: '2026-09-30', syncs: 1, pages: 5 },
      { day: '2026-09-29', syncs: 1, pages: 20 },
      { day: '2026-09-28', syncs: 1, pages: 80 },
    ]
    const { container } = render(<Stats session={{}} books={[]} summary={null} activity={{ ...activity, days, reading_days: [] }} />)
    const cls = (date) => container.querySelector(`[aria-label^="${date}"]`).className
    expect(cls('Wed, Sep 30')).toContain('bg-brand-200')
    expect(cls('Tue, Sep 29')).toContain('bg-brand-300')
    expect(cls('Mon, Sep 28')).toContain('bg-brand-500')
  })
})
