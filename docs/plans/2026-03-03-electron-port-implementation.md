# CodeFire Electron Port — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-parity Electron version of CodeFire (React + Tailwind) that shares the same SQLite database with the Swift version and lives in `electron/` within the same repo.

**Architecture:** Electron main process handles database, services, and window management. React renderer handles all UI. IPC bridge connects them. A standalone Node.js MCP server shares the database module and runs as a separate process spawned by Claude Code.

**Tech Stack:** Electron 34+, React 19, Tailwind CSS 4, Vite 6, TypeScript 5.5, better-sqlite3, xterm.js, node-pty, chokidar, @dnd-kit/core, CodeMirror 6, electron-builder

**Reference:** See `docs/plans/2026-03-03-electron-port-design.md` for full design rationale.

---

## Phase 1: Project Foundation

### Task 1: Scaffold Electron + Vite + React + TypeScript

**Files:**
- Create: `electron/package.json`
- Create: `electron/tsconfig.json`
- Create: `electron/tsconfig.node.json`
- Create: `electron/vite.config.ts`
- Create: `electron/.gitignore`
- Create: `electron/src/main/index.ts`
- Create: `electron/src/preload/index.ts`
- Create: `electron/src/renderer/index.html`
- Create: `electron/src/renderer/main.tsx`
- Create: `electron/src/renderer/App.tsx`

**Step 1: Initialize the project**

```bash
cd electron
npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install electron electron-builder vite @vitejs/plugin-react typescript --save-dev
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

**Step 3: Create package.json with scripts**

```json
{
  "name": "codefire-electron",
  "version": "0.1.0",
  "description": "CodeFire — Cross-platform companion for AI coding CLIs",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "build": {
    "appId": "com.codefire.electron",
    "productName": "CodeFire",
    "directories": { "output": "release" }
  }
}
```

**Step 4: Create vite.config.ts**

Configure Vite for Electron with main/preload/renderer builds. Use `vite-plugin-electron` for the multi-entry setup.

```bash
npm install vite-plugin-electron vite-plugin-electron-renderer concurrently wait-on --save-dev
```

```typescript
// electron/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      { entry: 'src/main/index.ts' },
      { entry: 'src/preload/index.ts', onstart(args) { args.reload() } },
    ]),
    renderer(),
  ],
})
```

**Step 5: Create tsconfig files**

```json
// electron/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src/**/*"]
}
```

**Step 6: Create minimal main process**

```typescript
// electron/src/main/index.ts
import { app, BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createMainWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

**Step 7: Create minimal preload**

```typescript
// electron/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) =>
    ipcRenderer.on(channel, (_event, ...args) => callback(...args)),
})
```

**Step 8: Create minimal React app**

```tsx
// electron/src/renderer/App.tsx
export default function App() {
  return <div className="h-screen bg-neutral-900 text-white flex items-center justify-center">
    <h1 className="text-2xl font-semibold text-orange-500">CodeFire</h1>
  </div>
}
```

**Step 9: Create .gitignore**

```
node_modules/
dist/
release/
*.tsbuildinfo
.vite/
```

**Step 10: Run dev to verify**

```bash
npm run electron:dev
```

Expected: Electron window opens at 1400x900 showing "CodeFire" in orange on dark background.

**Step 11: Commit**

```bash
git add electron/
git commit -m "feat(electron): scaffold project with Vite + React + TypeScript"
```

---

### Task 2: Add Tailwind CSS + Design Tokens

**Files:**
- Create: `electron/tailwind.config.ts`
- Create: `electron/src/renderer/styles/globals.css`
- Create: `electron/src/shared/theme.ts`
- Modify: `electron/src/renderer/main.tsx`
- Modify: `electron/postcss.config.js`

**Step 1: Install Tailwind**

```bash
cd electron
npm install tailwindcss @tailwindcss/vite --save-dev
```

**Step 2: Create Tailwind config with CodeFire design tokens**

```typescript
// electron/tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        codefire: {
          orange: '#f97316',
          'orange-hover': '#ea580c',
        },
        success: '#4ade80',
        warning: '#fb923c',
        error: '#ef4444',
        info: '#3b82f6',
      },
      fontSize: {
        tiny: '9px',
        xs: '10px',
        sm: '11px',
        base: '12px',
        title: '13px',
        xl: '15px',
      },
      fontFamily: {
        mono: ["'SF Mono'", "'Cascadia Code'", "'Fira Code'", 'monospace'],
      },
      spacing: {
        '4.5': '18px',
      },
      borderRadius: {
        cf: '6px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
} satisfies Config
```

**Step 3: Create global CSS**

```css
/* electron/src/renderer/styles/globals.css */
@import 'tailwindcss';

:root {
  --color-bg-primary: #171717;
  --color-bg-secondary: #262626;
  --color-bg-tertiary: #333333;
  --color-border: #404040;
  --color-text-primary: #f5f5f5;
  --color-text-secondary: #a3a3a3;
  --color-text-muted: #737373;
}

body {
  margin: 0;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  overflow: hidden;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #525252; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #737373; }

/* Drag region for frameless window */
.drag-region { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }
```

**Step 4: Create shared theme constants**

```typescript
// electron/src/shared/theme.ts
export const COLORS = {
  orange: '#f97316',
  orangeHover: '#ea580c',
  success: '#4ade80',
  warning: '#fb923c',
  error: '#ef4444',
  info: '#3b82f6',
} as const

export const WINDOW_SIZES = {
  main: { width: 1400, height: 900 },
  project: { width: 1200, height: 850 },
  settings: { width: 500, height: 550 },
} as const

export const PANEL_SIZES = {
  sidebar: { min: 160, max: 240, default: 200 },
  terminal: { min: 300, max: 550, default: 400 },
  chatDrawer: 380,
  briefingDrawer: 400,
} as const
```

**Step 5: Verify Tailwind renders**

Update App.tsx to use Tailwind classes, run `npm run electron:dev`, confirm orange accent color and dark theme render.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(electron): add Tailwind CSS with CodeFire design tokens"
```

---

### Task 3: Set Up Testing + Linting

**Files:**
- Create: `electron/vitest.config.ts`
- Create: `electron/src/__tests__/setup.ts`
- Create: `electron/eslint.config.js`
- Modify: `electron/package.json`

**Step 1: Install test & lint dependencies**

```bash
npm install vitest @testing-library/react @testing-library/jest-dom jsdom --save-dev
npm install eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser --save-dev
```

**Step 2: Create vitest config**

```typescript
// electron/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@main': '/src/main',
      '@renderer': '/src/renderer',
    },
  },
})
```

**Step 3: Create test setup**

```typescript
// electron/src/__tests__/setup.ts
import '@testing-library/jest-dom'
```

**Step 4: Write a smoke test to verify setup**

```typescript
// electron/src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

**Step 5: Run tests**

```bash
npm test
```

