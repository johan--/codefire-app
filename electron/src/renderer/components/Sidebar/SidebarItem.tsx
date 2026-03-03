import type { ReactNode } from 'react'

interface SidebarItemProps {
  label: string
  icon?: ReactNode
  isActive?: boolean
  onClick?: () => void
}

export default function SidebarItem({
  label,
  icon,
  isActive = false,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-2.5 py-1.5 rounded-cf text-left
        text-base transition-colors duration-100 cursor-default
        ${
          isActive
            ? 'bg-neutral-800 text-codefire-orange'
            : 'text-neutral-300 hover:bg-neutral-800'
        }
      `}
    >
      {icon && (
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-neutral-500">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}
