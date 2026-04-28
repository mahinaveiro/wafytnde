import {
  APP_NAME,
  SCHEMA_VERSION,
  type BackupData,
  type BackupPreview,
  type WafytndeBackup,
} from './types'
import { db, mergeImportedData, replaceAllRecords } from './db'
import { exportLocalSettings, importLocalSettings } from './settings'

export async function createBackup(): Promise<WafytndeBackup> {
  const [bundles, projects, notes, todoLists, todoItems, quickCaptures] =
    await Promise.all([
      db.bundles.toArray(),
      db.projects.toArray(),
      db.notes.toArray(),
      db.todoLists.toArray(),
      db.todoItems.toArray(),
      db.quickCaptures.toArray(),
    ])

  return {
    app: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      bundles,
      projects,
      notes,
      todoLists,
      todoItems,
      quickCaptures,
      settings: exportLocalSettings(),
    },
  }
}

export function backupFilename(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `wafytnde-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`
}

export function downloadBackup(backup: WafytndeBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backupFilename(new Date(backup.exportedAt))
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseBackup(raw: string): WafytndeBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  assertBackup(parsed)
  return parsed
}

export function assertBackup(value: unknown): asserts value is WafytndeBackup {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup file is empty or malformed.')
  }
  const backup = value as Partial<WafytndeBackup>
  if (backup.app !== APP_NAME) {
    throw new Error('This file is not a Wafytnde backup.')
  }
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup uses an unsupported schema version.')
  }
  const data = backup.data as Partial<BackupData> | undefined
  if (!data) throw new Error('Backup data is missing.')
  for (const key of [
    'bundles',
    'projects',
    'notes',
    'todoLists',
    'todoItems',
    'quickCaptures',
  ] as const) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Backup data is missing ${key}.`)
    }
  }
  if (!data.settings || typeof data.settings !== 'object') {
    throw new Error('Backup settings are missing.')
  }
}

export function previewBackup(backup: WafytndeBackup): BackupPreview {
  return {
    exportedAt: backup.exportedAt,
    bundles: backup.data.bundles.length,
    projects: backup.data.projects.length,
    notes: backup.data.notes.length,
    todos: backup.data.todoLists.length + backup.data.todoItems.length,
    captures: backup.data.quickCaptures.length,
  }
}

export async function importBackup(
  backup: WafytndeBackup,
  mode: 'merge' | 'replace',
) {
  assertBackup(backup)
  if (mode === 'replace') {
    await replaceAllRecords(backup.data)
  } else {
    await mergeImportedData(backup.data)
  }
  importLocalSettings(backup.data.settings)
}
