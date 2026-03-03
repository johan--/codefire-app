import type { Project } from '@shared/models'
import { api } from '@renderer/lib/api'

interface ProjectItemProps {
  project: Project
  onClick: () => void
}

/** Extract the last path component as a display name. */
function displayName(project: Project): string {
  const name = project.name
  // If name looks like a path, take the last segment
  if (name.includes('/') || name.includes('\\')) {
    const segments = name.split(/[/\\]/).filter(Boolean)
    return segments[segments.length - 1] ?? name
  }
  return name
}

/** Parse comma-separated tags string into an array. */
function parseTags(tags: string | null): string[] {
  if (!tags) return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export default function ProjectItem({ project, onClick }: ProjectItemProps) {
  const tags = parseTags(project.tags)

  const handleClick = () => {
    api.windows.openProject(project.id)
    onClick()
  }

  return (
    <button
      onClick={handleClick}
      className="
        w-full flex flex-col gap-0.5 px-2.5 py-1 rounded-cf text-left
        text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200
        transition-colors duration-100 cursor-default
      "
    >
      <span className="truncate">{displayName(project)}</span>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="
                inline-block px-1.5 py-px rounded-sm
                text-tiny text-neutral-500 bg-neutral-800
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
