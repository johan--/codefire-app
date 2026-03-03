import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { Client, Project } from '@shared/models'
import ProjectItem from './ProjectItem'

interface ClientGroupProps {
  client: Client
  projects: Project[]
  onProjectClick: (projectId: string) => void
}

export default function ClientGroup({
  client,
  projects,
  onProjectClick,
}: ClientGroupProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="mb-1">
      {/* Client header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="
          w-full flex items-center gap-1.5 px-2.5 py-1 rounded-cf
          text-xs text-neutral-400 hover:text-neutral-200
          hover:bg-neutral-800 transition-colors duration-100 cursor-default
        "
      >
        <span className="flex-shrink-0 w-3 h-3 flex items-center justify-center text-neutral-500">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: client.color || '#737373' }}
        />
        <span className="truncate font-medium">{client.name}</span>
        <span className="ml-auto text-neutral-600 text-tiny">
          {projects.length}
        </span>
      </button>

      {/* Project list */}
      {expanded && projects.length > 0 && (
        <div className="ml-3 mt-0.5">
          {projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              onClick={() => onProjectClick(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
