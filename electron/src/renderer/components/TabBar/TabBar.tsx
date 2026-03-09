import {
  CheckSquare,
  FileText,
  FolderOpen,
  Globe,
  Brain,
  Layers,
  ScrollText,
  Cloud,
  GitBranch,
  Image,
  Clock,
  LayoutDashboard,
  AudioLines,
  BarChart3,
  Activity,
  BookOpen,
  GitPullRequest,
} from 'lucide-react'
import TabButton from './TabButton'

interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  hiddenTabs?: Set<string>
}

const tabs = [
  { id: 'Tasks', icon: CheckSquare },
  { id: 'Dashboard', icon: LayoutDashboard },
  { id: 'Activity', icon: Activity },
  { id: 'Sessions', icon: Clock },
  { id: 'Notes', icon: FileText },
  { id: 'Memory', icon: Brain },
  { id: 'Patterns', icon: Layers },
  { id: 'Rules', icon: ScrollText },
  { id: 'Files', icon: FolderOpen },
  { id: 'Git', icon: GitBranch },
  { id: 'Docs', icon: BookOpen },
  { id: 'Browser', icon: Globe },
  { id: 'Images', icon: Image },
  { id: 'Transcribe', icon: AudioLines },
  { id: 'Reviews', icon: GitPullRequest },
] as const

export default function TabBar({ activeTab, onTabChange, hiddenTabs }: TabBarProps) {
  return (
    <div className="flex items-center overflow-x-auto scrollbar-none bg-neutral-900 border-b border-neutral-800 shrink-0">
      {tabs.filter((tab) => !('hidden' in tab && tab.hidden) && !hiddenTabs?.has(tab.id)).map((tab) => (
        <TabButton
          key={tab.id}
          label={tab.id}
          icon={<tab.icon size={16} />}
          isActive={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        />
      ))}
    </div>
  )
}
