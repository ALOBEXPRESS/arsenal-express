import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project'

const supabase = createClient()

// Fetch all projects for current user
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
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
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      console.log('🔍 Creating project:', { input, user, authError })
      
      if (!user) {
        console.error('❌ User not authenticated')
        throw new Error('User not authenticated')
      }

      // Map frontend fields to database fields
      const insertData = {
        name: input.title, // 'title' -> 'name' no schema
        user_id: user.id,
        mode_id: input.mode === 'upload' ? 'custom' : 'news', // map mode
        aspect_ratio: input.settings.output_format === '1:1' ? '16:9' : input.settings.output_format,
        status: 'draft',
        config: input.settings, // 'settings' -> 'config' no schema
      }
      
      console.log('📝 Inserting data:', insertData)
      console.log('📝 Data types:', {
        name: typeof insertData.name,
        user_id: typeof insertData.user_id,
        mode_id: typeof insertData.mode_id,
        aspect_ratio: typeof insertData.aspect_ratio,
        status: typeof insertData.status,
        config: typeof insertData.config,
        configIsObject: typeof insertData.config === 'object',
        configValue: JSON.stringify(insertData.config),
      })

      const { data, error } = await supabase
        .from('projects')
        .insert([insertData])
        .select()
        .single()

      if (error) {
        console.error('❌ Insert error:', error)
        console.error('❌ Error code:', error.code)
        console.error('❌ Error message:', error.message)
        console.error('❌ Error hint:', error.hint)
        console.error('❌ Error details:', error.details)
        console.error('❌ Full error object:', JSON.stringify(error, null, 2))
        throw error // throw the full error object, not just message
      }
      
      console.log('✅ Project created:', data)
      
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
    onError: (error: any) => {
      console.error('❌ Mutation error:', error)
      console.error('❌ Error type:', typeof error)
      console.error('❌ Error constructor:', error?.constructor?.name)
      console.error('❌ Error message:', error?.message)
      console.error('❌ Error code:', error?.code)
      console.error('❌ Error hint:', error?.hint)
      console.error('❌ Error details:', error?.details)
      
      // Try to stringify the error
      try {
        console.error('❌ Full error JSON:', JSON.stringify(error, null, 2))
      } catch (e) {
        console.error('❌ Could not stringify error')
      }
      
      // Show user-friendly error with all available info
      const errorMessage = error?.message || error?.hint || error?.details || 'Unknown error occurred'
      const errorCode = error?.code ? ` (Code: ${error.code})` : ''
      alert(`Failed to create project: ${errorMessage}${errorCode}`)
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
