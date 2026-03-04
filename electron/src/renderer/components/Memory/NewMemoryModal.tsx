import { useState } from 'react'
import { X } from 'lucide-react'

interface NewMemoryModalProps {
  onClose: () => void
  onCreate: (fileName: string, content?: string) => Promise<void>
}

export default function NewMemoryModal({ onClose, onCreate }: NewMemoryModalProps) {
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const name = fileName.trim()
    if (!name) return

    setCreating(true)
    try {
      await onCreate(name.endsWith('.md') ? name : `${name}.md`, content || undefined)
      onClose()
    } catch (err) {
      console.error('Failed to create memory file:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && e.metaKey) handleCreate()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg w-[420px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-200">New Memory File</h3>
          <button
            className="p-1 text-neutral-500 hover:text-neutral-300 rounded-cf transition-colors"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Filename input */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Filename</label>
            <div className="flex items-center gap-1">
              <input
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-cf px-3 py-2
                           text-sm text-neutral-200 placeholder-neutral-500
                           focus:outline-none focus:border-codefire-orange/50"
                placeholder="my-context"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                autoFocus
              />
              <span className="text-sm text-neutral-500">.md</span>
            </div>
          </div>

          {/* Content textarea */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">
              Content <span className="text-neutral-600">(optional)</span>
            </label>
            <textarea
              className="w-full bg-neutral-800 border border-neutral-700 rounded-cf px-3 py-2
                         text-sm text-neutral-200 placeholder-neutral-500 font-mono
                         focus:outline-none focus:border-codefire-orange/50 resize-none"
              rows={5}
              placeholder="# Memory context..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {/* Hint */}
          <p className="text-xs text-neutral-600">
            Link from MEMORY.md to load automatically
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-neutral-800">
          <button
            className="px-4 py-1.5 text-sm bg-codefire-orange text-white rounded-cf
                       hover:bg-codefire-orange-hover transition-colors disabled:opacity-50"
            onClick={handleCreate}
            disabled={!fileName.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
