import { ipcMain, BrowserWindow, app } from 'electron'
import { TerminalService } from '../services/TerminalService'
import { NotificationService } from '../services/NotificationService'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Register IPC handlers for terminal management.
 *
 * Data flow:
 * - Renderer → Main (keystrokes): `terminal:write` via send (fire-and-forget)
 * - Main → Renderer (output):     `terminal:data` via webContents.send
 * - Renderer → Main (resize):     `terminal:resize` via send (fire-and-forget)
 * - Main → Renderer (exit):       `terminal:exit` via webContents.send
 * - Lifecycle (create/kill):       `terminal:create` / `terminal:kill` via handle (request-response)
 */
export function registerTerminalHandlers(terminalService: TerminalService) {
  // ─── Availability check ─────────────────────────────────────────────────────

  ipcMain.handle('terminal:available', () => {
    return terminalService.isAvailable()
  })

  // ─── Lifecycle (request-response) ─────────────────────────────────────────

  // Buffer PTY output until the renderer signals it's ready to receive.
  // Without this, the shell prompt arrives before xterm.js mounts its listener
  // and the initial output is silently dropped — causing a blank terminal.
  const pendingBuffers = new Map<string, string[]>()

  ipcMain.handle(
    'terminal:create',
    (_event, id: string, projectPath: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Terminal id is required and must be a string')
      }
      if (!projectPath || typeof projectPath !== 'string') {
        throw new Error('projectPath is required and must be a string')
      }

      // Start buffering before PTY is created
      pendingBuffers.set(id, [])

      terminalService.create(id, projectPath)

      // Wire up PTY output → renderer (buffers until renderer signals ready)
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)

      terminalService.onData(id, (data) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          const buffer = pendingBuffers.get(id)
          if (buffer) {
            // Renderer not ready yet — buffer the output
            buffer.push(data)
          } else {
            senderWindow.webContents.send('terminal:data', id, data)
          }
        }
      })

      terminalService.onExit(id, (exitCode, signal) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('terminal:exit', id, exitCode, signal)
        }
        // Send native OS notification for CLI session completion
        NotificationService.getInstance().notifyClaudeDone(id)
        // Clean up the session after exit
        pendingBuffers.delete(id)
        terminalService.kill(id)
      })

      return { id }
    }
  )

  // Renderer signals it has mounted the xterm.js listener and is ready for data
  ipcMain.on('terminal:ready', (_event, id: string) => {
    const buffer = pendingBuffers.get(id)
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (buffer && senderWindow && !senderWindow.isDestroyed()) {
      // Flush all buffered output
      for (const data of buffer) {
        senderWindow.webContents.send('terminal:data', id, data)
      }
    }
    pendingBuffers.delete(id)
  })

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Terminal id is required and must be a string')
    }
    terminalService.kill(id)
    return { success: true }
  })

  // ─── Fire-and-forget (renderer → main) ───────────────────────────────────

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    terminalService.write(id, data)
  })

  // Write to the first active terminal — only if one already exists.
  // Does NOT auto-create terminals to prevent shell injection from XSS.
  ipcMain.on('terminal:writeToActive', (_event, data: string) => {
    const ids = terminalService.getActiveIds()
    if (ids.length > 0) {
      terminalService.write(ids[0], data)
    }
    // If no terminal exists, silently ignore — the renderer must create one first
    // via the terminal:create handle (which requires explicit user action).
  })

  ipcMain.on(
    'terminal:resize',
    (_event, id: string, cols: number, rows: number) => {
      terminalService.resize(id, cols, rows)
    }
  )

  // ─── Clipboard image save (for pasting images into terminal) ──────────────

  ipcMain.handle(
    'terminal:saveClipboardImage',
    async (_event, imageData: number[], ext: string) => {
      const safeExt = (ext || 'png').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
      const tempDir = path.join(app.getPath('temp'), 'codefire-clipboard')
      fs.mkdirSync(tempDir, { recursive: true })
      const fileName = `clipboard-${Date.now()}.${safeExt}`
      const filePath = path.join(tempDir, fileName)
      fs.writeFileSync(filePath, Buffer.from(imageData))
      return filePath
    }
  )
}
