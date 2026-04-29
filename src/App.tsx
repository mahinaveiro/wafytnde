import { useLiveQuery } from 'dexie-react-hooks'
import { clsx } from 'clsx'
import {
  Archive,
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
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
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
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
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChangelogModal } from './components/ChangelogModal'
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
import { UpdateReadyModal } from './components/UpdateReadyModal'
import { WhatsNewToast } from './components/WhatsNewToast'
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
  isValidHexColor,
  normalizeHexColor,
  patchSettings,
  resetLocalSettings,
} from './lib/settings'
import {
  ROUTE_AFTER_UPDATE_KEY,
  type UpdateCheckResult,
  useAppUpdate,
} from './hooks/useAppUpdate'
import {
  APP_NAME,
  type AppearanceOverrides,
  type AppSettings,
  type BackupPreview,
  type Bundle,
  type EntityType,
  type Note,
  type ParentType,
  type Project,
  type QuickCapture,
  type SearchResult,
  type TodoItem,
  type TodoList,
  type WafytndeBackup,
} from './lib/types'
import { APP_VERSION, formatAppReleaseDate } from './lib/version'

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

type UpdateCheckNotice = {
  title: string
  body: string
  detail?: string
}

type AppearanceDraft = {
  topBarColor: string
  accentColor: string
  primaryTextColor: string
  panelTintColor: string
}

type ThemeAppearanceDefaults = Omit<AppearanceDraft, 'panelTintColor'>

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

const appearanceDefaultsByTheme: Record<AppSettings['theme'], ThemeAppearanceDefaults> = {
  warm: {
    topBarColor: '#efc64f',
    accentColor: '#d56d33',
    primaryTextColor: '#241b14',
  },
  paper: {
    topBarColor: '#e9cd6b',
    accentColor: '#c6734a',
    primaryTextColor: '#241b14',
  },
  terminal: {
    topBarColor: '#24221d',
    accentColor: '#b86a2f',
    primaryTextColor: '#e6e0d2',
  },
}

const userManualSections: Array<{
  title: string
  body: string
  items: string[]
}> = [
  {
    title: 'Getting started',
    body: 'Begin with a note when you know what you want to write. Use a bundle when the thought belongs on a shelf.',
    items: ['New note creates a local note immediately.', 'Bundles group notes, projects, and todo lists.'],
  },
  {
    title: 'Editing notes',
    body: 'The editor is quiet on purpose. Open a note, click into the paper, and start typing.',
    items: ['Notes save automatically as you write.', 'Use the note controls to close, archive, trash, or focus the editor.'],
  },
  {
    title: 'Todo lists',
    body: 'Todo cards have an edit mode hidden in plain sight.',
    items: ['To edit a todo list title, click on its background area.', 'Use the task field inside edit mode to add more tasks.'],
  },
  {
    title: 'Organization system',
    body: 'Wafytnde uses a small hierarchy so loose writing and structured work can live together.',
    items: ['Bundles are top-level shelves.', 'Projects live inside bundles.', 'Notes can belong to a bundle or a project.'],
  },
  {
    title: 'Inbox / Capture',
    body: 'Capture is for fast, unsorted material that you can clean up later.',
    items: ['Quick captures land in Inbox first.', 'Move a capture into a note or todo when you are ready.'],
  },
  {
    title: 'Data & backups',
    body: 'Your workspace is local to this device unless you export it.',
    items: ['Export creates a JSON backup of records and preferences.', 'Import can merge with, or replace, local data.'],
  },
]

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

function getThemeAppearanceDefaults(theme: AppSettings['theme']): ThemeAppearanceDefaults {
  return appearanceDefaultsByTheme[theme]
}

function appearanceDraftFromSettings(settings: AppSettings): AppearanceDraft {
  const defaults = getThemeAppearanceDefaults(settings.theme)
  return {
    topBarColor: settings.appearanceOverrides?.topBarColor ?? defaults.topBarColor,
    accentColor: settings.appearanceOverrides?.accentColor ?? defaults.accentColor,
    primaryTextColor: settings.appearanceOverrides?.primaryTextColor ?? defaults.primaryTextColor,
    panelTintColor: settings.appearanceOverrides?.panelTintColor ?? '',
  }
}

function sanitizeAppearanceDraft(
  draft: AppearanceDraft,
  theme: AppSettings['theme'],
): AppearanceOverrides | undefined {
  const defaults = getThemeAppearanceDefaults(theme)
  const next: AppearanceOverrides = {}
  const topBarColor = normalizeHexColor(draft.topBarColor)
  const accentColor = normalizeHexColor(draft.accentColor)
  const primaryTextColor = normalizeHexColor(draft.primaryTextColor)
  const panelTintColor = draft.panelTintColor.trim() ? normalizeHexColor(draft.panelTintColor) : undefined

  if (topBarColor && topBarColor !== defaults.topBarColor) next.topBarColor = topBarColor
  if (accentColor && accentColor !== defaults.accentColor) next.accentColor = accentColor
  if (primaryTextColor && primaryTextColor !== defaults.primaryTextColor) {
    next.primaryTextColor = primaryTextColor
  }
  if (panelTintColor) next.panelTintColor = panelTintColor

  return Object.keys(next).length ? next : undefined
}

function appearanceDraftsEqual(left: AppearanceDraft, right: AppearanceDraft) {
  return (
    left.topBarColor.toLowerCase() === right.topBarColor.toLowerCase() &&
    left.accentColor.toLowerCase() === right.accentColor.toLowerCase() &&
    left.primaryTextColor.toLowerCase() === right.primaryTextColor.toLowerCase() &&
    left.panelTintColor.toLowerCase() === right.panelTintColor.toLowerCase()
  )
}

