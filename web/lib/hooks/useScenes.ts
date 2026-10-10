import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Scene, CreateSceneInput } from '@/types/project'

const supabase = createClient()

// Fetch scenes for a project
export function useScenes(projectId: string) {
  return useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return data as Scene[]
    },
    enabled: !!projectId,
  })
}

// Create new scene
export function useCreateScene() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSceneInput) => {
      const { data, error } = await supabase
        .from('scenes')
        .insert([input])
        .select()
        .single()

      if (error) throw error
      return data as Scene
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', data.project_id] })
    },
  })
}

// Update scene
export function useUpdateScene() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Scene>
    }) => {
      const { data, error } = await supabase
        .from('scenes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Scene
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', data.project_id] })
    },
  })
}

// Delete scene
export function useDeleteScene() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scene: Scene) => {
      const { error } = await supabase.from('scenes').delete().eq('id', scene.id)

      if (error) throw error
      return scene
    },
    onSuccess: (scene) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', scene.project_id] })
    },
  })
}

// Reorder scenes (update order field for all scenes)
export function useReorderScenes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      scenes,
    }: {
      projectId: string
      scenes: Scene[]
    }) => {
      // Update order for each scene
      const updates = scenes.map((scene, index) =>
        supabase
          .from('scenes')
          .update({ order_index: index })
          .eq('id', scene.id)
      )

      await Promise.all(updates)
      return scenes
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}
