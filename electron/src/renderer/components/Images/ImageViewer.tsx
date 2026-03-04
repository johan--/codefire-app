import { Image, Copy, ExternalLink, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import type { GeneratedImage } from '@shared/models'

interface ImageViewerProps {
  image: GeneratedImage | null
}

export default function ImageViewer({ image }: ImageViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  if (!image) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-2">
        <Image size={32} />
        <p className="text-sm">Select an image to view</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
            {image.aspectRatio ?? '1:1'}
          </span>
          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">
            {image.model.split('/').pop()}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(image.filePath)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Copy path"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={() => window.open(`file://${image.filePath}`, '_blank')}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Open externally"
          >
            <ExternalLink size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Image display */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950/50">
          <img
            src={`file://${image.filePath}`}
            alt={image.prompt}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>

        {/* Prompt display */}
        <div className="px-3 py-2 border-t border-neutral-800">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">Prompt</p>
          <p className="text-xs text-neutral-300">{image.prompt}</p>
          {image.responseText && (
            <>
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mt-2 mb-1">
                Response
              </p>
              <p className="text-xs text-neutral-400">{image.responseText}</p>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setIsFullscreen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsFullscreen(false)}
          role="button"
          tabIndex={0}
        >
          <img
            src={`file://${image.filePath}`}
            alt={image.prompt}
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
        </div>
      )}
    </>
  )
}
