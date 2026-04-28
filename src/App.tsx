import { useLiveQuery } from 'dexie-react-hooks'
import { clsx } from 'clsx'
import {
  Archive,
  BookOpen,
  CheckSquare,
  ChevronLeft,
  Command,
  Database,
  Download,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Moon,
  PanelLeftClose,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  archiveRecord,
  clearAllData,
  convertCaptureToNote,
  convertCaptureToTodo,
  createBundle,
  createNote,
  createProject,
  createQuickCapture,
  createTodoItem,
  createTodoList,
  db,
  estimateStorageUsage,
  permanentlyDeleteRecord,
  restoreRecord,
  softDeleteRecord,
  updateBundle,
  updateNote,
  updateProject,
  updateTodoItem,
  updateTodoList,
} from './lib/db'
import {
  createBackup,
  downloadBackup,
  importBackup,
  parseBackup,
  previewBackup,
} from './lib/backup'
import { searchAll } from './lib/search'
import {
  defaultSettings,
  getSettings,
  patchSettings,
  resetLocalSettings,
} from './lib/settings'
import {
  APP_NAME,
  type AppSettings,
  type BackupPreview,
  type Bundle,
  type EntityType,
  type Note,
  type Project,
  type QuickCapture,
  type SearchResult,
  type TodoItem,
  type TodoList,
  type WafytndeBackup,
} from './lib/types'

type ViewKey =
  | 'dashboard'
  | 'inbox'
  | 'bundles'
  | 'bundle'
  | 'project'
  | 'note'
  | 'search'
  | 'archive'
  | 'trash'
  | 'settings'

type LoadedData = {
  bundles: Bundle[]
  projects: Project[]
  notes: Note[]
  todoLists: TodoList[]
  todoItems: TodoItem[]
  quickCaptures: QuickCapture[]
}

type ConfirmState = {
  title: string
  message: string
  confirmLabel: string
  tone?: 'danger' | 'normal'
  onConfirm: () => Promise<void> | void
}

type Toast = {
  id: number
  text: string
}

type ImportState = {
  fileName?: string
  backup?: WafytndeBackup
  preview?: BackupPreview
  error?: string
  busy: boolean
}

const emptyData: LoadedData = {
  bundles: [],
  projects: [],
  notes: [],
  todoLists: [],
  todoItems: [],
  quickCaptures: [],
}

const viewKeys = new Set<ViewKey>([
  'dashboard',
  'inbox',
  'bundles',
  'bundle',
  'project',
  'note',
  'search',
  'archive',
  'trash',
  'settings',
])

const navItems: Array<{
  view: ViewKey
  label: string
  icon: typeof LayoutDashboard
}> = [
  { view: 'dashboard', label: 'Desk', icon: LayoutDashboard },
  { view: 'inbox', label: 'Inbox', icon: Inbox },
  { view: 'bundles', label: 'Bundles', icon: Folder },
  { view: 'archive', label: 'Archive', icon: Archive },
  { view: 'trash', label: 'Trash', icon: Trash2 },
  { view: 'settings', label: 'Settings', icon: Settings },
]

const entityLabels: Record<EntityType, string> = {
  bundle: 'Bundle',
  project: 'Project',
  note: 'Note',
  todoList: 'Todo list',
  todoItem: 'Todo item',
  quickCapture: 'Capture',
}

function isViewKey(value: string): value is ViewKey {
  return viewKeys.has(value as ViewKey)
}

function isActive(record: { archivedAt?: string; deletedAt?: string }) {
  return !record.archivedAt && !record.deletedAt
}

function isArchived(record: { archivedAt?: string; deletedAt?: string }) {
  return Boolean(record.archivedAt && !record.deletedAt)
}

function isDeleted(record: { deletedAt?: string }) {
  return Boolean(record.deletedAt)
}

function byOrder<T extends { order: number; updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => a.order - b.order || b.updatedAt.localeCompare(a.updatedAt))
}

