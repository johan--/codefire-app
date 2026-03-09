import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { TaskItem } from '@shared/models'
import KanbanColumn from './KanbanColumn'
import TaskDetailSheet from './TaskDetailSheet'
import TaskCard from './TaskCard'

interface KanbanBoardProps {
  todoTasks: TaskItem[]
  inProgressTasks: TaskItem[]
  doneTasks: TaskItem[]
  onUpdateTask: (
    id: number,
    data: {
      title?: string
      description?: string
      status?: string
      priority?: number
      labels?: string[]
    }
  ) => Promise<void>
  onDeleteTask: (id: number) => Promise<void>
  onAddTask: (title: string, status?: string) => Promise<unknown>
  /** Map of projectId → projectName, for showing project badge on task cards in global view */
  projectNames?: Record<string, string>
}

const COLUMNS = [
  { id: 'todo', title: 'Todo', color: 'text-orange-400', icon: 'circle' as const },
  { id: 'in_progress', title: 'In Progress', color: 'text-blue-400', icon: 'circle-dot' as const },
  { id: 'done', title: 'Done', color: 'text-green-400', icon: 'check-circle' as const },
] as const

const COLUMN_IDS = new Set<string>(COLUMNS.map((c) => c.id))

export default function KanbanBoard({
  todoTasks,
  inProgressTasks,
  doneTasks,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  projectNames,
}: KanbanBoardProps) {
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  // Local optimistic state: null means "use props", otherwise use this override
  const [optimisticTasks, setOptimisticTasks] = useState<Record<string, TaskItem[]> | null>(null)
  const pendingUpdate = useRef(false)

  // Clear optimistic state when props change (server confirmed the update)
  useEffect(() => {
    if (pendingUpdate.current) {
      setOptimisticTasks(null)
      pendingUpdate.current = false
    }
  }, [todoTasks, inProgressTasks, doneTasks])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const allTasks = useCallback(() => {
    return [...todoTasks, ...inProgressTasks, ...doneTasks]
  }, [todoTasks, inProgressTasks, doneTasks])

  const getTasksForColumn = (columnId: string): TaskItem[] => {
    if (optimisticTasks) {
      return optimisticTasks[columnId] || []
    }
    switch (columnId) {
      case 'todo':
        return todoTasks
      case 'in_progress':
        return inProgressTasks
      case 'done':
        return doneTasks
      default:
        return []
    }
  }

  const findTaskColumn = (taskId: string): string | null => {
    const id = Number(taskId)
    if (optimisticTasks) {
      for (const [col, tasks] of Object.entries(optimisticTasks)) {
        if (tasks.some((t) => t.id === id)) return col
      }
      return null
    }
    if (todoTasks.some((t) => t.id === id)) return 'todo'
    if (inProgressTasks.some((t) => t.id === id)) return 'in_progress'
    if (doneTasks.some((t) => t.id === id)) return 'done'
    return null
  }

  const resolveColumnId = (id: string | number): string | null => {
    const idStr = String(id)
    if (COLUMN_IDS.has(idStr)) return idStr
    return findTaskColumn(idStr)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = allTasks().find((t) => String(t.id) === String(event.active.id))
    setActiveTask(task || null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      setOverColumnId(null)
      return
    }
    setOverColumnId(resolveColumnId(over.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    // Always clear drag state
    setActiveTask(null)
    setOverColumnId(null)

    if (!over) return

    const taskId = Number(active.id)
    const sourceColumn = findTaskColumn(String(active.id))
    const targetColumn = resolveColumnId(over.id)

    if (!targetColumn || !sourceColumn || targetColumn === sourceColumn) return

    // Optimistic update: move the task in local state immediately
    const task = allTasks().find((t) => t.id === taskId)
    if (!task) return

    const updatedTask = { ...task, status: targetColumn }
    const newState: Record<string, TaskItem[]> = {
      todo: todoTasks.filter((t) => t.id !== taskId),
      in_progress: inProgressTasks.filter((t) => t.id !== taskId),
      done: doneTasks.filter((t) => t.id !== taskId),
    }
    newState[targetColumn] = [...newState[targetColumn], updatedTask]
    setOptimisticTasks(newState)
    pendingUpdate.current = true

    // Fire-and-forget the backend update; if it fails, the next refetch corrects state
    onUpdateTask(taskId, { status: targetColumn }).catch(() => {
      // Revert optimistic update on failure
      setOptimisticTasks(null)
      pendingUpdate.current = false
    })
  }

  const handleDragCancel = () => {
    setActiveTask(null)
    setOverColumnId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full p-3 gap-3">
        <div className="flex-1 grid grid-cols-3 gap-3 min-h-0 min-w-0">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              color={col.color}
              icon={col.icon}
              tasks={getTasksForColumn(col.id)}
              isDropTarget={overColumnId === col.id}
              onTaskClick={(task) => setSelectedTask(task)}
              onAddTask={(title) => onAddTask(title, col.id)}
              projectNames={projectNames}
            />
          ))}
        </div>

        {selectedTask && (
          <TaskDetailSheet
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={async (id, data) => {
              await onUpdateTask(id, data)
              const tasks = [...todoTasks, ...inProgressTasks, ...doneTasks]
              const updated = tasks.find((t) => t.id === id)
              if (updated) {
                const merged = { ...updated, ...data } as Record<string, unknown>
                // labels is stored as JSON string in the model but passed as string[] in the update
                if (data.labels) {
                  merged.labels = JSON.stringify(data.labels)
                }
                setSelectedTask(merged as unknown as TaskItem)
              }
            }}
            onDelete={onDeleteTask}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[280px] opacity-90 rotate-2">
            <TaskCard
              task={activeTask}
              onClick={() => {}}
              projectName={projectNames?.[activeTask.projectId]}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
