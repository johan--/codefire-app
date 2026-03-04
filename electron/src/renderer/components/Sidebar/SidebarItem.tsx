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
        w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left
        text-[13px] font-medium transition-colors duration-100 cursor-default
        ${
          isActive
            ? 'bg-codefire-orange/15 text-codefire-orange'
            : 'text-neutral-300 hover:bg-white/[0.04]'
        }
      `}
    >
      {icon && (
        <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${
          isActive ? 'text-codefire-orange' : 'text-neutral-500'
        }`}>
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}