Expected: 1 test passes.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(electron): add vitest + eslint configuration"
```

---

## Phase 2: Database Layer

### Task 4: Database Connection + Migration Runner

**Files:**
- Create: `electron/src/main/database/connection.ts`
- Create: `electron/src/main/database/migrator.ts`
- Create: `electron/src/main/database/paths.ts`
- Test: `electron/src/__tests__/database/connection.test.ts`
- Test: `electron/src/__tests__/database/migrator.test.ts`

**Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install @types/better-sqlite3 --save-dev
```

**Step 2: Write failing test for database path resolution**

```typescript
// electron/src/__tests__/database/connection.test.ts
import { describe, it, expect } from 'vitest'
import { getDatabasePath } from '../../main/database/paths'

describe('getDatabasePath', () => {
  it('returns platform-appropriate path ending in codefire.db', () => {
    const dbPath = getDatabasePath()
    expect(dbPath).toMatch(/codefire\.db$/)
    expect(dbPath).toContain('CodeFire')
  })
})
```

**Step 3: Run test to verify it fails**

```bash
npm test -- connection
```

Expected: FAIL — module not found.

**Step 4: Implement database paths**

```typescript
// electron/src/main/database/paths.ts
import path from 'path'
import os from 'os'
import fs from 'fs'

export function getDatabasePath(): string {
  let dir: string
  switch (process.platform) {
    case 'darwin':
      dir = path.join(os.homedir(), 'Library', 'Application Support', 'CodeFire')
      break
    case 'win32':
      dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CodeFire')
      break
    default: // linux
      dir = path.join(os.homedir(), '.config', 'CodeFire')
  }
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'codefire.db')
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- connection
```

Expected: PASS.

**Step 6: Write failing test for migration runner**

```typescript
// electron/src/__tests__/database/migrator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { Migrator } from '../../main/database/migrator'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Migrator', () => {
  let db: Database.Database
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(dbPath)
  })

  it('creates schema_version table on first run', () => {
    const migrator = new Migrator(db)
    migrator.migrate()
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBeGreaterThan(0)
  })

  it('is idempotent — running twice does not error', () => {
    const migrator = new Migrator(db)
    migrator.migrate()
    migrator.migrate()
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBeGreaterThan(0)
  })
})
```

**Step 7: Implement migration runner**

```typescript
// electron/src/main/database/migrator.ts
import Database from 'better-sqlite3'
import { migrations } from './migrations'

export class Migrator {
  constructor(private db: Database.Database) {}

  migrate(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`)

    const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
    const currentVersion = row?.version ?? 0

    if (currentVersion === 0 && !row) {
      this.db.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
    }

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        this.db.transaction(() => {
          migration.up(this.db)
          this.db.prepare('UPDATE schema_version SET version = ?').run(migration.version)
        })()
      }
    }
  }

  getCurrentVersion(): number {
    try {
      const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
      return row?.version ?? 0
    } catch {
      return 0
    }
  }
}

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}
```

**Step 8: Implement connection factory**

```typescript
// electron/src/main/database/connection.ts
import Database from 'better-sqlite3'
import { getDatabasePath } from './paths'
import { Migrator } from './migrator'

let _db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!_db) {
    const dbPath = getDatabasePath()
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('busy_timeout = 5000')
    _db.pragma('foreign_keys = ON')

    const migrator = new Migrator(_db)
    migrator.migrate()
  }
  return _db
}

export function closeDatabase(): void {
  _db?.close()
  _db = null
}
```

**Step 9: Run tests**

```bash
npm test -- database
```

Expected: All pass.

**Step 10: Commit**

```bash
git add -A
git commit -m "feat(electron): database connection, path resolution, and migration runner"
```

---

### Task 5: Port All 19 Database Migrations

**Files:**
- Create: `electron/src/main/database/migrations/index.ts`
- Test: `electron/src/__tests__/database/migrations.test.ts`

This is the largest single task. Port all 19 GRDB migrations to TypeScript using `better-sqlite3` raw SQL. Every table, column, index, and FTS virtual table must match the Swift version exactly.

**Step 1: Write test that verifies all tables exist after migration**

```typescript
// electron/src/__tests__/database/migrations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { Migrator } from '../../main/database/migrator'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('all migrations', () => {
  let db: Database.Database
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-migrations-${Date.now()}.db`)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
  })

  afterEach(() => {
    db.close()
    fs.unlinkSync(dbPath)
  })

  it('creates all 25 tables (22 base + 3 FTS virtual)', () => {
    const migrator = new Migrator(db)
    migrator.migrate()

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_version' ORDER BY name"
    ).all() as { name: string }[]

    const tableNames = tables.map(t => t.name)

    // Base tables
    expect(tableNames).toContain('projects')
    expect(tableNames).toContain('sessions')
    expect(tableNames).toContain('codebaseSnapshots')
    expect(tableNames).toContain('notes')
    expect(tableNames).toContain('patterns')
    expect(tableNames).toContain('taskItems')
    expect(tableNames).toContain('taskNotes')
    expect(tableNames).toContain('clients')
    expect(tableNames).toContain('gmailAccounts')
    expect(tableNames).toContain('whitelistRules')
    expect(tableNames).toContain('processedEmails')
    expect(tableNames).toContain('browserScreenshots')
    expect(tableNames).toContain('chatConversations')
    expect(tableNames).toContain('chatMessages')
    expect(tableNames).toContain('browserCommands')
    expect(tableNames).toContain('indexedFiles')
    expect(tableNames).toContain('codeChunks')
    expect(tableNames).toContain('indexState')
    expect(tableNames).toContain('indexRequests')
    expect(tableNames).toContain('briefingDigests')
    expect(tableNames).toContain('briefingItems')
    expect(tableNames).toContain('generatedImages')
    expect(tableNames).toContain('recordings')
  })

  it('inserts __global__ sentinel project', () => {
    const migrator = new Migrator(db)
    migrator.migrate()
    const row = db.prepare("SELECT id FROM projects WHERE id = '__global__'").get()
    expect(row).toBeTruthy()
  })

  it('creates FTS virtual tables', () => {
    const migrator = new Migrator(db)
    migrator.migrate()
    // FTS tables show up differently in sqlite_master
    const fts = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Fts%'"
    ).all() as { name: string }[]
    const names = fts.map(t => t.name)
    expect(names.some(n => n.includes('sessionsFts'))).toBe(true)
    expect(names.some(n => n.includes('notesFts'))).toBe(true)
    expect(names.some(n => n.includes('codeChunksFts'))).toBe(true)
  })
})
```

**Step 2: Implement all migrations**

Create `electron/src/main/database/migrations/index.ts` with all 19 migrations ported from the Swift GRDB migrations in `Context/Sources/CodeFire/Database/DatabaseService.swift`.

Each migration is a `{ version, name, up(db) }` object. The `up` function runs raw SQL via `db.exec()`.

