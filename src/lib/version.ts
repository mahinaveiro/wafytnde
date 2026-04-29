export const APP_VERSION = '0.2.1'

export const APP_RELEASE_DATE = '2026-04-30'

export const APP_CHANGELOG = [
  'Fixed mobile appearance personalization controls',
  'Removed duplicate color swatches from personalization rows',
  'Improved panel tint enable and no tint states',
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
