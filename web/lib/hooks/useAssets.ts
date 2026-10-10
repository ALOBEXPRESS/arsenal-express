import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Asset, UploadAssetInput } from '@/types/project'

const supabase = createClient()

// Fetch assets for a project
export function useAssets(projectId: string) {
  return useQuery({
    queryKey: ['assets', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Map 'kind' back to 'type' for frontend consistency
      return (data || []).map(asset => ({
        ...asset,
        type: asset.kind,
      })) as Asset[]
    },
    enabled: !!projectId,
  })
}

// Upload asset to Supabase Storage and create record
export function useUploadAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ project_id, type, file }: UploadAssetInput) => {
      // Generate unique filename
      const timestamp = Date.now()
      const filename = `${timestamp}-${file.name}`
      const filePath = `${project_id}/${type}/${filename}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get file metadata (duration for video/audio)
      let duration_seconds: number | undefined
      if (type === 'video' || type === 'audio') {
        duration_seconds = await getMediaDuration(file)
      }

      // Create asset record in database
      const { data: asset, error: dbError } = await supabase
        .from('assets')
        .insert([
          {
            project_id,
            kind: type, // 'kind' no schema, não 'type'
            origin: 'upload',
            filename: file.name,
            storage_path: filePath,
            duration_seconds,
            file_size_bytes: file.size,
            metadata: {
              mime_type: file.type,
            },
          },
        ])
        .select()
        .single()

      if (dbError) throw dbError
      return asset as Asset
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assets', data.project_id] })
    },
  })
}

// Delete asset
export function useDeleteAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (asset: Asset) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('media')
        .remove([asset.storage_path])

      if (storageError) throw storageError

      // Delete from database
      const { error: dbError } = await supabase
        .from('assets')
        .delete()
        .eq('id', asset.id)

      if (dbError) throw dbError
    },
    onSuccess: (_, asset) => {
      queryClient.invalidateQueries({ queryKey: ['assets', asset.project_id] })
    },
  })
}

// Helper: Get media duration
async function getMediaDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src)
      resolve(Math.round(video.duration))
    }

    video.onerror = () => {
      resolve(undefined)
    }

    video.src = URL.createObjectURL(file)
  })
}
