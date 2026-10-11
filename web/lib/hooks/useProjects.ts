import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project'

const supabase = createClient()

// Fetch all projects for current user
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      // Only what the project cards render (skips script/outline/reference_text blobs).
      // RLS adds user_id = auth.uid() → served by idx_projects_user_updated (migration 002).
      const { data, error } = await supabase
        .from('projects')
        .select('id, user_id, name, mode_id, status, config, created_at, updated_at')
        .order('updated_at', { ascending: false })

      if (error) throw error
      
      // Map database fields to frontend type
      return (data || []).map(project => ({
        ...project,
        title: project.name,
        mode: project.mode_id === 'news' ? 'script-to-prompt' : 'upload',
        settings: project.config,
      })) as Project[]
    },
  })
}

// Fetch single project by ID
export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      
      // Map database fields to frontend type
      return {
        ...data,
        title: data.name,
        mode: data.mode_id === 'news' ? 'script-to-prompt' : 'upload',
        settings: data.config,
      } as Project
    },
    enabled: !!id,
  })
}

// Create new project
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Map frontend fields to database fields
      const insertData = {
        name: input.title, // 'title' -> 'name' no schema
        user_id: user.id,
        mode_id: input.mode === 'upload' ? 'custom' : 'news', // map mode
        aspect_ratio: input.settings.output_format === '9:16' ? '9:16' : '16:9', // DB only allows 16:9|9:16; real frame lives in config.output_format
        status: 'draft',
        config: input.settings, // 'settings' -> 'config' no schema
      }

      const { data, error } = await supabase
        .from('projects')
        .insert([insertData])
        .select()
        .single()

      if (error) {
        throw error // throw the full error object, not just message
      }
      
      // Map database fields back to frontend type
      return {
        ...data,
        title: data.name,
        mode: input.mode,
        settings: data.config,
      } as unknown as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: { message?: string; hint?: string; details?: string; code?: string }) => {
      const errorMessage = error?.message || error?.hint || error?.details || 'erro desconhecido'
      const errorCode = error?.code ? ` (código ${error.code})` : ''
      toast.error('Não foi possível criar o projeto', { description: `${errorMessage}${errorCode}` })
    },
  })
}

// Update existing project
export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateProjectInput }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Project
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', data.id] })
    },
  })
}

// Delete project
export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Remove the project's media from Storage first (DB rows cascade, files don't)
      const { data: files } = await supabase.from('assets').select('storage_path').eq('project_id', id)
      const paths = (files || []).map((f) => f.storage_path).filter(Boolean)
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmError } = await supabase.storage.from('media').remove(paths.slice(i, i + 100))
        if (rmError) console.warn('[deleteProject] storage cleanup failed:', rmError)
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
