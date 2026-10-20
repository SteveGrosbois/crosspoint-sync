// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { moveCatalog } from './catalogs.js'

it('moves a catalog to where another one is', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const ids = (l) => l.map((c) => c.id).join('')
  expect(ids(moveCatalog(list, 'a', 'c'))).toBe('bcad') // down
  expect(ids(moveCatalog(list, 'd', 'b'))).toBe('adbc') // up
  expect(ids(list)).toBe('abcd') // untouched
})
