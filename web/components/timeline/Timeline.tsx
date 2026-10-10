'use client'

import { useState } from 'react'
import { useScenes, useDeleteScene, useReorderScenes } from '@/lib/hooks/useScenes'
import { SceneCard } from './SceneCard'
import { Button } from '@/components/ui/button'
import type { Scene } from '@/types/project'

interface TimelineProps {
  projectId: string
  onAddScene?: () => void
  onEditScene?: (scene: Scene) => void
}

export function Timeline({ projectId, onAddScene, onEditScene }: TimelineProps) {
  const { data: scenes, isLoading } = useScenes(projectId)
  const deleteScene = useDeleteScene()
  const reorderScenes = useReorderScenes()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index || !scenes) return

    const newScenes = [...scenes]
    const draggedScene = newScenes[draggedIndex]
    newScenes.splice(draggedIndex, 1)
    newScenes.splice(index, 0, draggedScene)

    // Update order field
    const updatedScenes = newScenes.map((scene, idx) => ({
      ...scene,
      order: idx,
    }))

    reorderScenes.mutate({ projectId, scenes: updatedScenes })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleDelete = async (scene: Scene) => {
    await deleteScene.mutateAsync(scene)
  }

  const getTotalDuration = () => {
    if (!scenes) return 0
    return scenes.reduce((total, scene) => total + scene.duration, 0)
  }

  const formatTotalDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="h-full p-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div>
          <h2 className="font-semibold">Timeline</h2>
          {scenes && scenes.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {scenes.length} scene{scenes.length !== 1 ? 's' : ''} ·{' '}
              {formatTotalDuration(getTotalDuration())} total
            </p>
          )}
        </div>
        <Button size="sm" onClick={onAddScene}>
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Scene
        </Button>
      </div>

      {/* Scene Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {!scenes || scenes.length === 0 ? (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-700 rounded-lg">
            <div className="text-center">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-gray-400 mb-2">No scenes yet</p>
              <p className="text-sm text-gray-500 mb-4">
                Add your first scene to start building your video
              </p>
              <Button size="sm" onClick={onAddScene}>
                Add Scene
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {scenes.map((scene, index) => (
              <div key={scene.id} className="flex-shrink-0 w-48">
                <SceneCard
                  scene={scene}
                  index={index}
                  onEdit={onEditScene}
                  onDelete={handleDelete}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedIndex === index}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
