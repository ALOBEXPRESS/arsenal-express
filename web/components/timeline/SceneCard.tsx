'use client'

import type { Scene } from '@/types/project'

interface SceneCardProps {
  scene: Scene
  index: number
  onEdit?: (scene: Scene) => void
  onDelete?: (scene: Scene) => void
  onDragStart?: (e: React.DragEvent, index: number) => void
  onDragEnter?: (e: React.DragEvent, index: number) => void
  onDragEnd?: (e: React.DragEvent) => void
  isDragging?: boolean
}

export function SceneCard({
  scene,
  index,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isDragging,
}: SceneCardProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      className={`relative bg-gray-800 rounded-lg p-3 border-2 transition-all cursor-move ${
        isDragging
          ? 'opacity-50 border-blue-500'
          : 'border-gray-700 hover:border-gray-600'
      }`}
      draggable
      onDragStart={(e) => onDragStart?.(e, index)}
      onDragEnter={(e) => onDragEnter?.(e, index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Scene Number */}
      <div className="absolute -top-2 -left-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
        {index + 1}
      </div>

      {/* Preview */}
      <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 rounded mb-2 flex items-center justify-center">
        {scene.image_asset_id ? (
          <span className="text-2xl">🖼️</span>
        ) : scene.video_asset_id ? (
          <span className="text-2xl">🎬</span>
        ) : (
          <span className="text-2xl">⬜</span>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Duration:</span>
          <span className="font-medium">{formatDuration(scene.duration)}</span>
        </div>
        {scene.audio_asset_id && (
          <div className="flex items-center gap-1 text-gray-400">
            <span>🎵</span>
            <span>Audio</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Transition:</span>
          <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">
            {scene.transition_out}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit?.(scene)
          }}
          className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this scene?')) {
              onDelete?.(scene)
            }
          }}
          className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