Reference the exact schemas from the Swift source:
- Migration 1 (v1_createTables): projects, sessions, codebaseSnapshots, notes, patterns, taskItems
- Migration 2 (v2_addTokenColumns): ALTER sessions ADD 4 token columns
- Migration 3 (v3_addTaskLabels): ALTER taskItems ADD labels
- Migration 4 (v4_addTaskAttachments): ALTER taskItems ADD attachments
- Migration 5 (v5_createTaskNotes): CREATE taskNotes
- Migration 6 (v1_createFTS): CREATE FTS5 virtual tables for sessions, notes
- Migration 7 (v6_addClients): CREATE clients
- Migration 8 (v7_addProjectClientAndTags): ALTER projects ADD clientId, tags, sortOrder
- Migration 9 (v8_addGlobalFlags): ALTER taskItems/notes ADD isGlobal
- Migration 10 (v9_addGmailIntegration): CREATE gmailAccounts, whitelistRules, processedEmails + ALTER taskItems
- Migration 11 (v10_seedGlobalProject): INSERT __global__ project
- Migration 12 (v11_createBrowserScreenshots): CREATE browserScreenshots
- Migration 13 (v12_createChatTables): CREATE chatConversations, chatMessages
- Migration 14 (v13_addProfileText): ALTER codebaseSnapshots ADD profileText
- Migration 15 (v14_createBrowserCommands): CREATE browserCommands
- Migration 16 (v15_createContextEngine): CREATE indexedFiles, codeChunks, indexState, indexRequests + FTS5
- Migration 17 (v16_createBriefing): CREATE briefingDigests, briefingItems
- Migration 18 (v17_createGeneratedImages): CREATE generatedImages
- Migration 19 (v18_createRecordings): CREATE recordings + ALTER taskItems ADD recordingId

Every column name, type, default, and constraint must match the Swift version exactly. See the migration extraction notes for precise definitions.

**Step 3: Run tests**

```bash
npm test -- migrations
```

Expected: All pass — all tables created, __global__ project seeded, FTS tables present.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(electron): port all 19 database migrations from Swift"
```

---

### Task 6: Core Data Access Objects (DAOs)

**Files:**
- Create: `electron/src/shared/models.ts` (TypeScript interfaces for all models)
- Create: `electron/src/main/database/dao/ProjectDAO.ts`
- Create: `electron/src/main/database/dao/TaskDAO.ts`
- Create: `electron/src/main/database/dao/NoteDAO.ts`
- Create: `electron/src/main/database/dao/SessionDAO.ts`
- Create: `electron/src/main/database/dao/ClientDAO.ts`
- Create: `electron/src/main/database/dao/index.ts`
- Test: `electron/src/__tests__/database/dao/project-dao.test.ts`
- Test: `electron/src/__tests__/database/dao/task-dao.test.ts`
- Test: `electron/src/__tests__/database/dao/note-dao.test.ts`

**Pattern:** Each DAO is a class that takes a `Database.Database` in its constructor. Methods are synchronous (matching `better-sqlite3`). Use prepared statements for performance.

**Step 1: Create shared model interfaces**

```typescript
// electron/src/shared/models.ts
export interface Project {
  id: string
  name: string
  path: string
  claudeProject: string | null
  lastOpened: string | null
  createdAt: string
  clientId: string | null
  tags: string | null  // JSON array
  sortOrder: number
}

export interface TaskItem {
  id: number
  projectId: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: number  // 0-4
  source: 'manual' | 'claude' | 'ai-extracted'
  labels: string | null  // JSON array
  attachments: string | null  // JSON array
  isGlobal: boolean
  gmailThreadId: string | null
  gmailMessageId: string | null
  recordingId: string | null
  createdAt: string
  completedAt: string | null
}

export interface TaskNote {
  id: number
  taskId: number
  content: string
  source: 'manual' | 'claude' | 'system'
  sessionId: string | null
  createdAt: string
}

export interface Note {
  id: number
  projectId: string
  title: string
  content: string
  pinned: boolean
  sessionId: string | null
  isGlobal: boolean
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  projectId: string
  slug: string | null
  startedAt: string | null
  endedAt: string | null
  model: string | null
  gitBranch: string | null
  summary: string | null
  messageCount: number
  toolUseCount: number
  filesChanged: string | null
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export interface Client {
  id: string
  name: string
  color: string
  sortOrder: number
  createdAt: string
}

// Continue for all remaining models: CodeChunk, IndexedFile, IndexState,
// BrowserCommand, GmailAccount, ProcessedEmail, WhitelistRule,
// ChatConversation, ChatMessage, BriefingDigest, BriefingItem,
// GeneratedImage, Recording, CodebaseSnapshot, Pattern, BrowserScreenshot
```

**Step 2: Implement DAOs following TDD**

Write tests first for each DAO, then implement. Each DAO needs: `getById`, `list` (with filters), `create`, `update`, `delete` where applicable.

Example pattern for TaskDAO:

```typescript
// electron/src/main/database/dao/TaskDAO.ts
import Database from 'better-sqlite3'
import { TaskItem, TaskNote } from '@shared/models'

export class TaskDAO {
  private stmts: Record<string, Database.Statement>

  constructor(private db: Database.Database) {
    this.stmts = {
      list: db.prepare(`SELECT * FROM taskItems WHERE projectId = ? ORDER BY priority DESC, createdAt DESC`),
      listByStatus: db.prepare(`SELECT * FROM taskItems WHERE projectId = ? AND status = ? ORDER BY priority DESC, createdAt DESC`),
      listGlobal: db.prepare(`SELECT * FROM taskItems WHERE isGlobal = 1 ORDER BY priority DESC, createdAt DESC`),
      getById: db.prepare(`SELECT * FROM taskItems WHERE id = ?`),
      create: db.prepare(`INSERT INTO taskItems (projectId, title, description, status, priority, source, labels, isGlobal, createdAt) VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?)`),
      update: db.prepare(`UPDATE taskItems SET title = ?, description = ?, status = ?, priority = ?, labels = ?, completedAt = ? WHERE id = ?`),
      delete: db.prepare(`DELETE FROM taskItems WHERE id = ?`),
    }
  }

  list(projectId: string, status?: string): TaskItem[] {
    if (status) return this.stmts.listByStatus.all(projectId, status) as TaskItem[]
    return this.stmts.list.all(projectId) as TaskItem[]
  }

  listGlobal(status?: string): TaskItem[] {
    if (status) {
      return this.db.prepare(`SELECT * FROM taskItems WHERE isGlobal = 1 AND status = ? ORDER BY priority DESC, createdAt DESC`).all(status) as TaskItem[]
    }
    return this.stmts.listGlobal.all() as TaskItem[]
  }

  getById(id: number): TaskItem | undefined {
    return this.stmts.getById.get(id) as TaskItem | undefined
  }

