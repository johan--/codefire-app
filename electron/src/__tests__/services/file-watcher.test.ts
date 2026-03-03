import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mock chokidar ──────────────────────────────────────────────────────────

const mockChokidar = vi.hoisted(() => {
  const createMockWatcher = () => {
    const listeners = new Map<string, Array<(path: string) => void>>()

    return {
      on: vi.fn((event: string, handler: (path: string) => void) => {
        if (!listeners.has(event)) listeners.set(event, [])
        listeners.get(event)!.push(handler)
        return mockWatcher
      }),
      close: vi.fn(() => Promise.resolve()),
      // Test helper: simulate a file event
      _emit(event: string, filePath: string) {
        const handlers = listeners.get(event)
        if (handlers) {
          for (const handler of handlers) handler(filePath)
        }
      },
      _listeners: listeners,
    }
  }

  let mockWatcher = createMockWatcher()

  return {
    watch: vi.fn(() => mockWatcher),
    _getMockWatcher: () => mockWatcher,
    _resetMockWatcher: () => {
      mockWatcher = createMockWatcher()
    },
    _createMockWatcher: createMockWatcher,
  }
})

vi.mock('chokidar', () => ({
  watch: mockChokidar.watch,
}))

import { FileWatcher } from '../../main/services/FileWatcher'

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher

  beforeEach(() => {
    vi.useFakeTimers()
    mockChokidar._resetMockWatcher()
    vi.clearAllMocks()
    fileWatcher = new FileWatcher(2000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── watch ──────────────────────────────────────────────────────────────

  describe('watch', () => {
    it('creates a chokidar watcher for the project path', () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')

      expect(mockChokidar.watch).toHaveBeenCalledOnce()
      expect(mockChokidar.watch).toHaveBeenCalledWith(
        '/home/user/my-project',
        expect.objectContaining({
          ignoreInitial: true,
          awaitWriteFinish: expect.objectContaining({
            stabilityThreshold: expect.any(Number),
            pollInterval: expect.any(Number),
          }),
        })
      )
    })

    it('registers add, change, and unlink event handlers', () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')

      const watcher = mockChokidar._getMockWatcher()
      const registeredEvents = watcher.on.mock.calls.map(
        (call: [string, ...unknown[]]) => call[0]
      )

      expect(registeredEvents).toContain('add')
      expect(registeredEvents).toContain('change')
      expect(registeredEvents).toContain('unlink')
    })

    it('passes ignored directory patterns to chokidar', () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')

      const options = mockChokidar.watch.mock.calls[0][1] as { ignored: string[] }
      expect(options.ignored).toContain('**/node_modules/**')
      expect(options.ignored).toContain('**/.git/**')
      expect(options.ignored).toContain('**/dist/**')
      expect(options.ignored).toContain('**/build/**')
      expect(options.ignored).toContain('**/__pycache__/**')
    })

    it('does not create a duplicate watcher for the same project', () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')
      fileWatcher.watch('proj-1', '/home/user/my-project')

      expect(mockChokidar.watch).toHaveBeenCalledOnce()
    })

    it('creates separate watchers for different projects', () => {
      // Need a fresh mock watcher for the second call
      const watcher1 = mockChokidar._getMockWatcher()
      fileWatcher.watch('proj-1', '/home/user/project-a')

      mockChokidar._resetMockWatcher()
      fileWatcher.watch('proj-2', '/home/user/project-b')

      expect(mockChokidar.watch).toHaveBeenCalledTimes(2)
      expect(fileWatcher.isWatching('proj-1')).toBe(true)
      expect(fileWatcher.isWatching('proj-2')).toBe(true)
    })
  })

  // ─── unwatch ────────────────────────────────────────────────────────────

  describe('unwatch', () => {
    it('closes the chokidar watcher and removes it', async () => {
      const watcher = mockChokidar._getMockWatcher()
      fileWatcher.watch('proj-1', '/home/user/my-project')

      await fileWatcher.unwatch('proj-1')

      expect(watcher.close).toHaveBeenCalledOnce()
      expect(fileWatcher.isWatching('proj-1')).toBe(false)
    })

    it('does nothing for a project that is not being watched', async () => {
      await expect(fileWatcher.unwatch('nonexistent')).resolves.toBeUndefined()
    })

    it('clears pending debounce timer on unwatch', async () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      // Trigger a file change so there's a pending debounce
      watcher._emit('change', '/home/user/my-project/src/index.ts')

      await fileWatcher.unwatch('proj-1')

      // Advance past debounce — callback should NOT fire
      vi.advanceTimersByTime(3000)
      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ─── unwatchAll ─────────────────────────────────────────────────────────

  describe('unwatchAll', () => {
    it('closes all watchers', async () => {
      const watcher1 = mockChokidar._getMockWatcher()
      fileWatcher.watch('proj-1', '/home/user/project-a')

      mockChokidar._resetMockWatcher()
      const watcher2 = mockChokidar._getMockWatcher()
      fileWatcher.watch('proj-2', '/home/user/project-b')

      await fileWatcher.unwatchAll()

      expect(watcher1.close).toHaveBeenCalledOnce()
      expect(watcher2.close).toHaveBeenCalledOnce()
      expect(fileWatcher.isWatching('proj-1')).toBe(false)
      expect(fileWatcher.isWatching('proj-2')).toBe(false)
    })

    it('handles empty watcher list gracefully', async () => {
      await expect(fileWatcher.unwatchAll()).resolves.toBeUndefined()
    })
  })

  // ─── isWatching ─────────────────────────────────────────────────────────

  describe('isWatching', () => {
    it('returns true for a watched project', () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')
      expect(fileWatcher.isWatching('proj-1')).toBe(true)
    })

    it('returns false for an unwatched project', () => {
      expect(fileWatcher.isWatching('proj-1')).toBe(false)
    })

    it('returns false after unwatching', async () => {
      fileWatcher.watch('proj-1', '/home/user/my-project')
      await fileWatcher.unwatch('proj-1')
      expect(fileWatcher.isWatching('proj-1')).toBe(false)
    })
  })

  // ─── File extension filtering ──────────────────────────────────────────

  describe('file extension filtering', () => {
    it('triggers callback for source code files', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/src/app.ts')

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledWith('proj-1', ['/home/user/my-project/src/app.ts'])
    })

    it('triggers for various source extensions', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      const sourceFiles = [
        '/home/user/my-project/src/index.tsx',
        '/home/user/my-project/lib/utils.js',
        '/home/user/my-project/main.py',
        '/home/user/my-project/App.swift',
        '/home/user/my-project/Main.java',
        '/home/user/my-project/main.go',
        '/home/user/my-project/lib.rs',
        '/home/user/my-project/style.css',
        '/home/user/my-project/schema.sql',
        '/home/user/my-project/README.md',
        '/home/user/my-project/config.yaml',
        '/home/user/my-project/package.json',
      ]

      for (const file of sourceFiles) {
        watcher._emit('change', file)
      }

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledOnce()
      const changedPaths = callback.mock.calls[0][1] as string[]
      expect(changedPaths).toHaveLength(sourceFiles.length)
      for (const file of sourceFiles) {
        expect(changedPaths).toContain(file)
      }
    })

    it('ignores non-source files', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/image.png')
      watcher._emit('change', '/home/user/my-project/archive.zip')
      watcher._emit('change', '/home/user/my-project/binary.exe')
      watcher._emit('change', '/home/user/my-project/.DS_Store')

      vi.advanceTimersByTime(2000)

      expect(callback).not.toHaveBeenCalled()
    })

    it('ignores files without extensions', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/Makefile')
      watcher._emit('change', '/home/user/my-project/Dockerfile')

      vi.advanceTimersByTime(2000)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ─── Debouncing ─────────────────────────────────────────────────────────

  describe('debouncing', () => {
    it('accumulates changes and fires once after quiet period', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/a.ts')
      vi.advanceTimersByTime(500)

      watcher._emit('change', '/home/user/my-project/b.ts')
      vi.advanceTimersByTime(500)

      watcher._emit('change', '/home/user/my-project/c.ts')

      // Not yet — debounce hasn't elapsed since last event
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledOnce()
      const changedPaths = callback.mock.calls[0][1] as string[]
      expect(changedPaths).toHaveLength(3)
      expect(changedPaths).toContain('/home/user/my-project/a.ts')
      expect(changedPaths).toContain('/home/user/my-project/b.ts')
      expect(changedPaths).toContain('/home/user/my-project/c.ts')
    })

    it('resets the debounce timer on each new event', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/a.ts')
      vi.advanceTimersByTime(1500) // 1.5s in — not yet

      watcher._emit('change', '/home/user/my-project/b.ts') // resets timer
      vi.advanceTimersByTime(1500) // 1.5s after reset — still not enough

      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500) // now 2s after last event

      expect(callback).toHaveBeenCalledOnce()
    })

    it('deduplicates the same file path', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/src/app.ts')
      watcher._emit('change', '/home/user/my-project/src/app.ts')
      watcher._emit('change', '/home/user/my-project/src/app.ts')

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledOnce()
      const changedPaths = callback.mock.calls[0][1] as string[]
      expect(changedPaths).toHaveLength(1)
    })

    it('does not fire callback when no callback is set', () => {
      const watcher = mockChokidar._getMockWatcher()
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('change', '/home/user/my-project/src/app.ts')

      // Should not throw
      expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    })
  })

  // ─── Event types ────────────────────────────────────────────────────────

  describe('event types', () => {
    it('fires on file add events', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('add', '/home/user/my-project/new-file.ts')

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledWith('proj-1', ['/home/user/my-project/new-file.ts'])
    })

    it('fires on file unlink events', () => {
      const watcher = mockChokidar._getMockWatcher()
      const callback = vi.fn()
      fileWatcher.onFilesChanged = callback
      fileWatcher.watch('proj-1', '/home/user/my-project')

      watcher._emit('unlink', '/home/user/my-project/deleted.ts')

      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenCalledWith('proj-1', ['/home/user/my-project/deleted.ts'])
    })
  })
})
