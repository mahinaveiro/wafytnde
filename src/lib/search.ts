import type {
  Bundle,
  Note,
  Project,
  QuickCapture,
  SearchResult,
  TodoItem,
  TodoList,
} from './types'

export function searchAll(
  query: string,
  data: {
    bundles: Bundle[]
    projects: Project[]
    notes: Note[]
    todoLists: TodoList[]
    todoItems: TodoItem[]
    quickCaptures: QuickCapture[]
  },
): SearchResult[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const matches = (parts: Array<string | undefined>) =>
    parts.some((part) => part?.toLowerCase().includes(term))

  const results: SearchResult[] = []

  for (const bundle of data.bundles) {
    if (matches([bundle.title, bundle.description])) {
      results.push({
        id: bundle.id,
        type: 'bundle',
        title: bundle.title,
        subtitle: 'Bundle',
        body: bundle.description,
      })
    }
  }

  for (const project of data.projects) {
    if (matches([project.title, project.description, project.status])) {
      results.push({
        id: project.id,
        type: 'project',
        title: project.title,
        subtitle: `Project, ${project.status}`,
        body: project.description,
      })
    }
  }

  for (const note of data.notes) {
    if (matches([note.title, note.body, note.tags.join(' ')])) {
      results.push({
        id: note.id,
        type: 'note',
        title: note.title,
        subtitle: note.tags.length ? `Note, ${note.tags.join(', ')}` : 'Note',
        body: note.body,
      })
    }
  }

  for (const list of data.todoLists) {
    if (matches([list.title])) {
      results.push({
        id: list.id,
        type: 'todoList',
        title: list.title,
        subtitle: 'Todo list',
        body: `${list.parentType} record`,
      })
    }
  }

  for (const item of data.todoItems) {
    if (matches([item.text, item.notes, item.dueDate])) {
      results.push({
        id: item.id,
        type: 'todoItem',
        title: item.text,
        subtitle: item.completed ? 'Completed todo' : 'Open todo',
        body: item.notes ?? '',
      })
    }
  }

  for (const capture of data.quickCaptures) {
    if (matches([capture.title, capture.body])) {
      results.push({
        id: capture.id,
        type: 'quickCapture',
        title: capture.title,
        subtitle: capture.processedAt ? 'Processed capture' : 'Inbox capture',
        body: capture.body,
      })
    }
  }

  return results.slice(0, 80)
}
