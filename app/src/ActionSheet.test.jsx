// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('./api.js', () => ({ isApp: false, api: {} }))
vi.mock('./tabbar.js', () => ({ useSheet() {} }))
import { ActionSheet } from './ui.jsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each([undefined, 'Name'])('blocks duplicate submissions and dismissal while pending (input: %s)', async (inputLabel) => {
  const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const nativePrompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
  let fail
  const onConfirm = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { fail = reject })).mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<ActionSheet title="Confirm action" actionLabel="Apply" pendingLabel="Applying…" inputLabel={inputLabel} initialValue="Selected name" onConfirm={onConfirm} onClose={onClose} />)
  const dialog = screen.getByRole('dialog')
  const submit = within(dialog).getByRole('button', { name: 'Apply' })
  const form = submit.closest('form')
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  })
  fireEvent.click(submit)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  // The Sheet backdrop shares the same guarded close action.
  fireEvent.click(dialog.previousElementSibling)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith('Selected name')
  expect(onClose).not.toHaveBeenCalled()
  expect(submit.disabled).toBe(true)
  expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  if (inputLabel) expect(within(dialog).getByRole('textbox').disabled).toBe(true)
  fail(new Error('Server unavailable'))
  expect((await within(dialog).findByRole('alert')).textContent).toBe('Server unavailable')
  expect(submit.disabled).toBe(false)
  if (inputLabel) expect(within(dialog).getByRole('textbox').value).toBe('Selected name')
  fireEvent.click(submit)
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(onConfirm).toHaveBeenCalledTimes(2)
  expect(nativeConfirm).not.toHaveBeenCalled()
  expect(nativePrompt).not.toHaveBeenCalled()
})
