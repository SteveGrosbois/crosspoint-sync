const DAY_MS = 86400000
const EPOCH = Date.UTC(2000, 0, 1)

export const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// history_b64: bit N (LSB-first per byte) = anchor_day - N, anchor_day = days since 2000-01-01.
export function decodeHistory(b64, anchorDay = 0, readingDays = []) {
  const bytes = Uint8Array.from(atob(b64 || ''), (ch) => ch.charCodeAt(0))
  const extra = new Set(readingDays)
  const today = localDay(new Date())
  const latest = readingDays.filter((day) => day <= today).sort().at(-1)
  const original = EPOCH + anchorDay * DAY_MS
  const anchor = new Date(Math.max(original, latest ? Date.parse(`${latest}T00:00:00Z`) : original))
  const shift = (anchor.getTime() - original) / DAY_MS
  const read = (n) => {
    if (n < 0) return false
    const day = new Date(anchor.getTime() - n * DAY_MS).toISOString().slice(0, 10)
    const bit = n - shift
    return extra.has(day) || (bit >= 0 && bit < bytes.length * 8 && ((bytes[bit >> 3] >> (bit & 7)) & 1) === 1)
  }
  const anchorRow = (anchor.getUTCDay() + 6) % 7 // Monday = 0
  return { read, anchor, anchorRow }
}

// Count the same dates the grid fills, anchored to the user's actual today.
// An empty dated history is known zero; only missing history uses the old total.
export function readingStreak(summary, activity) {
  const hasDeviceHistory = summary?.anchor_day > 0 && !!summary.history_b64
  if (!hasDeviceHistory && !Array.isArray(activity?.reading_days)) return summary?.current_streak ?? 0
  const { read, anchor } = decodeHistory(summary?.history_b64, summary?.anchor_day ?? 0, activity?.reading_days)
  const today = Date.parse(`${localDay(new Date())}T00:00:00Z`)
  const offset = (anchor.getTime() - today) / DAY_MS
  let n = read(offset) ? offset : offset + 1
  let streak = 0
  while (read(n)) {
    streak++
    n++
  }
  return streak
}

const BASELINE_DAYS = 90

// Shade levels 1-4 for a read day, relative to the user's median day. `entries` is
// [date, amount] pairs; amounts of the last 90 days are blended with a fallback
// (worth `prior` days) so a few early days don't set the scale.
export function shadeLevels(entries, { fallback, prior = 14 }) {
  const cutoff = localDay(new Date(Date.now() - BASELINE_DAYS * DAY_MS))
  const sorted = [...entries].filter(([date, v]) => date > cutoff && v > 0).map(([, v]) => v).sort((a, b) => a - b)
  const n = sorted.length
  const median = n % 2 ? sorted[(n - 1) / 2] : ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
  const baseline = (prior * fallback + n * median) / (prior + n)
  const level = (amount) => {
    if (amount == null) return 2
    const r = amount / baseline
    return r < 0.5 ? 1 : r < 1.25 ? 2 : r < 2 ? 3 : 4
  }
  return { baseline, level }
}
