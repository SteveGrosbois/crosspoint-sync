// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.hoisted(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
vi.mock('./api.js', () => ({ isApp: true, api: {} }))
vi.mock('./tabbar.js', () => ({ useSheet() {} }))
vi.mock('./catalogs.js', () => ({ downloads: vi.fn(async () => []), removeDownload: vi.fn(), sendDownload: vi.fn(), sendFile: vi.fn() }))
vi.mock('./device.js', async (original) => ({
  ...await original(),
  connect: vi.fn(), folders: vi.fn(), listFiles: vi.fn(), deleteFiles: vi.fn(),
  loadDevicePrefs: () => ({ host: 'reader.local', folder: '/', optimize: false, quality: 85 }),
}))
import Send from './Send.jsx'
import { connect, folders, listFiles, deleteFiles } from './device.js'

beforeEach(() => {
  vi.resetAllMocks()
  connect.mockResolvedValue({ base: 'http://192.0.2.1', status: { device: 'X3', version: 'test' } })
  folders.mockResolvedValue([])
  listFiles.mockResolvedValue([{ name: 'book.epub', isDirectory: false, size: 1024 }])
  deleteFiles.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('confirms deletion in the app even when WebView confirm returns false, then refreshes the list', async () => {
  const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<Send />)
  fireEvent.click(await screen.findByRole('button', { name: 'Delete book.epub' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete book.epub?' })
  expect(deleteFiles).not.toHaveBeenCalled()
  listFiles.mockResolvedValue([])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  await screen.findByText('This folder is empty')
  expect(deleteFiles).toHaveBeenCalledExactlyOnceWith('http://192.0.2.1', ['/book.epub'])
  expect(nativeConfirm).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('does not delete when confirmation is cancelled or closed', async () => {
  render(<Send />)
  for (const action of ['Cancel', 'Close']) {
    fireEvent.click(await screen.findByRole('button', { name: 'Delete book.epub' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: action }))
    expect(screen.queryByRole('dialog')).toBeNull()
  }
  expect(deleteFiles).not.toHaveBeenCalled()
})

it('deletes the selected nested path and prevents repeated requests while pending', async () => {
  listFiles.mockImplementation(async (_, path) => path === '/'
    ? [{ name: 'Books', isDirectory: true }]
    : [{ name: 'Été & notes.epub', isDirectory: false, size: 1024 }])
  let finish
  deleteFiles.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  render(<Send />)
  fireEvent.click(await screen.findByRole('button', { name: 'Books', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Été & notes.epub' }))
  const dialog = screen.getByRole('dialog')
  const confirmDelete = within(dialog).getByRole('button', { name: 'Delete', exact: true })
  expect(deleteFiles).not.toHaveBeenCalled()
  fireEvent.click(confirmDelete)
  fireEvent.click(confirmDelete)
  fireEvent.click(screen.getByRole('button', { name: 'Delete Été & notes.epub' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('dialog')).toBe(dialog)
  expect(deleteFiles).toHaveBeenCalledExactlyOnceWith('http://192.0.2.1', ['/Books/Été & notes.epub'])
  expect(screen.getByRole('button', { name: 'Deleting…' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  listFiles.mockResolvedValue([])
  finish()
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('keeps a failed deletion visible with the server error and allows retry', async () => {
  folders.mockResolvedValueOnce(['Books'])
  listFiles.mockResolvedValue([{ name: 'Books', isDirectory: true }])
  deleteFiles.mockRejectedValueOnce(new Error('Books (folder not empty)'))
  render(<Send />)
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Books' }))
  const dialog = screen.getByRole('dialog')
  expect(screen.getByRole('option', { name: '/Books' })).toBeTruthy()
  expect(within(dialog).getByText(/folder must be empty/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  expect((await within(dialog).findByRole('alert')).textContent).toBe('Books (folder not empty)')
  expect(listFiles).toHaveBeenCalledTimes(1)
  expect(folders).toHaveBeenCalledTimes(1)
  listFiles.mockResolvedValue([])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  await screen.findByText('This folder is empty')
  expect(deleteFiles).toHaveBeenCalledTimes(2)
  expect(deleteFiles).toHaveBeenNthCalledWith(1, 'http://192.0.2.1', ['/Books'])
  expect(deleteFiles).toHaveBeenNthCalledWith(2, 'http://192.0.2.1', ['/Books'])
  expect(folders).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('option', { name: '/Books' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})
