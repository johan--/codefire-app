import { useEffect, useState } from 'react'
import { Home, Clock, Plus, Folder } from 'lucide-react'
import type { Project, Client } from '@shared/models'
import { api } from '@renderer/lib/api'
import SidebarItem from './SidebarItem'
import ClientGroup from './ClientGroup'
import ProjectItem from './ProjectItem'

type NavView = 'planner' | 'sessions'

export default function Sidebar() {
  const [activeNav, setActiveNav] = useState<NavView>('planner')
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [projectList, clientList] = await Promise.all([
          api.projects.list(),
          api.clients.list(),
        ])
        if (!cancelled) {
          setProjects(projectList)
          setClients(clientList)
        }
      } catch (err) {
        console.error('Failed to load sidebar data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Group projects by client
  const clientProjectMap = new Map<string, Project[]>()
  const ungrouped: Project[] = []

  for (const project of projects) {
    if (project.clientId) {
      const list = clientProjectMap.get(project.clientId) ?? []
      list.push(project)
      clientProjectMap.set(project.clientId, list)
    } else {
      ungrouped.push(project)
    }
  }

  const handleProjectClick = (_projectId: string) => {
    // Window opening is handled inside ProjectItem
  }

  return (
    <div className="h-full flex flex-col bg-neutral-950 border-r border-neutral-800">
      {/* macOS drag region */}
      <div className="drag-region h-7 flex-shrink-0" />

      {/* Logo */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <span className="text-codefire-orange text-title" aria-hidden>
          *
        </span>
        <span className="text-title font-semibold text-neutral-200 tracking-tight">
          CodeFire
        </span>
      </div>

      {/* Navigation */}
      <div className="px-2 space-y-0.5">
        <SidebarItem
          label="Planner"
          icon={<Home size={14} />}
          isActive={activeNav === 'planner'}
          onClick={() => setActiveNav('planner')}
        />
        <SidebarItem
          label="Sessions"
          icon={<Clock size={14} />}
          isActive={activeNav === 'sessions'}
          onClick={() => setActiveNav('sessions')}
        />
      </div>

      {/* Divider */}
      <div className="mx-3 my-3 border-t border-neutral-800" />

      {/* Clients section header */}
      <div className="px-3 mb-1 flex items-center justify-between">
        <span className="text-tiny font-medium text-neutral-600 uppercase tracking-wider">
          Clients
        </span>
        <button
          className="
            w-4 h-4 flex items-center justify-center rounded
            text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800
            transition-colors duration-100
          "
          title="Add client"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Scrollable project list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          // Subtle loading skeleton
          <div className="space-y-2 px-2.5 pt-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-4 bg-neutral-800/50 rounded animate-pulse"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Client groups */}
            {clients.map((client) => {
              const clientProjects = clientProjectMap.get(client.id) ?? []
              return (
                <ClientGroup
                  key={client.id}
                  client={client}
                  projects={clientProjects}
                  onProjectClick={handleProjectClick}
                />
              )
            })}

            {/* Ungrouped projects */}
            {ungrouped.length > 0 && (
              <div className="mt-2">
                {clients.length > 0 && (
                  <div className="px-2.5 py-1 flex items-center gap-1.5">
                    <Folder size={12} className="text-neutral-600" />
                    <span className="text-tiny font-medium text-neutral-600 uppercase tracking-wider">
                      Ungrouped
                    </span>
                  </div>
                )}
                {ungrouped.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    onClick={() => handleProjectClick(project.id)}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {projects.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-neutral-600">No projects yet</p>
                <p className="text-tiny text-neutral-700 mt-1">
                  Open a project folder to get started
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
