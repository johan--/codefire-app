import { Star, FileText, Plus, Trash2 } from 'lucide-react'

interface MemoryFile {
  name: string
  path: string
  isMain: boolean
}

interface MemoryFileListProps {
  files: MemoryFile[]
  selectedPath: string | null
  onSelect: (file: MemoryFile) => void
  onDelete: (file: MemoryFile) => void
  onNew: () => void
}

export default function MemoryFileList({
  files,
  selectedPath,
  onSelect,
  onDelete,
  onNew,
}: MemoryFileListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 shrink-0">
        <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
          Memory Files
        </h3>
        <button
          className="px-2 py-1.5 bg-codefire-orange/20 text-codefire-orange rounded-cf
                     hover:bg-codefire-orange/30 transition-colors shrink-0"
          onClick={onNew}
          title="New memory file"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <FileText size={24} className="text-neutral-600 mb-2" />
            <p className="text-sm text-neutral-500">No memory files</p>
          </div>
        ) : (
          files.map((file) => {
            const isSelected = file.path === selectedPath

            return (
              <button
                key={file.path}
                className={`group w-full text-left px-3 py-2 border-b border-neutral-800/50 transition-colors flex items-center gap-2
                  ${
                    isSelected
                      ? 'bg-neutral-800 border-l-2 border-l-codefire-orange'
                      : 'hover:bg-neutral-800/60 border-l-2 border-l-transparent'
                  }`}
                onClick={() => onSelect(file)}
              >
                {file.isMain ? (
                  <Star size={14} className="text-codefire-orange shrink-0" />
                ) : (
                  <FileText size={14} className="text-neutral-500 shrink-0" />
                )}
                <span className="text-sm text-neutral-200 truncate flex-1">
                  {file.name}
                </span>
                {!file.isMain && (
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-cf
                               text-neutral-500 hover:text-red-400 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(file)
                    }}
                    title="Delete file"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-neutral-800 shrink-0">
        <p className="text-xs text-neutral-600">Auto-loaded by Claude Code</p>
      </div>
    </div>
  )
}
