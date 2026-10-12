/**
 * Hook para upload de efeitos sonoros customizados pelo usuário
 * Salva no Supabase Storage (bucket sfx-custom) e adiciona ao manifest local
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { SFXCategory, SoundEffect } from '@/types/project'

interface UploadCustomSFXInput {
  file: File
  name: string
  category: SFXCategory
  tags: string[]
}

const supabase = createClient()

// Helper to generate storage-safe filename
function storageSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Helper to get audio duration
async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.onloadedmetadata = () => {
      resolve(audio.duration)
      URL.revokeObjectURL(audio.src)
    }
    audio.onerror = () => {
      resolve(1.0) // fallback
      URL.revokeObjectURL(audio.src)
    }
    audio.src = URL.createObjectURL(file)
  })
}

export function useUploadCustomSFX() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, name, category, tags }: UploadCustomSFXInput) => {
      // Validate file type
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm']
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|ogg|wav|webm)$/i)) {
        throw new Error('Formato inválido. Use MP3, OGG, WAV ou WebM')
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Arquivo muito grande. Máximo: 5MB')
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      // Generate unique filename
      const timestamp = Date.now()
      const ext = file.name.split('.').pop()
      const safeName = storageSafeName(name)
      const filePath = `${user.id}/${category}/${timestamp}-${safeName}.${ext}`

      // Get audio duration
      const duration = await getAudioDuration(file)

      // Upload to Supabase Storage (bucket: sfx-custom)
      const { error: uploadError } = await supabase.storage
        .from('sfx-custom')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get public URL (assuming bucket is public)
      const { data } = supabase.storage
        .from('sfx-custom')
        .getPublicUrl(filePath)

      // Create SoundEffect object
      const effect: SoundEffect = {
        id: `custom-${timestamp}`,
        category,
        name,
        filename: file.name,
        path: data.publicUrl,
        duration,
        tags: [...tags, 'custom', 'uploaded'],
        license: 'Custom Upload',
        attribution: user.email || 'User Upload',
      }

      return effect
    },
    onSuccess: (effect) => {
      // Invalidate manifest query to refresh list
      queryClient.invalidateQueries({ queryKey: ['sfx-manifest'] })
      toast.success('Efeito sonoro adicionado!', {
        description: `"${effect.name}" está disponível na categoria ${effect.category}`,
      })
    },
    onError: (error: any) => {
      console.error('Erro ao fazer upload do SFX:', error)
      toast.error('Falha no upload', {
        description: error?.message || 'Tente novamente',
      })
    },
  })
}
