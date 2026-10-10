'use client'

import { useState } from 'react'
import { useCreateRender } from '@/lib/hooks/useRender'
import type { Project, Scene, Asset } from '@/types/project'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { validateScenes } from '@/lib/ffmpeg/generateCommands'

interface RenderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  scenes: Scene[]
  assets: Asset[]
}

export function RenderModal({
  open,
  onOpenChange,
  project,
  scenes,
  assets,
}: RenderModalProps) {
  const createRender = useCreateRender()
  const [isRendering, setIsRendering] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleRender = async () => {
    // Validate
    const validationErrors = validateScenes(scenes, assets)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setIsRendering(true)
    setErrors([])

    try {
      const render = await createRender.mutateAsync({
        project,
        scenes,
        assets,
      })

      alert(
        `Render queued successfully!\n\n` +
        `Render ID: ${render.id}\n` +
        `Status: ${render.status}\n\n` +
        `The video will be processed in the background.\n` +
        `Check the "Renders" tab to see progress.`
      )

      onOpenChange(false)
    } catch (error: any) {
      setErrors([error.message || 'Failed to start render'])
    } finally {
      setIsRendering(false)
    }
  }

  const getTotalDuration = () => {
    return scenes.reduce((sum, scene) => sum + scene.duration, 0)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Render Video</DialogTitle>
          <DialogDescription>
            Generate final video from your timeline
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project Info */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Project:</span>
              <span className="font-medium">{project.title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Scenes:</span>
              <span className="font-medium">{scenes.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Duration:</span>
              <span className="font-medium">{formatDuration(getTotalDuration())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Format:</span>
              <span className="font-medium">{project.settings.output_format}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">FPS:</span>
              <span className="font-medium">{project.settings.fps || 30}</span>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
              <p className="font-semibold text-red-400 mb-2">Validation Errors:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-300">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <strong>Note:</strong> The video will be processed in the background.
              This may take several minutes depending on the length and complexity.
              You can close this window and check progress in the Renders tab.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isRendering}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRender}
              disabled={isRendering || scenes.length === 0}
            >
              {isRendering ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Starting...
                </>
              ) : (
                <>
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
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Start Render
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
