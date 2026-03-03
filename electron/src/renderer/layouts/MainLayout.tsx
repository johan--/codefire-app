import { Group, Panel, Separator } from 'react-resizable-panels'
import Sidebar from '@renderer/components/Sidebar/Sidebar'

export default function MainLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-900">
      <Group orientation="horizontal" id="main-layout">
        {/* Sidebar panel */}
        <Panel id="sidebar" defaultSize="18%" minSize="12%" maxSize="25%">
          <Sidebar />
        </Panel>

        {/* Resize handle */}
        <Separator className="w-[2px] bg-neutral-800 hover:bg-codefire-orange active:bg-codefire-orange transition-colors duration-150" />

        {/* Dashboard content area */}
        <Panel id="dashboard">
          <div className="h-full flex flex-col bg-neutral-900 p-6">
            {/* Drag region for the dashboard side */}
            <div className="drag-region h-7 -mt-6 -mx-6 mb-4 flex-shrink-0" />

            <h1 className="text-title font-semibold text-neutral-200">
              Dashboard
            </h1>
            <p className="text-sm text-neutral-500 mt-2">
              Select a project to get started
            </p>
          </div>
        </Panel>
      </Group>
    </div>
  )
}
