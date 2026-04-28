import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_WORKSPACE_ID,
  type BackupData,
  type BaseRecord,
  type Bundle,
  type EntityType,
  type Note,
  type ParentType,
  type Project,
  type ProjectStatus,
  type QuickCapture,
  type TodoItem,
  type TodoList,
} from './types'

type TableName =
  | 'bundles'
  | 'projects'
  | 'notes'
  | 'todoLists'
  | 'todoItems'
  | 'quickCaptures'

export class WafytndeDatabase extends Dexie {
  bundles!: Table<Bundle, string>
  projects!: Table<Project, string>
  notes!: Table<Note, string>
  todoLists!: Table<TodoList, string>
  todoItems!: Table<TodoItem, string>
  quickCaptures!: Table<QuickCapture, string>

  constructor(name = 'wafytnde-v1') {
    super(name)
    this.version(1).stores({
      bundles:
        'id, workspaceId, title, updatedAt, archivedAt, deletedAt, order, pinned, favorite',
      projects:
        'id, workspaceId, bundleId, title, status, updatedAt, archivedAt, deletedAt, order, pinned',
      notes:
        'id, workspaceId, bundleId, projectId, title, updatedAt, archivedAt, deletedAt, order, pinned, favorite, *tags',
      todoLists:
        'id, workspaceId, parentType, parentId, updatedAt, archivedAt, deletedAt, order',
      todoItems:
        'id, workspaceId, todoListId, completed, updatedAt, deletedAt, order',
      quickCaptures:
        'id, workspaceId, title, updatedAt, archivedAt, deletedAt, order, processedAt',
    })
    this.version(2).stores({
      bundles:
        'id, workspaceId, title, updatedAt, archivedAt, deletedAt, order, pinned, favorite',
      projects:
        'id, workspaceId, bundleId, title, status, updatedAt, archivedAt, deletedAt, order, pinned',
      notes:
        'id, workspaceId, bundleId, projectId, title, updatedAt, archivedAt, deletedAt, order, pinned, favorite, *tags',
      todoLists:
        'id, workspaceId, parentType, parentId, [parentType+parentId], updatedAt, archivedAt, deletedAt, order',
      todoItems:
        'id, workspaceId, todoListId, completed, updatedAt, archivedAt, deletedAt, order',
      quickCaptures:
        'id, workspaceId, title, updatedAt, archivedAt, deletedAt, order, processedAt',
    })
  }
}

export const db = new WafytndeDatabase()

export function makeId(prefix: EntityType): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${random}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function activeOnly<T extends BaseRecord>(items: T[]): T[] {
  return items.filter((item) => !item.deletedAt && !item.archivedAt)
}

export function archivedOnly<T extends BaseRecord>(items: T[]): T[] {
  return items.filter((item) => !item.deletedAt && item.archivedAt)
}

export function deletedOnly<T extends BaseRecord>(items: T[]): T[] {
  return items.filter((item) => item.deletedAt)
}

function baseRecord(id: string): BaseRecord {
  const stamp = nowIso()
  return {
    id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    createdAt: stamp,
    updatedAt: stamp,
    order: Date.now(),
  }
}

function normalizeTitle(value: string, fallback: string) {
  const title = value.trim()
  return title.length > 0 ? title : fallback
}

export async function createBundle(title = 'Untitled bundle') {
  const bundle: Bundle = {
    ...baseRecord(makeId('bundle')),
    type: 'bundle',
    title: normalizeTitle(title, 'Untitled bundle'),
    description: '',
    color: '#f0c24b',
    visualMarker: 'square',
    pinned: false,
    favorite: false,
  }
  await db.bundles.add(bundle)
  return bundle
}

export async function updateBundle(id: string, patch: Partial<Bundle>) {
  await db.bundles.update(id, { ...patch, updatedAt: nowIso() })
}

export async function createProject(bundleId: string, title = 'Untitled project') {
  const project: Project = {
    ...baseRecord(makeId('project')),
    type: 'project',
    bundleId,
    title: normalizeTitle(title, 'Untitled project'),
    description: '',
    status: 'idea',
    color: '#8fbf9f',
    pinned: false,
  }
  await db.projects.add(project)
  await touchParent('bundle', bundleId)
  return project
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: nowIso() })
}