function byUpdated<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function byPinnedThenUpdated<T extends { pinned?: boolean; updatedAt: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function displayDate(value?: string) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function oneLine(value: string, fallback = 'Nothing written yet.') {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return fallback
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}

function readableStorage(value?: number) {
  if (!value) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function activeTodoItems(listId: string, items: TodoItem[]) {
  return byOrder(items.filter((item) => item.todoListId === listId && isActive(item)))
}

function itemParentLabel(list: TodoList, data: LoadedData) {
  if (list.parentType === 'bundle') {
    return data.bundles.find((bundle) => bundle.id === list.parentId)?.title ?? 'Bundle'
  }
  if (list.parentType === 'project') {
    return data.projects.find((project) => project.id === list.parentId)?.title ?? 'Project'
  }
  return data.notes.find((note) => note.id === list.parentId)?.title ?? 'Note'
}

function countOpenTodos(lists: TodoList[], items: TodoItem[]) {
  const listIds = new Set(lists.map((list) => list.id))
  return items.filter((item) => listIds.has(item.todoListId) && isActive(item) && !item.completed)
    .length
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings())
  const [view, setView] = useState<ViewKey>(() =>
    isViewKey(getSettings().lastView) ? (getSettings().lastView as ViewKey) : 'dashboard',
  )
  const [selectedBundleId, setSelectedBundleId] = useState<string>()
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [selectedNoteId, setSelectedNoteId] = useState<string>()
  const [searchQuery, setSearchQuery] = useState('')
  const [bundleTab, setBundleTab] = useState<'overview' | 'notes' | 'projects' | 'todos' | 'archive'>(
    'overview',
  )
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [online, setOnline] = useState(() => navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [storage, setStorage] = useState<StorageEstimate>({})
  const [exportStatus, setExportStatus] = useState<'idle' | 'collecting' | 'packing' | 'ready'>(
    'idle',
  )
  const [importState, setImportState] = useState<ImportState>({ busy: false })
  const toastIdRef = useRef(0)

  const data = useLiveQuery(async () => {
    const [bundles, projects, notes, todoLists, todoItems, quickCaptures] = await Promise.all([
      db.bundles.toArray(),
      db.projects.toArray(),
      db.notes.toArray(),
      db.todoLists.toArray(),
      db.todoItems.toArray(),
      db.quickCaptures.toArray(),
    ])
    return { bundles, projects, notes, todoLists, todoItems, quickCaptures }
  }, []) ?? emptyData

  const activeBundles = useMemo(() => byPinnedThenUpdated(data.bundles.filter(isActive)), [data.bundles])
  const activeProjects = useMemo(
    () => byPinnedThenUpdated(data.projects.filter(isActive)),
    [data.projects],
  )
  const activeNotes = useMemo(() => byPinnedThenUpdated(data.notes.filter(isActive)), [data.notes])
  const activeTodoLists = useMemo(
    () => byUpdated(data.todoLists.filter(isActive)),
    [data.todoLists],
  )
  const activeCaptures = useMemo(
    () => byUpdated(data.quickCaptures.filter((capture) => isActive(capture) && !capture.processedAt)),
    [data.quickCaptures],
  )
  const effectiveBundleId = selectedBundleId ?? activeBundles[0]?.id
  const selectedBundle = data.bundles.find((bundle) => bundle.id === effectiveBundleId)
  const selectedProject = data.projects.find((project) => project.id === selectedProjectId)
  const selectedNote = data.notes.find((note) => note.id === selectedNoteId)
  const searchResults = useMemo(() => searchAll(searchQuery, data), [searchQuery, data])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.font = settings.fontMode
    document.documentElement.dataset.compact = String(settings.compactMode)
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion)
  }, [settings])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onOfflineReady = () => {
      setOfflineReady(true)
      pushToast('Offline app shell is ready.')
    }
    const onUpdateReady = () => {
      setUpdateReady(true)
      pushToast('A fresh app shell is waiting.')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('wafytnde:offline-ready', onOfflineReady)
    window.addEventListener('wafytnde:update-ready', onUpdateReady)
    refreshStorage()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('wafytnde:offline-ready', onOfflineReady)
      window.removeEventListener('wafytnde:update-ready', onUpdateReady)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (mod && event.key.toLowerCase() === 'n' && event.shiftKey) {
        event.preventDefault()
        void handleCreateBundle()
      } else if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void handleCreateNote()
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        pushToast('Current editor is saved automatically.')
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        navigate('search')
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        void handleExport()
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setQuickCaptureOpen(false)
      }
      if (event.key === 'Delete' && selectedNote && !isTypingTarget(event.target)) {
        event.preventDefault()
        askDelete('note', selectedNote.id, selectedNote.title)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function pushToast(text: string) {
    const id = toastIdRef.current + 1
    toastIdRef.current = id
    setToasts((current) => [...current, { id, text }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

  function navigate(nextView: ViewKey) {
    setView(nextView)
    setSettings(patchSettings({ lastView: nextView }))
  }

  function patchAppSettings(patch: Partial<AppSettings>) {
    setSettings(patchSettings(patch))
  }

  async function refreshStorage() {
    setStorage(await estimateStorageUsage())
  }

  function showConfirm(state: ConfirmState) {
    setConfirmState(state)
  }

  async function ensureBundle(title = 'Quick Notes') {
    if (selectedBundle && isActive(selectedBundle)) return selectedBundle
    if (selectedProject) {
      const projectBundle = data.bundles.find((bundle) => bundle.id === selectedProject.bundleId)
      if (projectBundle && isActive(projectBundle)) return projectBundle
    }
    if (activeBundles[0]) return activeBundles[0]
    const bundle = await createBundle(title)
    setSelectedBundleId(bundle.id)
    return bundle
  }

  function openBundle(bundle: Bundle) {
    setSelectedBundleId(bundle.id)
    setSelectedProjectId(undefined)
    setSelectedNoteId(undefined)
    setBundleTab('overview')
    navigate('bundle')
  }

  function openProject(project: Project) {
    setSelectedBundleId(project.bundleId)
    setSelectedProjectId(project.id)
    setSelectedNoteId(undefined)
    navigate('project')
  }

  function openNote(note: Note) {
    setSelectedNoteId(note.id)
    if (note.projectId) {
      const project = data.projects.find((item) => item.id === note.projectId)
      setSelectedProjectId(project?.id)
      setSelectedBundleId(project?.bundleId ?? note.bundleId)
    } else {
      setSelectedProjectId(undefined)
      setSelectedBundleId(note.bundleId)
    }
    navigate('note')
  }

  function openSearchResult(result: SearchResult) {
    if (result.type === 'bundle') {
      const bundle = data.bundles.find((item) => item.id === result.id)
      if (bundle) openBundle(bundle)
    }
    if (result.type === 'project') {
      const project = data.projects.find((item) => item.id === result.id)
      if (project) openProject(project)
    }
    if (result.type === 'note') {
      const note = data.notes.find((item) => item.id === result.id)
      if (note) openNote(note)
    }
    if (result.type === 'todoList') {
      const list = data.todoLists.find((item) => item.id === result.id)
      if (list) openTodoParent(list)
    }
    if (result.type === 'todoItem') {
      const item = data.todoItems.find((todo) => todo.id === result.id)
      const list = item ? data.todoLists.find((todoList) => todoList.id === item.todoListId) : undefined
      if (list) openTodoParent(list)
    }
    if (result.type === 'quickCapture') navigate('inbox')
  }

  function openTodoParent(list: TodoList) {
    if (list.parentType === 'bundle') {
      const bundle = data.bundles.find((item) => item.id === list.parentId)
      if (bundle) openBundle(bundle)
    }
    if (list.parentType === 'project') {
      const project = data.projects.find((item) => item.id === list.parentId)
      if (project) openProject(project)
    }
    if (list.parentType === 'note') {
      const note = data.notes.find((item) => item.id === list.parentId)
      if (note) openNote(note)
    }
  }

  async function handleCreateBundle(title = 'Untitled bundle') {
    const bundle = await createBundle(title)
    openBundle(bundle)
    pushToast('Bundle created.')
  }

  async function handleCreateProject(bundleId?: string, title = 'Untitled project') {
    const bundle = bundleId
      ? data.bundles.find((item) => item.id === bundleId) ?? (await ensureBundle())
      : await ensureBundle()
    const project = await createProject(bundle.id, title)
    openProject(project)
    pushToast('Project created.')
  }

  async function handleCreateNote(input?: { bundleId?: string; projectId?: string; title?: string }) {
    const project = input?.projectId
      ? data.projects.find((item) => item.id === input.projectId)
      : selectedProject
    const bundle = project
      ? data.bundles.find((item) => item.id === project.bundleId) ?? (await ensureBundle())
      : input?.bundleId
        ? data.bundles.find((item) => item.id === input.bundleId) ?? (await ensureBundle())
        : await ensureBundle()
    const note = await createNote({
      bundleId: project ? undefined : bundle.id,
      projectId: project?.id,
      title: input?.title ?? 'Untitled note',
    })
    openNote(note)
    pushToast('Note created.')
  }

  async function handleCreateTodoList(parentType?: 'bundle' | 'project' | 'note', parentId?: string) {
    let targetType = parentType
    let targetId = parentId
    if (!targetType || !targetId) {
      if (selectedNote) {
        targetType = 'note'
        targetId = selectedNote.id
      } else if (selectedProject) {
        targetType = 'project'
        targetId = selectedProject.id
      } else {
        const bundle = await ensureBundle()
        targetType = 'bundle'
        targetId = bundle.id
      }
    }
    const list = await createTodoList(targetType, targetId, 'New todo list')
    pushToast('Todo list created.')
    openTodoParent(list)
  }

  async function handleQuickCapture(text: string) {
    await createQuickCapture(text)
    setQuickCaptureOpen(false)
    navigate('inbox')
    pushToast('Captured to Inbox.')
  }

  async function handleExport() {
    setExportStatus('collecting')
    await new Promise((resolve) => window.setTimeout(resolve, 180))
    const backup = await createBackup()
    setExportStatus('packing')
    await new Promise((resolve) => window.setTimeout(resolve, 180))
    downloadBackup(backup)
    setExportStatus('ready')
    pushToast('Backup download started.')
    window.setTimeout(() => setExportStatus('idle'), 1600)
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setImportState({ fileName: file.name, busy: true })
    try {
      const raw = await file.text()
      const backup = parseBackup(raw)
      setImportState({
        fileName: file.name,
        backup,
        preview: previewBackup(backup),
        busy: false,
      })
      pushToast('Backup validated.')
    } catch (error) {
      setImportState({
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Import failed.',
        busy: false,
      })
    }
  }

  async function applyImport(mode: 'merge' | 'replace') {
    if (!importState.backup) return
    const runImport = async () => {
      setImportState((current) => ({ ...current, busy: true }))
      await importBackup(importState.backup!, mode)
      setSettings(getSettings())
      setImportState({ busy: false })
      pushToast(mode === 'replace' ? 'Backup replaced local data.' : 'Backup merged.')
      navigate('dashboard')
    }
    if (mode === 'replace') {
      showConfirm({
        title: 'Replace all local data?',
        message: 'This clears current bundles, notes, todos, and captures before importing the backup.',
        confirmLabel: 'Replace data',
        tone: 'danger',
        onConfirm: runImport,
      })
    } else {
      await runImport()
    }
  }

  function askArchive(type: EntityType, id: string, title: string) {
    showConfirm({
      title: `Archive ${entityLabels[type].toLowerCase()}?`,
      message: `${title} will move out of normal lists. You can restore it from Archive.`,
      confirmLabel: 'Archive',
      onConfirm: async () => {
        await archiveRecord(type, id)
        if (type === 'note') setSelectedNoteId(undefined)
        pushToast('Moved to Archive.')
      },
    })
  }

  function askDelete(type: EntityType, id: string, title: string) {
    showConfirm({
      title: `Move ${entityLabels[type].toLowerCase()} to Trash?`,
      message: `${title} will stay recoverable until permanently deleted.`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
      onConfirm: async () => {
        await softDeleteRecord(type, id)
        if (type === 'note') setSelectedNoteId(undefined)
        if (type === 'project') setSelectedProjectId(undefined)
        if (type === 'bundle') setSelectedBundleId(undefined)
        pushToast('Moved to Trash.')
      },
    })
  }

  function askPermanentDelete(type: EntityType, id: string, title: string) {
    showConfirm({
      title: `Permanently delete ${entityLabels[type].toLowerCase()}?`,
      message: `${title} will be removed from this device. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
      onConfirm: async () => {
        await permanentlyDeleteRecord(type, id)
        pushToast('Deleted permanently.')
      },
    })
  }

  function handleResetData() {
    showConfirm({
      title: 'Reset Wafytnde?',
      message: 'This clears local data and local preferences on this device.',
      confirmLabel: 'Reset app',
      tone: 'danger',
      onConfirm: async () => {
        await clearAllData()
        resetLocalSettings()
        setSettings(defaultSettings)
        setSelectedBundleId(undefined)
        setSelectedProjectId(undefined)
        setSelectedNoteId(undefined)
        navigate('dashboard')
        pushToast('Local app data reset.')
      },
    })
  }

  function runCommand(command: string) {
    setCommandOpen(false)
    if (command === 'new-note') void handleCreateNote()
    if (command === 'new-bundle') void handleCreateBundle()
    if (command === 'new-project') void handleCreateProject()
    if (command === 'new-todo') void handleCreateTodoList()
    if (command === 'quick-capture') setQuickCaptureOpen(true)
    if (command === 'archive-selected' && selectedNote) {
      askArchive('note', selectedNote.id, selectedNote.title)
    }
    if (command === 'export') void handleExport()
    if (command === 'import') navigate('settings')
    if (command === 'theme') {
      patchAppSettings({ theme: settings.theme === 'terminal' ? 'warm' : 'terminal' })
    }
    if (command === 'inbox') navigate('inbox')
    if (command === 'settings') navigate('settings')
    if (command === 'search') navigate('search')
  }

  function renderMainPanel() {
    if (view === 'dashboard') {
      return (
        <DashboardPanel
          activeBundles={activeBundles}
          activeProjects={activeProjects}
          activeNotes={activeNotes}
          activeTodoLists={activeTodoLists}
          todoItems={data.todoItems}
          captures={activeCaptures}
          onOpenBundle={openBundle}
          onOpenProject={openProject}
          onOpenNote={openNote}
          onCreateBundle={handleCreateBundle}
          onCreateNote={handleCreateNote}
          onCapture={() => setQuickCaptureOpen(true)}
        />
      )
    }
    if (view === 'inbox') {
      return (
        <InboxPanel
          captures={activeCaptures}
          bundles={activeBundles}
          selectedBundleId={effectiveBundleId}
          onCapture={() => setQuickCaptureOpen(true)}
          onConvertToNote={async (capture, bundleId) => {
            const bundle = bundleId
              ? data.bundles.find((item) => item.id === bundleId) ?? (await ensureBundle())
              : await ensureBundle('Inbox Notes')
            await convertCaptureToNote(capture.id, { type: 'bundle', id: bundle.id })
            pushToast('Capture converted to note.')
          }}
          onConvertToTodo={async (capture) => {
            const bundle = await ensureBundle('Inbox Tasks')
            const list =
              activeTodoLists.find(
                (item) => item.parentType === 'bundle' && item.parentId === bundle.id,
              ) ?? (await createTodoList('bundle', bundle.id, 'Inbox tasks'))
            await convertCaptureToTodo(capture.id, list.id)
            pushToast('Capture converted to todo.')
          }}
          onArchive={(capture) => askArchive('quickCapture', capture.id, capture.title)}
          onDelete={(capture) => askDelete('quickCapture', capture.id, capture.title)}
        />
      )
    }
    if (view === 'bundles') {
      return (
        <BundlesPanel
          bundles={activeBundles}
          projects={activeProjects}
          notes={activeNotes}
          onOpen={openBundle}
          onCreate={handleCreateBundle}
          onArchive={(bundle) => askArchive('bundle', bundle.id, bundle.title)}
          onDelete={(bundle) => askDelete('bundle', bundle.id, bundle.title)}
        />
      )
    }
    if (view === 'bundle') {
      return selectedBundle ? (
        <BundlePanel
          bundle={selectedBundle}
          tab={bundleTab}
          data={data}
          activeProjects={activeProjects}
          activeNotes={activeNotes}
          activeTodoLists={activeTodoLists}
          todoItems={data.todoItems}
          onTab={setBundleTab}
          onOpenNote={openNote}
          onOpenProject={openProject}
          onCreateNote={(title) => handleCreateNote({ bundleId: selectedBundle.id, title })}
          onCreateProject={(title) => handleCreateProject(selectedBundle.id, title)}
          onCreateTodoList={() => handleCreateTodoList('bundle', selectedBundle.id)}
          onArchive={(type, id, title) => askArchive(type, id, title)}
          onDelete={(type, id, title) => askDelete(type, id, title)}
        />
      ) : (
        <EmptyPanel
          title="No bundle selected."
          body="Pick a bundle or create one from the list."
          actionLabel="New bundle"
          onAction={() => void handleCreateBundle()}
        />
      )
    }
    if (view === 'project') {
      return selectedProject ? (
        <ProjectPanel
          project={selectedProject}
          data={data}
          activeNotes={activeNotes}
          activeTodoLists={activeTodoLists}
          todoItems={data.todoItems}
          onBack={() => {
            const bundle = data.bundles.find((item) => item.id === selectedProject.bundleId)
            if (bundle) openBundle(bundle)
          }}
          onOpenNote={openNote}
          onCreateNote={(title) => handleCreateNote({ projectId: selectedProject.id, title })}
          onCreateTodoList={() => handleCreateTodoList('project', selectedProject.id)}
          onArchive={(type, id, title) => askArchive(type, id, title)}
          onDelete={(type, id, title) => askDelete(type, id, title)}
        />
      ) : (
        <EmptyPanel title="No project selected." body="Open a project from a bundle." />
      )
    }
    if (view === 'note') {
      return (
        <NoteListPanel
          notes={activeNotes}
          selectedNoteId={selectedNoteId}
          onOpen={openNote}
          onCreate={() => void handleCreateNote()}
        />
      )
    }
    if (view === 'search') {
      return (
        <SearchPanel
          query={searchQuery}
          onQuery={setSearchQuery}
          results={searchResults}
          onOpen={openSearchResult}
        />
      )
    }
    if (view === 'archive') {
      return (
        <ArchivePanel
          data={data}
          onRestore={async (type, id) => {
            await restoreRecord(type, id)
            pushToast('Restored from Archive.')
          }}
          onDelete={askDelete}
        />
      )
    }
    if (view === 'trash') {
      return (
        <TrashPanel
          data={data}
          onRestore={async (type, id) => {
            await restoreRecord(type, id)
            pushToast('Restored from Trash.')
          }}
          onPermanentDelete={askPermanentDelete}
          onEmpty={() => {
            showConfirm({
              title: 'Empty Trash?',
              message: 'Every item currently in Trash will be permanently deleted.',
              confirmLabel: 'Empty Trash',
              tone: 'danger',
              onConfirm: async () => {
                const deletedRecords = collectRecords(data, isDeleted)
                for (const record of deletedRecords) {
                  await permanentlyDeleteRecord(record.type, record.id)
                }
                pushToast('Trash emptied.')
              },
            })
          }}
        />
      )
    }
    return (
      <SettingsPanel
        settings={settings}
        online={online}
        offlineReady={offlineReady}
        updateReady={updateReady}
        storage={storage}
        exportStatus={exportStatus}
        importState={importState}
        onPatch={patchAppSettings}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onApplyImport={applyImport}
        onRefreshStorage={refreshStorage}
        onReset={handleResetData}
        onReloadUpdate={() => {
          void window.wafytndeUpdateSW?.(true)
          setUpdateReady(false)
        }}
      />
    )
  }

  function renderDetailPanel() {
    if (view === 'note' || selectedNote) {
      return selectedNote ? (
        <NoteEditor
          key={selectedNote.id}
          note={selectedNote}
          bundles={activeBundles}
          projects={activeProjects}
          todoLists={activeTodoLists}
          todoItems={data.todoItems}
          onBack={() => navigate(selectedProject ? 'project' : 'bundle')}
          onSave={async (patch) => updateNote(selectedNote.id, patch)}
          onCreateTodoList={() => handleCreateTodoList('note', selectedNote.id)}
          onArchive={() => askArchive('note', selectedNote.id, selectedNote.title)}
          onDelete={() => askDelete('note', selectedNote.id, selectedNote.title)}
          onOpenTodoParent={openTodoParent}
          pushToast={pushToast}
        />
      ) : (
        <EditorBlankState onCreate={() => void handleCreateNote()} />
      )
    }
    if (view === 'project' && selectedProject) {
      return (
        <ProjectInspector
          project={selectedProject}
          onSave={(patch) => updateProject(selectedProject.id, patch)}
          onArchive={() => askArchive('project', selectedProject.id, selectedProject.title)}
          onDelete={() => askDelete('project', selectedProject.id, selectedProject.title)}
        />
      )
    }
    if ((view === 'bundle' || view === 'bundles') && selectedBundle) {
      return (
        <BundleInspector
          bundle={selectedBundle}
          onSave={(patch) => updateBundle(selectedBundle.id, patch)}
          onArchive={() => askArchive('bundle', selectedBundle.id, selectedBundle.title)}
          onDelete={() => askDelete('bundle', selectedBundle.id, selectedBundle.title)}
        />
      )
    }
    return <EditorBlankState onCreate={() => void handleCreateNote()} />
  }

  return (
    <main
      className={clsx('app-root', settings.sidebarCollapsed && 'sidebar-collapsed')}
      data-view={view}
    >
      {!settings.onboardingComplete && (
        <OnboardingDialog
          onStart={() => patchAppSettings({ onboardingComplete: true })}
          onImport={() => {
            patchAppSettings({ onboardingComplete: true })
            navigate('settings')
          }}
        />
      )}

      <Sidebar
        activeView={view}
        collapsed={settings.sidebarCollapsed}
        bundles={activeBundles}
        inboxCount={activeCaptures.length}
        storageUsage={storage.usage}
        online={online}
        onNavigate={navigate}
        onOpenBundle={openBundle}
        onToggleCollapse={() => patchAppSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
      />

      <section className="workspace-shell">
        <Topbar
          view={view}
          searchQuery={searchQuery}
          online={online}
          offlineReady={offlineReady}
          updateReady={updateReady}
          onSearch={(query) => {
            setSearchQuery(query)
            navigate('search')
          }}
          onCommand={() => setCommandOpen(true)}
          onCapture={() => setQuickCaptureOpen(true)}
          onNewNote={() => void handleCreateNote()}
          onApplyUpdate={() => {
            void window.wafytndeUpdateSW?.(true)
            setUpdateReady(false)
          }}
        />

        <div className="pane-grid">
          <section className="middle-panel">{renderMainPanel()}</section>
          <section className="detail-panel">{renderDetailPanel()}</section>
        </div>
      </section>

      <MobileNav activeView={view} onNavigate={navigate} />
      <button
        type="button"
        className="mobile-capture"
        aria-label="Quick capture"
        onClick={() => setQuickCaptureOpen(true)}
      >
        <Plus size={22} />
      </button>

      {quickCaptureOpen && (
        <QuickCaptureDialog
          onClose={() => setQuickCaptureOpen(false)}
          onSave={handleQuickCapture}
        />
      )}
      {commandOpen && (
        <CommandMenu
          selectedNote={selectedNote}
          onClose={() => setCommandOpen(false)}
          onRun={runCommand}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          state={confirmState}
          onClose={() => setConfirmState(null)}
        />
      )}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function collectRecords(
  data: LoadedData,
  predicate: (record: Bundle | Project | Note | TodoList | TodoItem | QuickCapture) => boolean,
) {
  return [
    ...data.quickCaptures.map((record) => ({ ...record, type: 'quickCapture' as const })),
    ...data.todoItems.map((record) => ({ ...record, type: 'todoItem' as const })),
    ...data.todoLists.map((record) => ({ ...record, type: 'todoList' as const })),
    ...data.notes.map((record) => ({ ...record, type: 'note' as const })),
    ...data.projects.map((record) => ({ ...record, type: 'project' as const })),
    ...data.bundles.map((record) => ({ ...record, type: 'bundle' as const })),
  ].filter(predicate)
}

function Sidebar(props: {
  activeView: ViewKey
  collapsed: boolean
  bundles: Bundle[]
  inboxCount: number
  storageUsage?: number
  online: boolean
  onNavigate: (view: ViewKey) => void
  onOpenBundle: (bundle: Bundle) => void
  onToggleCollapse: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="app-mark">
        <div className="app-stamp" aria-hidden="true">
          W
        </div>
        {!props.collapsed && (
          <div>
            <strong>{APP_NAME}</strong>
            <span>My Library</span>
          </div>
        )}
      </div>
      <nav className="sidebar-nav" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.view}
              type="button"
              className={clsx(props.activeView === item.view && 'active')}
              onClick={() => props.onNavigate(item.view)}
              title={item.label}
            >
              <Icon size={17} />
              {!props.collapsed && <span>{item.label}</span>}
              {!props.collapsed && item.view === 'inbox' && props.inboxCount > 0 && (
                <mark>{props.inboxCount}</mark>
              )}
            </button>
          )
        })}
      </nav>
      {!props.collapsed && (
        <div className="sidebar-bundles">
          <div className="sidebar-heading">Pinned bundles</div>
          {props.bundles.slice(0, 6).map((bundle) => (
            <button key={bundle.id} type="button" onClick={() => props.onOpenBundle(bundle)}>
              <span className="color-dot" style={{ background: bundle.color }} />
              <span>{bundle.title}</span>
            </button>
          ))}
          {props.bundles.length === 0 && <p>Nothing here yet.</p>}
        </div>
      )}
      <div className="sidebar-footer">
        {!props.collapsed && (
          <span>
            {props.online ? 'Online' : 'Offline'} · {readableStorage(props.storageUsage)}
          </span>
        )}
        <button type="button" aria-label="Toggle sidebar" onClick={props.onToggleCollapse}>
          <PanelLeftClose size={16} />
        </button>
      </div>
    </aside>
  )
}

function Topbar(props: {
  view: ViewKey
  searchQuery: string
  online: boolean
  offlineReady: boolean
  updateReady: boolean
  onSearch: (query: string) => void
  onCommand: () => void
  onCapture: () => void
  onNewNote: () => void
  onApplyUpdate: () => void
}) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <BookOpen size={16} />
        <span>{props.view === 'dashboard' ? 'Desk' : entityTitle(props.view)}</span>
      </div>
      <label className="global-search">
        <Search size={16} />
        <input
          value={props.searchQuery}
          placeholder="Search the library"
          onChange={(event) => props.onSearch(event.target.value)}
          onFocus={() => props.onSearch(props.searchQuery)}
        />
      </label>
      <div className="top-actions">
        {!props.online && (
          <span className="offline-badge">
            <WifiOff size={14} />
            Offline
          </span>
        )}
        {props.offlineReady && <span className="status-chip">Offline ready</span>}
        {props.updateReady && (
          <button type="button" className="system-button" onClick={props.onApplyUpdate}>
            <RefreshCw size={15} />
            Update
          </button>
        )}
        <button type="button" className="system-button" onClick={props.onCommand}>
          <Command size={15} />
          Commands
        </button>
        <button type="button" className="system-button" onClick={props.onNewNote}>
          <FileText size={15} />
          New note
        </button>
        <button type="button" className="primary-button" onClick={props.onCapture}>
          <Plus size={15} />
          Capture
        </button>
      </div>
    </header>
  )
}

function entityTitle(view: ViewKey) {
  const titles: Record<ViewKey, string> = {
    dashboard: 'Desk',
    inbox: 'Inbox',
    bundles: 'Bundles',
    bundle: 'Bundle',
    project: 'Project',
    note: 'Note',
    search: 'Search',
    archive: 'Archive',
    trash: 'Trash',
    settings: 'Settings',
  }
  return titles[view]
}

function MobileNav(props: { activeView: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const mobileItems: Array<{ view: ViewKey; label: string; icon: typeof Inbox }> = [
    { view: 'inbox', label: 'Inbox', icon: Inbox },
    { view: 'bundles', label: 'Bundles', icon: Folder },
    { view: 'search', label: 'Search', icon: Search },
    { view: 'archive', label: 'Archive', icon: Archive },
    { view: 'settings', label: 'Settings', icon: Settings },
  ]
  return (
    <nav className="mobile-nav" aria-label="Mobile primary">
      {mobileItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.view}
            type="button"
            className={clsx(props.activeView === item.view && 'active')}
            onClick={() => props.onNavigate(item.view)}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function DashboardPanel(props: {
  activeBundles: Bundle[]
  activeProjects: Project[]
  activeNotes: Note[]
  activeTodoLists: TodoList[]
  todoItems: TodoItem[]
  captures: QuickCapture[]
  onOpenBundle: (bundle: Bundle) => void
  onOpenProject: (project: Project) => void
  onOpenNote: (note: Note) => void
  onCreateBundle: (title?: string) => Promise<void>
  onCreateNote: () => Promise<void>
  onCapture: () => void
}) {
  return (
    <div className="panel-stack">
      <PanelHeader
        eyebrow="Local desk"
        title="Capture, then sort it later."
        actions={
          <>
            <button type="button" className="system-button" onClick={() => void props.onCreateBundle()}>
              <Folder size={15} />
              Bundle
            </button>
            <button type="button" className="primary-button" onClick={props.onCapture}>
              <Plus size={15} />
              Quick capture
            </button>
          </>
        }
      />
      <div className="stat-row">
        <Stat label="Bundles" value={props.activeBundles.length} />
        <Stat label="Notes" value={props.activeNotes.length} />
        <Stat label="Projects" value={props.activeProjects.length} />
        <Stat label="Open todos" value={countOpenTodos(props.activeTodoLists, props.todoItems)} />
      </div>
      <section className="window-panel">
        <WindowTitle icon={<Inbox size={15} />} title="Inbox strip" />
        <div className="quick-strip">
          <button type="button" onClick={props.onCapture}>
            Capture a thought before it escapes.
          </button>
          <span>{props.captures.length} waiting</span>
        </div>
      </section>
      <section className="split-section">
        <div className="window-panel">
          <WindowTitle icon={<FileText size={15} />} title="Recently updated notes" />
          <div className="row-list">
            {props.activeNotes.slice(0, 6).map((note) => (
              <NoteRow key={note.id} note={note} onOpen={() => props.onOpenNote(note)} />
            ))}
            {props.activeNotes.length === 0 && (
              <EmptyMini body="No notes yet." action="New note" onAction={() => void props.onCreateNote()} />
            )}
          </div>
        </div>
        <div className="window-panel">
          <WindowTitle icon={<FolderOpen size={15} />} title="Pinned bundles" />
          <div className="bundle-tile-list">
            {props.activeBundles.slice(0, 5).map((bundle) => (
              <button key={bundle.id} type="button" onClick={() => props.onOpenBundle(bundle)}>
                <span className="color-dot" style={{ background: bundle.color }} />
                <strong>{bundle.title}</strong>
                <small>{oneLine(bundle.description, 'No description.')}</small>
              </button>
            ))}
            {props.activeBundles.length === 0 && <EmptyMini body="Nothing here yet." />}
          </div>
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle icon={<SlidersHorizontal size={15} />} title="Active projects" />
        <div className="card-grid">
          {props.activeProjects.slice(0, 4).map((project) => (
            <button key={project.id} type="button" className="project-card" onClick={() => props.onOpenProject(project)}>
              <span className="card-label">{project.status}</span>
              <strong>{project.title}</strong>
              <small>{oneLine(project.description, 'No description.')}</small>
            </button>
          ))}
          {props.activeProjects.length === 0 && <EmptyMini body="No active projects." />}
        </div>
      </section>
    </div>
  )
}

function InboxPanel(props: {
  captures: QuickCapture[]
  bundles: Bundle[]
  selectedBundleId?: string
  onCapture: () => void
  onConvertToNote: (capture: QuickCapture, bundleId?: string) => Promise<void>
  onConvertToTodo: (capture: QuickCapture) => Promise<void>
  onArchive: (capture: QuickCapture) => void
  onDelete: (capture: QuickCapture) => void
}) {
  const [targetBundleId, setTargetBundleId] = useState(props.selectedBundleId)
  const activeTargetBundleId = targetBundleId ?? props.bundles[0]?.id
  return (
    <div className="panel-stack">
      <PanelHeader
        eyebrow="Inbox"
        title="Loose thoughts, still warm."
        actions={
          <button type="button" className="primary-button" onClick={props.onCapture}>
            <Plus size={15} />
            Capture
          </button>
        }
      />
      <section className="window-panel">
        <WindowTitle icon={<Inbox size={15} />} title="Unprocessed captures" />
        {props.bundles.length > 0 && (
          <label className="field-row">
            <span>Default move target</span>
            <select value={activeTargetBundleId ?? ''} onChange={(event) => setTargetBundleId(event.target.value)}>
              {props.bundles.map((bundle) => (
                <option key={bundle.id} value={bundle.id}>
                  {bundle.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="capture-list">
          {props.captures.map((capture) => (
            <article key={capture.id} className="capture-card">
              <div>
                <strong>{capture.title}</strong>
                <time>{displayDate(capture.createdAt)}</time>
              </div>
              <p>{oneLine(capture.body)}</p>
              <div className="button-row">
                <button type="button" onClick={() => void props.onConvertToNote(capture, activeTargetBundleId)}>
                  <FileText size={14} />
                  Move as note
                </button>
                <button type="button" onClick={() => void props.onConvertToTodo(capture)}>
                  <CheckSquare size={14} />
                  Make todo
                </button>
                <button type="button" onClick={() => props.onArchive(capture)}>
                  <Archive size={14} />
                  Archive
                </button>
                <button type="button" onClick={() => props.onDelete(capture)}>
                  <Trash2 size={14} />
                  Trash
                </button>
              </div>
            </article>
          ))}
          {props.captures.length === 0 && (
            <EmptyPanel title="Inbox is clear." body="Quick captures will land here first." />
          )}
        </div>
      </section>
    </div>
  )
}

function BundlesPanel(props: {
  bundles: Bundle[]
  projects: Project[]
  notes: Note[]
  onOpen: (bundle: Bundle) => void
  onCreate: (title?: string) => Promise<void>
  onArchive: (bundle: Bundle) => void
  onDelete: (bundle: Bundle) => void
}) {
  const [title, setTitle] = useState('')
  return (
    <div className="panel-stack">
      <PanelHeader eyebrow="Bundles" title="Top shelves for everything." />
      <form
        className="inline-create"
        onSubmit={(event) => {
          event.preventDefault()
          void props.onCreate(title || undefined)
          setTitle('')
        }}
      >
        <input value={title} placeholder="New bundle title" onChange={(event) => setTitle(event.target.value)} />
        <button type="submit" className="primary-button">
          <Plus size={15} />
          Add
        </button>
      </form>
      <div className="bundle-grid">
        {props.bundles.map((bundle) => {
          const projectCount = props.projects.filter((project) => project.bundleId === bundle.id).length
          const noteCount = props.notes.filter((note) => note.bundleId === bundle.id).length
          return (
            <article key={bundle.id} className="bundle-card" style={{ borderTopColor: bundle.color }}>
              <button type="button" className="bundle-open" onClick={() => props.onOpen(bundle)}>
                <span className="color-dot" style={{ background: bundle.color }} />
                <strong>{bundle.title}</strong>
                <p>{oneLine(bundle.description, 'No description.')}</p>
                <small>
                  {projectCount} projects · {noteCount} notes
                </small>
              </button>
              <div className="button-row">
                <button type="button" onClick={() => props.onArchive(bundle)}>
                  <Archive size={14} />
                  Archive
                </button>
                <button type="button" onClick={() => props.onDelete(bundle)}>
                  <Trash2 size={14} />
                  Trash
                </button>
              </div>
            </article>
          )
        })}
        {props.bundles.length === 0 && (
          <EmptyPanel title="No bundles yet." body="Create a shelf for a project, subject, or stray pile." />
        )}
      </div>
    </div>
  )
}

function BundlePanel(props: {
  bundle: Bundle
  tab: 'overview' | 'notes' | 'projects' | 'todos' | 'archive'
  data: LoadedData
  activeProjects: Project[]
  activeNotes: Note[]
  activeTodoLists: TodoList[]
  todoItems: TodoItem[]
  onTab: (tab: 'overview' | 'notes' | 'projects' | 'todos' | 'archive') => void
  onOpenNote: (note: Note) => void
  onOpenProject: (project: Project) => void
  onCreateNote: (title?: string) => Promise<void>
  onCreateProject: (title?: string) => Promise<void>
  onCreateTodoList: () => Promise<void>
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const bundleProjects = props.activeProjects.filter((project) => project.bundleId === props.bundle.id)
  const bundleNotes = props.activeNotes.filter((note) => note.bundleId === props.bundle.id)
  const bundleProjectIds = new Set(bundleProjects.map((project) => project.id))
  const bundleNoteIds = new Set(bundleNotes.map((note) => note.id))
  const bundleTodoLists = props.activeTodoLists.filter(
    (list) =>
      (list.parentType === 'bundle' && list.parentId === props.bundle.id) ||
      (list.parentType === 'project' && bundleProjectIds.has(list.parentId)) ||
      (list.parentType === 'note' && bundleNoteIds.has(list.parentId)),
  )
  const archived = collectRecords(props.data, (record) => {
    if (!isArchived(record)) return false
    if (record.type === 'project') return record.bundleId === props.bundle.id
    if (record.type === 'note') return record.bundleId === props.bundle.id
    if (record.type === 'todoList') return bundleTodoLists.some((list) => list.id === record.id)
    return record.type === 'todoItem'
  })
  const [noteTitle, setNoteTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  return (
    <div className="panel-stack">
      <PanelHeader eyebrow="Bundle" title={props.bundle.title} sub={props.bundle.description || 'No description.'} />
      <div className="tab-strip" role="tablist" aria-label="Bundle tabs">
        {(['overview', 'notes', 'projects', 'todos', 'archive'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx(props.tab === tab && 'active')}
            onClick={() => props.onTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {props.tab === 'overview' && (
        <>
          <section className="split-section">
            <div className="window-panel">
              <WindowTitle icon={<FileText size={15} />} title="Pinned and recent notes" />
              <div className="row-list">
                {bundleNotes.slice(0, 6).map((note) => (
                  <NoteRow key={note.id} note={note} onOpen={() => props.onOpenNote(note)} />
                ))}
                {bundleNotes.length === 0 && <EmptyMini body="No notes in this bundle." />}
              </div>
            </div>
            <div className="window-panel">
              <WindowTitle icon={<SlidersHorizontal size={15} />} title="Active projects" />
              <div className="row-list">
                {bundleProjects.slice(0, 6).map((project) => (
                  <button key={project.id} type="button" className="list-row" onClick={() => props.onOpenProject(project)}>
                    <span className="color-dot" style={{ background: project.color }} />
                    <strong>{project.title}</strong>
                    <small>{project.status}</small>
                  </button>
                ))}
                {bundleProjects.length === 0 && <EmptyMini body="No projects yet." />}
              </div>
            </div>
          </section>
          <section className="window-panel">
            <WindowTitle icon={<ListTodo size={15} />} title="Open todos" />
            <TodoListCollection
              lists={bundleTodoLists}
              items={props.todoItems}
              data={props.data}
              onArchive={props.onArchive}
              onDelete={props.onDelete}
            />
          </section>
        </>
      )}
      {props.tab === 'notes' && (
        <section className="window-panel">
          <WindowTitle icon={<FileText size={15} />} title="Notes" />
          <InlineCreate
            value={noteTitle}
            placeholder="New note title"
            button="Add note"
            onValue={setNoteTitle}
            onSubmit={() => {
              void props.onCreateNote(noteTitle || undefined)
              setNoteTitle('')
            }}
          />
          <div className="row-list">
            {bundleNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                onOpen={() => props.onOpenNote(note)}
                actions={
                  <>
                    <button type="button" onClick={() => props.onArchive('note', note.id, note.title)}>
                      <Archive size={14} />
                      Archive
                    </button>
                    <button type="button" onClick={() => props.onDelete('note', note.id, note.title)}>
                      <Trash2 size={14} />
                      Trash
                    </button>
                  </>
                }
              />
            ))}
            {bundleNotes.length === 0 && <EmptyMini body="No notes in this bundle." />}
          </div>
        </section>
      )}
      {props.tab === 'projects' && (
        <section className="window-panel">
          <WindowTitle icon={<SlidersHorizontal size={15} />} title="Projects" />
          <InlineCreate
            value={projectTitle}
            placeholder="New project title"
            button="Add project"
            onValue={setProjectTitle}
            onSubmit={() => {
              void props.onCreateProject(projectTitle || undefined)
              setProjectTitle('')
            }}
          />
          <div className="card-grid">
            {bundleProjects.map((project) => (
              <button key={project.id} type="button" className="project-card" onClick={() => props.onOpenProject(project)}>
                <span className="card-label">{project.status}</span>
                <strong>{project.title}</strong>
                <small>{oneLine(project.description, 'No description.')}</small>
              </button>
            ))}
            {bundleProjects.length === 0 && <EmptyMini body="No projects yet." />}
          </div>
        </section>
      )}
      {props.tab === 'todos' && (
        <section className="window-panel">
          <WindowTitle
            icon={<ListTodo size={15} />}
            title="Todos"
            action={
              <button type="button" onClick={() => void props.onCreateTodoList()}>
                <Plus size={14} />
                List
              </button>
            }
          />
          <TodoListCollection
            lists={bundleTodoLists}
            items={props.todoItems}
            data={props.data}
            onArchive={props.onArchive}
            onDelete={props.onDelete}
          />
        </section>
      )}
      {props.tab === 'archive' && (
        <RecordList
          title="Archived in this bundle"
          records={archived}
          empty="No archived records in this bundle."
          onArchive={props.onArchive}
          onDelete={props.onDelete}
        />
      )}
    </div>
  )
}

function ProjectPanel(props: {
  project: Project
  data: LoadedData
  activeNotes: Note[]
  activeTodoLists: TodoList[]
  todoItems: TodoItem[]
  onBack: () => void
  onOpenNote: (note: Note) => void
  onCreateNote: (title?: string) => Promise<void>
  onCreateTodoList: () => Promise<void>
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const [noteTitle, setNoteTitle] = useState('')
  const notes = props.activeNotes.filter((note) => note.projectId === props.project.id)
  const todoLists = props.activeTodoLists.filter(
    (list) => list.parentType === 'project' && list.parentId === props.project.id,
  )
  return (
    <div className="panel-stack">
      <button type="button" className="back-button" onClick={props.onBack}>
        <ChevronLeft size={15} />
        Bundle
      </button>
      <PanelHeader eyebrow="Project" title={props.project.title} sub={props.project.description || props.project.status} />
      <section className="window-panel">
        <WindowTitle icon={<FileText size={15} />} title="Linked notes" />
        <InlineCreate
          value={noteTitle}
          placeholder="New note title"
          button="Add note"
          onValue={setNoteTitle}
          onSubmit={() => {
            void props.onCreateNote(noteTitle || undefined)
            setNoteTitle('')
          }}
        />
        <div className="row-list">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onOpen={() => props.onOpenNote(note)}
              actions={
                <>
                  <button type="button" onClick={() => props.onArchive('note', note.id, note.title)}>
                    <Archive size={14} />
                    Archive
                  </button>
                  <button type="button" onClick={() => props.onDelete('note', note.id, note.title)}>
                    <Trash2 size={14} />
                    Trash
                  </button>
                </>
              }
            />
          ))}
          {notes.length === 0 && <EmptyMini body="No notes in this project." />}
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle
          icon={<ListTodo size={15} />}
          title="Project todos"
          action={
            <button type="button" onClick={() => void props.onCreateTodoList()}>
              <Plus size={14} />
              List
            </button>
          }
        />
        <TodoListCollection
          lists={todoLists}
          items={props.todoItems}
          data={props.data}
          onArchive={props.onArchive}
          onDelete={props.onDelete}
        />
      </section>
    </div>
  )
}

function NoteListPanel(props: {
  notes: Note[]
  selectedNoteId?: string
  onOpen: (note: Note) => void
  onCreate: () => void
}) {
  return (
    <div className="panel-stack">
      <PanelHeader
        eyebrow="Notes"
        title="Paper drawer"
        actions={
          <button type="button" className="primary-button" onClick={props.onCreate}>
            <Plus size={15} />
            Note
          </button>
        }
      />
      <section className="window-panel">
        <WindowTitle icon={<FileText size={15} />} title="All active notes" />
        <div className="row-list">
          {props.notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              selected={note.id === props.selectedNoteId}
              onOpen={() => props.onOpen(note)}
            />
          ))}
          {props.notes.length === 0 && <EmptyMini body="No notes yet." />}
        </div>
      </section>
    </div>
  )
}

function SearchPanel(props: {
  query: string
  results: SearchResult[]
  onQuery: (query: string) => void
  onOpen: (result: SearchResult) => void
}) {
  return (
    <div className="panel-stack">
      <PanelHeader eyebrow="Search" title="Find the thing by any scrap." />
      <label className="search-page-input">
        <Search size={18} />
        <input
          value={props.query}
          autoFocus
          placeholder="Search bundles, projects, notes, todos, tags"
          onChange={(event) => props.onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && props.results[0]) props.onOpen(props.results[0])
          }}
        />
      </label>
      <section className="window-panel">
        <WindowTitle icon={<Database size={15} />} title="Results" />
        <div className="row-list">
          {props.results.map((result) => (
            <button key={`${result.type}-${result.id}`} type="button" className="search-result" onClick={() => props.onOpen(result)}>
              <strong>{result.title}</strong>
              <span>{result.subtitle}</span>
              <small>{oneLine(result.body, 'No preview.')}</small>
            </button>
          ))}
          {props.query && props.results.length === 0 && <EmptyMini body="No matching record." />}
          {!props.query && <EmptyMini body="Start typing to search the local library." />}
        </div>
      </section>
    </div>
  )
}

function ArchivePanel(props: {
  data: LoadedData
  onRestore: (type: EntityType, id: string) => Promise<void>
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const records = collectRecords(props.data, isArchived)
  return (
    <div className="panel-stack">
      <PanelHeader eyebrow="Archive" title="Quiet storage." />
      <section className="window-panel">
        <WindowTitle icon={<Archive size={15} />} title="Archived records" />
        <div className="row-list">
          {records.map((record) => (
            <RecordRow
              key={`${record.type}-${record.id}`}
              record={record}
              actions={
                <>
                  <button type="button" onClick={() => void props.onRestore(record.type, record.id)}>
                    <RotateCcw size={14} />
                    Restore
                  </button>
                  <button type="button" onClick={() => props.onDelete(record.type, record.id, recordTitle(record))}>
                    <Trash2 size={14} />
                    Trash
                  </button>
                </>
              }
            />
          ))}
          {records.length === 0 && <EmptyMini body="Archive is empty." />}
        </div>
      </section>
    </div>
  )
}

function TrashPanel(props: {
  data: LoadedData
  onRestore: (type: EntityType, id: string) => Promise<void>
  onPermanentDelete: (type: EntityType, id: string, title: string) => void
  onEmpty: () => void
}) {
  const records = collectRecords(props.data, isDeleted)
  return (
    <div className="panel-stack">
      <PanelHeader
        eyebrow="Trash"
        title="Recoverable until you empty it."
        actions={
          records.length > 0 && (
            <button type="button" className="danger-button" onClick={props.onEmpty}>
              <Trash2 size={15} />
              Empty
            </button>
          )
        }
      />
      <section className="window-panel">
        <WindowTitle icon={<Trash2 size={15} />} title="Deleted records" />
        <div className="row-list">
          {records.map((record) => (
            <RecordRow
              key={`${record.type}-${record.id}`}
              record={record}
              actions={
                <>
                  <button type="button" onClick={() => void props.onRestore(record.type, record.id)}>
                    <RotateCcw size={14} />
                    Restore
                  </button>
                  <button type="button" onClick={() => props.onPermanentDelete(record.type, record.id, recordTitle(record))}>
                    <Trash2 size={14} />
                    Delete forever
                  </button>
                </>
              }
            />
          ))}
          {records.length === 0 && <EmptyMini body="Trash is empty." />}
        </div>
      </section>
    </div>
  )
}

function SettingsPanel(props: {
  settings: AppSettings
  online: boolean
  offlineReady: boolean
  updateReady: boolean
  storage: StorageEstimate
  exportStatus: 'idle' | 'collecting' | 'packing' | 'ready'
  importState: ImportState
  onPatch: (patch: Partial<AppSettings>) => void
  onExport: () => Promise<void>
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onApplyImport: (mode: 'merge' | 'replace') => Promise<void>
  onRefreshStorage: () => Promise<void>
  onReset: () => void
  onReloadUpdate: () => void
}) {
  const exportLabel =
    props.exportStatus === 'collecting'
      ? 'Collecting data'
      : props.exportStatus === 'packing'
        ? 'Packing backup'
        : props.exportStatus === 'ready'
          ? 'Download ready'
          : 'Export all data'
  return (
    <div className="panel-stack settings-panel">
      <PanelHeader eyebrow="Settings" title="Local machine room." />
      <section className="window-panel">
        <WindowTitle icon={<Download size={15} />} title="Data" />
        <div className="settings-grid">
          <div>
            <h3>Backup</h3>
            <p>Export one JSON file containing IndexedDB records and local preferences.</p>
          </div>
          <div className="settings-actions">
            <button type="button" className="primary-button" onClick={() => void props.onExport()}>
              <Download size={15} />
              {exportLabel}
            </button>
            <div className="progress-track" aria-hidden="true">
              <span
                style={{
                  width:
                    props.exportStatus === 'idle'
                      ? '0%'
                      : props.exportStatus === 'collecting'
                        ? '35%'
                        : props.exportStatus === 'packing'
                          ? '70%'
                          : '100%',
                }}
              />
            </div>
          </div>
        </div>
        <div className="import-box">
          <label className="drop-zone">
            <Upload size={18} />
            <span>{props.importState.fileName ?? 'Choose backup JSON'}</span>
            <input type="file" accept="application/json,.json" onChange={(event) => void props.onImportFile(event)} />
          </label>
          {props.importState.busy && <p>Validating backup...</p>}
          {props.importState.error && <p className="form-error">{props.importState.error}</p>}
          {props.importState.preview && (
            <div className="import-preview">
              <strong>Backup preview</strong>
              <span>Exported {displayDate(props.importState.preview.exportedAt)}</span>
              <span>{props.importState.preview.bundles} bundles</span>
              <span>{props.importState.preview.projects} projects</span>
              <span>{props.importState.preview.notes} notes</span>
              <span>{props.importState.preview.todos} todos</span>
              <div className="button-row">
                <button type="button" onClick={() => void props.onApplyImport('merge')}>
                  Merge
                </button>
                <button type="button" className="danger-button" onClick={() => void props.onApplyImport('replace')}>
                  Replace
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="settings-grid">
          <div>
            <h3>Storage</h3>
            <p>Data is stored locally on this device. Export backups to move it elsewhere.</p>
          </div>
          <div className="settings-actions">
            <span className="meter-label">
              {readableStorage(props.storage.usage)} used of {readableStorage(props.storage.quota)}
            </span>
            <button type="button" onClick={() => void props.onRefreshStorage()}>
              <HardDrive size={15} />
              Refresh
            </button>
            <button type="button" className="danger-button" onClick={props.onReset}>
              Reset app data
            </button>
          </div>
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle icon={<Moon size={15} />} title="Appearance" />
        <div className="settings-grid">
          <label>
            <span>Theme</span>
            <select
              value={props.settings.theme}
              onChange={(event) => props.onPatch({ theme: event.target.value as AppSettings['theme'] })}
            >
              <option value="warm">Warm Retro</option>
              <option value="paper">Paper</option>
              <option value="terminal">Dark Terminal</option>
            </select>
          </label>
          <label>
            <span>Note font</span>
            <select
              value={props.settings.fontMode}
              onChange={(event) => props.onPatch({ fontMode: event.target.value as AppSettings['fontMode'] })}
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={props.settings.compactMode}
              onChange={(event) => props.onPatch({ compactMode: event.target.checked })}
            />
            <span>Compact mode</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={props.settings.reduceMotion}
              onChange={(event) => props.onPatch({ reduceMotion: event.target.checked })}
            />
            <span>Reduce motion</span>
          </label>
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle icon={<WifiOff size={15} />} title="PWA / Offline" />
        <div className="status-grid">
          <span>{props.online ? 'Network online' : 'Network offline'}</span>
          <span>{props.offlineReady ? 'Offline app shell ready' : 'Offline shell will cache after build'}</span>
          <span>{props.updateReady ? 'Update available' : 'No waiting update'}</span>
          <button type="button" onClick={props.onReloadUpdate}>
            <RefreshCw size={15} />
            Re-cache app shell
          </button>
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle icon={<Command size={15} />} title="Shortcuts" />
        <div className="shortcut-grid">
          <span>Ctrl/Cmd + K</span>
          <span>Command menu</span>
          <span>Ctrl/Cmd + N</span>
          <span>New note</span>
          <span>Ctrl/Cmd + Shift + N</span>
          <span>New bundle</span>
          <span>Ctrl/Cmd + F</span>
          <span>Search</span>
          <span>Ctrl/Cmd + Shift + E</span>
          <span>Export data</span>
        </div>
      </section>
      <section className="window-panel">
        <WindowTitle icon={<BookOpen size={15} />} title="About" />
        <p>{APP_NAME} version 0.1.0</p>
      </section>
    </div>
  )
}

function NoteEditor(props: {
  note: Note
  bundles: Bundle[]
  projects: Project[]
  todoLists: TodoList[]
  todoItems: TodoItem[]
  onBack: () => void
  onSave: (patch: Partial<Note>) => Promise<void>
  onCreateTodoList: () => Promise<void>
  onArchive: () => void
  onDelete: () => void
  onOpenTodoParent: (list: TodoList) => void
  pushToast: (text: string) => void
}) {
  const [title, setTitle] = useState(props.note.title)
  const [body, setBody] = useState(props.note.body)
  const [tags, setTags] = useState(props.note.tags.join(', '))
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const noteTodoLists = props.todoLists.filter(
    (list) => list.parentType === 'note' && list.parentId === props.note.id,
  )

  useEffect(() => {
    const nextTags = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    const changed =
      title !== props.note.title ||
      body !== props.note.body ||
      nextTags.join('|') !== props.note.tags.join('|')
    if (!changed) return
    const handle = window.setTimeout(() => {
      void props
        .onSave({ title: title.trim() || 'Untitled note', body, tags: nextTags })
        .then(() => setSaveState('saved'))
    }, 650)
    return () => window.clearTimeout(handle)
  }, [body, props, tags, title])

  const bundleProjects = props.projects.filter((project) => project.bundleId === props.note.bundleId)
  return (
    <article className="note-editor">
      <div className="editor-titlebar">
        <button type="button" className="back-button" onClick={props.onBack}>
          <ChevronLeft size={15} />
          Back
        </button>
        <span>{saveState === 'saving' ? 'Saving...' : `Saved ${displayDate(props.note.lastSavedAt)}`}</span>
      </div>
      <section className="paper-sheet">
        <input
          className="title-input"
          value={title}
          aria-label="Note title"
          placeholder="Untitled note"
          onChange={(event) => {
            setTitle(event.target.value)
            setSaveState('saving')
          }}
        />
        <textarea
          className="body-input"
          value={body}
          aria-label="Note body"
          placeholder="Start writing."
          onChange={(event) => {
            setBody(event.target.value)
            setSaveState('saving')
          }}
        />
      </section>
      <div className="note-meta-grid">
        <label>
          <span>Tags</span>
          <input
            value={tags}
            placeholder="tag, another tag"
            onChange={(event) => {
              setTags(event.target.value)
              setSaveState('saving')
            }}
          />
        </label>
        <label>
          <span>Move to bundle</span>
          <select
            value={props.note.bundleId ?? ''}
            onChange={(event) => {
              const bundleId = event.target.value || undefined
              void props.onSave({ bundleId, projectId: undefined })
            }}
          >
            <option value="">Loose note</option>
            {props.bundles.map((bundle) => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Move to project</span>
          <select
            value={props.note.projectId ?? ''}
            onChange={(event) => {
              const projectId = event.target.value || undefined
              const project = props.projects.find((item) => item.id === projectId)
              void props.onSave({ projectId, bundleId: project?.bundleId ?? props.note.bundleId })
            }}
          >
            <option value="">No project</option>
            {bundleProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="button-row editor-actions">
        <button
          type="button"
          onClick={() => {
            void props.onSave({ title: title.trim() || 'Untitled note', body })
            props.pushToast('Note saved.')
          }}
        >
          <Save size={14} />
          Save now
        </button>
        <button type="button" onClick={() => void props.onSave({ pinned: !props.note.pinned })}>
          <Pin size={14} />
          {props.note.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" onClick={() => void props.onSave({ favorite: !props.note.favorite })}>
          <Star size={14} />
          {props.note.favorite ? 'Unfavorite' : 'Favorite'}
        </button>
        <button type="button" onClick={() => void props.onCreateTodoList()}>
          <ListTodo size={14} />
          Todo list
        </button>
        <button type="button" onClick={props.onArchive}>
          <Archive size={14} />
          Archive
        </button>
        <button type="button" onClick={props.onDelete}>
          <Trash2 size={14} />
          Trash
        </button>
      </div>
      <section className="window-panel linked-todos">
        <WindowTitle icon={<ListTodo size={15} />} title="Linked todos" />
        <TodoListCollection
          lists={noteTodoLists}
          items={props.todoItems}
          data={{
            bundles: props.bundles,
            projects: props.projects,
            notes: [props.note],
            todoLists: props.todoLists,
            todoItems: props.todoItems,
            quickCaptures: [],
          }}
          onArchive={() => undefined}
          onDelete={() => undefined}
        />
      </section>
    </article>
  )
}

function BundleInspector(props: {
  bundle: Bundle
  onSave: (patch: Partial<Bundle>) => Promise<void>
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <Inspector title="Bundle card" subtitle={props.bundle.title}>
      <label>
        <span>Title</span>
        <input value={props.bundle.title} onChange={(event) => void props.onSave({ title: event.target.value })} />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={props.bundle.description}
          onChange={(event) => void props.onSave({ description: event.target.value })}
        />
      </label>
      <label>
        <span>Color</span>
        <input type="color" value={props.bundle.color} onChange={(event) => void props.onSave({ color: event.target.value })} />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={props.bundle.pinned}
          onChange={(event) => void props.onSave({ pinned: event.target.checked })}
        />
        <span>Pinned</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={props.bundle.favorite}
          onChange={(event) => void props.onSave({ favorite: event.target.checked })}
        />
        <span>Favorite</span>
      </label>
      <div className="button-row">
        <button type="button" onClick={props.onArchive}>
          <Archive size={14} />
          Archive
        </button>
        <button type="button" onClick={props.onDelete}>
          <Trash2 size={14} />
          Trash
        </button>
      </div>
    </Inspector>
  )
}

function ProjectInspector(props: {
  project: Project
  onSave: (patch: Partial<Project>) => Promise<void>
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <Inspector title="Project card" subtitle={props.project.title}>
      <label>
        <span>Title</span>
        <input value={props.project.title} onChange={(event) => void props.onSave({ title: event.target.value })} />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={props.project.description}
          onChange={(event) => void props.onSave({ description: event.target.value })}
        />
      </label>
      <label>
        <span>Status</span>
        <select value={props.project.status} onChange={(event) => void props.onSave({ status: event.target.value as Project['status'] })}>
          <option value="idea">idea</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="completed">completed</option>
          <option value="archived">archived</option>
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={props.project.pinned}
          onChange={(event) => void props.onSave({ pinned: event.target.checked })}
        />
        <span>Pinned</span>
      </label>
      <div className="button-row">
        <button type="button" onClick={props.onArchive}>
          <Archive size={14} />
          Archive
        </button>
        <button type="button" onClick={props.onDelete}>
          <Trash2 size={14} />
          Trash
        </button>
      </div>
    </Inspector>
  )
}

function TodoListCollection(props: {
  lists: TodoList[]
  items: TodoItem[]
  data: LoadedData
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  if (props.lists.length === 0) return <EmptyMini body="No todo lists here." />
  return (
    <div className="todo-list-collection">
      {props.lists.map((list) => (
        <TodoListCard
          key={list.id}
          list={list}
          items={activeTodoItems(list.id, props.items)}
          parentLabel={itemParentLabel(list, props.data)}
          onArchive={props.onArchive}
          onDelete={props.onDelete}
        />
      ))}
    </div>
  )
}

function TodoListCard(props: {
  list: TodoList
  items: TodoItem[]
  parentLabel: string
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [text, setText] = useState('')
  const completed = props.items.filter((item) => item.completed).length
  const visibleItems = props.items.filter((item) => {
    if (filter === 'active') return !item.completed
    if (filter === 'completed') return item.completed
    return true
  })
  return (
    <article className="todo-card">
      <div className="todo-title">
        <input
          value={props.list.title}
          aria-label="Todo list title"
          onChange={(event) => void updateTodoList(props.list.id, { title: event.target.value })}
        />
        <span>
          {completed}/{props.items.length} done
        </span>
      </div>
      <small>{props.parentLabel}</small>
      <div className="segmented">
        {(['all', 'active', 'completed'] as const).map((mode) => (
          <button key={mode} type="button" className={clsx(filter === mode && 'active')} onClick={() => setFilter(mode)}>
            {mode}
          </button>
        ))}
      </div>
      <form
        className="todo-add"
        onSubmit={(event) => {
          event.preventDefault()
          if (!text.trim()) return
          void createTodoItem(props.list.id, text.trim())
          setText('')
        }}
      >
        <input value={text} placeholder="Add task" onChange={(event) => setText(event.target.value)} />
        <button type="submit">
          <Plus size={14} />
        </button>
      </form>
      <div className="todo-items">
        {visibleItems.map((item, index) => (
          <div key={item.id} className={clsx('todo-item', item.completed && 'done')}>
            <label>
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(event) => void updateTodoItem(item.id, { completed: event.target.checked })}
              />
              <span>{item.text}</span>
            </label>
            <div className="todo-item-actions">
              <button
                type="button"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => {
                  const previous = visibleItems[index - 1]
                  if (!previous) return
                  void updateTodoItem(item.id, { order: previous.order - 1 })
                }}
              >
                <ChevronLeft size={13} />
              </button>
              <button type="button" aria-label="Delete item" onClick={() => void softDeleteRecord('todoItem', item.id)}>
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
        {visibleItems.length === 0 && <span className="empty-line">Nothing here yet.</span>}
      </div>
      <div className="button-row">
        <button
          type="button"
          onClick={() => {
            for (const item of props.items.filter((todo) => todo.completed)) {
              void archiveRecord('todoItem', item.id)
            }
          }}
        >
          <Archive size={14} />
          Archive completed
        </button>
        <button type="button" onClick={() => props.onArchive('todoList', props.list.id, props.list.title)}>
          <Archive size={14} />
          Archive list
        </button>
        <button type="button" onClick={() => props.onDelete('todoList', props.list.id, props.list.title)}>
          <Trash2 size={14} />
          Trash list
        </button>
      </div>
    </article>
  )
}

function CommandMenu(props: {
  selectedNote?: Note
  onClose: () => void
  onRun: (command: string) => void
}) {
  const [query, setQuery] = useState('')
  const commands = [
    { id: 'new-note', label: 'New note', shortcut: 'Ctrl N' },
    { id: 'new-bundle', label: 'New bundle', shortcut: 'Ctrl Shift N' },
    { id: 'new-project', label: 'New project', shortcut: '' },
    { id: 'new-todo', label: 'New todo list', shortcut: '' },
    { id: 'quick-capture', label: 'Quick capture', shortcut: '' },
    { id: 'archive-selected', label: props.selectedNote ? 'Archive selected note' : 'Archive selected note unavailable', shortcut: 'Delete' },
    { id: 'export', label: 'Export data', shortcut: 'Ctrl Shift E' },
    { id: 'import', label: 'Import data', shortcut: '' },
    { id: 'theme', label: 'Toggle theme', shortcut: '' },
    { id: 'inbox', label: 'Go to inbox', shortcut: '' },
    { id: 'search', label: 'Go to search', shortcut: 'Ctrl F' },
    { id: 'settings', label: 'Go to settings', shortcut: '' },
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase()))
  return (
    <Modal title="Command menu" onClose={props.onClose}>
      <div className="command-menu">
        <label className="search-page-input">
          <Command size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Type a command"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && commands[0] && !commands[0].label.includes('unavailable')) {
                props.onRun(commands[0].id)
              }
            }}
          />
        </label>
        <div className="command-list">
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              disabled={command.label.includes('unavailable')}
              onClick={() => props.onRun(command.id)}
            >
              <span>{command.label}</span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function QuickCaptureDialog(props: { onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!text.trim()) return
    setSaving(true)
    await props.onSave(text.trim())
    setSaving(false)
  }
  return (
    <Modal title="Quick capture" onClose={props.onClose}>
      <form
        className="quick-capture-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          autoFocus
          value={text}
          placeholder="Dump the thought here."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <div className="button-row">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving || !text.trim()}>
            <Save size={15} />
            Save capture
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDialog(props: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={props.state.title} onClose={props.onClose}>
      <div className="confirm-panel">
        <p>{props.state.message}</p>
        <div className="button-row">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={props.state.tone === 'danger' ? 'danger-button' : 'primary-button'}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await props.state.onConfirm()
              setBusy(false)
              props.onClose()
            }}
          >
            {props.state.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function OnboardingDialog(props: { onStart: () => void; onImport: () => void }) {
  return (
    <Modal title="Welcome to Wafytnde" onClose={props.onStart}>
      <div className="onboarding">
        <p>Your notes live locally on this device.</p>
        <p>Export backups to move data to another phone or desktop.</p>
        <p>After the first successful load, the app shell can open offline.</p>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={props.onStart}>
            Start writing
          </button>
          <button type="button" onClick={props.onImport}>
            Import backup
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal(props: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-window" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="window-titlebar">
          <span>{props.title}</span>
          <button type="button" aria-label="Close" onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
      </section>
    </div>
  )
}

function PanelHeader(props: {
  eyebrow: string
  title: string
  sub?: string
  actions?: ReactNode
}) {
  return (
    <header className="panel-header">
      <div>
        <span>{props.eyebrow}</span>
        <h1>{props.title}</h1>
        {props.sub && <p>{props.sub}</p>}
      </div>
      {props.actions && <div className="panel-actions">{props.actions}</div>}
    </header>
  )
}

function WindowTitle(props: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="window-titlebar">
      <span>
        {props.icon}
        {props.title}
      </span>
      {props.action}
    </div>
  )
}

function Stat(props: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function InlineCreate(props: {
  value: string
  placeholder: string
  button: string
  onValue: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="inline-create"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <input value={props.value} placeholder={props.placeholder} onChange={(event) => props.onValue(event.target.value)} />
      <button type="submit">
        <Plus size={14} />
        {props.button}
      </button>
    </form>
  )
}

function NoteRow(props: {
  note: Note
  selected?: boolean
  onOpen: () => void
  actions?: ReactNode
}) {
  return (
    <article className={clsx('note-row', props.selected && 'selected')}>
      <button type="button" onClick={props.onOpen}>
        <span>
          {props.note.pinned && <Pin size={12} />}
          <strong>{props.note.title}</strong>
        </span>
        <p>{oneLine(props.note.body)}</p>
        <small>Updated {displayDate(props.note.updatedAt)}</small>
      </button>
      {props.actions && <div className="button-row">{props.actions}</div>}
    </article>
  )
}

function RecordList(props: {
  title: string
  records: ReturnType<typeof collectRecords>
  empty: string
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  return (
    <section className="window-panel">
      <WindowTitle icon={<Archive size={15} />} title={props.title} />
      <div className="row-list">
        {props.records.map((record) => (
          <RecordRow
            key={`${record.type}-${record.id}`}
            record={record}
            actions={
              <>
                <button type="button" onClick={() => props.onArchive(record.type, record.id, recordTitle(record))}>
                  <Archive size={14} />
                  Archive
                </button>
                <button type="button" onClick={() => props.onDelete(record.type, record.id, recordTitle(record))}>
                  <Trash2 size={14} />
                  Trash
                </button>
              </>
            }
          />
        ))}
        {props.records.length === 0 && <EmptyMini body={props.empty} />}
      </div>
    </section>
  )
}

function RecordRow(props: { record: ReturnType<typeof collectRecords>[number]; actions: ReactNode }) {
  return (
    <article className="record-row">
      <div>
        <strong>{recordTitle(props.record)}</strong>
        <span>{entityLabels[props.record.type]}</span>
        <small>Updated {displayDate(props.record.updatedAt)}</small>
      </div>
      <div className="button-row">{props.actions}</div>
    </article>
  )
}

function recordTitle(record: ReturnType<typeof collectRecords>[number]) {
  if ('text' in record) return record.text
  return record.title
}

function Inspector(props: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <aside className="inspector">
      <div className="window-titlebar">
        <span>{props.title}</span>
      </div>
      <div className="inspector-body">
        <h2>{props.subtitle}</h2>
        {props.children}
      </div>
    </aside>
  )
}

function EditorBlankState(props: { onCreate: () => void }) {
  return (
    <section className="blank-editor">
      <div>
        <FileText size={28} />
        <h2>No note open.</h2>
        <p>Select a note or start a new one.</p>
        <button type="button" className="primary-button" onClick={props.onCreate}>
          <Plus size={15} />
          New note
        </button>
      </div>
    </section>
  )
}

function EmptyPanel(props: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section className="empty-panel">
      <h2>{props.title}</h2>
      <p>{props.body}</p>
      {props.actionLabel && props.onAction && (
        <button type="button" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      )}
    </section>
  )
}

function EmptyMini(props: { body: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty-mini">
      <span>{props.body}</span>
      {props.action && props.onAction && (
        <button type="button" onClick={props.onAction}>
          {props.action}
        </button>
      )}
    </div>
  )
}

export default App
