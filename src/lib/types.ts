export const APP_NAME = 'Wafytnde'
export const SCHEMA_VERSION = 1
export const DEFAULT_WORKSPACE_ID = 'default'
export const DEFAULT_WORKSPACE_TITLE = 'My Library'

export type EntityType =
  | 'bundle'
  | 'project'
  | 'note'
  | 'todoList'
  | 'todoItem'
  | 'quickCapture'

export type ParentType = 'bundle' | 'project' | 'note'
export type ProjectStatus = 'idea' | 'active' | 'paused' | 'completed' | 'archived'
export type ThemeMode = 'warm' | 'terminal' | 'pixel-pink'
export type FontMode = 'sans' | 'serif' | 'mono'

export interface AppearanceOverrides {
  topBarColor?: string
  accentColor?: string
  primaryTextColor?: string
  panelTintColor?: string
}

export interface BaseRecord {
  id: string
  workspaceId: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
  deletedAt?: string
  order: number
}

export interface Bundle extends BaseRecord {
  type: 'bundle'
  title: string
  description: string
  color: string
  visualMarker: string
  pinned: boolean
}

export interface Project extends BaseRecord {
  type: 'project'
  bundleId: string
  title: string
  description: string
  status: ProjectStatus
  color: string
  pinned: boolean
}

export interface Note extends BaseRecord {
  type: 'note'
  bundleId?: string
  projectId?: string
  title: string
  body: string
  tags: string[]
  pinned: boolean
  lastSavedAt?: string
}

export interface TodoList extends BaseRecord {
  type: 'todoList'
  parentType: ParentType
  parentId: string
  title: string
}

export interface TodoItem extends BaseRecord {
  type: 'todoItem'
  todoListId: string
  text: string
  completed: boolean
  dueDate?: string
  notes?: string
}

export interface QuickCapture extends BaseRecord {
  type: 'quickCapture'
  title: string
  body: string
  processedAt?: string
  convertedToType?: ParentType | 'todoList'
  convertedToId?: string
}

export interface AppSettings {
  theme: ThemeMode
  fontMode: FontMode
  compactMode: boolean
  reduceMotion: boolean
  appearanceOverrides?: AppearanceOverrides
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  lastView: string
  backupReminderDismissedAt?: string
}

export interface BackupData {
  bundles: Bundle[]
  projects: Project[]
  notes: Note[]
  todoLists: TodoList[]
  todoItems: TodoItem[]
  quickCaptures: QuickCapture[]
  settings: AppSettings
}

export interface WafytndeBackup {
  app: typeof APP_NAME
  schemaVersion: number
  exportedAt: string
  data: BackupData
}

export interface BackupPreview {
  exportedAt: string
  bundles: number
  projects: number
  notes: number
  todos: number
  captures: number
}

export interface SearchResult {
  id: string
  type: EntityType
  title: string
  subtitle: string
  body: string
}
