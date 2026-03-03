// ─── File Watcher ─────────────────────────────────────────────────────────────
//
// Watches project directories for source file changes and fires a debounced
// callback with the list of changed paths. Used by the ContextEngine to
// trigger re-indexing when code is modified.
//
// Uses chokidar for cross-platform file watching with debouncing.
//

import { watch, type FSWatcher } from 'chokidar'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Source file extensions we care about for indexing. */
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.swift',
  '.java',
  '.go',
  '.rs',
  '.cs',
  '.cpp',
  '.c',
  '.h',
  '.rb',
  '.php',
  '.sql',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.html',
  '.css',
  '.scss',
])

/** Directories to ignore completely. */
const IGNORED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.build/**',
  '**/__pycache__/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/venv/**',
  '**/.venv/**',
  '**/target/**',
  '**/Pods/**',
]

// ─── Types ───────────────────────────────────────────────────────────────────

export type FilesChangedCallback = (projectId: string, changedPaths: string[]) => void

interface WatcherState {
  watcher: FSWatcher
  projectId: string
  projectPath: string
  debounceTimer: ReturnType<typeof setTimeout> | null
  pendingPaths: Set<string>
}

// ─── FileWatcher ─────────────────────────────────────────────────────────────

/**
 * Watches project directories for source file changes and fires a
 * debounced callback with accumulated changed paths.
 */
export class FileWatcher {
  private watchers = new Map<string, WatcherState>()
  private onFilesChangedCallback: FilesChangedCallback | null = null
  private debounceMs: number

  constructor(debounceMs = 2000) {
    this.debounceMs = debounceMs
  }

  /**
   * Set the callback that fires when source files change.
   */
  set onFilesChanged(callback: FilesChangedCallback | null) {
    this.onFilesChangedCallback = callback
  }

  /**
   * Start watching a project directory for source file changes.
   * If the project is already being watched, this is a no-op.
   */
  watch(projectId: string, projectPath: string): void {
    if (this.watchers.has(projectId)) return

    const watcher = watch(projectPath, {
      ignored: IGNORED_DIRS,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    })

    const state: WatcherState = {
      watcher,
      projectId,
      projectPath,
      debounceTimer: null,
      pendingPaths: new Set(),
    }

    watcher.on('add', (filePath: string) => this.handleFileEvent(state, filePath))
    watcher.on('change', (filePath: string) => this.handleFileEvent(state, filePath))
    watcher.on('unlink', (filePath: string) => this.handleFileEvent(state, filePath))

    this.watchers.set(projectId, state)
  }

  /**
   * Stop watching a specific project.
   */
  async unwatch(projectId: string): Promise<void> {
    const state = this.watchers.get(projectId)
    if (!state) return

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }
    await state.watcher.close()
    this.watchers.delete(projectId)
  }

  /**
   * Stop watching all projects. Call on app quit.
   */
  async unwatchAll(): Promise<void> {
    const promises = Array.from(this.watchers.keys()).map((id) => this.unwatch(id))
    await Promise.all(promises)
  }

  /**
   * Check if a project is currently being watched.
   */
  isWatching(projectId: string): boolean {
    return this.watchers.has(projectId)
  }

  /**
   * Handle a file event (add, change, or unlink) with extension filtering
   * and debouncing.
   */
  private handleFileEvent(state: WatcherState, filePath: string): void {
    if (!this.isSourceFile(filePath)) return

    state.pendingPaths.add(filePath)

    // Reset debounce timer — wait for quiet period before firing
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }

    state.debounceTimer = setTimeout(() => {
      this.flushPendingChanges(state)
    }, this.debounceMs)
  }

  /**
   * Fire the callback with all accumulated changes and clear the pending set.
   */
  private flushPendingChanges(state: WatcherState): void {
    const changedPaths = Array.from(state.pendingPaths)
    state.pendingPaths.clear()
    state.debounceTimer = null

    if (changedPaths.length > 0 && this.onFilesChangedCallback) {
      this.onFilesChangedCallback(state.projectId, changedPaths)
    }
  }

  /**
   * Check if a file path has a source code extension we care about.
   */
  private isSourceFile(filePath: string): boolean {
    const dot = filePath.lastIndexOf('.')
    if (dot === -1) return false
    const ext = filePath.slice(dot).toLowerCase()
    return SOURCE_EXTENSIONS.has(ext)
  }
}