function appearanceDraftKey(draft: AppearanceDraft) {
  return [
    draft.topBarColor.toLowerCase(),
    draft.accentColor.toLowerCase(),
    draft.primaryTextColor.toLowerCase(),
    draft.panelTintColor.toLowerCase(),
  ].join('|')
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return undefined

  const value = normalized.slice(1)
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function applyAppearanceCssVariables(overrides?: AppearanceOverrides) {
  const root = document.documentElement
  const topBarColor = overrides?.topBarColor
  const accentColor = overrides?.accentColor
  const primaryTextColor = overrides?.primaryTextColor
  const panelTintColor = overrides?.panelTintColor ? hexToRgba(overrides.panelTintColor, 0.16) : undefined

  if (topBarColor) root.style.setProperty('--wafy-topbar-bg', topBarColor)
  else root.style.removeProperty('--wafy-topbar-bg')

  if (accentColor) root.style.setProperty('--wafy-accent', accentColor)
  else root.style.removeProperty('--wafy-accent')

  if (primaryTextColor) root.style.setProperty('--wafy-text-primary', primaryTextColor)
  else root.style.removeProperty('--wafy-text-primary')

  if (panelTintColor) root.style.setProperty('--wafy-panel-tint', panelTintColor)
  else root.style.removeProperty('--wafy-panel-tint')
}

function relativeLuminance(hex: string) {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return 0

  const channels = [normalized.slice(1, 3), normalized.slice(3, 5), normalized.slice(5, 7)].map((part) => {
    const value = Number.parseInt(part, 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(hexA: string, hexB: string) {
  const first = relativeLuminance(hexA)
  const second = relativeLuminance(hexB)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

function hasAppearanceContrastWarning(draft: AppearanceDraft) {
  if (
    !isValidHexColor(draft.topBarColor) ||
    !isValidHexColor(draft.accentColor) ||
    !isValidHexColor(draft.primaryTextColor)
  ) {
    return false
  }

  return contrastRatio(draft.primaryTextColor, draft.topBarColor) < 3 || contrastRatio('#1d130c', draft.accentColor) < 2.4
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

function todoSectionKey(parentType: ParentType, parentId: string) {
  return `${parentType}:${parentId}`
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function getInitialView() {
  if (localStorage.getItem(ROUTE_AFTER_UPDATE_KEY) === 'desk') return 'dashboard'

  const lastView = getSettings().lastView
  return isViewKey(lastView) ? lastView : 'dashboard'
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings())
  const [view, setView] = useState<ViewKey>(() => getInitialView())
  const [selectedBundleId, setSelectedBundleId] = useState<string>()
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [selectedNoteId, setSelectedNoteId] = useState<string>()
  const [paneSplit, setPaneSplit] = useState(0.39)
  const [detailFullscreen, setDetailFullscreen] = useState(false)
  const [expandedTodoSections, setExpandedTodoSections] = useState<Set<string>>(() => new Set())
  const [newTodoListId, setNewTodoListId] = useState<string>()
  const [searchQuery, setSearchQuery] = useState('')
  const [bundleTab, setBundleTab] = useState<'overview' | 'notes' | 'projects' | 'todos' | 'archive'>(
    'overview',
  )
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [updateCheckNotice, setUpdateCheckNotice] = useState<UpdateCheckNotice | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [online, setOnline] = useState(() => navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  const [highlightAbout, setHighlightAbout] = useState(false)
  const [storage, setStorage] = useState<StorageEstimate>({})
  const [exportStatus, setExportStatus] = useState<'idle' | 'collecting' | 'packing' | 'ready'>(
    'idle',
  )
  const [importState, setImportState] = useState<ImportState>({ busy: false })
  const toastIdRef = useRef(0)
  const paneGridRef = useRef<HTMLDivElement | null>(null)
  const appUpdate = useAppUpdate({
    onRouteAfterUpdate: () => navigate('dashboard'),
    onOpenChangelog: () => {
      setHighlightAbout(true)
      window.setTimeout(() => setHighlightAbout(false), 2200)
    },
  })

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
    applyAppearanceCssVariables(settings.appearanceOverrides)
  }, [settings])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onOfflineReady = () => {
      setOfflineReady(true)
      pushToast('Offline app shell is ready.')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('wafytnde:offline-ready', onOfflineReady)
    refreshStorage()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('wafytnde:offline-ready', onOfflineReady)
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
    setDetailFullscreen(false)
    if (nextView !== 'note' && isMobileLayout()) setSelectedNoteId(undefined)
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

  function parentViewForOpenNote() {
    if (selectedProject) return 'project'
    if (selectedBundle) return 'bundle'
    return 'dashboard'
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches
  }

  function closeNote() {
    setDetailFullscreen(false)
    setSelectedNoteId(undefined)
    if (isMobileLayout()) navigate(parentViewForOpenNote())
  }

  function backFromNote() {
    const parentView = parentViewForOpenNote()
    if (isMobileLayout()) setSelectedNoteId(undefined)
    navigate(parentView)
  }

  function setTodoSectionExpanded(sectionKey: string, expanded: boolean) {
    setExpandedTodoSections((current) => {
      const next = new Set(current)
      if (expanded) {
        next.add(sectionKey)
      } else {
        next.delete(sectionKey)
      }
      return next
    })
  }

  function resizePaneFromClientX(clientX: number) {
    const grid = paneGridRef.current
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const nextSplit = (clientX - rect.left) / rect.width
    setPaneSplit(Math.min(0.52, Math.max(0.38, nextSplit)))
  }

  function startPaneResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizePaneFromClientX(event.clientX)

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      resizePaneFromClientX(moveEvent.clientX)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }

  function nudgePaneResize(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setPaneSplit((current) => {
      const direction = event.key === 'ArrowLeft' ? -0.02 : 0.02
      return Math.min(0.52, Math.max(0.38, current + direction))
    })
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

  async function handleCreateTodoList(parentType?: ParentType, parentId?: string) {
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
    setNewTodoListId(list.id)
    setTodoSectionExpanded(todoSectionKey(targetType, targetId), true)
    pushToast('Todo list created.')
    openTodoParent(list)
    return list
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

  function viewWhatsNewInSettings() {
    appUpdate.dismissWhatsNew()
    navigate('settings')
    appUpdate.openChangelog()
  }

  function noticeForUpdateCheck(result: UpdateCheckResult): UpdateCheckNotice | null {
    if (result.status === 'update-available') return null
    if (result.status === 'up-to-date') {
      return {
        title: "You're up to date",
        body: "You're already using the latest version of Wafytnde.",
        detail: 'No updates available right now.',
      }
    }
    if (result.status === 'unavailable') {
      return {
        title: 'Update check unavailable',
        body: 'The offline app shell is not registered for this run.',
        detail: 'Try again from the installed app or a production build.',
      }
    }
    return {
      title: 'Could not check updates',
      body: 'Wafytnde could not reach the app update service.',
      detail: 'Check your connection and try again.',
    }
  }

  async function handleCheckUpdate() {
    const result = await appUpdate.checkForUpdate({ revealModal: true })
    const notice = noticeForUpdateCheck(result)
    if (notice) setUpdateCheckNotice(notice)
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
          onCreateNote={handleCreateNote}
          onOpenInbox={() => navigate('inbox')}
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
          newTodoListId={newTodoListId}
          expandedTodoSections={expandedTodoSections}
          onTodoSectionExpanded={setTodoSectionExpanded}
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
          newTodoListId={newTodoListId}
          expandedTodoSections={expandedTodoSections}
          onTodoSectionExpanded={setTodoSectionExpanded}
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
        updateReady={appUpdate.updateAvailable}
        highlightAbout={highlightAbout}
        storage={storage}
        exportStatus={exportStatus}
        importState={importState}
        onPatch={patchAppSettings}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onApplyImport={applyImport}
        onRefreshStorage={refreshStorage}
        onReset={handleResetData}
        onReloadUpdate={appUpdate.refreshToUpdate}
        onCheckUpdate={handleCheckUpdate}
        onOpenChangelog={appUpdate.openChangelog}
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
          onBack={backFromNote}
          onClose={closeNote}
          fullscreen={detailFullscreen}
          onToggleFullscreen={() => setDetailFullscreen((current) => !current)}
          onSave={async (patch) => updateNote(selectedNote.id, patch)}
          onCreateTodoList={() => handleCreateTodoList('note', selectedNote.id)}
          newTodoListId={newTodoListId}
          expandedTodoSections={expandedTodoSections}
          onTodoSectionExpanded={setTodoSectionExpanded}
          onArchive={() => askArchive('note', selectedNote.id, selectedNote.title)}
          onDelete={() => askDelete('note', selectedNote.id, selectedNote.title)}
          onArchiveTodo={(type, id, title) => askArchive(type, id, title)}
          onDeleteTodo={(type, id, title) => askDelete(type, id, title)}
          onOpenTodoParent={openTodoParent}
          pushToast={pushToast}
        />
      ) : (
        <EditorBlankState
          notes={activeNotes}
          onCreate={() => void handleCreateNote()}
          onOpen={openNote}
        />
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
    return (
      <EditorBlankState
        notes={activeNotes}
        onCreate={() => void handleCreateNote()}
        onOpen={openNote}
      />
    )
  }

  const paneStyle = { '--middle-pane-size': `${paneSplit * 100}%` } as CSSProperties
  const modalOpen =
    !settings.onboardingComplete ||
    quickCaptureOpen ||
    commandOpen ||
    Boolean(confirmState) ||
    Boolean(updateCheckNotice) ||
    appUpdate.showUpdateModal ||
    appUpdate.showChangelog
  const whatsNewVisible = appUpdate.showWhatsNew && !modalOpen

  return (
    <main
      className={clsx(
        'app-root',
        settings.sidebarCollapsed && 'sidebar-collapsed',
        detailFullscreen && 'detail-fullscreen',
      )}
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
        <MobileHeader onNavigateDesk={() => navigate('dashboard')} />
        <Topbar
          view={view}
          searchQuery={searchQuery}
          online={online}
          offlineReady={offlineReady}
          updateReady={appUpdate.updateAvailable}
          onSearch={(query) => {
            setSearchQuery(query)
            navigate('search')
          }}
          onCommand={() => setCommandOpen(true)}
          onCapture={() => setQuickCaptureOpen(true)}
          onNewNote={() => void handleCreateNote()}
          onApplyUpdate={() => void appUpdate.refreshToUpdate()}
        />

        <div className="pane-grid" ref={paneGridRef} style={paneStyle}>
          <section className="middle-panel">{renderMainPanel()}</section>
          <button
            type="button"
            className="pane-resizer"
            aria-label="Resize editor panes"
            aria-orientation="vertical"
            onPointerDown={startPaneResize}
            onKeyDown={nudgePaneResize}
          />
          <section className="detail-panel">{renderDetailPanel()}</section>
        </div>
      </section>

      <MobileNav activeView={view} onNavigate={navigate} />
      {view === 'dashboard' && !modalOpen && !whatsNewVisible && (
        <button
          type="button"
          className="mobile-capture"
          aria-label="Quick capture"
          onClick={() => setQuickCaptureOpen(true)}
        >
          <Plus size={22} />
        </button>
      )}

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
      {updateCheckNotice && (
        <UpdateCheckDialog
          notice={updateCheckNotice}
          onClose={() => setUpdateCheckNotice(null)}
        />
      )}
      <UpdateReadyModal
        show={appUpdate.showUpdateModal}
        onLater={appUpdate.dismissUpdateForSession}
        onRefresh={appUpdate.refreshToUpdate}
      />
      <ChangelogModal show={appUpdate.showChangelog} onClose={appUpdate.closeChangelog} />
      <WhatsNewToast
        show={whatsNewVisible}
        onDismiss={appUpdate.dismissWhatsNew}
        onViewSettings={viewWhatsNewInSettings}
      />
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
  const pinnedBundles = props.bundles.filter((bundle) => bundle.pinned)
  return (
    <aside className="sidebar">
      <div className="app-mark">
        <div className="app-stamp" aria-hidden="true">
          W
        </div>
        <div className="sidebar-brand-copy">
          <strong>{APP_NAME}</strong>
          <span>My Library</span>
        </div>
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
              <span className="sidebar-label">{item.label}</span>
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
          {pinnedBundles.slice(0, 6).map((bundle) => (
            <button key={bundle.id} type="button" onClick={() => props.onOpenBundle(bundle)}>
              <span className="color-dot" style={{ background: bundle.color }} />
              <span>{bundle.title}</span>
            </button>
          ))}
          {pinnedBundles.length === 0 && <p>Nothing pinned yet.</p>}
        </div>
      )}
      <div className="sidebar-footer">
        {!props.collapsed && (
          <span>
            {props.online ? 'Online' : 'Offline'} · {readableStorage(props.storageUsage)}
          </span>
        )}
        <button type="button" aria-label="Toggle sidebar" onClick={props.onToggleCollapse}>
          {props.collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </aside>
  )
}

function MobileHeader(props: { onNavigateDesk: () => void }) {
  return (
    <header className="mobile-header">
      <button type="button" onClick={props.onNavigateDesk} aria-label="Go to Desk">
        <span className="mobile-stamp" aria-hidden="true">
          W
        </span>
        <span>
          <strong>{APP_NAME}</strong>
          <small>My Library</small>
        </span>
      </button>
    </header>
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
    { view: 'trash', label: 'Trash', icon: Trash2 },
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
            aria-label={item.label}
            title={item.label}
          >
            <Icon size={18} />
            <span className="sr-only">{item.label}</span>
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
  onCreateNote: () => Promise<void>
  onOpenInbox: () => void
}) {
  const pinnedBundles = props.activeBundles.filter((bundle) => bundle.pinned)
  return (
    <div className="panel-stack">
      <PanelHeader
        eyebrow="Local desk"
        title="Capture, then sort it later."
      />
      <div className="stat-row">
        <Stat label="Bundles" value={props.activeBundles.length} />
        <Stat label="Notes" value={props.activeNotes.length} />
        <Stat label="Projects" value={props.activeProjects.length} />
        <Stat label="Open todos" value={countOpenTodos(props.activeTodoLists, props.todoItems)} />
      </div>
      <CollapsibleSection
        icon={<Inbox size={15} />}
        title="Inbox strip"
        defaultOpen
        action={<span className="window-count">{props.captures.length} waiting</span>}
      >
        <div className="inbox-strip-list">
          {props.captures.slice(0, 4).map((capture) => (
            <button key={capture.id} type="button" className="capture-strip-row" onClick={props.onOpenInbox}>
              <strong>{capture.title}</strong>
              <span>{oneLine(capture.body)}</span>
              <small>Captured {displayDate(capture.createdAt)}</small>
            </button>
          ))}
          {props.captures.length === 0 && <EmptyMini body="No waiting captures." />}
        </div>
      </CollapsibleSection>
      <section className="split-section">
        <CollapsibleSection icon={<FileText size={15} />} title="Recently updated notes" defaultOpen>
          <div className="row-list">
            {props.activeNotes.slice(0, 6).map((note) => (
              <NoteRow key={note.id} note={note} onOpen={() => props.onOpenNote(note)} />
            ))}
            {props.activeNotes.length === 0 && (
              <EmptyMini body="No notes yet." action="New note" onAction={() => void props.onCreateNote()} />
            )}
          </div>
        </CollapsibleSection>
        <CollapsibleSection icon={<FolderOpen size={15} />} title="Pinned bundles" defaultOpen>
          <div className="bundle-tile-list">
            {pinnedBundles.slice(0, 5).map((bundle) => (
              <button key={bundle.id} type="button" onClick={() => props.onOpenBundle(bundle)}>
                <span className="color-dot" style={{ background: bundle.color }} />
                <strong>{bundle.title}</strong>
                <small>{oneLine(bundle.description, 'No description.')}</small>
              </button>
            ))}
            {pinnedBundles.length === 0 && <EmptyMini body="Nothing pinned yet." />}
          </div>
        </CollapsibleSection>
      </section>
      <CollapsibleSection icon={<SlidersHorizontal size={15} />} title="Active projects" defaultOpen>
        <div className="row-list">
          {props.activeProjects.slice(0, 4).map((project) => (
            <ProjectRow key={project.id} project={project} onOpen={() => props.onOpenProject(project)} />
          ))}
          {props.activeProjects.length === 0 && <EmptyMini body="No active projects." />}
        </div>
      </CollapsibleSection>
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
  onCreateTodoList: () => Promise<TodoList>
  newTodoListId?: string
  expandedTodoSections: Set<string>
  onTodoSectionExpanded: (sectionKey: string, expanded: boolean) => void
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const bundleProjects = props.activeProjects.filter((project) => project.bundleId === props.bundle.id)
  const bundleNotes = props.activeNotes.filter((note) => note.bundleId === props.bundle.id && !note.projectId)
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
    if (record.type === 'note') return record.bundleId === props.bundle.id && !record.projectId
    if (record.type === 'todoList') return bundleTodoLists.some((list) => list.id === record.id)
    return record.type === 'todoItem'
  })
  const [noteTitle, setNoteTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const todoKey = todoSectionKey('bundle', props.bundle.id)
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
            <CollapsibleSection icon={<FileText size={15} />} title="Pinned and recent notes" defaultOpen>
              <div className="row-list">
                {bundleNotes.slice(0, 6).map((note) => (
                  <NoteRow key={note.id} note={note} onOpen={() => props.onOpenNote(note)} />
                ))}
                {bundleNotes.length === 0 && <EmptyMini body="No notes in this bundle." />}
              </div>
            </CollapsibleSection>
            <CollapsibleSection icon={<SlidersHorizontal size={15} />} title="Active projects" defaultOpen>
              <div className="row-list">
                {bundleProjects.slice(0, 6).map((project) => (
                  <ProjectRow key={project.id} project={project} onOpen={() => props.onOpenProject(project)} />
                ))}
                {bundleProjects.length === 0 && <EmptyMini body="No projects yet." />}
              </div>
            </CollapsibleSection>
          </section>
          <TodoSection
            sectionKey={todoKey}
            expanded={props.expandedTodoSections.has(todoKey)}
            lists={bundleTodoLists}
            items={props.todoItems}
            data={props.data}
            newTodoListId={props.newTodoListId}
            onExpandedChange={props.onTodoSectionExpanded}
            onCreateTodoList={props.onCreateTodoList}
            onArchive={props.onArchive}
            onDelete={props.onDelete}
          />
        </>
      )}
      {props.tab === 'notes' && (
        <CollapsibleSection icon={<FileText size={15} />} title="Notes" defaultOpen>
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
        </CollapsibleSection>
      )}
      {props.tab === 'projects' && (
        <CollapsibleSection icon={<SlidersHorizontal size={15} />} title="Projects" defaultOpen>
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
          <div className="row-list">
            {bundleProjects.map((project) => (
              <ProjectRow key={project.id} project={project} onOpen={() => props.onOpenProject(project)} />
            ))}
            {bundleProjects.length === 0 && <EmptyMini body="No projects yet." />}
          </div>
        </CollapsibleSection>
      )}
      {props.tab === 'todos' && (
        <TodoSection
          sectionKey={todoKey}
          expanded={props.expandedTodoSections.has(todoKey)}
          lists={bundleTodoLists}
          items={props.todoItems}
          data={props.data}
          newTodoListId={props.newTodoListId}
          onExpandedChange={props.onTodoSectionExpanded}
          onCreateTodoList={props.onCreateTodoList}
          onArchive={props.onArchive}
          onDelete={props.onDelete}
        />
      )}
      {props.tab === 'archive' && (
        <CollapsibleSection icon={<Archive size={15} />} title="Archived in this bundle" defaultOpen>
          <div className="row-list">
            {archived.map((record) => (
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
            {archived.length === 0 && <EmptyMini body="No archived records in this bundle." />}
          </div>
        </CollapsibleSection>
      )}
      {props.tab === 'overview' && (
        <BundleEditCard
          bundle={props.bundle}
          onSave={(patch) => updateBundle(props.bundle.id, patch)}
          onArchive={() => props.onArchive('bundle', props.bundle.id, props.bundle.title)}
          onDelete={() => props.onDelete('bundle', props.bundle.id, props.bundle.title)}
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
  onCreateTodoList: () => Promise<TodoList>
  newTodoListId?: string
  expandedTodoSections: Set<string>
  onTodoSectionExpanded: (sectionKey: string, expanded: boolean) => void
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const [noteTitle, setNoteTitle] = useState('')
  const notes = props.activeNotes.filter((note) => note.projectId === props.project.id)
  const todoLists = props.activeTodoLists.filter(
    (list) => list.parentType === 'project' && list.parentId === props.project.id,
  )
  const todoKey = todoSectionKey('project', props.project.id)
  return (
    <div className="panel-stack">
      <button type="button" className="back-button" onClick={props.onBack}>
        <ChevronLeft size={15} />
        Bundle
      </button>
      <PanelHeader eyebrow="Project" title={props.project.title} sub={props.project.description || props.project.status} />
      <CollapsibleSection icon={<FileText size={15} />} title="Linked notes" defaultOpen>
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
      </CollapsibleSection>
      <TodoSection
        sectionKey={todoKey}
        expanded={props.expandedTodoSections.has(todoKey)}
        lists={todoLists}
        items={props.todoItems}
        data={props.data}
        newTodoListId={props.newTodoListId}
        onExpandedChange={props.onTodoSectionExpanded}
        onCreateTodoList={props.onCreateTodoList}
        onArchive={props.onArchive}
        onDelete={props.onDelete}
      />
      <ProjectEditCard
        project={props.project}
        onSave={(patch) => updateProject(props.project.id, patch)}
        onArchive={() => props.onArchive('project', props.project.id, props.project.title)}
        onDelete={() => props.onDelete('project', props.project.id, props.project.title)}
      />
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
        title="Restore or erase"
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
  highlightAbout: boolean
  storage: StorageEstimate
  exportStatus: 'idle' | 'collecting' | 'packing' | 'ready'
  importState: ImportState
  onPatch: (patch: Partial<AppSettings>) => void
  onExport: () => Promise<void>
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onApplyImport: (mode: 'merge' | 'replace') => Promise<void>
  onRefreshStorage: () => Promise<void>
  onReset: () => void
  onReloadUpdate: () => Promise<void> | void
  onCheckUpdate: () => Promise<void>
  onOpenChangelog: () => void
}) {
  const [checkingUpdate, setCheckingUpdate] = useState(false)
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
              <option value="terminal">Night Desk</option>
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
        <AppearancePersonalization settings={props.settings} onPatch={props.onPatch} />
      </section>
      <section className="window-panel">
        <WindowTitle icon={<WifiOff size={15} />} title="PWA / Offline" />
        <div className="status-grid">
          <span>{props.online ? 'Network online' : 'Network offline'}</span>
          <span>{props.offlineReady ? 'Offline app shell ready' : 'Offline shell will cache after build'}</span>
          <span>{props.updateReady ? 'Update available' : 'No waiting update'}</span>
          {props.updateReady ? (
            <button type="button" className="primary-button" onClick={() => void props.onReloadUpdate()}>
              <RefreshCw size={15} />
              Refresh now
            </button>
          ) : (
            <button
              type="button"
              disabled={checkingUpdate}
              onClick={async () => {
                setCheckingUpdate(true)
                try {
                  await props.onCheckUpdate()
                } finally {
                  setCheckingUpdate(false)
                }
              }}
            >
              <RefreshCw size={15} />
              {checkingUpdate ? 'Checking' : 'Check for updates'}
            </button>
          )}
        </div>
      </section>
      <section className="window-panel shortcuts-panel">
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
      <UserManualPanel />
      <section className={clsx('window-panel about-panel', props.highlightAbout && 'highlight')}>
        <WindowTitle icon={<BookOpen size={15} />} title="About" />
        <div className="about-body">
          <div>
            <h3>{APP_NAME}</h3>
            <p>Version {APP_VERSION}</p>
            <p>Updated {formatAppReleaseDate()}</p>
          </div>
          <button type="button" onClick={props.onOpenChangelog}>
            What changed
          </button>
        </div>
      </section>
    </div>
  )
}

function AppearancePersonalization(props: {
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
}) {
  const savedDraft = appearanceDraftFromSettings(props.settings)
  const [status, setStatus] = useState<string>()

  return (
    <AppearancePersonalizationEditor
      key={appearanceDraftKey(savedDraft)}
      settings={props.settings}
      savedDraft={savedDraft}
      status={status}
      onStatus={setStatus}
      onPatch={props.onPatch}
    />
  )
}

function AppearancePersonalizationEditor(props: {
  settings: AppSettings
  savedDraft: AppearanceDraft
  status?: string
  onStatus: (status?: string) => void
  onPatch: (patch: Partial<AppSettings>) => void
}) {
  const savedDraft = props.savedDraft
  const [draft, setDraft] = useState<AppearanceDraft>(savedDraft)
  const requiredInvalid =
    !isValidHexColor(draft.topBarColor) ||
    !isValidHexColor(draft.accentColor) ||
    !isValidHexColor(draft.primaryTextColor)
  const panelTintInvalid = Boolean(draft.panelTintColor.trim() && !isValidHexColor(draft.panelTintColor))
  const hasDraftChanges = !appearanceDraftsEqual(draft, savedDraft)
  const contrastWarning = hasAppearanceContrastWarning(draft)
  const canReset = Boolean(props.settings.appearanceOverrides) || hasDraftChanges

  function updateDraft(field: keyof AppearanceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    props.onStatus(undefined)
  }

  function handleApply() {
    if (requiredInvalid || panelTintInvalid) {
      props.onStatus('Use valid #RRGGBB colors before applying.')
      return
    }

    props.onPatch({ appearanceOverrides: sanitizeAppearanceDraft(draft, props.settings.theme) })
    props.onStatus('Appearance updated.')
  }

  function handleReset() {
    const defaults = getThemeAppearanceDefaults(props.settings.theme)
    setDraft({ ...defaults, panelTintColor: '' })
    props.onPatch({ appearanceOverrides: undefined })
    props.onStatus('Default appearance restored.')
  }

  function handleCancel() {
    setDraft(savedDraft)
    props.onStatus('Changes discarded.')
  }

  return (
    <div className="personalization-panel">
      <div className="personalization-intro">
        <h3>Personalization</h3>
        <p>Optional color tweaks. Defaults stay untouched unless applied.</p>
      </div>
      <div className="personalization-layout">
        <div className="personalization-controls">
          <AppearanceColorControl
            label="Top bar color"
            value={draft.topBarColor}
            fallback={getThemeAppearanceDefaults(props.settings.theme).topBarColor}
            onChange={(value) => updateDraft('topBarColor', value)}
          />
          <AppearanceColorControl
            label="Accent color"
            value={draft.accentColor}
            fallback={getThemeAppearanceDefaults(props.settings.theme).accentColor}
            onChange={(value) => updateDraft('accentColor', value)}
          />
          <AppearanceColorControl
            label="Primary text color"
            value={draft.primaryTextColor}
            fallback={getThemeAppearanceDefaults(props.settings.theme).primaryTextColor}
            onChange={(value) => updateDraft('primaryTextColor', value)}
          />
          <AppearanceColorControl
            label="Panel background tint"
            value={draft.panelTintColor}
            fallback="#fff9e9"
            helper="Subtle overlay only. Leave blank for standard panels."
            enabled={Boolean(draft.panelTintColor.trim())}
            onEnabledChange={(enabled) => updateDraft('panelTintColor', enabled ? '#fff9e9' : '')}
            onChange={(value) => updateDraft('panelTintColor', value)}
          />
        </div>
        <AppearancePreview draft={draft} theme={props.settings.theme} />
      </div>
      {(requiredInvalid || panelTintInvalid || contrastWarning || props.status) && (
        <p className={clsx('appearance-status', (requiredInvalid || panelTintInvalid) && 'error')}>
          {requiredInvalid || panelTintInvalid
            ? 'Use valid #RRGGBB colors before applying.'
            : props.status ?? 'Some colors may reduce readability.'}
        </p>
      )}
      <div className="button-row personalization-actions">
        <button type="button" className="primary-button" disabled={!hasDraftChanges || requiredInvalid || panelTintInvalid} onClick={handleApply}>
          Apply changes
        </button>
        <button type="button" disabled={!canReset} onClick={handleReset}>
          Reset to default
        </button>
        {hasDraftChanges && (
          <button type="button" onClick={handleCancel}>
            Cancel changes
          </button>
        )}
      </div>
    </div>
  )
}

function AppearanceColorControl(props: {
  label: string
  value: string
  fallback: string
  helper?: string
  enabled?: boolean
  onEnabledChange?: (enabled: boolean) => void
  onChange: (value: string) => void
}) {
  const hexInputId = useId()
  const colorInputId = useId()
  const isOptional = Boolean(props.onEnabledChange)
  const enabled = props.enabled ?? true
  const pickerValue = normalizeHexColor(props.value) ?? props.fallback

  return (
    <div className="color-control">
      <div className="color-control-label">
        <label htmlFor={hexInputId}>{props.label}</label>
        {props.helper && <small>{props.helper}</small>}
      </div>
      <div className={clsx('color-control-inputs', !enabled && 'disabled')}>
        {isOptional && (
          <label className="check-row panel-tint-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => props.onEnabledChange?.(event.target.checked)}
            />
            <span>Enable panel tint</span>
          </label>
        )}
        {enabled ? (
          <div className="color-control-row">
            <input
              id={colorInputId}
              className="color-swatch-input"
              type="color"
              value={pickerValue}
              aria-label={`Choose ${props.label.toLowerCase()}`}
              onChange={(event) => props.onChange(event.target.value)}
            />
            <input
              id={hexInputId}
              className="color-hex-input"
              value={props.value}
              placeholder={props.fallback}
              onChange={(event) => props.onChange(event.target.value)}
              spellCheck={false}
            />
          </div>
        ) : (
          <span className="no-tint-label">No tint</span>
        )}
      </div>
    </div>
  )
}

function AppearancePreview(props: {
  draft: AppearanceDraft
  theme: AppSettings['theme']
}) {
  const defaults = getThemeAppearanceDefaults(props.theme)
  const topBarColor = normalizeHexColor(props.draft.topBarColor) ?? defaults.topBarColor
  const accentColor = normalizeHexColor(props.draft.accentColor) ?? defaults.accentColor
  const primaryTextColor = normalizeHexColor(props.draft.primaryTextColor) ?? defaults.primaryTextColor
  const panelTint = props.draft.panelTintColor.trim() ? hexToRgba(props.draft.panelTintColor, 0.2) : 'transparent'
  const style = {
    '--preview-topbar-bg': topBarColor,
    '--preview-accent': accentColor,
    '--preview-text': primaryTextColor,
    '--preview-panel-tint': panelTint ?? 'transparent',
  } as CSSProperties

  return (
    <div className="appearance-preview" style={style} aria-label="Appearance preview">
      <div className="appearance-preview-topbar">
        <span />
        <strong>Wafytnde</strong>
      </div>
      <div className="appearance-preview-panel">
        <p>Sample note text</p>
        <button type="button">Sample button</button>
      </div>
    </div>
  )
}

function UserManualPanel() {
  return (
    <section className="window-panel user-manual-panel">
      <WindowTitle icon={<BookOpen size={15} />} title="User manual" />
      <div className="manual-grid">
        {userManualSections.map((section) => (
          <article key={section.title} className="manual-card">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function NoteEditor(props: {
  note: Note
  bundles: Bundle[]
  projects: Project[]
  todoLists: TodoList[]
  todoItems: TodoItem[]
  onBack: () => void
  onClose: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  onSave: (patch: Partial<Note>) => Promise<void>
  onCreateTodoList: () => Promise<TodoList>
  newTodoListId?: string
  expandedTodoSections: Set<string>
  onTodoSectionExpanded: (sectionKey: string, expanded: boolean) => void
  onArchive: () => void
  onDelete: () => void
  onArchiveTodo: (type: EntityType, id: string, title: string) => void
  onDeleteTodo: (type: EntityType, id: string, title: string) => void
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
  const todoKey = todoSectionKey('note', props.note.id)
  return (
    <article className="note-editor">
      <div className="editor-titlebar">
        <div className="editor-window-controls">
          <button type="button" className="mac-control close" aria-label="Close note" onClick={props.onClose}>
            <X size={11} />
          </button>
          <button type="button" className="mac-control back" aria-label="Back" title="Back" onClick={props.onBack}>
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="mac-control fullscreen"
            aria-label={props.fullscreen ? 'Exit fullscreen editor' : 'Fullscreen editor'}
            title={props.fullscreen ? 'Exit fullscreen editor' : 'Fullscreen editor'}
            onClick={props.onToggleFullscreen}
          >
            {props.fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
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
          aria-label="Save now"
          title="Save now"
          onClick={() => {
            void props.onSave({ title: title.trim() || 'Untitled note', body })
            props.pushToast('Note saved.')
          }}
        >
          <Save size={14} />
        </button>
        <button
          type="button"
          aria-label={props.note.pinned ? 'Unpin note' : 'Pin note'}
          title={props.note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={() => void props.onSave({ pinned: !props.note.pinned })}
        >
          <Pin size={14} />
        </button>
        <button
          type="button"
          aria-label={props.note.favorite ? 'Unfavorite note' : 'Favorite note'}
          title={props.note.favorite ? 'Unfavorite note' : 'Favorite note'}
          onClick={() => void props.onSave({ favorite: !props.note.favorite })}
        >
          <Star size={14} />
        </button>
        <button type="button" aria-label="New todo list" title="New todo list" onClick={() => void props.onCreateTodoList()}>
          <ListTodo size={14} />
        </button>
        <button type="button" aria-label="Archive note" title="Archive note" onClick={props.onArchive}>
          <Archive size={14} />
        </button>
        <button type="button" aria-label="Trash note" title="Trash note" onClick={props.onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
      <TodoSection
        sectionKey={todoKey}
        className="linked-todos"
        expanded={props.expandedTodoSections.has(todoKey)}
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
        newTodoListId={props.newTodoListId}
        onExpandedChange={props.onTodoSectionExpanded}
        onCreateTodoList={props.onCreateTodoList}
        onArchive={props.onArchiveTodo}
        onDelete={props.onDeleteTodo}
      />
    </article>
  )
}

function BundleColorField(props: {
  value: string
  onSave: (color: string) => Promise<void>
}) {
  const savedColor = normalizeHexColor(props.value) ?? '#efc64f'

  return <BundleColorFieldEditor key={savedColor} value={savedColor} onSave={props.onSave} />
}

function BundleColorFieldEditor(props: {
  value: string
  onSave: (color: string) => Promise<void>
}) {
  const hexInputId = useId()
  const [draft, setDraft] = useState(props.value)
  const draftColor = normalizeHexColor(draft)

  function commit(nextValue = draft) {
    const color = normalizeHexColor(nextValue)
    if (!color || color === props.value) return
    void props.onSave(color)
  }

  return (
    <div className="bundle-color-field">
      <div className="color-control-label">
        <label htmlFor={hexInputId}>Color</label>
        <small>Swatch, hex, or picker.</small>
      </div>
      <input
        className="color-swatch-input"
        type="color"
        value={draftColor ?? props.value}
        aria-label="Choose bundle color"
        onChange={(event) => {
          setDraft(event.target.value)
          void props.onSave(event.target.value)
        }}
      />
      <input
        id={hexInputId}
        className="color-hex-input"
        value={draft}
        placeholder={props.value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
        spellCheck={false}
      />
      {!draftColor && <small className="color-field-error">Use #RRGGBB.</small>}
    </div>
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
      <BundleColorField value={props.bundle.color} onSave={(color) => props.onSave({ color })} />
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

function BundleEditCard(props: {
  bundle: Bundle
  onSave: (patch: Partial<Bundle>) => Promise<void>
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <CollapsibleSection className="inline-detail-card" icon={<FolderOpen size={15} />} title="Bundle card" defaultOpen>
      <div className="detail-card-body">
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
        <BundleColorField value={props.bundle.color} onSave={(color) => props.onSave({ color })} />
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
      </div>
    </CollapsibleSection>
  )
}

function ProjectEditCard(props: {
  project: Project
  onSave: (patch: Partial<Project>) => Promise<void>
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <CollapsibleSection className="inline-detail-card" icon={<SlidersHorizontal size={15} />} title="Project card" defaultOpen>
      <div className="detail-card-body">
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
      </div>
    </CollapsibleSection>
  )
}

function TodoSection(props: {
  sectionKey: string
  className?: string
  expanded: boolean
  lists: TodoList[]
  items: TodoItem[]
  data: LoadedData
  newTodoListId?: string
  onExpandedChange: (sectionKey: string, expanded: boolean) => void
  onCreateTodoList?: () => Promise<TodoList>
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const count = props.lists.length
  return (
    <section className={clsx('window-panel todo-section', props.className)}>
      <WindowTitle
        icon={<ListTodo size={15} />}
        title="Todos"
        action={
          <div className="todo-section-actions">
            {props.onCreateTodoList && (
              <button
                type="button"
                aria-label="New todo list"
                title="New todo list"
                onClick={() => void props.onCreateTodoList?.()}
              >
                <Plus size={14} />
              </button>
            )}
            <button
              type="button"
              className={clsx('todo-section-toggle', props.expanded && 'open')}
              aria-label={props.expanded ? 'Collapse todos' : 'Expand todos'}
              title={props.expanded ? 'Collapse todos' : 'Expand todos'}
              aria-expanded={props.expanded}
              onClick={() => props.onExpandedChange(props.sectionKey, !props.expanded)}
            >
              <ChevronDown size={14} />
              <span>{count}</span>
            </button>
          </div>
        }
      />
      {props.expanded && (
        <TodoListCollection
          lists={props.lists}
          items={props.items}
          data={props.data}
          newTodoListId={props.newTodoListId}
          onArchive={props.onArchive}
          onDelete={props.onDelete}
        />
      )}
    </section>
  )
}

function TodoListCollection(props: {
  lists: TodoList[]
  items: TodoItem[]
  data: LoadedData
  newTodoListId?: string
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
          startEditing={list.id === props.newTodoListId}
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
  startEditing?: boolean
  onArchive: (type: EntityType, id: string, title: string) => void
  onDelete: (type: EntityType, id: string, title: string) => void
}) {
  const [editing, setEditing] = useState(Boolean(props.startEditing))
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [text, setText] = useState('')
  const [draftTitle, setDraftTitle] = useState(props.list.title)
  const taskInputRef = useRef<HTMLInputElement | null>(null)
  const completed = props.items.filter((item) => item.completed).length
  const nextTitle = draftTitle.trim() || 'New todo list'
  const titleChanged = nextTitle !== props.list.title
  const taskChanged = text.trim().length > 0
  const canSave = titleChanged || taskChanged
  const visibleItems = props.items.filter((item) => {
    if (filter === 'active') return !item.completed
    if (filter === 'completed') return item.completed
    return true
  })
  function enterEditMode(event: MouseEvent<HTMLElement>) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button,input,label,select,textarea,a')) return
    setEditing(true)
  }
  async function saveTitleIfNeeded() {
    if (titleChanged) {
      await updateTodoList(props.list.id, { title: nextTitle })
      setDraftTitle(nextTitle)
    }
  }
  async function addTaskAndKeepEditing() {
    if (!taskChanged) return
    await saveTitleIfNeeded()
    await createTodoItem(props.list.id, text.trim())
    setText('')
    if (filter === 'completed') setFilter('all')
    window.setTimeout(() => taskInputRef.current?.focus(), 0)
  }
  async function saveEdits() {
    if (!canSave) return
    await saveTitleIfNeeded()
    if (taskChanged) {
      await createTodoItem(props.list.id, text.trim())
    }
    setText('')
    setEditing(false)
  }
  function cancelEdits() {
    setDraftTitle(props.list.title)
    setText('')
    setEditing(false)
  }
  return (
    <article className={clsx('todo-card', editing && 'editing')} onClick={enterEditMode}>
      {editing && (
        <div className="todo-card-controls">
          <button
            type="button"
            className="mac-control save"
            aria-label="Save todo list"
            title="Save todo list"
            disabled={!canSave}
            onClick={() => void saveEdits()}
          >
            <Check size={12} />
          </button>
          <button type="button" className="mac-control close" aria-label="Cancel todo edits" title="Cancel todo edits" onClick={cancelEdits}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className="todo-title">
        {editing ? (
          <input
            value={draftTitle}
            aria-label="Todo list title"
            onChange={(event) => setDraftTitle(event.target.value)}
          />
        ) : (
          <strong>{props.list.title}</strong>
        )}
        <span>
          {completed}/{props.items.length} done
        </span>
      </div>
      <small>{props.parentLabel}</small>
      {editing && (
        <>
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
              void addTaskAndKeepEditing()
            }}
          >
            <input
              ref={taskInputRef}
              value={text}
              placeholder="Add task"
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" aria-label="Add task" title="Add task" disabled={!taskChanged}>
              <Check size={14} />
            </button>
          </form>
        </>
      )}
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
            {editing && (
              <div className="todo-item-actions">
                <button
                  type="button"
                  aria-label="Move todo up"
                  title="Move todo up"
                  disabled={index === 0}
                  onClick={() => {
                    const previous = visibleItems[index - 1]
                    if (!previous) return
                    void updateTodoItem(item.id, { order: previous.order - 1 })
                  }}
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Delete todo"
                  title="Delete todo"
                  onClick={() => void softDeleteRecord('todoItem', item.id)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
        {visibleItems.length === 0 && <span className="empty-line">Nothing here yet.</span>}
      </div>
      {editing && (
        <div className="button-row todo-editor-actions">
          <button
            type="button"
            aria-label="Archive todo list"
            title="Archive todo list"
            onClick={() => props.onArchive('todoList', props.list.id, props.list.title)}
          >
            <Archive size={14} />
          </button>
          <button
            type="button"
            aria-label="Trash todo list"
            title="Trash todo list"
            onClick={() => props.onDelete('todoList', props.list.id, props.list.title)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
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

function UpdateCheckDialog(props: { notice: UpdateCheckNotice; onClose: () => void }) {
  return (
    <Modal title={props.notice.title} onClose={props.onClose}>
      <div className="update-check-panel">
        <p>{props.notice.body}</p>
        {props.notice.detail && <small>{props.notice.detail}</small>}
        <div className="button-row update-check-actions">
          <button type="button" className="primary-button" onClick={props.onClose}>
            OK
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

function CollapsibleSection(props: {
  icon: ReactNode
  title: string
  defaultOpen?: boolean
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  return (
    <section className={clsx('window-panel collapsible-section', props.className)}>
      <WindowTitle
        icon={props.icon}
        title={props.title}
        action={
          <div className="section-title-actions">
            {props.action}
            <button
              type="button"
              className={clsx('section-toggle', open && 'open')}
              aria-label={open ? `Collapse ${props.title}` : `Expand ${props.title}`}
              title={open ? `Collapse ${props.title}` : `Expand ${props.title}`}
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        }
      />
      {open && props.children}
    </section>
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

function ProjectRow(props: {
  project: Project
  onOpen: () => void
  actions?: ReactNode
}) {
  return (
    <article className="project-row">
      <button type="button" onClick={props.onOpen}>
        <span>
          <span className="color-dot" style={{ background: props.project.color }} />
          <strong>{props.project.title}</strong>
        </span>
        <p>{oneLine(props.project.description, 'No description.')}</p>
        <small>{props.project.status}</small>
      </button>
      {props.actions && <div className="button-row">{props.actions}</div>}
    </article>
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

function NotePickerModal(props: {
  notes: Note[]
  onClose: () => void
  onOpen: (note: Note) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<string>()
  const filteredNotes = props.notes.filter((note) => {
    const haystack = `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  const selectedNote =
    filteredNotes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0]

  function openSelected() {
    if (!selectedNote) return
    props.onOpen(selectedNote)
    props.onClose()
  }

  function moveSelection(direction: 1 | -1) {
    if (filteredNotes.length === 0) return
    const currentIndex = selectedNote
      ? filteredNotes.findIndex((note) => note.id === selectedNote.id)
      : -1
    const nextIndex =
      currentIndex < 0
        ? 0
        : Math.min(filteredNotes.length - 1, Math.max(0, currentIndex + direction))
    setSelectedNoteId(filteredNotes[nextIndex]?.id)
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openSelected()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onClose()
    }
  }

  return (
    <Modal title="Open note" onClose={props.onClose}>
      <div className="note-picker" onKeyDown={handleKeys}>
        <label className="search-page-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Search notes"
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedNoteId(undefined)
            }}
          />
        </label>
        <div className="note-picker-list" role="listbox" aria-label="Notes">
          {filteredNotes.map((note) => {
            const selected = selectedNote?.id === note.id
            return (
              <button
                key={note.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={clsx(selected && 'selected')}
                onMouseEnter={() => setSelectedNoteId(note.id)}
                onFocus={() => setSelectedNoteId(note.id)}
                onClick={() => {
                  props.onOpen(note)
                  props.onClose()
                }}
              >
                <strong>{note.title}</strong>
                <span>{oneLine(note.body, 'No body text yet.')}</span>
                <small>Updated {displayDate(note.updatedAt)}</small>
              </button>
            )
          })}
          {filteredNotes.length === 0 && <EmptyMini body="No matching notes." />}
        </div>
        <div className="button-row note-picker-actions">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!selectedNote}
            onClick={openSelected}
          >
            <FolderOpen size={15} />
            Open
          </button>
        </div>
      </div>
    </Modal>
  )
}

function EditorBlankState(props: {
  notes?: Note[]
  onCreate: () => void
  onOpen?: (note: Note) => void
}) {
  const notes = props.notes ?? []
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <section className="blank-editor">
      <div>
        <FileText size={28} />
        <h2>No note open.</h2>
        <p>Select a note or start a new one.</p>
        <div className="blank-editor-actions">
          <button type="button" className="primary-button" onClick={props.onCreate}>
            <Plus size={15} />
            New note
          </button>
          {props.onOpen && notes.length > 0 && (
            <button type="button" onClick={() => setPickerOpen(true)}>
              <FolderOpen size={15} />
              Open note
            </button>
          )}
        </div>
        {pickerOpen && props.onOpen && notes.length > 0 && (
          <NotePickerModal
            notes={notes}
            onClose={() => setPickerOpen(false)}
            onOpen={props.onOpen}
          />
        )}
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
