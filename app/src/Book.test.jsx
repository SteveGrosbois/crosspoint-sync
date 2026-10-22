// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
vi.mock('./api.js', () => ({ isApp: false, api: { setStatus: vi.fn(), merge: vi.fn(), syncBookorbitBook: vi.fn() } }))
const loads = vi.hoisted(() => ({}))
vi.mock('./ui.jsx', async (original) => ({ ...await original(), useLoad: (fn, deps, memo) => [loads[memo] ?? null] }))
vi.mock('./tabbar.js', () => ({ useSheet() {}, useNativeBack() {}, useNativeButton() {} }))
vi.mock('./SpotifyCard.jsx', () => ({ default: () => null }))
import Book from './Book.jsx'
import { api } from './api.js'

const book = { document: 'book', title: 'Middlemarch', status: 'reading', percentage: 0.62, cover_url: '/cover.jpg' }
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('syncs just this book, disables repeat clicks and refreshes its details', async () => {
  loads['matches book'] = [{ id: 'bookorbit', name: 'BookOrbit', matched: true }]
  let finish
  api.syncBookorbitBook.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const onChange = vi.fn()
  render(<Book session={{}} book={book} books={[book]} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  expect(screen.getByRole('button', { name: 'Syncing…' }).disabled).toBe(true)
  expect(api.syncBookorbitBook).toHaveBeenCalledWith({}, 'book')
  finish({ queued: 1 })
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  expect(screen.getByRole('status').textContent).toContain('Outgoing updates queued')
  delete loads['matches book']
})

it('shows a failed sync and allows retry without reporting success', async () => {
  loads['matches book'] = [{ id: 'bookorbit', name: 'BookOrbit', matched: true }]
  api.syncBookorbitBook.mockRejectedValue(new Error('BookOrbit unavailable'))
  const onChange = vi.fn()
  render(<Book session={{}} book={book} books={[book]} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  expect((await screen.findByRole('alert')).textContent).toBe('BookOrbit unavailable')
  expect(screen.getByRole('button', { name: 'Sync now' }).disabled).toBe(false)
  expect(onChange).not.toHaveBeenCalled()
  delete loads['matches book']
})

it('saves the chosen status and refreshes the book', async () => {
  const onChange = vi.fn()
  api.setStatus.mockResolvedValue({})
  render(<Book session={{}} book={book} books={[book]} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Reading status'), { target: { value: 'finished' } })
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  expect(api.setStatus).toHaveBeenCalledWith({}, 'book', 'finished')
})

it('keeps the saved status and allows retry after a failed update', async () => {
  const onChange = vi.fn()
  api.setStatus.mockRejectedValue(new Error('Connection lost'))
  render(<Book session={{}} book={book} books={[book]} onChange={onChange} />)
  const select = screen.getByLabelText('Reading status')
  fireEvent.change(select, { target: { value: 'paused' } })
  expect((await screen.findByRole('alert')).textContent).toBe('Connection lost')
  expect(select.value).toBe('reading')
  expect(select.disabled).toBe(false)
  expect(onChange).not.toHaveBeenCalled()
  api.setStatus.mockResolvedValue({})
  fireEvent.change(select, { target: { value: 'paused' } })
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  expect(screen.queryByRole('alert')).toBeNull()
})

it('offers hidden untitled syncs as merge candidates with device, progress and last sync', async () => {
  loads['untitled books'] = [{ document: 'koreader-hash', device: 'Kobo', percentage: 0.41, timestamp: Date.now() / 1000 - 7200 }]
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.merge.mockResolvedValue({})
  render(<Book session={{}} book={book} books={[book]} onChange={vi.fn()} />)
  fireEvent.click(screen.getByLabelText('More'))
  fireEvent.click(screen.getByRole('menuitem', { name: /Merge a duplicate/ }))
  expect(screen.getByText('41% · Kobo · synced 2h ago')).toBeTruthy()
  fireEvent.click(screen.getByText('Untitled book'))
  await waitFor(() => expect(api.merge).toHaveBeenCalledWith({}, 'koreader-hash', 'book', true))
  delete loads['untitled books']
})