export async function createNote(input: {
  bundleId?: string
  projectId?: string
  title?: string
  body?: string
  tags?: string[]
}) {
  let bundleId = input.bundleId
  if (!bundleId && input.projectId) {
    const project = await db.projects.get(input.projectId)
    bundleId = project?.bundleId
  }
  const note: Note = {
    ...baseRecord(makeId('note')),
    type: 'note',
    bundleId,
    projectId: input.projectId,
    title: normalizeTitle(input.title ?? '', 'Untitled note'),
    body: input.body ?? '',
    tags: input.tags ?? [],
    favorite: false,
    pinned: false,
    lastSavedAt: nowIso(),
  }
  await db.notes.add(note)
  if (input.projectId) await touchParent('project', input.projectId)
  if (bundleId) await touchParent('bundle', bundleId)
  return note
}

export async function updateNote(id: string, patch: Partial<Note>) {
  const stamp = nowIso()
  await db.notes.update(id, { ...patch, updatedAt: stamp, lastSavedAt: stamp })
}

export async function createTodoList(
  parentType: ParentType,
  parentId: string,
  title = 'New todo list',
) {
  const todoList: TodoList = {
    ...baseRecord(makeId('todoList')),
    type: 'todoList',
    parentType,
    parentId,
    title: normalizeTitle(title, 'New todo list'),
  }
  await db.todoLists.add(todoList)
  await touchParent(parentType, parentId)
  return todoList
}

export async function updateTodoList(id: string, patch: Partial<TodoList>) {
  await db.todoLists.update(id, { ...patch, updatedAt: nowIso() })
}

export async function createTodoItem(
  todoListId: string,
  text: string,
  patch: Partial<TodoItem> = {},
) {
  const item: TodoItem = {
    ...baseRecord(makeId('todoItem')),
    type: 'todoItem',
    todoListId,
    text: normalizeTitle(text, 'Untitled task'),
    completed: false,
    ...patch,
  }
  await db.todoItems.add(item)
  await db.todoLists.update(todoListId, { updatedAt: nowIso() })
  return item
}

export async function updateTodoItem(id: string, patch: Partial<TodoItem>) {
  await db.todoItems.update(id, { ...patch, updatedAt: nowIso() })
}

export async function createQuickCapture(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())
  const capture: QuickCapture = {
    ...baseRecord(makeId('quickCapture')),
    type: 'quickCapture',
    title: normalizeTitle(firstLine ?? '', 'Untitled capture'),
    body: text,
  }
  await db.quickCaptures.add(capture)
  return capture
}

export async function updateQuickCapture(id: string, patch: Partial<QuickCapture>) {
  await db.quickCaptures.update(id, { ...patch, updatedAt: nowIso() })
}

export async function convertCaptureToNote(
  captureId: string,
  target: { type: 'bundle' | 'project' | 'note'; id: string },
) {
  const capture = await db.quickCaptures.get(captureId)
  if (!capture) throw new Error('Capture was not found.')
  if (target.type === 'note') {
    const note = await db.notes.get(target.id)
    if (!note) throw new Error('Note was not found.')
    const separator = note.body.trim().length > 0 ? '\n\n' : ''
    await updateNote(note.id, {
      body: `${note.body}${separator}${capture.body}`,
      title: note.title || capture.title,
    })
  } else {
    await createNote({
      bundleId: target.type === 'bundle' ? target.id : undefined,
      projectId: target.type === 'project' ? target.id : undefined,
      title: capture.title,
      body: capture.body,
    })
  }
  await updateQuickCapture(capture.id, {
    processedAt: nowIso(),
    convertedToType: target.type,
    convertedToId: target.id,
  })
}

export async function convertCaptureToTodo(captureId: string, todoListId: string) {
  const capture = await db.quickCaptures.get(captureId)
  if (!capture) throw new Error('Capture was not found.')
  await createTodoItem(todoListId, capture.title, { notes: capture.body })
  await updateQuickCapture(capture.id, {
    processedAt: nowIso(),
    convertedToType: 'todoList',
    convertedToId: todoListId,
  })
}

