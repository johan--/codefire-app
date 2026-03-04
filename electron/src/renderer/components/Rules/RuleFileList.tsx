import { Globe, FolderOpen, FileCode, Plus } from 'lucide-react'

export interface RuleFile {
  scope: 'global' | 'project' | 'local'
  label: string
  path: string
  exists: boolean
  color: 'blue' | 'purple' | 'orange'
}

interface RuleFileListProps {
  files: RuleFile[]
  selectedScope: string | null
  onSelect: (file: RuleFile) => void
  onCreate: (file: RuleFile) => void
}

const scopeIcons = {
  global: Globe,
  project: FolderOpen,
  local: FileCode,
} as const

const colorClasses = {
  blue: { text: 'text-blue-400', bg: 'bg-blue-400/10' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-400/10' },
  orange: { text: 'text-codefire-orange', bg: 'bg-codefire-orange/10' },
} as const

export default function RuleFileList({
  files,
  selectedScope,
  onSelect,
  onCreate,
}: RuleFileListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-800 shrink-0">
        <h3 className="text-sm font-medium text-neutral-300">Rule Files</h3>
      </div>

      {/* File rows */}
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => {
          const Icon = scopeIcons[file.scope]
          const colors = colorClasses[file.color]
          const isSelected = file.scope === selectedScope

          return (
            <button
              key={file.scope}
              className={`group w-full text-left px-3 py-2.5 border-b border-neutral-800/50 transition-colors
                ${
                  isSelected
                    ? 'bg-neutral-800 border-l-2 border-l-codefire-orange'
                    : 'hover:bg-neutral-800/50 border-l-2 border-l-transparent'
                }`}
              onClick={() => onSelect(file)}
            >
              <div className="flex items-center gap-2.5">
                {/* Colored icon */}
                <div className={`p-1.5 rounded-cf ${colors.bg} shrink-0`}>
                  <Icon size={14} className={colors.text} />
                </div>

                {/* Scope info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-neutral-200 font-medium truncate">
                      {file.scope.charAt(0).toUpperCase() + file.scope.slice(1)}
                    </span>
                    {file.exists && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {file.exists ? 'CLAUDE.md' : 'Not created'}
                  </p>
                </div>

                {/* Create button (hover only, if file doesn't exist) */}
                {!file.exists && (
                  <button
                    className="p-1 rounded-cf text-neutral-500 hover:text-neutral-300
                               opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreate(file)
                    }}
                    title="Create CLAUDE.md"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-neutral-800 shrink-0">
        <p className="text-xs text-neutral-600 leading-relaxed">
          Load Order: Global → Project → Local
        </p>
        <p className="text-xs text-neutral-600 mt-0.5">
          Later files override earlier ones
        </p>
      </div>
    </div>
  )
}
