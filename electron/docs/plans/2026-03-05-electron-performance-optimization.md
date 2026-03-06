# Electron Performance Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce startup time and memory footprint of the Electron app to be closer to the Swift app's performance.

**Architecture:** Defer heavy initialization, reduce bundle size, lazy-load views, and trim the asar.

**Tech Stack:** Vite code-splitting, dynamic imports, electron-builder file filtering

---

## Current State (Measured)

| Metric | Value |
|--------|-------|
| Total app size | 340 MB |
| asar bundle | 78 MB |
| asar.unpacked (native modules) | 15 MB |
| Files in asar | 11,269 (11,255 are node_modules) |
| Renderer JS bundle | 3.9 MB (single chunk) |
| Main process bundle | 132 KB |
| `lucide-react` in node_modules | 45 MB |
| `@uiw/react-md-editor` + deps | 12 MB |
| `@codemirror` | 3.4 MB |
| `@xterm` | 6.1 MB |

## Priority 1: Low-Hanging Fruit (Immediate Impact)

### Task 1: Tree-shake lucide-react icons

**Problem:** `lucide-react` is 45 MB in node_modules and likely ships all 1500+ icons to the asar. Only ~20-30 icons are actually used.

**Files:**
- Modify: `electron/vite.config.ts` (or check current config)
- Check: All renderer files importing from `lucide-react`

**Step 1:** Audit which icons are imported across the codebase:
```bash
grep -rh "from 'lucide-react'" src/renderer/ | sort -u
```

**Step 2:** Verify Vite is tree-shaking lucide-react properly. If icons are imported as `import { X, Y } from 'lucide-react'`, Vite should tree-shake. If not, switch to direct imports: `import { X } from 'lucide-react/dist/esm/icons/x'`.

**Step 3:** Confirm the 3.9 MB renderer bundle shrinks after proper tree-shaking.

---

### Task 2: Defer heavy main-process initialization

**Problem:** `index.ts` eagerly initializes everything at module load time — Gmail, MCP, SearchEngine, ContextEngine, EmbeddingClient, FileWatcher, BrowserCommandExecutor, LiveSessionWatcher — before the window even opens.

**Files:**
- Modify: `electron/src/main/index.ts`

**Step 1:** Move these initializations inside `app.whenReady()`, after the window is created:
- `GmailService` → lazy, only if credentials exist
- `SearchEngine` + `ContextEngine` + `EmbeddingClient` → defer to after window shows
- `BrowserCommandExecutor` → already deferred, good
- `LiveSessionWatcher` → defer to after window shows
- `FileWatcher` → defer to after window shows

**Step 2:** Use `setImmediate()` or `setTimeout(fn, 0)` to push non-critical init after the event loop processes the window creation.

Pattern:
```typescript
app.whenReady().then(() => {
  const mainWin = windowManager.createMainWindow()

  // Show window ASAP, then init services
  mainWin.once('show', () => {
    setTimeout(() => {
      // Init search, context, gmail, file watcher, etc.
    }, 100)
  })
})
```

---

### Task 3: Trim node_modules from asar

**Problem:** 11,255 node_modules files in the asar. Many are only needed at build time or are already bundled by Vite (renderer deps). Only main-process runtime deps need to be in the asar: `better-sqlite3`, `node-pty`, `chokidar`, `@modelcontextprotocol/sdk`, and their transitive deps.

**Files:**
- Modify: `electron/package.json` (`build.files` section)

**Step 1:** Add explicit excludes to the `files` config:
```json
"files": [
  "dist/**/*",
  "dist-electron/**/*",
  "node_modules/**/*",
  "!node_modules/lucide-react/**",
  "!node_modules/@codemirror/**",
  "!node_modules/codemirror/**",
  "!node_modules/@xterm/**",
  "!node_modules/@uiw/**",
  "!node_modules/react/**",
  "!node_modules/react-dom/**",
  "!node_modules/@dnd-kit/**",
  "!node_modules/react-resizable-panels/**",
  "!node_modules/@lezer/**",
  "!node_modules/refractor/**",
  "!node_modules/rehype*/**",
  "!node_modules/remark*/**",
  "!node_modules/react-markdown/**",
  "!node_modules/micromark*/**",
  "!node_modules/mdast*/**",
  "!node_modules/hast*/**",
  "!node_modules/unified/**",
  "!node_modules/unist*/**",
  "!node_modules/vfile*/**",
  "!node_modules/@tailwindcss/**",
  "!node_modules/tailwindcss/**",
  "!node_modules/@vitejs/**",
  "!node_modules/typescript/**",
  "!node_modules/vitest/**"
]
```

