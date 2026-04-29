# Wafytnde

Wafytnde is an offline-first personal idea desk for developers, builders, and people who keep getting ambushed by useful thoughts at inconvenient times.

It is built for the moment when you need to save an idea immediately, but your usual tool asks you to pick a workspace, wait for a database view, choose a template, fight a sidebar, and somehow the idea is gone. Heavy tools like Notion have their place. Wafytnde is for the smaller, faster, more fragile moment before an idea becomes a project.

The app runs entirely in the browser, stores data locally with IndexedDB, works as an installable PWA, and exports/imports portable JSON backups so notes can move between desktop and phone without accounts or a server.

## What It Does

Wafytnde is a local library for:

- Quick captures
- Bundles
- Projects
- Notes
- Todo lists
- Archive and trash recovery
- Search across local records
- Import/export backups
- Offline use after the first successful visit

The UI is intentionally not a SaaS dashboard. It leans into a compact retro desktop utility style: bordered panels, paper-like note sheets, file-folder tabs, warm colors, and practical controls.

## Why This Exists

Most idea tools are optimized for organized knowledge after the fact. Wafytnde is optimized for the messy first five seconds.

The goal is simple:

- Open fast.
- Capture the thought.
- Sort it later.
- Keep everything local.
- Never require a login.
- Never lose work because a page, network, or product team got clever.

## Current Features

- Offline-first PWA with app manifest, generated icons, and service worker caching.
- Local IndexedDB database using Dexie.
- Versioned data schema with bundle, project, note, todo, and quick capture records.
- Quick capture modal and mobile capture button.
- Three-pane desktop layout for navigation, lists, and editing.
- Phone-first stacked layout with bottom navigation.
- Autosaving note editor with manual save.
- Bundles with notes, projects, todos, overview, and archive tabs.
- Project detail view with linked notes and todo lists.
- Todo lists with active/completed filters and progress counts.
- Global search across bundles, projects, notes, todos, tags, and captures.
- Command menu for power-user actions.
- Archive, restore, trash, permanent delete, and empty trash flows.
- Settings for theme, note font, compact mode, reduced motion, storage status, offline status, shortcuts, and app reset.
- JSON backup export and validated import with merge or replace modes.
- Duplicate-safe merge import that remaps IDs while preserving relationships.

## Tech Stack

- React
- TypeScript
- Vite
- Dexie and IndexedDB
- dexie-react-hooks
- vite-plugin-pwa
- lucide-react
- Vitest
- Playwright
- ESLint

## Project Structure

```text
src/
  App.tsx                 Main application shell and UI flows
  index.css               Retro responsive visual system
  main.tsx                React bootstrapping and PWA update hooks
  components/
    ChangelogModal.tsx    Latest release notes modal
    ErrorBoundary.tsx     Runtime error fallback
    UpdateReadyModal.tsx  Service worker update prompt
    WhatsNewToast.tsx     Post-refresh release notes card
  hooks/
    useAppUpdate.ts       Version and service worker update flow
  lib/
    db.ts                 Dexie schema and data operations
    version.ts            App version, release date, and changelog
    types.ts              Shared data model types
    backup.ts             Export/import validation and backup helpers
    settings.ts           Local preference storage
    search.ts             Global search helper
    backup.test.ts        Backup and merge tests
scripts/
  generate-icons.mjs      PWA icon generation
public/
  favicon.svg
  pwa-source.svg
  pwa-192.png
  pwa-512.png
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build the production app:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # Typecheck and build production assets
npm run preview      # Serve the production build locally
npm run typecheck    # Run TypeScript checks
npm run lint         # Run ESLint
npm test             # Run Vitest
npm run test:watch   # Run Vitest in watch mode
npm run test:e2e     # Run Playwright tests
```

The build script runs `scripts/generate-icons.mjs` first, so PWA icons are regenerated before production assets are created.

## Data Model

The main records are:

- `Bundle`: top-level container for an area of thought.
- `Project`: scoped work inside a bundle.
- `Note`: fast plain-writing document, optionally linked to a bundle or project.
- `TodoList`: task list attached to a bundle, project, or note.
- `TodoItem`: individual task record.
- `QuickCapture`: inbox item for unsorted thoughts.

Every main record is designed around local durability and recovery:

- `id`
- `workspaceId`
- `createdAt`
- `updatedAt`
- `archivedAt`
- `deletedAt`
- `order`
- record-specific parent references

## Backup Format

Exports are JSON files named like:

```text
wafytnde-backup-YYYY-MM-DD-HH-mm.json
```

Each backup contains:

```json
{
  "app": "Wafytnde",
  "schemaVersion": 1,
  "exportedAt": "2026-04-28T00:00:00.000Z",
  "data": {
    "bundles": [],
    "projects": [],
    "notes": [],
    "todoLists": [],
    "todoItems": [],
    "quickCaptures": [],
    "settings": {}
  }
}
```

Import supports:

- Merge with current local data.
- Replace all current local data.
- Validation before import.
- Preview counts before applying.
- Duplicate ID remapping during merge.
- Relationship preservation across imported bundles, projects, notes, and todos.

## Offline Behavior

Wafytnde is a PWA. The first visit requires the app shell to load successfully. After that, the service worker can cache the shell so the app opens offline.

User data is not stored on a server. It lives in IndexedDB on the device. Moving data between devices requires exporting a backup from one device and importing it on another.

## Development Notes

- Main app data belongs in IndexedDB, not localStorage.
- localStorage is only for small preferences such as theme, font mode, compact mode, reduced motion, onboarding state, last view, and update notification flags.
- The editor should stay lightweight and fast.
- Destructive actions should remain confirmable.
- Import must never destroy existing data unless the user explicitly chooses replace and confirms.
- The UI should keep its compact utility character. Avoid generic startup SaaS patterns.

## Release Workflow

1. Update `APP_VERSION` in `src/lib/version.ts`.
2. Update `APP_RELEASE_DATE`.
3. Update `APP_CHANGELOG`.
4. Commit changes.
5. Push to GitHub.
6. Deploy on Vercel.
7. Existing users will see the update prompt when the new service worker/app shell is ready.

## Testing

The current test suite covers backup export and duplicate-safe merge import behavior.

Run:

```bash
npm test
```

Before shipping meaningful changes, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For browser-level checks:

```bash
npm run test:e2e
```

## License

See [LICENSE](LICENSE).