export async function archiveRecord(type: EntityType, id: string) {
  const patch = { archivedAt: nowIso(), deletedAt: undefined, updatedAt: nowIso() }
  await tableFor(type).update(id, patch)
  if (type === 'project') {
    await db.projects.update(id, { status: 'archived' satisfies ProjectStatus })
  }
}

export async function restoreRecord(type: EntityType, id: string) {
  await tableFor(type).update(id, {
    archivedAt: undefined,
    deletedAt: undefined,
    updatedAt: nowIso(),
  })
  if (type === 'project') {
    const project = await db.projects.get(id)
    if (project?.status === 'archived') {
      await db.projects.update(id, { status: 'paused' satisfies ProjectStatus })
    }
  }
}

export async function softDeleteRecord(type: EntityType, id: string) {
  await tableFor(type).update(id, {
    archivedAt: undefined,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
  })
}

export async function permanentlyDeleteRecord(type: EntityType, id: string) {
  if (type === 'bundle') {
    const projects = await db.projects.where('bundleId').equals(id).toArray()
    const notes = await db.notes.where('bundleId').equals(id).toArray()
    const directLists = await db.todoLists
      .where('[parentType+parentId]')
      .equals(['bundle', id])
      .toArray()
      .catch(() => db.todoLists.where('parentId').equals(id).toArray())
    await Promise.all(projects.map((project) => permanentlyDeleteRecord('project', project.id)))
    await Promise.all(notes.map((note) => permanentlyDeleteRecord('note', note.id)))
    await Promise.all(directLists.map((list) => permanentlyDeleteRecord('todoList', list.id)))
  }
  if (type === 'project') {
    const notes = await db.notes.where('projectId').equals(id).toArray()
    const lists = await db.todoLists.where('parentId').equals(id).toArray()
    await Promise.all(notes.map((note) => permanentlyDeleteRecord('note', note.id)))
    await Promise.all(lists.map((list) => permanentlyDeleteRecord('todoList', list.id)))
  }
  if (type === 'note') {
    const lists = await db.todoLists.where('parentId').equals(id).toArray()
    await Promise.all(lists.map((list) => permanentlyDeleteRecord('todoList', list.id)))
  }
  if (type === 'todoList') {
    await db.todoItems.where('todoListId').equals(id).delete()
  }
  await tableFor(type).delete(id)
}

export async function clearAllData() {
  await db.transaction(
    'rw',
    [db.bundles, db.projects, db.notes, db.todoLists, db.todoItems, db.quickCaptures],
    async () => {
      await Promise.all([
        db.bundles.clear(),
        db.projects.clear(),
        db.notes.clear(),
        db.todoLists.clear(),
        db.todoItems.clear(),
        db.quickCaptures.clear(),
      ])
    },
  )
}

export async function replaceAllRecords(data: BackupData) {
  await clearAllData()
  await bulkPutData(data)
}

