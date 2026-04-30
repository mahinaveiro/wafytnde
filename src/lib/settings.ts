import type { AppSettings, ThemeMode } from './types'

const SETTINGS_KEY = 'wafytnde.settings.v1'
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const THEME_MODES = new Set<ThemeMode>(['warm', 'terminal', 'pixel-pink'])

export const defaultSettings: AppSettings = {
  theme: 'warm',
  fontMode: 'sans',
  compactMode: false,
  reduceMotion: false,
  onboardingComplete: false,
  sidebarCollapsed: false,
  lastView: 'dashboard',
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim()
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toLowerCase() : undefined
}

export function isValidHexColor(value: string) {
  return Boolean(normalizeHexColor(value))
}

export function normalizeTheme(value: unknown): ThemeMode {
  return typeof value === 'string' && THEME_MODES.has(value as ThemeMode) ? (value as ThemeMode) : 'warm'
}

export function normalizeAppearanceOverrides(value: unknown): AppSettings['appearanceOverrides'] {
  if (!value || typeof value !== 'object') return undefined

  const source = value as Record<string, unknown>
  const next: NonNullable<AppSettings['appearanceOverrides']> = {}
  const topBarColor = typeof source.topBarColor === 'string' ? normalizeHexColor(source.topBarColor) : undefined
  const accentColor = typeof source.accentColor === 'string' ? normalizeHexColor(source.accentColor) : undefined
  const primaryTextColor =
    typeof source.primaryTextColor === 'string' ? normalizeHexColor(source.primaryTextColor) : undefined
  const panelTintColor =
    typeof source.panelTintColor === 'string' ? normalizeHexColor(source.panelTintColor) : undefined

  if (topBarColor) next.topBarColor = topBarColor
  if (accentColor) next.accentColor = accentColor
  if (primaryTextColor) next.primaryTextColor = primaryTextColor
  if (panelTintColor) next.panelTintColor = panelTintColor

  return Object.keys(next).length ? next : undefined
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...defaultSettings, ...settings, theme: normalizeTheme(settings.theme) }
  const appearanceOverrides = normalizeAppearanceOverrides(settings.appearanceOverrides)

  if (appearanceOverrides) {
    next.appearanceOverrides = appearanceOverrides
  } else {
    delete next.appearanceOverrides
  }

  return next
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw)
    const normalized = normalizeSettings(parsed)
    if (parsed?.theme !== normalized.theme) saveSettings(normalized)
    return normalized
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalizeSettings({ ...getSettings(), ...patch })
  saveSettings(next)
  return next
}

export function exportLocalSettings(): AppSettings {
  return getSettings()
}

export function importLocalSettings(settings: Partial<AppSettings>) {
  saveSettings(normalizeSettings(settings))
}

export function resetLocalSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}
