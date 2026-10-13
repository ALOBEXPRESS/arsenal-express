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
      const rows = data || []

      // Bucket 'media' is private: generate signed URLs in one batch call
      const urlByPath = new Map<string, string>()
      if (rows.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from('media')
          .createSignedUrls(rows.map((a) => a.storage_path), SIGNED_URL_TTL)
        if (signError) console.error('[useAssets] Failed to sign URLs:', signError)
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
        })
      }

      // Map DB columns to frontend fields ('kind' -> 'type', 'duration_seconds' -> 'duration')
      return rows.map((asset) => ({
        ...asset,
        type: asset.kind,
        duration: asset.duration_seconds,
        url: urlByPath.get(asset.storage_path) || '',
      })) as Asset[]
    },
    enabled: !!projectId,
    // Refresh before signed URLs expire
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    refetchInterval: (SIGNED_URL_TTL - 300) * 1000,
  })
}

const SIGNED_URL_TTL = 60 * 60 // 1 hour

// Upload asset to Supabase Storage and create record
export function useUploadAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ project_id, type, file }: UploadAssetInput) => {
      // Generate unique filename
      // Storage keys must be ASCII-safe ("…", accents etc. → "Invalid key").
      // The original name is kept in assets.filename.
      const timestamp = Date.now()
      const filePath = `${project_id}/${type}/${timestamp}-${storageSafeName(file.name)}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Upload error details:', uploadError)
        throw new Error(`Upload failed: ${uploadError.message || JSON.stringify(uploadError)}`)
      }

      // Get file metadata (duration for video/audio, thumbnails)
      let duration_seconds: number | undefined
      let thumbnail: string | undefined
      let dims: { width: number; height: number } | null = null
      // let subtype: string | undefined // Temporarily disabled - column doesn't exist

      if (type === 'video') {
        duration_seconds = await getMediaDuration(file)
        dims = lastDims
        thumbnail = await generateVideoThumbnail(file)
      } else if (type === 'audio') {
        duration_seconds = await getMediaDuration(file)
      } else if (type === 'image') {
        thumbnail = await generateImageThumbnail(file)
      } else if (type === 'asset') {
        // Detect subtype for extra assets (GIF, MOV, Lottie, stickers)
        // subtype = detectSubtype(file) // Temporarily disabled - column doesn't exist
        if (file.type.startsWith('video/') || file.type === 'image/gif') {
          duration_seconds = await getMediaDuration(file)
          thumbnail = await generateVideoThumbnail(file)
        } else if (file.type.startsWith('image/')) {
          thumbnail = await generateImageThumbnail(file)
        }
      }

      // Create asset record in database
      // Map 'asset' type to appropriate database kind (video/audio/image)
      let dbKind: 'video' | 'audio' | 'image' = type as 'video' | 'audio' | 'image'
      if (type === 'asset') {
        // For extra assets, determine kind from file type
        if (file.type.startsWith('video/') || file.type === 'image/gif') {
          dbKind = 'video'
        } else if (file.type.startsWith('audio/')) {
          dbKind = 'audio'
        } else {
          dbKind = 'image' // Default for stickers, images, etc.
        }
      }

      const { data: asset, error: dbError } = await supabase
        .from('assets')
        .insert([
          {
            project_id,
            kind: dbKind, // Use mapped database kind
            origin: 'upload',
            filename: file.name,
            storage_path: filePath,
            duration_seconds,
            file_size_bytes: file.size,
            // subtype, // Temporarily disabled - column doesn't exist
            metadata: {
              mime_type: file.type,
              thumbnail, // Base64 thumbnail for preview
              last_modified: file.lastModified, // File modification date (used by Auto Assemble ordering)
              ...(dims || {}), // width/height → output frame (9:16 vs 16:9)
            },
          },
        ])
        .select()
        .single()

      if (dbError) {
        console.error('Database error details:', dbError)
        throw new Error(`Database insert failed: ${dbError.message || JSON.stringify(dbError)}`)
      }
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

// Helper: ASCII-only object key (strip accents, replace anything else with "_")
export function storageSafeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const safe = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100)
  return `${safe || 'file'}${ext}`
}

// Helper: Get media duration
// Last probed video dimensions (read right after getMediaDuration for the same file)
let lastDims: { width: number; height: number } | null = null

async function getMediaDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
    video.preload = 'metadata'
    lastDims = null

    video.onloadedmetadata = () => {
      const v = video as HTMLVideoElement
      if (v.videoWidth && v.videoHeight) lastDims = { width: v.videoWidth, height: v.videoHeight }
      const d = video.duration
      const src = video.src
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(src)
      resolve(Number.isFinite(d) ? Math.round(d * 100) / 100 : undefined)
    }

    video.onerror = () => {
      resolve(undefined)
    }

    video.src = URL.createObjectURL(file)
  })
}

// Helper: Generate video thumbnail
async function generateVideoThumbnail(file: File | Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.muted = true

    // Detach the element BEFORE revoking the blob URL, otherwise the browser keeps
    // requesting the revoked blob (ERR_FILE_NOT_FOUND noise in the console)
    const finish = (thumb?: string) => {
      video.onloadeddata = null
      video.onseeked = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(thumb)
    }

    video.onloadeddata = () => {
      // Seek to 1 second or 10% of duration, whichever is smaller
      video.currentTime = Math.min(1, video.duration * 0.1)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = Math.round((320 * video.videoHeight) / video.videoWidth)
      const ctx = canvas.getContext('2d')
      if (!ctx) return finish(undefined)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      finish(canvas.toDataURL('image/jpeg', 0.7))
    }

    video.onerror = () => finish(undefined)

    video.src = url
  })
}

// Helper: Generate image thumbnail
async function generateImageThumbnail(file: File | Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxWidth = 320
      const scale = maxWidth / img.width
      canvas.width = maxWidth
      canvas.height = Math.round(img.height * scale)
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
        window.URL.revokeObjectURL(img.src)
        resolve(thumbnail)
      } else {
        window.URL.revokeObjectURL(img.src)
        resolve(undefined)
      }
    }

    img.onerror = () => {
      window.URL.revokeObjectURL(img.src)
      resolve(undefined)
    }

    img.src = URL.createObjectURL(file)
  })
}

// Update asset metadata
export function useUpdateAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Asset> }) => {
      const { data, error } = await supabase
        .from('assets')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, { id }) => {
      // Invalidate all asset queries that might contain this asset
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

// Detect asset subtype from file
function detectSubtype(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const mime = file.type.toLowerCase()
  
  // GIF
  if (mime === 'image/gif' || ext === 'gif') return 'gif'
  
  // JPG/JPEG
  if (mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  
  // MOV
  if (mime === 'video/quicktime' || ext === 'mov') return 'mov'
  
  // Lottie (JSON-based animation)
  if ((mime === 'application/json' || ext === 'json' || ext === 'lottie') && file.name.toLowerCase().includes('lottie')) {
    return 'lottie'
  }
  
  // Stickers (PNG, SVG, GIF)
  if (mime === 'image/png' || ext === 'png') return 'sticker-png'
  if (mime === 'image/svg+xml' || ext === 'svg') return 'sticker-svg'
  if ((mime === 'image/gif' || ext === 'gif') && file.name.toLowerCase().includes('sticker')) {
    return 'sticker-gif'
  }
  
  return 'unknown'
}

// Regenerate thumbnail for an existing asset
export function useRegenerateThumbnail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (asset: Asset) => {
      // Download the asset file from storage
      const { data: blob, error } = await supabase.storage.from('media').download(asset.storage_path)
      if (error || !blob) throw error || new Error(`Failed to download ${asset.filename}`)

      // Generate thumbnail based on type
      let thumbnail: string | undefined
      if (asset.type === 'video') {
        thumbnail = await generateVideoThumbnail(blob)
      } else if (asset.type === 'image') {
        thumbnail = await generateImageThumbnail(blob)
      } else {
        throw new Error(`Cannot generate thumbnail for type: ${asset.type}`)
      }

      if (!thumbnail) throw new Error('Failed to generate thumbnail')

      // Update asset metadata with new thumbnail
      const { data, error: updateError } = await supabase
        .from('assets')
        .update({
          metadata: {
            ...(asset.metadata || {}),
            thumbnail,
          },
        })
        .eq('id', asset.id)
        .select()
        .single()

      if (updateError) throw updateError
      return data as Asset
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assets', data.project_id] })
    },
  })
}

// Batch regenerate thumbnails for all assets without them in a project
export function useBatchRegenerateThumbnails() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, onProgress }: { projectId: string; onProgress?: (current: number, total: number) => void }) => {
      // Get all video/image assets without thumbnails
      const { data: assets, error } = await supabase
        .from('assets')
        .select('*')
        .eq('project_id', projectId)
        .in('kind', ['video', 'image'])
        .order('created_at', { ascending: false })

      if (error) throw error
      const assetsToFix = (assets || []).filter((a) => {
        const meta = a.metadata as Record<string, unknown> | null
        return !meta?.thumbnail
      })

      if (assetsToFix.length === 0) {
        return { fixed: 0, total: 0, skipped: 0 }
      }

      let fixed = 0
      let skipped = 0

      for (let i = 0; i < assetsToFix.length; i++) {
        const asset = assetsToFix[i]
        onProgress?.(i + 1, assetsToFix.length)

        try {
          // Download the file
          const { data: blob, error: downloadError } = await supabase.storage.from('media').download(asset.storage_path)
          if (downloadError || !blob) {
            console.warn(`[batch regen] Skip ${asset.filename}: download failed`, downloadError)
            skipped++
            continue
          }

          // Generate thumbnail
          let thumbnail: string | undefined
          if (asset.kind === 'video') {
            thumbnail = await generateVideoThumbnail(blob)
          } else if (asset.kind === 'image') {
            thumbnail = await generateImageThumbnail(blob)
          }

          if (!thumbnail) {
            console.warn(`[batch regen] Skip ${asset.filename}: thumbnail generation failed`)
            skipped++
            continue
          }

          // Update metadata
          const { error: updateError } = await supabase
            .from('assets')
            .update({
              metadata: {
                ...(asset.metadata || {}),
                thumbnail,
              },
            })
            .eq('id', asset.id)

          if (updateError) {
            console.warn(`[batch regen] Skip ${asset.filename}: update failed`, updateError)
            skipped++
            continue
          }

          fixed++
        } catch (err) {
          console.warn(`[batch regen] Skip ${asset.filename}:`, err)
          skipped++
        }
      }

      return { fixed, total: assetsToFix.length, skipped }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
    },
  })
}
