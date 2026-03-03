import MainLayout from '@renderer/layouts/MainLayout'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const projectId = params.get('projectId')

  if (projectId) {
    // ProjectLayout will be implemented in Task 19
    return (
      <div className="h-screen bg-neutral-900 text-neutral-200 flex items-center justify-center">
        <p className="text-sm text-neutral-500">
          Project window: {projectId}
        </p>
      </div>
    )
  }

  return <MainLayout />
}
