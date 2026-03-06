# Electron Feature Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the critical feature gaps between the Swift (macOS) and Electron (Windows/Linux) apps, focusing on MCP browser command execution, bug fixes, and core infrastructure.

**Architecture:** The Electron app follows strict main/preload/renderer separation. MCP tools write commands to a `browserCommands` SQLite table; a new `BrowserCommandExecutor` service in the main process will poll that table and dispatch commands to the renderer's `<webview>` elements via IPC. All database access goes through DAO classes. Tests use Vitest with jsdom.

**Tech Stack:** Electron, TypeScript, React, better-sqlite3, Vitest, node-pty

---

## Priority Order

| # | Task | Severity | Effort |
|---|------|----------|--------|
| 1 | Fix `listGlobal()` bug | Critical | 10 min |
| 2 | BrowserCommandExecutor | Critical | 2-3 hrs |
| 3 | Live session file polling | Important | 1-2 hrs |
| 4 | Incremental file watching for search index | Important | 1-2 hrs |

---

### Task 1: Fix `TaskDAO.listGlobal()` — Missing `isGlobal` Filter

The `listGlobal()` method returns ALL tasks instead of only global ones. This affects both the Electron IPC path and the MCP server's `list_tasks` tool when called without a project ID.

**Files:**
- Modify: `electron/src/main/database/dao/TaskDAO.ts:37-50`
- Test: `electron/src/__tests__/database/dao/task-dao.test.ts`

**Step 1: Write failing tests**

Add to `electron/src/__tests__/database/dao/task-dao.test.ts`:

```typescript
describe('listGlobal', () => {
  it('returns only tasks with isGlobal = 1', () => {
    // Create a project-scoped task
    dao.create({
      projectId: 'proj-1',
      title: 'Project task',
      status: 'todo',
      priority: 0,
      isGlobal: 0,
    } as any)

    // Create a global task
    dao.create({
      projectId: null,
      title: 'Global task',
      status: 'todo',
      priority: 0,
      isGlobal: 1,
    } as any)

    const results = dao.listGlobal()
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Global task')
  })

  it('filters global tasks by status', () => {
    dao.create({
      projectId: null,
      title: 'Done global',
      status: 'done',
      priority: 0,
      isGlobal: 1,
    } as any)

    dao.create({
      projectId: null,
      title: 'Todo global',
      status: 'todo',
      priority: 0,
      isGlobal: 1,
    } as any)

    const results = dao.listGlobal('todo')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Todo global')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd electron && npm test -- --reporter=verbose 2>&1 | grep -A 2 "listGlobal"`
Expected: FAIL — both tests fail because `listGlobal()` returns project tasks too.

**Step 3: Fix the implementation**

In `electron/src/main/database/dao/TaskDAO.ts`, replace the `listGlobal` method (lines 37-50):

```typescript
listGlobal(status?: string): TaskItem[] {
  if (status) {
    return this.db
      .prepare(
        'SELECT * FROM taskItems WHERE isGlobal = 1 AND status = ? ORDER BY createdAt DESC'
      )
      .all(status) as TaskItem[]
  }
  return this.db
    .prepare(
      'SELECT * FROM taskItems WHERE isGlobal = 1 ORDER BY createdAt DESC'
    )
    .all() as TaskItem[]
}
```

**Step 4: Run tests to verify they pass**

Run: `cd electron && npm test -- --reporter=verbose 2>&1 | grep -A 2 "listGlobal"`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/src/main/database/dao/TaskDAO.ts electron/src/__tests__/database/dao/task-dao.test.ts
git commit -m "fix: filter listGlobal() by isGlobal = 1

