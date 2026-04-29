export const APP_VERSION = '0.1.2'

export const APP_RELEASE_DATE = '2026-04-29'

export const APP_CHANGELOG = [
  'Improved dark mode readability',
  'Added update notification flow',
  'Polished mobile layout spacing',
  'Fixed backup import validation',
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
