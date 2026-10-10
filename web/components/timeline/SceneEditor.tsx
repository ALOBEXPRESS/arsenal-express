'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreateScene, useUpdateScene } from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import type { Scene, TransitionType, AnimationType } from '@/types/project'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const sceneSchema = z.object({
  duration: z.number().min(1).max(120),
  video_asset_id: z.string().optional(),
  audio_asset_id: z.string().optional(),
  image_asset_id: z.string().optional(),
  transition_in: z.enum(['cut', 'dissolve', 'fade', 'wipe', 'slide', 'fadeblack', 'fadewhite'] as const),
  transition_out: z.enum(['cut', 'dissolve', 'fade', 'wipe', 'slide', 'fadeblack', 'fadewhite'] as const),
  animation: z.enum(['none', 'zoom', 'pan', 'ken-burns'] as const).optional(),
})

type SceneFormData = z.infer<typeof sceneSchema>

interface SceneEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  scene?: Scene | null
  sceneCount: number
}

export function SceneEditor({
  open,
  onOpenChange,
  projectId,
  scene,
  sceneCount,
}: SceneEditorProps) {
  const createScene = useCreateScene()
  const updateScene = useUpdateScene()
  const { data: assets } = useAssets(projectId)

  const videoAssets = assets?.filter((a) => a.type === 'video') || []
  const audioAssets = assets?.filter((a) => a.type === 'audio') || []
  const imageAssets = assets?.filter((a) => a.type === 'image') || []

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SceneFormData>({
    resolver: zodResolver(sceneSchema),
    defaultValues: scene || {
      duration: 5,
      transition_in: 'dissolve',
      transition_out: 'dissolve',
      animation: 'none',
    },
  })

  const onSubmit = async (data: SceneFormData) => {
    try {
      if (scene) {
        // Update existing scene
        await updateScene.mutateAsync({
          id: scene.id,
          updates: data,
        })
      } else {
        // Create new scene
        await createScene.mutateAsync({
          project_id: projectId,
          order: sceneCount,
          ...data,
        })
      }

      reset()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save scene:', error)
      alert('Failed to save scene. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{scene ? 'Edit Scene' : 'Add New Scene'}</DialogTitle>
          <DialogDescription>
            Configure scene assets, duration, and transitions
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (seconds) *</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              max="120"
              {...register('duration', { valueAsNumber: true })}
            />
            {errors.duration && (
              <p className="text-sm text-red-500">{errors.duration.message}</p>
            )}
          </div>

          {/* Video/Image */}
          <div className="space-y-2">
            <Label htmlFor="video_asset_id">Video Asset</Label>
            <Select id="video_asset_id" {...register('video_asset_id')}>
              <option value="">-- None --</option>
              {videoAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_asset_id">Image Asset (if no video)</Label>
            <Select id="image_asset_id" {...register('image_asset_id')}>
              <option value="">-- None --</option>
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </Select>
          </div>

          {/* Audio */}
          <div className="space-y-2">
            <Label htmlFor="audio_asset_id">Audio Asset</Label>
            <Select id="audio_asset_id" {...register('audio_asset_id')}>
              <option value="">-- None --</option>
              {audioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename} {asset.duration && `(${asset.duration}s)`}
                </option>
              ))}
            </Select>
          </div>

          {/* Transitions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transition_in">Transition In *</Label>
              <Select id="transition_in" {...register('transition_in')}>
                <option value="cut">Cut</option>
                <option value="dissolve">Dissolve</option>
                <option value="fade">Fade</option>
                <option value="fadeblack">Fade Black</option>
                <option value="fadewhite">Fade White</option>
                <option value="wipe">Wipe</option>
                <option value="slide">Slide</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transition_out">Transition Out *</Label>
              <Select id="transition_out" {...register('transition_out')}>
                <option value="cut">Cut</option>
                <option value="dissolve">Dissolve</option>
                <option value="fade">Fade</option>
                <option value="fadeblack">Fade Black</option>
                <option value="fadewhite">Fade White</option>
                <option value="wipe">Wipe</option>
                <option value="slide">Slide</option>
              </Select>
            </div>
          </div>

          {/* Animation */}
          <div className="space-y-2">
            <Label htmlFor="animation">Animation (for images)</Label>
            <Select id="animation" {...register('animation')}>
              <option value="none">None</option>
              <option value="zoom">Zoom</option>
              <option value="pan">Pan</option>
              <option value="ken-burns">Ken Burns</option>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {scene ? 'Update Scene' : 'Add Scene'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
