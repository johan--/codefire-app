import { Download, X } from 'lucide-react'
import { useUpdateChecker } from '../hooks/useUpdateChecker'

export function UpdateBanner() {
  const { updateAvailable, updateInfo, dismiss, download } = useUpdateChecker()

  if (!updateAvailable || !updateInfo) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-codefire-orange/10 border-b border-codefire-orange/20 shrink-0">
      <Download className="w-4 h-4 text-codefire-orange shrink-0" />
      <p className="text-xs text-neutral-200 flex-1">
        <span className="font-medium">CodeFire v{updateInfo.latestVersion}</span> is available
        <span className="text-neutral-500 ml-1">(you have v{updateInfo.currentVersion})</span>
      </p>
      {download && (
        <button
          onClick={download}
          className="px-3 py-1 rounded text-xs bg-codefire-orange/20 text-codefire-orange
                     hover:bg-codefire-orange/30 transition-colors font-medium"
        >
          Update Now
        </button>
      )}
      <button
        onClick={dismiss}
        className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