**Step 2:** Rebuild and verify the app still works. All renderer deps are bundled in `dist/assets/index-*.js` — they don't need to be in node_modules inside the asar.

**Step 3:** Measure new asar size. Target: < 20 MB (down from 78 MB).

---

### Task 4: Add Vite code splitting for heavy renderer views

**Problem:** Single 3.9 MB renderer chunk means the entire UI (CodeMirror, xterm, markdown editor, all views) loads before anything renders.

**Files:**
- Modify: `electron/src/renderer/App.tsx` or view imports
- Modify: `electron/vite.config.ts` (manualChunks if needed)

**Step 1:** Lazy-load heavy views with `React.lazy()`:
```typescript
const BrowserView = React.lazy(() => import('./views/BrowserView'))
const SessionsView = React.lazy(() => import('./views/SessionsView'))
const ChatView = React.lazy(() => import('./views/ChatView'))
const TerminalView = React.lazy(() => import('./views/TerminalView'))
```

**Step 2:** Wrap lazy components in `<Suspense fallback={<LoadingSpinner />}>`.

**Step 3:** Verify code splitting works — check `dist/assets/` for multiple JS chunks after build.

---

## Priority 2: Medium Effort (Significant Impact)

### Task 5: Optimize BrowserWindow creation

**Files:**
- Modify: `electron/src/main/windows/WindowManager.ts`

**Step 1:** Set `show: false` in BrowserWindow options (if not already), then call `win.show()` in the `ready-to-show` event:
```typescript
const win = new BrowserWindow({ show: false, ... })
win.once('ready-to-show', () => win.show())
```
This prevents the white flash while the renderer loads.

**Step 2:** Enable `backgroundThrottling: false` in webPreferences to prevent throttling when window is in background.

---

### Task 6: Replace @uiw/react-md-editor with lighter alternative

**Problem:** `@uiw/react-md-editor` pulls in 12 MB of dependencies (rehype, remark, refractor, etc.) that all end up in the asar even though they're bundled by Vite.

**Files:**
- Audit: Which components use `@uiw/react-md-editor`
- Evaluate: Can we use a lighter markdown renderer (e.g., `react-markdown` alone, which is already a dependency)?

**Step 1:** Audit usage — if it's only for display (not editing), replace with `react-markdown`.

**Step 2:** If editing is needed, consider `@mdxeditor/editor` or a simple textarea + preview approach.

---

### Task 7: Reduce polling intervals

**Problem:** Multiple polling loops running simultaneously:
- `BrowserCommandExecutor`: every 100ms
- `LiveSessionWatcher`: every 2s
- `MCPServerManager`: likely polling too

**Files:**
- Modify: `electron/src/main/services/BrowserCommandExecutor.ts`
- Modify: `electron/src/main/services/LiveSessionWatcher.ts`

**Step 1:** Increase `BrowserCommandExecutor` poll from 100ms to 500ms (still responsive enough for browser automation).

**Step 2:** Only start polling services when they're actually needed (e.g., BrowserCommandExecutor only when browser view is open).

---

## Priority 3: Longer Term

### Task 8: Use `electron-builder` `twoPackageJson` structure

Move renderer-only dependencies to `devDependencies` so they're excluded from the production build automatically, rather than using file exclusion patterns.

### Task 9: Profile renderer startup with Chrome DevTools

Use `--inspect` flag and Chrome DevTools Performance tab to identify the actual bottleneck in renderer startup (is it parsing 3.9 MB of JS? DOM rendering? Data loading?).

### Task 10: Consider V8 snapshots

Electron supports V8 snapshots (`--js-flags="--snapshot_blob=..."`) to pre-compile JavaScript, reducing parse time on startup.

---

## Expected Impact

| Optimization | Estimated Impact |
|-------------|-----------------|
| Trim asar node_modules | -60 MB asar, faster app load |
| Defer main process init | Window appears 1-2s sooner |
| Code-split renderer | Initial render 40-60% faster |
| ready-to-show pattern | Eliminates white flash |
| Reduce polling | Lower idle CPU usage |
| Replace md-editor | -12 MB dependencies |