  create(data: { projectId: string; title: string; description?: string; priority?: number; labels?: string[]; isGlobal?: boolean }): TaskItem {
    const now = new Date().toISOString()
    const result = this.stmts.create.run(
      data.projectId, data.title, data.description ?? null,
      Math.min(4, Math.max(0, data.priority ?? 0)),
      'claude',
      data.labels ? JSON.stringify(data.labels) : null,
      data.isGlobal ? 1 : 0,
      now
    )
    return this.getById(Number(result.lastInsertRowid))!
  }

  update(id: number, data: Partial<Pick<TaskItem, 'title' | 'description' | 'status' | 'priority' | 'labels'>>): TaskItem | undefined {
    const existing = this.getById(id)
    if (!existing) return undefined

    const completedAt = data.status === 'done' ? new Date().toISOString() : existing.completedAt
    this.stmts.update.run(
      data.title ?? existing.title,
      data.description ?? existing.description,
      data.status ?? existing.status,
      data.priority ?? existing.priority,
      data.labels !== undefined ? (typeof data.labels === 'string' ? data.labels : JSON.stringify(data.labels)) : existing.labels,
      completedAt,
      id
    )
    return this.getById(id)
  }
}
```

Follow this same pattern for ProjectDAO, NoteDAO, SessionDAO, ClientDAO.

**Step 3: Run tests**

```bash
npm test -- dao
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(electron): core DAOs for projects, tasks, notes, sessions, clients"
```

---

### Task 7: Search DAOs (FTS5 + Vector Search)

**Files:**
- Create: `electron/src/main/database/dao/ChunkDAO.ts`
- Create: `electron/src/main/database/search/fts-search.ts`
- Create: `electron/src/main/database/search/vector-search.ts`
- Create: `electron/src/main/database/search/hybrid-search.ts`
- Create: `electron/src/main/database/search/query-preprocessor.ts`
- Test: `electron/src/__tests__/database/search/fts-search.test.ts`
- Test: `electron/src/__tests__/database/search/vector-search.test.ts`

Port the ChunkSearchEngine and QueryPreprocessor from the Swift codebase. The hybrid search uses:
- FTS5 keyword search with BM25 ranking on `codeChunksFts`
- Cosine similarity on embedding BLOBs (Float32Array)
- Adaptive weighting: Symbol queries (40% semantic / 60% keyword), Concept (85% / 15%), Pattern (70% / 30%)

Reference: `Context/Sources/CodeFire/ContextEngine/ChunkSearchEngine.swift` and `QueryPreprocessor.swift`

**Key implementation:**

```typescript
// electron/src/main/database/search/vector-search.ts
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB)
  return magnitude === 0 ? 0 : dot / magnitude
}

export function blobToFloat32Array(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
}
```

**Commit after tests pass:**

```bash
git commit -m "feat(electron): FTS5 + vector search with hybrid ranking"
```

---

## Phase 3: Main Process Infrastructure

### Task 8: IPC Handler Architecture

**Files:**
- Create: `electron/src/main/ipc/index.ts`
- Create: `electron/src/main/ipc/project-handlers.ts`
- Create: `electron/src/main/ipc/task-handlers.ts`
- Create: `electron/src/main/ipc/note-handlers.ts`
- Create: `electron/src/main/ipc/session-handlers.ts`
- Modify: `electron/src/preload/index.ts`
- Create: `electron/src/renderer/lib/api.ts` (typed IPC client for renderer)

Set up the IPC bridge between main and renderer processes. Each handler file registers `ipcMain.handle` listeners. The preload script exposes a typed API.

**Pattern:**

```typescript
// electron/src/main/ipc/task-handlers.ts
import { ipcMain } from 'electron'
import { TaskDAO } from '../database/dao/TaskDAO'
import Database from 'better-sqlite3'

export function registerTaskHandlers(db: Database.Database) {
  const dao = new TaskDAO(db)

  ipcMain.handle('tasks:list', (_e, projectId: string, status?: string) => dao.list(projectId, status))
  ipcMain.handle('tasks:get', (_e, id: number) => dao.getById(id))
  ipcMain.handle('tasks:create', (_e, data) => dao.create(data))
  ipcMain.handle('tasks:update', (_e, id: number, data) => dao.update(id, data))
}
```

```typescript
// electron/src/renderer/lib/api.ts
// Typed wrapper around window.api.invoke
export const api = {
  tasks: {
    list: (projectId: string, status?: string) => window.api.invoke('tasks:list', projectId, status),
    get: (id: number) => window.api.invoke('tasks:get', id),
    create: (data: CreateTaskInput) => window.api.invoke('tasks:create', data),
    update: (id: number, data: UpdateTaskInput) => window.api.invoke('tasks:update', id, data),
  },
  // ... same for projects, notes, sessions, etc.
}
```

**Commit:**

```bash
git commit -m "feat(electron): IPC handler architecture with typed renderer API"
```

---

### Task 9: Window Management

**Files:**
- Create: `electron/src/main/windows/MainWindow.ts`
- Create: `electron/src/main/windows/ProjectWindow.ts`
- Create: `electron/src/main/windows/WindowManager.ts`
- Modify: `electron/src/main/index.ts`

**WindowManager** tracks all open windows. `createProjectWindow(projectId)` spawns a new `BrowserWindow` sized 1200x850 and passes the projectId to the renderer via query params or IPC.

**Key details:**
- Main window: 1400x900, `titleBarStyle: 'hiddenInset'` on macOS, `frame: false` on Windows/Linux (custom title bar)
- Project windows: 1200x850, same title bar strategy
- Window positions persisted to a `windowState` table or JSON file
- Closing all project windows leaves the main window open
- `app.on('activate')` reopens main window on macOS

**Commit:**

```bash
git commit -m "feat(electron): window manager with main and project window types"
```

---

### Task 10: Terminal Service (node-pty + xterm.js)

**Files:**
- Create: `electron/src/main/services/TerminalService.ts`
- Create: `electron/src/main/ipc/terminal-handlers.ts`
- Create: `electron/src/renderer/components/Terminal/TerminalPanel.tsx`
- Create: `electron/src/renderer/components/Terminal/TerminalTab.tsx`

**Step 1: Install dependencies**

```bash
npm install node-pty xterm @xterm/addon-fit @xterm/addon-web-links
```

**Step 2: Implement TerminalService in main process**

```typescript
// electron/src/main/services/TerminalService.ts
import * as pty from 'node-pty'

interface TerminalSession {
  id: string
  pty: pty.IPty
  projectPath: string
}

export class TerminalService {
  private sessions = new Map<string, TerminalSession>()

