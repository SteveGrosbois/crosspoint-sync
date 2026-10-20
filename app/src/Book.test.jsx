// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
vi.mock('./api.js', () => ({ isApp: false, api: { setStatus: vi.fn() } }))
vi.mock('./ui.jsx', async (original) => ({ ...await original(), useLoad: () => [null] }))
vi.mock('./tabbar.js', () => ({ useSheet() {}, useNativeBack() {}, useNativeButton() {} }))
vi.mock('./SpotifyCard.jsx', () => ({ default: () => null }))
import Book from './Book.jsx'
import { api } from './api.js'

const book = { document: 'book', title: 'Middlemarch', status: 'reading', percentage: 0.62, cover_url: '/cover.jpg' }
afterEach(() => { cleanup(); vi.clearAllMocks() })

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
