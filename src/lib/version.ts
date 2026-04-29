export const APP_VERSION = '0.3.0'

export const APP_RELEASE_DATE = '2026-04-30'

export const APP_CHANGELOG = [
  'Added mobile Desk pinned content drawer',
  'Added mobile Desk command drawer',
  'Improved pinned item sidebar navigation',
  'Standardized bundle and project action buttons',
  'Removed unused favorite controls',
  'Added bundle back navigation',
  'Updated user manual for mobile Desk actions',
] as const

export function formatAppReleaseDate(date = APP_RELEASE_DATE) {
  const [year, month, day] = date.split('-').map(Number)

  if (!year || !month || !day) return date

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}