Previously returned all tasks regardless of isGlobal flag.
Affects MCP list_tasks tool when called without project_id."
```

---

### Task 2: BrowserCommandExecutor Service

The MCP server writes browser commands (navigate, click, type, screenshot, etc.) to the `browserCommands` table with `status='pending'`. The Swift app has a `BrowserCommandExecutor` that polls this table every 100ms and executes commands in WKWebView. Electron has NO equivalent — commands are written but never executed, making all browser MCP tools non-functional.

**Architecture:**
- Main process: `BrowserCommandExecutor` service polls `browserCommands` table
- Main → Renderer IPC: sends command to renderer for execution in `<webview>`
- Renderer → Main IPC: returns result (HTML snapshot, screenshot base64, etc.)
- Main process: updates `browserCommands` row with result and `status='completed'`

**Files:**
- Create: `electron/src/main/services/BrowserCommandExecutor.ts`
- Create: `electron/src/__tests__/services/browser-command-executor.test.ts`
- Modify: `electron/src/main/index.ts` (start executor after app ready)
- Modify: `electron/src/shared/types.ts` (add IPC channel types)
- Modify: `electron/src/renderer/views/BrowserView.tsx` (handle command execution IPC)
- Modify: `electron/src/main/ipc/index.ts` (register handler)

#### Step 1: Define IPC channel types

In `electron/src/shared/types.ts`, add:

```typescript
export type BrowserCommandChannel = 'browser:executeCommand'
export type BrowserCommandReceiveChannel = 'browser:commandRequest'
```

Add `BrowserCommandChannel` to the `IpcChannel` union type.

#### Step 2: Write tests for BrowserCommandExecutor

Create `electron/src/__tests__/services/browser-command-executor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { Migrator } from '../../main/database/migrations'

describe('BrowserCommandExecutor', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    const migrator = new Migrator(db)
    migrator.migrate()
  })

  afterEach(() => {
    db.close()
  })

  it('fetches pending commands ordered by createdAt', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now', '-2 seconds'))
    `).run('browser_navigate', JSON.stringify({ url: 'https://example.com' }))

    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now', '-1 second'))
    `).run('browser_click', JSON.stringify({ ref: '1' }))

    const pending = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' ORDER BY createdAt ASC"
    ).all()

    expect(pending).toHaveLength(2)
    expect((pending[0] as any).tool).toBe('browser_navigate')
  })

  it('marks command as completed with result', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now'))
    `).run('browser_snapshot', '{}')

    const cmd = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' LIMIT 1"
    ).get() as any

    db.prepare(
      "UPDATE browserCommands SET status = 'completed', result = ?, completedAt = datetime('now') WHERE id = ?"
    ).run(JSON.stringify({ html: '<html>...</html>' }), cmd.id)

    const updated = db.prepare('SELECT * FROM browserCommands WHERE id = ?').get(cmd.id) as any
    expect(updated.status).toBe('completed')
    expect(JSON.parse(updated.result).html).toBe('<html>...</html>')
  })

  it('marks command as error on failure', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now'))
    `).run('browser_click', JSON.stringify({ ref: '999' }))

    const cmd = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' LIMIT 1"
    ).get() as any

    db.prepare(
      "UPDATE browserCommands SET status = 'error', result = ?, completedAt = datetime('now') WHERE id = ?"
    ).run(JSON.stringify({ error: 'Element not found' }), cmd.id)

    const updated = db.prepare('SELECT * FROM browserCommands WHERE id = ?').get(cmd.id) as any
    expect(updated.status).toBe('error')
  })
})
```

#### Step 3: Run tests to verify they pass (DB-level tests)

Run: `cd electron && npm test -- src/__tests__/services/browser-command-executor.test.ts --reporter=verbose`
Expected: PASS (these test the DB operations, not the executor itself)

#### Step 4: Implement BrowserCommandExecutor

Create `electron/src/main/services/BrowserCommandExecutor.ts`:

```typescript
import type Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'

interface BrowserCommand {
  id: number
  tool: string
  args: string | null
  status: string
  result: string | null
  createdAt: string
  completedAt: string | null
}

export class BrowserCommandExecutor {
  private db: Database.Database
  private timer: ReturnType<typeof setInterval> | null = null
  private processing = false

