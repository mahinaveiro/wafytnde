import type { AppSettings } from './types'

const SETTINGS_KEY = 'wafytnde.settings.v1'

export const defaultSettings: AppSettings = {
  theme: 'warm',
  fontMode: 'sans',
  compactMode: false,
  reduceMotion: false,
  onboardingComplete: false,
  sidebarCollapsed: false,
  lastView: 'dashboard',
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  saveSettings(next)
  return next
}

export function exportLocalSettings(): AppSettings {
  return getSettings()
}

export function importLocalSettings(settings: Partial<AppSettings>) {
  saveSettings({ ...defaultSettings, ...settings })
}

export function resetLocalSettings() {
  localStorage.removeItem(SETTINGS_KEY)
}
