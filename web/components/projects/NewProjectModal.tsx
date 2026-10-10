'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useCreateProject } from '@/lib/hooks/useProjects'
import type { ProjectMode, OutputFormat, TransitionType } from '@/types/project'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const projectSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().max(500).optional(),
  mode: z.enum(['upload', 'script-to-prompt'] as const),
  output_format: z.enum(['16:9', '9:16', '1:1'] as const),
  target_duration: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined
      const num = Number(val)
      return isNaN(num) ? undefined : num
    },
    z.number().min(5).max(600).optional()
  ),
  default_transition: z.enum(['cut', 'dissolve', 'fade', 'wipe', 'slide', 'fadeblack', 'fadewhite'] as const),
})

type ProjectFormData = z.infer<typeof projectSchema>

interface NewProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectModal({ open, onOpenChange }: NewProjectModalProps) {
  const router = useRouter()
  const createProject = useCreateProject()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      mode: 'upload',
      output_format: '16:9',
      default_transition: 'dissolve',
    },
  })

  const onSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true)
    try {
      const project = await createProject.mutateAsync({
        title: data.title,
        description: data.description,
        mode: data.mode,
        settings: {
          output_format: data.output_format,
          target_duration: data.target_duration,
          default_transition: data.default_transition,
          fps: 30,
          audio_bitrate: '192k',
          video_codec: 'libx264',
        },
      })

      // Reset form and close modal
      reset()
      onOpenChange(false)

      // Redirect to project editor
      router.push(`/project/${project.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
      // Error is handled by the hook's onError callback
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Choose your project mode and configure initial settings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Project Title *</Label>
            <Input
              id="title"
              placeholder="My awesome video"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of your project..."
              rows={3}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label htmlFor="mode">Mode *</Label>
            <Select id="mode" {...register('mode')}>
              <option value="upload">Upload Videos & Audio</option>
              <option value="script-to-prompt">Script to Prompt (Google Veo)</option>
            </Select>
            <p className="text-xs text-gray-400">
              Upload: Provide your own videos and audio files<br />
              Script-to-Prompt: Generate AI video prompts from your script
            </p>
          </div>

          {/* Output Format */}
          <div className="space-y-2">
            <Label htmlFor="output_format">Output Format *</Label>
            <Select id="output_format" {...register('output_format')}>
              <option value="16:9">16:9 (Landscape - YouTube)</option>
              <option value="9:16">9:16 (Portrait - TikTok/Instagram)</option>
              <option value="1:1">1:1 (Square - Instagram)</option>
            </Select>
          </div>

          {/* Target Duration */}
          <div className="space-y-2">
            <Label htmlFor="target_duration">Target Duration (seconds)</Label>
            <Input
              id="target_duration"
              type="number"
              min="5"
              max="600"
              placeholder="60"
              {...register('target_duration', { valueAsNumber: true })}
            />
            {errors.target_duration && (
              <p className="text-sm text-red-500">{errors.target_duration.message}</p>
            )}
          </div>

          {/* Default Transition */}
          <div className="space-y-2">
            <Label htmlFor="default_transition">Default Transition *</Label>
            <Select id="default_transition" {...register('default_transition')}>
              <option value="cut">Cut (No transition)</option>
              <option value="dissolve">Dissolve (Cross-fade)</option>
              <option value="fade">Fade (to black)</option>
              <option value="fadeblack">Fade Black</option>
              <option value="fadewhite">Fade White</option>
              <option value="wipe">Wipe</option>
              <option value="slide">Slide</option>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
