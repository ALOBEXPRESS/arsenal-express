/**
 * Hook to load and cache the Sound Effects manifest
 * Includes both bundled effects and user-uploaded custom effects
 */
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { SFXManifest, SoundEffect } from '@/types/project'

const supabase = createClient()

async function fetchManifest(): Promise<SFXManifest> {
  // 1. Load bundled effects from manifest.json
  const response = await fetch('/sfx/manifest.json')
  if (!response.ok) {
    throw new Error('Falha ao carregar biblioteca de efeitos')
  }
  const bundled: SFXManifest = await response.json()

  // 2. Load custom uploaded effects from Supabase Storage
  const customEffects: SoundEffect[] = []
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: files } = await supabase.storage
        .from('sfx-custom')
        .list(user.id, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' },
        })

      if (files) {
        files.forEach((file) => {
          const { data } = supabase.storage.from('sfx-custom').getPublicUrl(`${user.id}/${file.name}`)
          
          // Parse category from path (e.g., "whoosh/123-sound.mp3" -> "whoosh")
          const pathParts = file.name.split('/')
          const category = pathParts[0] as any || 'custom'
          const filename = pathParts[pathParts.length - 1]
          
          customEffects.push({
            id: `custom-${file.id}`,
            category,
            name: filename.replace(/^\d+-/, '').replace(/\.[^.]+$/, ''),
            filename,
            path: data.publicUrl,
            duration: 1.0, // Default, can't get from storage metadata
            tags: ['custom', 'uploaded'],
            license: 'Custom Upload',
            attribution: user.email || 'User',
          })
        })
      }
    }
  } catch (error) {
    console.warn('Failed to load custom SFX:', error)
  }

  // 3. Merge bundled + custom effects
  return {
    ...bundled,
    effects: [...bundled.effects, ...customEffects],
  }
}

export function useSFXManifest() {
  return useQuery({
    queryKey: ['sfx-manifest'],
    queryFn: fetchManifest,
    staleTime: 1000 * 60 * 5, // 5 minutes (shorter for custom uploads)
    gcTime: 1000 * 60 * 60, // 1 hour
  })
}
