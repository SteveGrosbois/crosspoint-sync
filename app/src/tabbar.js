import { useEffect } from 'react'
import { configureTabBar, hideTabBar, onTabSelected, removeTabBar, selectTab, showTabBar } from '@sosweetham/tauri-plugin-system-components-api'
import { isApp } from './api.js'

// iPhone app: a real UITabBar over the webview (Liquid Glass on iOS 26) replaces the
// HTML tab bar. iPad keeps the sidebar; Android and the web keep the HTML bar.
export const nativeTabBar = isApp && /iPhone/.test(navigator.userAgent)

// The native bar sits above anything the webview draws, so it steps aside while a
// sheet is open, and when a landscape iPhone is wide enough for the sidebar.
const wide = nativeTabBar && matchMedia('(min-width: 768px)')
let sheets = 0
const sync = () => (wide.matches || sheets ? hideTabBar() : showTabBar()).catch(() => {})

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

// Call in any full-screen sheet so it isn't covered by the native bar.
export function useHideTabBar() {
  useEffect(() => {
    if (!nativeTabBar) return
    sheets++
    sync()
    return () => {
      sheets--
      sync()
    }
  }, [])
}
