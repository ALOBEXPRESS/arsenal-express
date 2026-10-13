/**
 * Hook to add a sound effect to the timeline
 * Creates a pseudo-asset reference and adds to audio_clips
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { SoundEffect } from '@/types/project'

interface AddSFXInput {
  projectId: string
  effect: SoundEffect
  /** Timeline position in seconds where the effect should be placed */
  position: number
}

const supabase = createClient()

export function useAddSFXToTimeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, effect, position }: AddSFXInput) => {
      // 1. Fetch current project with subprojects
      const { data: project, error: fetchError } = await supabase
        .from('projects')
        .select('subprojects')
        .eq('id', projectId)
        .single()

      if (fetchError) throw fetchError

      // Get first subproject (main timeline)
      const subprojects = project.subprojects || []
      if (subprojects.length === 0) throw new Error('No subproject found')

      const mainSub = subprojects[0]
      const audioClips = mainSub.audio_clips || []

      // 2. Create new audio clip
      // Note: asset_id uses sfx:<id> pseudo-reference since these are bundled public files
      const newClip = {
        id: `sfx-${effect.id}-${Date.now()}`,
        asset_id: `sfx:${effect.id}`,
        start: position,
        duration: effect.duration,
        volume: 1.0,
        speed: 1.0,
        in_point: 0,
      }

      // 3. Add to audio_clips array
      const updatedSubprojects = subprojects.map((sp, i) =>
        i === 0
          ? { ...sp, audio_clips: [...audioClips, newClip] }
          : sp
      )

      // 4. Update project
      const { error: updateError } = await supabase
        .from('projects')
        .update({ subprojects: updatedSubprojects })
        .eq('id', projectId)

      if (updateError) throw updateError

      return newClip
    },
    onSuccess: (_, variables) => {
      // Invalidate project query to refresh timeline
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
      toast.success('Efeito adicionado à linha do tempo')
    },
    onError: (error: any) => {
      console.error('Erro ao adicionar efeito:', error)
      toast.error('Falha ao adicionar efeito', {
        description: error?.message || 'Tente novamente',
      })
    },
  })
}
