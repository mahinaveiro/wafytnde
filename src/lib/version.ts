export const APP_VERSION = '0.4.1'

export const APP_RELEASE_DATE = '2026-04-30'

export const APP_CHANGELOG = [
  'Removed unused Paper theme',
  'Improved Warm Retro pinned sidebar card styling',
  'Added Pixel Pink Retro to theme toggle cycle',
  'Added Toggle theme action to mobile command menu',
  'Updated user manual theme guidance',
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