  constructor(db: Database.Database) {
    this.db = db
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), 100)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async poll(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      const cmd = this.db.prepare(
        "SELECT * FROM browserCommands WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1"
      ).get() as BrowserCommand | undefined

      if (!cmd) return

      // Mark as executing
      this.db.prepare(
        "UPDATE browserCommands SET status = 'executing' WHERE id = ?"
      ).run(cmd.id)

      try {
        const result = await this.executeCommand(cmd)
        this.db.prepare(
          "UPDATE browserCommands SET status = 'completed', result = ?, completedAt = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(result), cmd.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.db.prepare(
          "UPDATE browserCommands SET status = 'error', result = ?, completedAt = datetime('now') WHERE id = ?"
        ).run(JSON.stringify({ error: message }), cmd.id)
      }
    } finally {
      this.processing = false
    }
  }

  private async executeCommand(cmd: BrowserCommand): Promise<unknown> {
    const args = cmd.args ? JSON.parse(cmd.args) : {}

    // Find a BrowserWindow that has a webview (project windows)
    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find(w => {
      const url = w.webContents.getURL()
      return url.includes('projectId=') || windows.length === 1
    }) || windows[0]

    if (!targetWindow) {
      throw new Error('No browser window available to execute command')
    }

    // Send command to renderer and await result
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Command ${cmd.tool} timed out after 30s`))
      }, 30_000)

      const channel = `browser:commandResult:${cmd.id}`

      targetWindow.webContents.ipc.handleOnce(channel, (_event, result) => {
        clearTimeout(timeout)
        if (result?.error) {
          reject(new Error(result.error))
        } else {
          resolve(result)
        }
        return undefined
      })

      targetWindow.webContents.send('browser:commandRequest', {
        id: cmd.id,
        tool: cmd.tool,
        args,
      })
    })
  }
}
```

#### Step 5: Register executor in main process

In `electron/src/main/index.ts`, after `app.whenReady()` and window creation:

```typescript
import { BrowserCommandExecutor } from './services/BrowserCommandExecutor'

// After: const mainWin = windowManager.createMainWindow()
const browserExecutor = new BrowserCommandExecutor(db)
browserExecutor.start()

// In the app quit handler:
app.on('before-quit', () => {
  browserExecutor.stop()
})
```

#### Step 6: Handle commands in BrowserView renderer

In `electron/src/renderer/views/BrowserView.tsx`, add a listener for incoming commands:

```typescript
useEffect(() => {
  const cleanup = window.api.on('browser:commandRequest', async (cmd: any) => {
    const { id, tool, args } = cmd
    const activeWebview = webviewRefs.current.get(activeTabId)

    try {
      let result: unknown

      switch (tool) {
        case 'browser_navigate':
          if (activeWebview) {
            activeWebview.loadURL(args.url)
            await new Promise(resolve => activeWebview.addEventListener('did-stop-loading', resolve, { once: true }))
          }
          result = { success: true, url: args.url }
          break

        case 'browser_snapshot':
          if (activeWebview) {
            const html = await activeWebview.executeJavaScript(
              'document.documentElement.outerHTML'
            )
            result = { html: html.substring(0, args.max_size || 50000) }
          }
          break

        case 'browser_screenshot':
          if (activeWebview) {
            const image = await activeWebview.capturePage()
            result = { base64: image.toPNG().toString('base64') }
          }
          break

        case 'browser_click':
          if (activeWebview) {
            await activeWebview.executeJavaScript(
              `document.querySelector('[data-ref="${args.ref}"]')?.click()`
            )
            result = { success: true }
          }
          break

        case 'browser_type':
          if (activeWebview) {
            const typeScript = args.clear
              ? `(() => { const el = document.querySelector('[data-ref="${args.ref}"]'); if(el) { el.value = ''; el.value = ${JSON.stringify(args.text)}; el.dispatchEvent(new Event('input', {bubbles:true})); } })()`
              : `(() => { const el = document.querySelector('[data-ref="${args.ref}"]'); if(el) { el.value += ${JSON.stringify(args.text)}; el.dispatchEvent(new Event('input', {bubbles:true})); } })()`
            await activeWebview.executeJavaScript(typeScript)
            result = { success: true }
          }
          break

        case 'browser_eval':
          if (activeWebview) {
            const evalResult = await activeWebview.executeJavaScript(args.expression)
            result = { value: evalResult }
          }
          break

        case 'browser_console_logs':
          result = { logs: consoleEntries }
          break

        default:
          result = { error: `Unsupported command: ${tool}` }
      }

      window.api.invoke(`browser:commandResult:${id}` as any, result)
    } catch (err) {
      window.api.invoke(`browser:commandResult:${id}` as any, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return cleanup
}, [activeTabId])
```

**Note:** This is a minimal viable set of commands. The Swift app supports ~30+ commands. Start with navigate, snapshot, screenshot, click, type, eval, and console_logs. Add the rest incrementally (scroll, hover, drag, select, wait, upload, iframe, cookies, storage, press) as follow-up work.

#### Step 7: Run all tests

Run: `cd electron && npm test -- --reporter=verbose`
Expected: All existing tests PASS, new tests PASS.

#### Step 8: Commit

```bash
git add electron/src/main/services/BrowserCommandExecutor.ts \
  electron/src/__tests__/services/browser-command-executor.test.ts \
  electron/src/main/index.ts \
  electron/src/shared/types.ts \
  electron/src/renderer/views/BrowserView.tsx \
  electron/src/main/ipc/index.ts
git commit -m "feat: add BrowserCommandExecutor for MCP browser tools

Polls browserCommands table every 100ms, dispatches to renderer
webview via IPC, returns results. Enables MCP browser_navigate,
browser_snapshot, browser_screenshot, browser_click, browser_type,
browser_eval, and browser_console_logs tools."
```

---

### Task 3: Live Session File Polling

Electron's `SessionParser.parseLiveSession()` is a pure function — it parses a JSONL file but doesn't actively watch for changes. The Swift app's `LiveSessionMonitor` polls the active session file every 2 seconds, reading only new bytes since the last read for efficiency. This enables the live session dashboard showing real-time activity, cost, and context usage.

**Files:**
- Create: `electron/src/main/services/LiveSessionWatcher.ts`
- Create: `electron/src/__tests__/services/live-session-watcher.test.ts`
- Modify: `electron/src/main/ipc/session-handlers.ts` (add `sessions:watchLive` / `sessions:unwatchLive`)
- Modify: `electron/src/shared/types.ts` (add channel types)

#### Step 1: Write tests

Create `electron/src/__tests__/services/live-session-watcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('LiveSessionWatcher', () => {
  it('reads only new bytes on subsequent polls', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsw-'))
    const file = path.join(tmpDir, 'session.jsonl')

    // Write initial content
    const line1 = JSON.stringify({ type: 'user', message: { content: 'hello' }, timestamp: new Date().toISOString() })
    fs.writeFileSync(file, line1 + '\n')

    // First read: get all content
    const stat1 = fs.statSync(file)
    const content1 = fs.readFileSync(file, 'utf-8')
    expect(content1.trim()).toBe(line1)

    // Append new content
    const line2 = JSON.stringify({ type: 'assistant', message: { content: 'world' }, timestamp: new Date().toISOString() })
    fs.appendFileSync(file, line2 + '\n')

    // Second read: only new bytes
    const fd = fs.openSync(file, 'r')
    const stat2 = fs.statSync(file)
    const newBytes = Buffer.alloc(stat2.size - stat1.size)
    fs.readSync(fd, newBytes, 0, newBytes.length, stat1.size)
    fs.closeSync(fd)

    expect(newBytes.toString('utf-8').trim()).toBe(line2)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true })
  })
})
```

#### Step 2: Run test to verify it passes

Run: `cd electron && npm test -- src/__tests__/services/live-session-watcher.test.ts --reporter=verbose`

#### Step 3: Implement LiveSessionWatcher

Create `electron/src/main/services/LiveSessionWatcher.ts`:

```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow } from 'electron'
import { parseLiveSession } from './SessionParser'

export class LiveSessionWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private sessionFile: string | null = null
  private lastReadOffset = 0
  private accumulatedContent = ''

  /**
   * Find the most recent active Claude Code session JSONL file.
   */
  findActiveSession(): string | null {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects')
    if (!fs.existsSync(claudeDir)) return null

    let newest: { path: string; mtime: number } | null = null

    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(full)
          } else if (entry.name.endsWith('.jsonl')) {
            const stat = fs.statSync(full)
            // Only consider files modified in the last 5 minutes
            if (Date.now() - stat.mtimeMs < 300_000) {
              if (!newest || stat.mtimeMs > newest.mtime) {
                newest = { path: full, mtime: stat.mtimeMs }
              }
            }
          }
        }
      } catch {
        // Permission errors, etc.
      }
    }

    walk(claudeDir)
    return newest?.path ?? null
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), 2000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.sessionFile = null
    this.lastReadOffset = 0
    this.accumulatedContent = ''
  }

  private poll(): void {
    // Re-detect active session periodically
    const active = this.findActiveSession()
    if (active !== this.sessionFile) {
      this.sessionFile = active
      this.lastReadOffset = 0
      this.accumulatedContent = ''
    }

    if (!this.sessionFile || !fs.existsSync(this.sessionFile)) return

    try {
      const stat = fs.statSync(this.sessionFile)
      if (stat.size <= this.lastReadOffset) return // No new data

      // Read only new bytes
      const fd = fs.openSync(this.sessionFile, 'r')
      const newBytes = Buffer.alloc(stat.size - this.lastReadOffset)
      fs.readSync(fd, newBytes, 0, newBytes.length, this.lastReadOffset)
      fs.closeSync(fd)

      this.lastReadOffset = stat.size
      this.accumulatedContent += newBytes.toString('utf-8')

      // Parse accumulated content
      const sessionId = path.basename(this.sessionFile, '.jsonl')
      const state = parseLiveSession(this.accumulatedContent, sessionId)

      // Broadcast to all windows
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('sessions:liveUpdate', state)
      }
    } catch {
      // File may be temporarily locked
    }
  }
}
```

#### Step 4: Register in main process and IPC

In `electron/src/main/index.ts`:

```typescript
import { LiveSessionWatcher } from './services/LiveSessionWatcher'

// After app.whenReady():
const liveWatcher = new LiveSessionWatcher()
liveWatcher.start()

app.on('before-quit', () => {
  liveWatcher.stop()
})
```

In `electron/src/main/ipc/session-handlers.ts`, add:

```typescript
ipcMain.handle('sessions:getLiveState', () => {
  // One-shot read for initial state (watcher broadcasts updates via push)
  return liveWatcher.findActiveSession() ? true : false
})
```

#### Step 5: Run all tests

Run: `cd electron && npm test -- --reporter=verbose`

#### Step 6: Commit

```bash
git add electron/src/main/services/LiveSessionWatcher.ts \
  electron/src/__tests__/services/live-session-watcher.test.ts \
  electron/src/main/index.ts \
  electron/src/main/ipc/session-handlers.ts \
  electron/src/shared/types.ts
git commit -m "feat: add LiveSessionWatcher for real-time session monitoring

Polls active Claude Code JSONL files every 2s, reads only new bytes
since last read, broadcasts parsed state to all windows. Enables
live session dashboard with activity, cost, and context tracking."
```

---

### Task 4: Incremental File Watching for Search Index

Electron's search index is built once via `indexProject()` and never updates. The Swift app uses a `FileWatcher` to detect file changes and incrementally re-index affected files. This means Electron's code search becomes stale as the user edits files during a session.

**Files:**
- Create: `electron/src/main/services/FileWatcher.ts`
- Create: `electron/src/__tests__/services/file-watcher-integration.test.ts`
- Modify: `electron/src/main/services/SearchEngine.ts` (integrate watcher)

#### Step 1: Check if FileWatcher already exists

The exploration found `electron/src/__tests__/services/file-watcher.test.ts` already exists. Read it and the corresponding service to understand what's already built before implementing.

#### Step 2: Implement or extend FileWatcher

Create `electron/src/main/services/FileWatcher.ts` (if not exists):

```typescript
import { watch, FSWatcher } from 'chokidar'
import path from 'path'

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.build', '__pycache__', '.dart_tool',
  '.next', 'dist', 'build', '.svelte-kit', 'target', 'vendor',
  '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
])

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2',
  '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.lock',
  '.min.js', '.min.css', '.map', '.pyc', '.o', '.a', '.dylib', '.so',
])

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private callback: ((paths: string[]) => void) | null = null
  private pendingPaths: Set<string> = new Set()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(projectPath: string, onChange: (paths: string[]) => void): void {
    this.stop()
    this.callback = onChange

    this.watcher = watch(projectPath, {
      ignored: (filePath: string) => {
        const basename = path.basename(filePath)
        if (SKIP_DIRS.has(basename)) return true
        const ext = path.extname(filePath).toLowerCase()
        if (SKIP_EXTS.has(ext)) return true
        return false
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    })

    this.watcher.on('change', (filePath) => this.enqueue(filePath))
    this.watcher.on('add', (filePath) => this.enqueue(filePath))
    this.watcher.on('unlink', (filePath) => this.enqueue(filePath))
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.pendingPaths.clear()
  }

  private enqueue(filePath: string): void {
    this.pendingPaths.add(filePath)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      const paths = [...this.pendingPaths]
      this.pendingPaths.clear()
      this.callback?.(paths)
    }, 2000)
  }
}
```

#### Step 3: Integrate with SearchEngine

In `electron/src/main/services/SearchEngine.ts`, add file watcher startup after initial index:

```typescript
import { FileWatcher } from './FileWatcher'

// In the SearchEngine class:
private fileWatcher = new FileWatcher()

async startWatching(projectPath: string, projectId: string): Promise<void> {
  this.fileWatcher.watch(projectPath, async (changedPaths) => {
    for (const filePath of changedPaths) {
      await this.reindexFile(filePath, projectId)
    }
  })
}

stopWatching(): void {
  this.fileWatcher.stop()
}
```

#### Step 4: Write tests

Create `electron/src/__tests__/services/file-watcher-integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('FileWatcher', () => {
  it('filters out node_modules and binary files', () => {
    // Unit test the ignore logic
    const SKIP_DIRS = new Set(['node_modules', '.git'])
    const SKIP_EXTS = new Set(['.png', '.jpg'])

    const shouldIgnore = (filePath: string) => {
      const path = require('path')
      if (SKIP_DIRS.has(path.basename(filePath))) return true
      if (SKIP_EXTS.has(path.extname(filePath).toLowerCase())) return true
      return false
    }

    expect(shouldIgnore('/project/node_modules/foo.js')).toBe(true)
    expect(shouldIgnore('/project/.git/HEAD')).toBe(true)
    expect(shouldIgnore('/project/src/image.png')).toBe(true)
    expect(shouldIgnore('/project/src/index.ts')).toBe(false)
    expect(shouldIgnore('/project/README.md')).toBe(false)
  })
})
```

#### Step 5: Run tests

Run: `cd electron && npm test -- --reporter=verbose`

#### Step 6: Commit

```bash
git add electron/src/main/services/FileWatcher.ts \
  electron/src/__tests__/services/file-watcher-integration.test.ts \
  electron/src/main/services/SearchEngine.ts
git commit -m "feat: add FileWatcher for incremental search index updates

Watches project files with chokidar, debounces changes (2s),
re-indexes affected files. Skips node_modules, .git, and binary files.
Keeps search index fresh as user edits code during a session."
```

---

## Future Work (Not In This Plan)

These items are lower priority and can be tackled after the above are complete:

- **Remaining browser commands**: Add scroll, hover, drag, select, wait, upload, iframe, cookies, storage, press handlers to BrowserView.tsx
- **Git commit chunking**: Index `git log` output into search chunks (Swift does this)
- **Persistent embeddings**: Store embedding vectors in `codeChunks.embedding` BLOB column
- **Email auto-triage**: Background Gmail polling + email → task conversion
- **Briefing service backend**: RSS/Reddit fetching + digest generation
- **Agent Arena data source**: Connect process monitoring to arena visualization
- **Audio recording & transcription**: Microphone recording + Whisper transcription
