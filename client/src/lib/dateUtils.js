/**
 * Returns local date string YYYY-MM-DD without timezone conversion.
 * Use this instead of date.toISOString().split('T')[0] which uses UTC.
 */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Returns tomorrow's local date string YYYY-MM-DD
 */
export function tomorrowDateKey() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateKey(d)
}