export async function mergeImportedData(data: BackupData) {
  const bundleIds = new Set(await db.bundles.toCollection().primaryKeys())
  const projectIds = new Set(await db.projects.toCollection().primaryKeys())
  const noteIds = new Set(await db.notes.toCollection().primaryKeys())
  const todoListIds = new Set(await db.todoLists.toCollection().primaryKeys())
  const todoItemIds = new Set(await db.todoItems.toCollection().primaryKeys())
  const captureIds = new Set(await db.quickCaptures.toCollection().primaryKeys())

  const bundleMap = mapIds(data.bundles, bundleIds, 'bundle')
  const projectMap = mapIds(data.projects, projectIds, 'project')
  const noteMap = mapIds(data.notes, noteIds, 'note')
  const todoListMap = mapIds(data.todoLists, todoListIds, 'todoList')
  const todoItemMap = mapIds(data.todoItems, todoItemIds, 'todoItem')
  const captureMap = mapIds(data.quickCaptures, captureIds, 'quickCapture')

  const mapped: BackupData = {
    ...data,
    bundles: data.bundles.map((record) => ({
      ...record,
      id: bundleMap.get(record.id) ?? record.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
    projects: data.projects.map((record) => ({
      ...record,
      id: projectMap.get(record.id) ?? record.id,
      bundleId: bundleMap.get(record.bundleId) ?? record.bundleId,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
    notes: data.notes.map((record) => ({
      ...record,
      id: noteMap.get(record.id) ?? record.id,
      bundleId: record.bundleId ? bundleMap.get(record.bundleId) ?? record.bundleId : undefined,
      projectId: record.projectId ? projectMap.get(record.projectId) ?? record.projectId : undefined,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
    todoLists: data.todoLists.map((record) => ({
      ...record,
      id: todoListMap.get(record.id) ?? record.id,
      parentId: remapParent(record.parentType, record.parentId, bundleMap, projectMap, noteMap),
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
    todoItems: data.todoItems.map((record) => ({
      ...record,
      id: todoItemMap.get(record.id) ?? record.id,
      todoListId: todoListMap.get(record.todoListId) ?? record.todoListId,
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
    quickCaptures: data.quickCaptures.map((record) => ({
      ...record,
      id: captureMap.get(record.id) ?? record.id,
      convertedToId: remapConvertedId(record.convertedToType, record.convertedToId, {
        bundleMap,
        projectMap,
        noteMap,
        todoListMap,
      }),
      workspaceId: DEFAULT_WORKSPACE_ID,
    })),
  }
  await bulkPutData(mapped)
}

async function bulkPutData(data: BackupData) {
  await db.transaction(
    'rw',
    [db.bundles, db.projects, db.notes, db.todoLists, db.todoItems, db.quickCaptures],
    async () => {
      await db.bundles.bulkPut(data.bundles)
      await db.projects.bulkPut(data.projects)
      await db.notes.bulkPut(data.notes)
      await db.todoLists.bulkPut(data.todoLists)
      await db.todoItems.bulkPut(data.todoItems)
      await db.quickCaptures.bulkPut(data.quickCaptures)
    },
  )
}

function mapIds<T extends BaseRecord>(
  records: T[],
  existingIds: Set<unknown>,
  prefix: EntityType,
) {
  const map = new Map<string, string>()
  for (const record of records) {
    if (existingIds.has(record.id)) {
      map.set(record.id, makeId(prefix))
    }
  }
  return map
}

function remapParent(
  parentType: ParentType,
  parentId: string,
  bundleMap: Map<string, string>,
  projectMap: Map<string, string>,
  noteMap: Map<string, string>,
) {
  if (parentType === 'bundle') return bundleMap.get(parentId) ?? parentId
  if (parentType === 'project') return projectMap.get(parentId) ?? parentId
  return noteMap.get(parentId) ?? parentId
}

function remapConvertedId(
  type: QuickCapture['convertedToType'],
  id: string | undefined,
  maps: {
    bundleMap: Map<string, string>
    projectMap: Map<string, string>
    noteMap: Map<string, string>
    todoListMap: Map<string, string>
  },
) {
  if (!type || !id) return id
  if (type === 'bundle') return maps.bundleMap.get(id) ?? id
  if (type === 'project') return maps.projectMap.get(id) ?? id
  if (type === 'note') return maps.noteMap.get(id) ?? id
  return maps.todoListMap.get(id) ?? id
}

function tableFor(type: EntityType) {
  const tables: Record<EntityType, Table<BaseRecord, string>> = {
    bundle: db.bundles as Table<BaseRecord, string>,
    project: db.projects as Table<BaseRecord, string>,
    note: db.notes as Table<BaseRecord, string>,
    todoList: db.todoLists as Table<BaseRecord, string>,
    todoItem: db.todoItems as Table<BaseRecord, string>,
    quickCapture: db.quickCaptures as Table<BaseRecord, string>,
  }
  return tables[type]
}

async function touchParent(parentType: ParentType, parentId: string) {
  const stamp = nowIso()
  if (parentType === 'bundle') await db.bundles.update(parentId, { updatedAt: stamp })
  if (parentType === 'project') await db.projects.update(parentId, { updatedAt: stamp })
  if (parentType === 'note') await db.notes.update(parentId, { updatedAt: stamp })
}

export async function estimateStorageUsage() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    return navigator.storage.estimate()
  }
  return { usage: undefined, quota: undefined }
}

export function tableNameForType(type: EntityType): TableName {
  const map: Record<EntityType, TableName> = {
    bundle: 'bundles',
    project: 'projects',
    note: 'notes',
    todoList: 'todoLists',
    todoItem: 'todoItems',
    quickCapture: 'quickCaptures',
  }
  return map[type]
}
