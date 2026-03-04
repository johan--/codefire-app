import { Folder } from 'lucide-react'
import type { Project } from '@shared/models'
import { api } from '@renderer/lib/api'

interface ProjectItemProps {
  project: Project
  onClick: () => void
  indent?: boolean
}

/** Extract the last path component as a display name. */
function displayName(project: Project): string {
  const name = project.name
  if (name.includes('/') || name.includes('\\')) {
    const segments = name.split(/[/\\]/).filter(Boolean)
    return segments[segments.length - 1] ?? name
  }
  return name
}

/** Parse tags — handles both JSON arrays and comma-separated strings. */
function parseTags(tags: string | null): string[] {
  if (!tags) return []
  const trimmed = tags.trim()

  // Handle JSON array format: '["prod","webapp"]'
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean)
      }
    } catch {
      // Fall through to comma-separated parsing
    }
  }

  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export default function ProjectItem({ project, onClick, indent }: ProjectItemProps) {
  const tags = parseTags(project.tags)
  const name = displayName(project)

  const handleClick = () => {
    api.windows.openProject(project.id)
    onClick()
  }

  return (
    <button
      onClick={handleClick}
      className={`
        w-full flex items-center gap-2 py-1 rounded text-left
        text-[12px] text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200
        transition-colors duration-100 cursor-default
        ${indent ? 'pl-7 pr-3' : 'px-3'}
      `}
    >
      <Folder size={13} className="flex-shrink-0 text-neutral-600" />
      <span className="truncate">{name}</span>
      {tags.length > 0 && (
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {tags.map((tag) => (
            <span
              key={tag}
              className="
                inline-block px-1.5 py-px rounded
                text-[10px] text-neutral-500 bg-neutral-800
                leading-tight
              "
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