  create(id: string, projectPath: string): void {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: projectPath,
      env: { ...process.env, TERM: 'xterm-256color' },
    })
    this.sessions.set(id, { id, pty: term, projectPath })
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.pty.resize(cols, rows)
  }

  onData(id: string, callback: (data: string) => void): void {
    this.sessions.get(id)?.pty.onData(callback)
  }

  kill(id: string): void {
    this.sessions.get(id)?.pty.kill()
    this.sessions.delete(id)
  }
}
```

**Step 3: Wire up IPC handlers for terminal data flow**

Main process sends terminal output to renderer via `webContents.send`. Renderer sends keystrokes via `ipcRenderer.send`.

**Step 4: Implement TerminalPanel React component with xterm.js**

Use `@xterm/addon-fit` for auto-resizing. Multiple tabs, each with its own PTY.

**Commit:**

```bash
git commit -m "feat(electron): terminal service with node-pty and xterm.js"
```

---

## Phase 4: Core Services

### Task 11: Project Discovery + Session Parser

**Files:**
- Create: `electron/src/main/services/ProjectDiscovery.ts`
- Create: `electron/src/main/services/SessionParser.ts`
- Create: `electron/src/main/services/SessionWatcher.ts`
- Test: `electron/src/__tests__/services/session-parser.test.ts`

Port the Swift ProjectDiscovery (scans `~/.claude/projects/`) and SessionParser (reads JSONL session files). SessionWatcher monitors active session files for live updates.

**Key reference:** `Context/Sources/CodeFire/Services/SessionParser.swift`

**Commit:**

```bash
git commit -m "feat(electron): project discovery and session parser services"
```

---

### Task 12: File Watcher Service

**Files:**
- Create: `electron/src/main/services/FileWatcher.ts`
- Test: `electron/src/__tests__/services/file-watcher.test.ts`

```bash
npm install chokidar
```

Use chokidar to watch project directories for file changes. Debounce events (2s) and trigger re-indexing via the ContextEngine.

**Commit:**

```bash
git commit -m "feat(electron): file watcher service using chokidar"
```

---

### Task 13: Git Service

**Files:**
- Create: `electron/src/main/services/GitService.ts`
- Create: `electron/src/main/ipc/git-handlers.ts`
- Test: `electron/src/__tests__/services/git-service.test.ts`

Port all 6 git operations from the Swift MCP server. Each operation shells out to the `git` CLI via `child_process.execFile`.

Operations: `status`, `diff`, `log`, `stage`, `unstage`, `commit`

Reference: The git tool handlers from `CodeFireMCP/main.swift`

**Commit:**

```bash
git commit -m "feat(electron): git service with status, diff, log, stage, commit"
```

---

### Task 14: Code Indexing Engine

**Files:**
- Create: `electron/src/main/services/ContextEngine.ts`
- Create: `electron/src/main/services/CodeChunker.ts`
- Create: `electron/src/main/database/dao/IndexDAO.ts`
- Test: `electron/src/__tests__/services/code-chunker.test.ts`

Port the CodeChunker from Swift. It parses source files into semantic chunks (functions, classes, blocks, docs) using regex patterns for each supported language.

**Supported languages:** Swift, TypeScript, Python, Java, Go, Rust, C#, C++, Ruby, PHP, JavaScript, JSX, JSON, YAML, Markdown, SQL, HTML, CSS

**Key logic:**
- File content hashing (SHA256) for change detection
- Language detection by file extension
- Regex-based symbol extraction per language
- Fallback: line-based chunking (max 50 lines)
- Skip patterns: node_modules, .build, .git, __pycache__, dist, etc.

Reference: `Context/Sources/CodeFire/ContextEngine/CodeChunker.swift`

**Commit:**

```bash
git commit -m "feat(electron): code chunker with multi-language support"
```

---

### Task 15: Embedding Client + Search Engine

**Files:**
- Create: `electron/src/main/services/EmbeddingClient.ts`
- Create: `electron/src/main/services/SearchEngine.ts`
- Test: `electron/src/__tests__/services/embedding-client.test.ts`

**EmbeddingClient:** Calls OpenRouter API (`text-embedding-3-large`, 1536-dim vectors). Includes LRU cache (50 entries).

**SearchEngine:** Orchestrates hybrid search — FTS5 keyword + vector cosine similarity with adaptive weighting based on query classification.

Reference: `Context/Sources/CodeFire/ContextEngine/EmbeddingClient.swift` and `ChunkSearchEngine.swift`

**Commit:**

```bash
git commit -m "feat(electron): embedding client and hybrid search engine"
```

---

### Task 16: Gmail Service

**Files:**
- Create: `electron/src/main/services/GmailService.ts`
- Create: `electron/src/main/services/GoogleOAuth.ts`
- Create: `electron/src/main/database/dao/GmailDAO.ts`

Port Gmail integration: OAuth 2.0 flow (opens browser window for consent), message polling, whitelist filtering, auto-task creation.

Reference: `Context/Sources/CodeFire/Services/GmailAPIService.swift` and `GoogleOAuthManager.swift`

**Commit:**

```bash
git commit -m "feat(electron): Gmail integration with OAuth and auto-task creation"
```

---

### Task 17: GitHub Service

**Files:**
- Create: `electron/src/main/services/GitHubService.ts`
- Create: `electron/src/main/ipc/github-handlers.ts`

Port GitHub GraphQL queries for PRs, workflows, commits, issues.

Reference: `Context/Sources/CodeFire/Services/GitHubService.swift`

**Commit:**

```bash
git commit -m "feat(electron): GitHub service with GraphQL PR and workflow queries"
```

---

## Phase 5: UI Shell

### Task 18: Main Window Layout (Sidebar + Dashboard)

**Files:**
- Create: `electron/src/renderer/layouts/MainLayout.tsx`
- Create: `electron/src/renderer/components/Sidebar/Sidebar.tsx`
- Create: `electron/src/renderer/components/Sidebar/SidebarItem.tsx`
- Create: `electron/src/renderer/components/Sidebar/ClientGroup.tsx`
- Create: `electron/src/renderer/components/Sidebar/ProjectItem.tsx`

Build the two-panel main window layout:
- Left sidebar (160-240px, resizable): Logo, planner button, collapsible client groups with colored dots, project list
- Right panel: Dashboard content area

Use `react-resizable-panels` for the split:

```bash
npm install react-resizable-panels
```

**Key patterns:**
- Sidebar items use consistent SidebarItem component
- Client groups are collapsible with chevron icons
- Projects show tags as colored pills
- Clicking a project calls `window.api.invoke('window:openProject', projectId)`

**Commit:**

```bash
git commit -m "feat(electron): main window layout with sidebar and project list"
```

---

### Task 19: Project Window Layout (Terminal + GUI Panel)

**Files:**
- Create: `electron/src/renderer/layouts/ProjectLayout.tsx`
- Create: `electron/src/renderer/components/TabBar/TabBar.tsx`
- Create: `electron/src/renderer/components/TabBar/TabButton.tsx`
- Modify: `electron/src/renderer/App.tsx` (route between main and project layouts)

Build the two-panel project window:
- Left: Terminal panel with tab bar (reuse TerminalPanel from Task 10)
- Right: GUI panel with 12-tab navigation

The tab bar shows icons + labels for all 12 tabs. Active tab highlighted with CodeFire orange bottom border.

**Commit:**

```bash
git commit -m "feat(electron): project window layout with terminal and tab navigation"
```

---

### Task 20: Status Indicators

**Files:**
- Create: `electron/src/renderer/components/StatusBar/MCPIndicator.tsx`
- Create: `electron/src/renderer/components/StatusBar/IndexIndicator.tsx`
- Create: `electron/src/renderer/components/StatusBar/AgentStatusBar.tsx`

Port the status indicators that show MCP connection state, index progress, and agent activity.

**Commit:**

```bash
git commit -m "feat(electron): MCP, index, and agent status indicators"
```

---

## Phase 6: Feature Views (12 Tabs)

Each task below creates one tab view. Follow the same pattern: create the view component, wire up IPC hooks, test rendering.

### Task 21: Dashboard Tab

**Files:**
- Create: `electron/src/renderer/views/DashboardView.tsx`
- Create: `electron/src/renderer/components/Dashboard/CostSummaryCard.tsx`
- Create: `electron/src/renderer/components/Dashboard/LiveSessionCard.tsx`
- Create: `electron/src/renderer/components/Dashboard/TaskLauncherCard.tsx`
- Create: `electron/src/renderer/hooks/useSessions.ts`

Reference: `Context/Sources/CodeFire/Views/DashboardView.swift`

**Commit:**

```bash
git commit -m "feat(electron): dashboard tab with cost summary and live sessions"
```

---

### Task 22: Sessions Tab

**Files:**
- Create: `electron/src/renderer/views/SessionsView.tsx`
- Create: `electron/src/renderer/components/Sessions/SessionList.tsx`
- Create: `electron/src/renderer/components/Sessions/SessionDetail.tsx`
- Create: `electron/src/renderer/components/Sessions/CostSummary.tsx`
- Create: `electron/src/renderer/hooks/useSessions.ts`

Show session history with token counts and cost calculation. Session list on left, detail on right.

Cost calculation per model:
- Opus: ($15, $75, $18.75, $1.50) per million tokens (input, output, cacheWrite, cacheRead)
- Sonnet: ($3, $15, $3.75, $0.30)
- Haiku: ($0.80, $4, $1, $0.08)

Reference: `Context/Sources/CodeFire/Views/SessionListView.swift`, `SessionDetailView.swift`

**Commit:**

```bash
git commit -m "feat(electron): sessions tab with history and cost tracking"
```

---

### Task 23: Tasks Tab (Kanban Board)

**Files:**
- Create: `electron/src/renderer/views/TasksView.tsx`
- Create: `electron/src/renderer/components/Kanban/KanbanBoard.tsx`
- Create: `electron/src/renderer/components/Kanban/KanbanColumn.tsx`
- Create: `electron/src/renderer/components/Kanban/TaskCard.tsx`
- Create: `electron/src/renderer/components/Kanban/TaskDetailSheet.tsx`
- Create: `electron/src/renderer/hooks/useTasks.ts`

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Three columns: Todo, In Progress, Done. Drag-drop between columns updates task status. Cards show priority badge, labels, and note count.

Reference: `Context/Sources/CodeFire/Views/KanbanBoard.swift`

**Commit:**

```bash
git commit -m "feat(electron): kanban board with drag-drop task management"
```

---

### Task 24: Notes Tab

**Files:**
- Create: `electron/src/renderer/views/NotesView.tsx`
- Create: `electron/src/renderer/components/Notes/NoteList.tsx`
- Create: `electron/src/renderer/components/Notes/NoteEditor.tsx`
- Create: `electron/src/renderer/hooks/useNotes.ts`

Note list on left (pinned notes first), markdown editor on right. FTS search bar at top.

```bash
npm install @uiw/react-md-editor
```

Reference: `Context/Sources/CodeFire/Views/NoteListView.swift`, `NoteEditorView.swift`

**Commit:**

```bash
git commit -m "feat(electron): notes tab with markdown editor and FTS search"
```

---

### Task 25: Files Tab

**Files:**
- Create: `electron/src/renderer/views/FilesView.tsx`
- Create: `electron/src/renderer/components/Files/FileTree.tsx`
- Create: `electron/src/renderer/components/Files/FileTreeRow.tsx`
- Create: `electron/src/renderer/components/Files/CodeViewer.tsx`

File tree on left (collapsible directories), code viewer on right with syntax highlighting.

```bash
npm install @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json codemirror @codemirror/view @codemirror/state @codemirror/theme-one-dark
```

Reference: `Context/Sources/CodeFire/Views/FileBrowserView.swift`

**Commit:**

```bash
git commit -m "feat(electron): file browser with tree view and code viewer"
```

---

### Task 26: Memory Editor Tab

**Files:**
- Create: `electron/src/renderer/views/MemoryView.tsx`

Editor for `~/.claude/MEMORY.md` files. Uses the same CodeMirror markdown setup from the Notes tab.

Reference: `Context/Sources/CodeFire/Views/MemoryEditorView.swift`

**Commit:**

```bash
git commit -m "feat(electron): memory editor tab for MEMORY.md files"
```

---

### Task 27: Rules Editor Tab

**Files:**
- Create: `electron/src/renderer/views/RulesView.tsx`

Editor for `CLAUDE.md` / `.claude/settings.json` instruction files. Same CodeMirror setup.

Reference: `Context/Sources/CodeFire/Views/ClaudeMdEditorView.swift`

**Commit:**

```bash
git commit -m "feat(electron): rules editor tab for CLAUDE.md files"
```

---

### Task 28: Services Tab

**Files:**
- Create: `electron/src/renderer/views/ServicesView.tsx`

Displays detected cloud services (Firebase, Supabase, Vercel, etc.) with dashboard links. Data from the `detect_services` logic in the MCP server.

Reference: `Context/Sources/CodeFire/Views/ProjectServicesView.swift`

**Commit:**

```bash
git commit -m "feat(electron): services tab with cloud service detection"
```

---

### Task 29: Git Tab

**Files:**
- Create: `electron/src/renderer/views/GitView.tsx`
- Create: `electron/src/renderer/components/Git/GitChanges.tsx`
- Create: `electron/src/renderer/components/Git/DiffViewer.tsx`
- Create: `electron/src/renderer/components/Git/GitHubPanel.tsx`
- Create: `electron/src/renderer/hooks/useGit.ts`

Shows file changes (staged/unstaged/untracked), diff viewer, commit interface, and GitHub PR list.

Use CodeMirror's merge extension for diff viewing:

```bash
npm install @codemirror/merge
```

Reference: `Context/Sources/CodeFire/Views/GitChangesView.swift`, `GitHubTabView.swift`

**Commit:**

```bash
git commit -m "feat(electron): git tab with changes, diff viewer, and GitHub PRs"
```

---

### Task 30: Images Tab

**Files:**
- Create: `electron/src/renderer/views/ImagesView.tsx`
- Create: `electron/src/main/services/ImageGenerationService.ts`
- Create: `electron/src/main/ipc/image-handlers.ts`
- Create: `electron/src/renderer/hooks/useImages.ts`

Image generation via OpenRouter API (google/gemini-3.1-flash-image-preview). Shows prompt input, generated images gallery, and edit capability.

Reference: `Context/Sources/CodeFire/Services/ImageGenerationService.swift`

**Commit:**

```bash
git commit -m "feat(electron): image generation tab with OpenRouter integration"
```

---

### Task 31: Recordings Tab

**Files:**
- Create: `electron/src/renderer/views/RecordingsView.tsx`
- Create: `electron/src/main/services/RecordingService.ts`
- Create: `electron/src/main/services/TranscriptionService.ts`
- Create: `electron/src/renderer/components/Recordings/AudioPlayer.tsx`
- Create: `electron/src/renderer/hooks/useRecordings.ts`

Audio recording via Web Audio API (`MediaRecorder`), transcription via `whisper-node`.

```bash
npm install whisper-node
```

Reference: `Context/Sources/CodeFire/Views/RecordingsView.swift`

**Commit:**

```bash
git commit -m "feat(electron): recordings tab with audio capture and transcription"
```

---

### Task 32: Browser Tab

**Files:**
- Create: `electron/src/renderer/views/BrowserView.tsx`
- Create: `electron/src/renderer/components/Browser/BrowserPanel.tsx`
- Create: `electron/src/renderer/components/Browser/DevToolsPanel.tsx`
- Create: `electron/src/renderer/components/Browser/ConsoleLog.tsx`
- Create: `electron/src/renderer/components/Browser/ScreenshotGallery.tsx`
- Create: `electron/src/main/services/BrowserService.ts`
- Create: `electron/src/main/ipc/browser-handlers.ts`

Embedded browser using Electron's `<webview>` tag. Features:
- URL bar with navigation buttons
- Multiple tabs (tab management)
- Console log capture
- Screenshot capture
- Network request inspection
- DevTools panel toggle

The browser commands from the MCP server are executed by polling the `browserCommands` table (100ms interval) and executing via `webContents` APIs on the `<webview>`.

Reference: `Context/Sources/CodeFire/Views/BrowserView.swift`

**Commit:**

```bash
git commit -m "feat(electron): browser tab with webview, console, and screenshots"
```

---

## Phase 7: Drawers & Modals

### Task 33: Chat Drawer

**Files:**
- Create: `electron/src/renderer/components/Drawers/ChatDrawer.tsx`
- Create: `electron/src/renderer/components/Chat/ChatMessageList.tsx`
- Create: `electron/src/renderer/components/Chat/ChatInput.tsx`
- Create: `electron/src/main/services/ChatService.ts`
- Create: `electron/src/renderer/hooks/useChat.ts`

Right-side drawer (380px) with chat interface. Messages stored in chatConversations/chatMessages tables.

Reference: `Context/Sources/CodeFire/Views/ChatDrawerView.swift`

**Commit:**

```bash
git commit -m "feat(electron): chat drawer with message history"
```

---

### Task 34: Briefing Drawer

**Files:**
- Create: `electron/src/renderer/components/Drawers/BriefingDrawer.tsx`
- Create: `electron/src/renderer/components/Briefing/BriefingBell.tsx`
- Create: `electron/src/main/services/BriefingService.ts`

Right-side drawer (400px) showing briefing digest items. Bell icon in toolbar shows unread count.

Reference: `Context/Sources/CodeFire/Views/BriefingDrawerView.swift`

**Commit:**

```bash
git commit -m "feat(electron): briefing drawer with digest items"
```

---

### Task 35: Modal Sheets

**Files:**
- Create: `electron/src/renderer/components/Modals/NewClientSheet.tsx`
- Create: `electron/src/renderer/components/Modals/NewTaskSheet.tsx`
- Create: `electron/src/renderer/components/Modals/SettingsWindow.tsx`
- Create: `electron/src/renderer/components/Modals/ScreenshotAnnotation.tsx`

Port all modal dialogs. Settings window has tabs: General, Terminal, CodeFire Engine, Gmail, Browser, Briefing.

**Commit:**

```bash
git commit -m "feat(electron): modal sheets for client, task, and settings"
```

---

## Phase 8: MCP Server

### Task 36: Node.js MCP Server — Core

**Files:**
- Create: `electron/mcp-server/package.json`
- Create: `electron/mcp-server/tsconfig.json`
- Create: `electron/mcp-server/src/index.ts`
- Create: `electron/mcp-server/src/server.ts`
- Create: `electron/mcp-server/src/tools/index.ts`
- Test: `electron/mcp-server/src/__tests__/server.test.ts`

Standalone Node.js process that communicates via stdio JSON-RPC. Uses the same database module from the main app.

```bash
npm install @anthropic-ai/sdk  # or use raw JSON-RPC
```

The server implements the MCP protocol:
- `initialize` / `initialized` handshake
- `tools/list` — returns all 57 tool definitions
- `tools/call` — dispatches to the correct handler

**Commit:**

```bash
git commit -m "feat(electron): MCP server core with JSON-RPC over stdio"
```

---

### Task 37: MCP Server — All 57 Tool Implementations

**Files:**
- Create: `electron/mcp-server/src/tools/project-tools.ts` (2 tools)
- Create: `electron/mcp-server/src/tools/task-tools.ts` (6 tools)
- Create: `electron/mcp-server/src/tools/note-tools.ts` (6 tools)
- Create: `electron/mcp-server/src/tools/client-tools.ts` (2 tools)
- Create: `electron/mcp-server/src/tools/browser-tools.ts` (24 tools)
- Create: `electron/mcp-server/src/tools/git-tools.ts` (6 tools)
- Create: `electron/mcp-server/src/tools/network-tools.ts` (3 tools)
- Create: `electron/mcp-server/src/tools/env-tools.ts` (3 tools)
- Create: `electron/mcp-server/src/tools/search-tools.ts` (1 tool)
- Create: `electron/mcp-server/src/tools/image-tools.ts` (4 tools)
- Test: `electron/mcp-server/src/__tests__/tools/task-tools.test.ts`
- Test: `electron/mcp-server/src/__tests__/tools/note-tools.test.ts`

Port every tool from the Swift MCP server with identical parameter names, types, and behavior. Reference the exact tool definitions extracted from `CodeFireMCP/main.swift`.

**Commit:**

```bash
git commit -m "feat(electron): all 57 MCP tool implementations"
```

---

### Task 38: MCP Server Packaging

**Files:**
- Modify: `electron/mcp-server/package.json` (add bin entry)
- Create: `electron/mcp-server/scripts/install.ts`

Package the MCP server so it can be:
1. Run directly: `node mcp-server/dist/index.js`
2. Registered with Claude Code: `claude mcp add codefire-electron /path/to/index.js`
3. Bundled inside the Electron app's resources folder

**Commit:**

```bash
git commit -m "feat(electron): MCP server packaging and installation script"
```

---

## Phase 9: Platform Integration

### Task 39: System Tray

**Files:**
- Create: `electron/src/main/tray.ts`
- Modify: `electron/src/main/index.ts`

Add system tray icon with context menu: Show/Hide, Projects list, Quit.

**Commit:**

```bash
git commit -m "feat(electron): system tray with context menu"
```

---

### Task 40: Auto-Updates

**Files:**
- Create: `electron/src/main/updater.ts`
- Modify: `electron/src/main/index.ts`
- Modify: `electron/package.json`

```bash
npm install electron-updater
```

Configure `electron-updater` to check GitHub Releases for updates. Show notification in settings tab when update available.

**Commit:**

```bash
git commit -m "feat(electron): auto-update via electron-updater"
```

---

### Task 41: Electron Builder Configuration

**Files:**
- Create: `electron/electron-builder.yml`
- Create: `electron/resources/icon.icns` (macOS)
- Create: `electron/resources/icon.ico` (Windows)
- Create: `electron/resources/icon.png` (Linux)

Configure electron-builder for all three platforms:

```yaml
# electron/electron-builder.yml
appId: com.codefire.electron
productName: CodeFire
directories:
  output: release
