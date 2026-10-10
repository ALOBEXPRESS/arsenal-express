import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { generateFFmpegCommand, generateScenesJSON, validateScenes } from '@/lib/ffmpeg/generateCommands'
import { submitRenderJob, pollRenderStatus } from '@/lib/api/render'
import type { Project, Scene, Asset } from '@/types/project'

const supabase = createClient()

interface Render {
  id: string
  project_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  ffmpeg_command: string
  scenes_json: string
  output_url?: string | null
  error_message?: string | null
  created_at: string
  updated_at: string
}

interface CreateRenderInput {
  project: Project
  scenes: Scene[]
  assets: Asset[]
}

// Fetch renders for a project
export function useRenders(projectId: string) {
  return useQuery({
    queryKey: ['renders', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renders')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Render[]
    },
    enabled: !!projectId,
  })
}

// Fetch single render
export function useRender(renderId: string) {
  return useQuery({
    queryKey: ['render', renderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renders')
        .select('*')
        .eq('id', renderId)
        .single()

      if (error) throw error
      return data as Render
    },
    enabled: !!renderId,
  })
}

// Create new render
export function useCreateRender() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ project, scenes, assets }: CreateRenderInput) => {
      // Validate scenes
      const errors = validateScenes(scenes, assets)
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n${errors.join('\n')}`)
      }

      // Generate FFmpeg command
      const ffmpegCommand = generateFFmpegCommand({ project, scenes, assets })

      // Generate scenes JSON (for Python assembler compatibility)
      const scenesJson = generateScenesJSON({ project, scenes, assets })

      // Create render record
      const { data, error } = await supabase
        .from('renders')
        .insert([
          {
            project_id: project.id,
            status: 'pending',
            progress: 0,
            ffmpeg_command: ffmpegCommand,
            scenes_json: scenesJson,
          },
        ])
        .select()
        .single()

      if (error) throw error

      const render = data as Render

      // Submit render job to backend
      try {
        await submitRenderJob(render.id, project.id)
      } catch (backendError) {
        // If backend submission fails, mark render as failed
        await supabase
          .from('renders')
          .update({
            status: 'failed',
            error_message: `Backend error: ${backendError}`,
          })
          .eq('id', render.id)
        
        throw new Error(`Failed to submit render job: ${backendError}`)
      }

      return render
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renders', data.project_id] })
    },
  })
}

// Update render progress (called by backend)
export function useUpdateRenderProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      progress,
      status,
    }: {
      id: string
      progress: number
      status?: 'processing' | 'completed' | 'failed'
    }) => {
      const { data, error } = await supabase
        .from('renders')
        .update({
          progress,
          status: status || 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Render
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['render', data.id] })
      queryClient.invalidateQueries({ queryKey: ['renders', data.project_id] })
    },
  })
}

// Complete render (set output URL)
export function useCompleteRender() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      outputUrl,
      error,
    }: {
      id: string
      outputUrl?: string
      error?: string
    }) => {
      const { data, error: dbError } = await supabase
        .from('renders')
        .update({
          status: error ? 'failed' : 'completed',
          progress: error ? 0 : 100,
          output_url: outputUrl,
          error_message: error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (dbError) throw dbError
      return data as Render
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['render', data.id] })
      queryClient.invalidateQueries({ queryKey: ['renders', data.project_id] })
    },
  })
}

// Monitor render progress (polls backend for updates)
export function useMonitorRender(renderId: string, taskId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!taskId) {
        throw new Error('Task ID is required to monitor render')
      }

      // Poll for status updates
      const finalStatus = await pollRenderStatus(
        taskId,
        (status) => {
          // Update progress in real-time
          queryClient.setQueryData(['render', renderId], (old: Render | undefined) => {
            if (!old) return old
            return {
              ...old,
              progress: status.progress,
              status: status.status as Render['status'],
            }
          })
        }
      )

      // Return final status
      return finalStatus
    },
  })
}
