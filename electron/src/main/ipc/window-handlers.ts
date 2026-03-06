import { ipcMain, shell } from 'electron'
import Database from 'better-sqlite3'
import { WindowManager } from '../windows/WindowManager'
import { ProjectDAO } from '../database/dao/ProjectDAO'
import type { FileWatcher } from '../services/FileWatcher'

export function registerWindowHandlers(
  windowManager: WindowManager,
  db?: Database.Database,
  fileWatcher?: FileWatcher
) {
  const projectDAO = db ? new ProjectDAO(db) : null

  ipcMain.handle('window:openProject', (_e, projectId: string) => {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId is required and must be a string')
    }
    const win = windowManager.createProjectWindow(projectId)

    // Start watching project directory for file changes
    if (fileWatcher && projectDAO && !fileWatcher.isWatching(projectId)) {
      const project = projectDAO.getById(projectId)
      if (project) {
        fileWatcher.watch(projectId, project.path)
        console.log(`[FileWatcher] Started watching project: ${projectId}`)
      }
    }

    return { windowId: win.id }
  })

  ipcMain.handle('window:closeProject', (_e, projectId: string) => {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId is required and must be a string')
    }
    const result = windowManager.closeProjectWindow(projectId)

    // Stop watching project directory when its window closes
    if (fileWatcher && fileWatcher.isWatching(projectId)) {
      fileWatcher.unwatch(projectId)
      console.log(`[FileWatcher] Stopped watching project: ${projectId}`)
    }

    return result
  })

  ipcMain.handle('window:getProjectWindows', () => {
    const windows = windowManager.getAllProjectWindows()
    return Array.from(windows.keys())
  })

  ipcMain.handle('window:focusMain', () => {
    const mainWin = windowManager.getMainWindow()
    if (mainWin) {
      mainWin.focus()
      return true
    }
    return false
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
      await shell.openExternal(url)
      return true
    }
    return false
  })
}
