export const APP_VERSION = '0.4.0'

export const APP_RELEASE_DATE = '2026-04-30'

export const APP_CHANGELOG = [
  'Added Pixel Pink Retro appearance theme',
  'Improved theme variable support for optional skins',
  'Fixed Todo List Save and Cancel actions',
  'Updated user manual with theme and todo editing guidance',
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
