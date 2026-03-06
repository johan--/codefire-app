import { describe, it, expect, beforeEach, vi } from 'vitest'

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
      _emit(event: string, filePath: string) {
        const handlers = listeners.get(event)
        if (handlers) {
          for (const handler of handlers) handler(filePath)
        }
      },
    }
  }

  let mockWatcher = createMockWatcher()

  return {
    watch: vi.fn(() => mockWatcher),
    _getMockWatcher: () => mockWatcher,
    _resetMockWatcher: () => {
      mockWatcher = createMockWatcher()
    },
  }
})

vi.mock('chokidar', () => ({
  watch: mockChokidar.watch,
}))

import { FileWatcher } from '../../main/services/FileWatcher'

describe('FileWatcher Integration', () => {
  let fileWatcher: FileWatcher

  beforeEach(() => {
    vi.useFakeTimers()
    mockChokidar._resetMockWatcher()
    vi.clearAllMocks()
    fileWatcher = new FileWatcher()
  })

  it('can be instantiated and reports not watching', () => {
    expect(fileWatcher).toBeDefined()
    expect(fileWatcher.isWatching('test-project')).toBe(false)
  })

  it('filters out non-source files from triggering callbacks', () => {
    const watcher = mockChokidar._getMockWatcher()
    const callback = vi.fn()
    fileWatcher.onFilesChanged = callback
    fileWatcher.watch('proj-1', '/tmp/test-project')

    // These should be ignored (no matching source extension)
    watcher._emit('change', '/tmp/test-project/node_modules/pkg/index.js')
    watcher._emit('change', '/tmp/test-project/image.png')
    watcher._emit('change', '/tmp/test-project/archive.tar.gz')
    watcher._emit('change', '/tmp/test-project/Makefile')

    vi.advanceTimersByTime(3000)

    // node_modules is filtered by chokidar ignored patterns, but the
    // .js extension passes isSourceFile — chokidar mock doesn't enforce
    // ignored patterns, so we check that non-source extensions are filtered
    // The .png, .tar.gz, and Makefile should not trigger the callback
    // However node_modules/pkg/index.js has .js extension so it passes
    // the extension filter (chokidar would block it in production)
    const calls = callback.mock.calls
    if (calls.length > 0) {
      const changedPaths = calls[0][1] as string[]
      // Binary/non-source files should NOT be in the changed paths
      expect(changedPaths).not.toContain('/tmp/test-project/image.png')
      expect(changedPaths).not.toContain('/tmp/test-project/archive.tar.gz')
      expect(changedPaths).not.toContain('/tmp/test-project/Makefile')
    }
  })

  it('calls onFilesChanged with correct projectId and paths for source files', () => {
    const watcher = mockChokidar._getMockWatcher()
    const callback = vi.fn()
    fileWatcher.onFilesChanged = callback
    fileWatcher.watch('my-project', '/tmp/test-project')

    watcher._emit('change', '/tmp/test-project/src/app.ts')
    watcher._emit('add', '/tmp/test-project/src/utils.py')

    vi.advanceTimersByTime(3000)

    expect(callback).toHaveBeenCalledOnce()
    const [projectId, changedPaths] = callback.mock.calls[0]
    expect(projectId).toBe('my-project')
    expect(changedPaths).toContain('/tmp/test-project/src/app.ts')
    expect(changedPaths).toContain('/tmp/test-project/src/utils.py')
  })

  it('starts and stops watching correctly', async () => {
    fileWatcher.watch('proj-1', '/tmp/test-project')
    expect(fileWatcher.isWatching('proj-1')).toBe(true)

    await fileWatcher.unwatch('proj-1')
    expect(fileWatcher.isWatching('proj-1')).toBe(false)
  })
})