mac:
  category: public.app-category.developer-tools
  target: [dmg, zip]
  icon: resources/icon.icns
  hardenedRuntime: true
win:
  target: [nsis, portable]
  icon: resources/icon.ico
linux:
  target: [AppImage, deb, rpm]
  icon: resources/icon.png
  category: Development
extraResources:
  - from: mcp-server/dist
    to: mcp-server
```

**Step: Test packaging**

```bash
npm run electron:build
```

Verify output in `electron/release/` contains installable packages.

**Commit:**

```bash
git commit -m "feat(electron): electron-builder config for Mac, Windows, Linux"
```

---

### Task 42: Visualization Views (Bonus)

**Files:**
- Create: `electron/src/renderer/views/VisualizerView.tsx`
- Create: `electron/src/renderer/components/Visualizer/ArchitectureMap.tsx`
- Create: `electron/src/renderer/components/Visualizer/FileHeatmap.tsx`
- Create: `electron/src/renderer/components/Visualizer/GitGraph.tsx`
- Create: `electron/src/renderer/components/Visualizer/SchemaView.tsx`

Port the visualization views (architecture map, file heatmap, git graph, schema viewer). These are secondary views within the Dashboard or as sub-views.

**Commit:**

```bash
git commit -m "feat(electron): visualization views (architecture map, heatmap, git graph)"
```

---

### Task 43: Home / Planner View

**Files:**
- Create: `electron/src/renderer/views/HomeView.tsx`
- Create: `electron/src/renderer/components/Home/GlobalTaskSummary.tsx`
- Create: `electron/src/renderer/components/Home/RecentEmailsCard.tsx`
- Create: `electron/src/renderer/components/Home/DevToolsLauncher.tsx`

The main window's dashboard content: global task summary across all projects, recent emails, dev tools launcher, cost aggregation.

Reference: `Context/Sources/CodeFire/Views/HomeView.swift`, `DashboardView.swift`

**Commit:**

```bash
git commit -m "feat(electron): home/planner view with global task overview"
```

---

## Phase 10: Polish & QA

### Task 44: Keyboard Shortcuts

**Files:**
- Create: `electron/src/main/shortcuts.ts`
- Modify: `electron/src/main/index.ts`

Register keyboard shortcuts matching the Swift version:
- `Cmd/Ctrl+T`: New terminal tab
- `Cmd/Ctrl+W`: Close terminal tab
- `Cmd/Ctrl+R`: Reload browser tab
- `Cmd/Ctrl+L`: Focus URL bar (in browser tab)

**Commit:**

```bash
git commit -m "feat(electron): keyboard shortcuts matching Swift version"
```

---

### Task 45: Cross-Platform Title Bar

**Files:**
- Create: `electron/src/renderer/components/TitleBar/TitleBar.tsx`
- Create: `electron/src/renderer/components/TitleBar/WindowControls.tsx`

On macOS: use `titleBarStyle: 'hiddenInset'` (native traffic lights).
On Windows/Linux: custom title bar with minimize/maximize/close buttons styled to match CodeFire theme.

**Commit:**

```bash
git commit -m "feat(electron): cross-platform custom title bar"
```

---

### Task 46: End-to-End Smoke Test

**Files:**
- Create: `electron/src/__tests__/e2e/smoke.test.ts`

Use Playwright with Electron to verify:
1. App launches and shows main window
2. Sidebar renders with project list
3. Clicking a project opens a project window
4. Terminal tab shows and accepts input
5. Tasks tab creates and displays a task
6. Notes tab creates and searches a note

```bash
npm install @playwright/test electron --save-dev
```

**Commit:**

```bash
git commit -m "test(electron): end-to-end smoke tests with Playwright"
```

---

## Dependency Summary

### Production Dependencies
```
react, react-dom, better-sqlite3, node-pty, xterm, @xterm/addon-fit, @xterm/addon-web-links,
chokidar, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @uiw/react-md-editor,
codemirror, @codemirror/view, @codemirror/state, @codemirror/lang-javascript,
@codemirror/lang-python, @codemirror/lang-html, @codemirror/lang-css, @codemirror/lang-json,
@codemirror/theme-one-dark, @codemirror/merge, react-resizable-panels, electron-updater,
whisper-node
```

### Dev Dependencies
```
electron, electron-builder, vite, vite-plugin-electron, vite-plugin-electron-renderer,
@vitejs/plugin-react, typescript, tailwindcss, @tailwindcss/vite, vitest,
@testing-library/react, @testing-library/jest-dom, jsdom, @playwright/test,
@types/react, @types/react-dom, @types/better-sqlite3, concurrently, wait-on,
eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser
```

---

## Critical Path

The minimum viable order (tasks that block others):

```
Task 1 (scaffold) → Task 2 (tailwind) → Task 3 (testing)
    → Task 4 (database) → Task 5 (migrations) → Task 6 (DAOs) → Task 7 (search)
        → Task 8 (IPC) → Task 9 (windows)
            → Task 18 (main layout) → Task 43 (home view)
            → Task 19 (project layout) → Tasks 21-32 (all tabs)
        → Task 10 (terminal) → Task 19 (project layout)
    → Task 11 (sessions) → Task 22 (sessions tab)
    → Task 13 (git) → Task 29 (git tab)
    → Task 36-38 (MCP server) — can be parallelized with UI work
```

Tasks 36-38 (MCP server) can be built in parallel with the UI since they share only the database module.
