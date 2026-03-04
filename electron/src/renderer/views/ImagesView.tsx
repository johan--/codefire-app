import { useState, useEffect } from 'react'
import { api } from '@renderer/lib/api'
import type { GeneratedImage } from '@shared/models'
import ImageHistoryList from '@renderer/components/Images/ImageHistoryList'
import ImageViewer from '@renderer/components/Images/ImageViewer'

interface ImagesViewProps {
  projectId: string
}

export default function ImagesView({ projectId }: ImagesViewProps) {
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [selected, setSelected] = useState<GeneratedImage | null>(null)

  useEffect(() => {
    api.images.list(projectId).then((imgs) => {
      setImages(imgs)
      if (imgs.length > 0) setSelected(imgs[0])
    })
  }, [projectId])

  function handleDelete(id: number) {
    api.images.delete(id).then((ok) => {
      if (ok) {
        setImages((prev) => prev.filter((i) => i.id !== id))
        if (selected?.id === id) {
          setSelected(images.find((i) => i.id !== id) ?? null)
        }
      }
    })
  }

  return (
    <div className="flex h-full">
      {/* Left: History list */}
      <div className="w-64 border-r border-neutral-800 shrink-0">
        <ImageHistoryList
          images={images}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onDelete={handleDelete}
        />
      </div>

      {/* Right: Image viewer */}
      <div className="flex-1">
        <ImageViewer image={selected} />
      </div>
    </div>
  )
}
