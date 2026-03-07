import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string | null
  downloadUrl: string | null
  releaseNotes: string | null
}

export function useUpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const check = useCallback(async () => {
    try {
      const result = await api.update.check()
      if (result.available) {
        setUpdateInfo(result)
      }
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    check()
    const interval = setInterval(check, 6 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [check])

  const dismiss = useCallback(() => setDismissed(true), [])

  return {
    updateAvailable: updateInfo?.available && !dismissed,
    updateInfo,
    dismiss,
    download: updateInfo?.downloadUrl
      ? () => api.update.download(updateInfo.downloadUrl!)
      : null,
  }
}
