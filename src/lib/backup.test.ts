import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllData,
  createBundle,
  createNote,
  createProject,
  createQuickCapture,
  createTodoItem,
  createTodoList,
  db,
  mergeImportedData,
} from './db'
import { backupFilename, createBackup, parseBackup, previewBackup } from './backup'
import { resetLocalSettings } from './settings'

describe('backup and local storage flows', () => {
  beforeEach(async () => {
    await clearAllData()
    resetLocalSettings()
  })

  it('exports a versioned backup with every main table', async () => {
    const bundle = await createBundle('Game Ideas')
    const project = await createProject(bundle.id, 'Village Map')
    const note = await createNote({
      projectId: project.id,
      title: 'Bridge route',
      body: 'Sketch the river crossing.',
      tags: ['map'],
    })
    const list = await createTodoList('note', note.id, 'Map tasks')
    await createTodoItem(list.id, 'Mark footpaths')
    await createQuickCapture('A night market corner')

    const backup = await createBackup()
    const parsed = parseBackup(JSON.stringify(backup))
    const preview = previewBackup(parsed)

    expect(parsed.app).toBe('Wafytnde')
    expect(parsed.data.bundles).toHaveLength(1)
    expect(parsed.data.projects).toHaveLength(1)
    expect(parsed.data.notes).toHaveLength(1)
    expect(parsed.data.todoLists).toHaveLength(1)
    expect(parsed.data.todoItems).toHaveLength(1)
    expect(parsed.data.quickCaptures).toHaveLength(1)
    expect(preview.todos).toBe(2)
    expect(backupFilename(new Date('2026-04-28T16:05:00.000Z'))).toMatch(
      /^wafytnde-backup-2026-04-28-\d{2}-\d{2}\.json$/,
    )
  })

  it('merges duplicate backup IDs while preserving relationships', async () => {
    const bundle = await createBundle('Codanela')
    const project = await createProject(bundle.id, 'Homepage Redesign')
    const note = await createNote({ projectId: project.id, title: 'Pricing notes' })
    const list = await createTodoList('note', note.id, 'Launch tasks')
    await createTodoItem(list.id, 'Write copy')

    const backup = await createBackup()
    await mergeImportedData(backup.data)

    const bundles = await db.bundles.toArray()
    const projects = await db.projects.toArray()
    const notes = await db.notes.toArray()
    const todoLists = await db.todoLists.toArray()
    const todoItems = await db.todoItems.toArray()
    const copiedProject = projects.find((item) => item.id !== project.id)
    const copiedNote = notes.find((item) => item.id !== note.id)
    const copiedList = todoLists.find((item) => item.id !== list.id)
    const copiedItem = todoItems.find((item) => item.todoListId === copiedList?.id)

    expect(bundles).toHaveLength(2)
    expect(projects).toHaveLength(2)
    expect(notes).toHaveLength(2)
    expect(todoLists).toHaveLength(2)
    expect(todoItems).toHaveLength(2)
    expect(copiedProject?.bundleId).not.toBe(bundle.id)
    expect(copiedNote?.projectId).toBe(copiedProject?.id)
    expect(copiedList?.parentId).toBe(copiedNote?.id)
    expect(copiedItem).toBeTruthy()
  })
})
