import { useEffect, useRef } from 'react'
import {
  configureTabBar,
  createComponent,
  hideTabBar,
  onComponentEvent,
  onTabSelected,
  removeComponent,
  removeTabBar,
  selectTab,
  showTabBar,
} from '@sosweetham/tauri-plugin-system-components-api'
import { isApp } from './api.js'

// iPhone app: a real UITabBar over the webview (Liquid Glass on iOS 26) replaces the
// HTML tab bar. iPad keeps the sidebar; Android and the web keep the HTML bar.
export const nativeTabBar = isApp && /iPhone/.test(navigator.userAgent)
// The HTML controls that native buttons replace carry `native-hide` (index.css).
if (nativeTabBar) document.documentElement.classList.add('native-chrome')

// The native bar sits above anything the webview draws, so it steps aside while a
// sheet is open, and when a landscape iPhone is wide enough for the sidebar.
const wide = nativeTabBar && matchMedia('(min-width: 768px)')
let sheets = 0
const sync = () => {
  // Android: no pull-to-refresh while a sheet scrolls (see MainActivity).
  window.CrossPointRefresh?.setEnabled(sheets === 0)
  if (!nativeTabBar) return
  const hidden = wide.matches || sheets > 0
  ;(hidden ? hideTabBar() : showTabBar()).catch(() => {})
  syncButtons(!hidden)
}

// Glass buttons pinned to the top corners (gear, back, a page's ⋯ menu), iOS 26
// style. Components have no hide, so they're removed and recreated around sheets.
const buttons = new Map() // id -> { sfSymbol, anchor, click, shown }
let listening = false
function syncButtons(show) {
  for (const [id, b] of buttons) {
    if (show && !b.shown) {
      b.shown = true
      // No `label`: the plugin renders it as visible title text beside the symbol.
      // The button is already glass on iOS 26; `glass` would wrap it in a second capsule.
      const props = { sfSymbol: b.sfSymbol, width: 44, height: 44 }
      createComponent({ id, kind: 'button', anchor: b.anchor, dx: 12, dy: 8, props }).catch(() => {})
    } else if (!show && b.shown) {
      b.shown = false
      removeComponent(id).catch(() => {})
    }
  }
}

export function useNativeButton(id, { sfSymbol, anchor }, onClick) {
  const click = useRef(onClick)
  click.current = onClick
  useEffect(() => {
    if (!nativeTabBar) return
    if (!listening) {
      listening = true
      onComponentEvent((e) => e.event === 'click' && buttons.get(e.id)?.click()).catch(() => {})
    }
    buttons.set(id, { sfSymbol, anchor, click: () => click.current(), shown: false })
    syncButtons(!(wide.matches || sheets > 0))
    return () => {
      if (buttons.get(id)?.shown) removeComponent(id).catch(() => {})
      buttons.delete(id)
    }
  }, [id, sfSymbol, anchor])
}

// to: a hash, or a function (e.g. history.back).
export const useNativeBack = (to) =>
  useNativeButton('back', { sfSymbol: 'chevron.left', anchor: 'topLeading' }, () =>
    typeof to === 'function' ? to() : (location.hash = to)
  )

// items: [{ id, title, sfSymbol }]; ids are hashes. Returns the unmount cleanup.
export function mountTabBar(items, selectedId) {
  let live = true
  let listener
  configureTabBar({ items, selectedId, tint: '#4a7a62' }).then(sync, () => {})
  onTabSelected(({ id }) => (location.hash = id)).then((l) => (live ? (listener = l) : l.unregister()), () => {})
  wide.addEventListener('change', sync)
  return () => {
    live = false
    listener?.unregister()
    wide.removeEventListener('change', sync)
    removeTabBar().catch(() => {})
  }
}

export const selectNativeTab = (id) => selectTab(id).catch(() => {})

// Call in any full-screen sheet: the native bar and buttons step aside, and
// pull-to-refresh pauses.
export function useSheet() {
  useEffect(() => {
    sheets++
    sync()
    return () => {
      sheets--
      sync()
    }
  }, [])
}
