import { mediaUrl, downloadMedia, deleteMedia } from '@/lib/storage/media'
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
        .or(`project_id.eq.${projectId},library_user_id.not.is.null`)
        .order('created_at', { ascending: false })

      if (error) throw error
      const rows = data || []
      
      console.log('[useAssets] Raw rows from DB:', rows.length, 'assets')
      console.log('[useAssets] First 3 rows:', rows.slice(0, 3).map(r => ({
        id: r.id,
        filename: r.filename,
        kind: r.kind,
        is_favorite: r.is_favorite
      })))

      // Bucket 'media' is private: generate signed URLs in one batch call
      const urlByPath = new Map<string, string>()
      if (rows.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from('media')
          .createSignedUrls(rows.filter(a => a.metadata?.storage_provider !== 'r2').map((a) => a.storage_path), SIGNED_URL_TTL)
        if (signError) console.error('[useAssets] Failed to sign URLs:', signError)
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
        })
      }

      await Promise.all(rows.filter(a => a.metadata?.storage_provider === 'r2').map(async a => { urlByPath.set(a.storage_path, await mediaUrl(a)) }))

      // Map DB columns to frontend fields ('kind' -> 'type', 'duration_seconds' -> 'duration')
      // Restore original_type from metadata if it was 'asset'
      const mapped = rows.map((asset) => ({
        ...asset,
        type: (asset.metadata as any)?.original_type || asset.kind,
        duration: asset.duration_seconds,
        is_narration: (asset.metadata?.is_narration ?? asset.is_narration) === true,
        url: urlByPath.get(asset.storage_path) || '',
      })) as Asset[]
      
      // Debug: log favorited assets
      const favorited = mapped.filter(a => a.is_favorite)
      if (favorited.length > 0) {
        console.log('[useAssets] Favorited assets:', favorited.map(a => ({
          id: a.id,
          filename: a.filename,
          type: a.type,
          is_favorite: a.is_favorite
        })))
      }
      
      return mapped
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
    mutationFn: async ({ project_id, type, file, signal }: UploadAssetInput) => {
      // Generate unique filename
      // Storage keys must be ASCII-safe ("…", accents etc. → "Invalid key").
      // The original name is kept in assets.filename.
      const timestamp = Date.now()
      const filePath = `${project_id}/${type}/${timestamp}-${storageSafeName(file.name)}`

      const initResponse = await fetch('/api/media/uploads', { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project_id, size: file.size, contentType: file.type || 'application/octet-stream' }) })
      const upload = await initResponse.json()
      if (!initResponse.ok) throw new Error(upload.error || 'Falha ao preparar upload')
      const put = await fetch(upload.url, { signal, method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      if (!put.ok) throw new Error('Falha ao enviar arquivo ao armazenamento.')

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

      if (signal?.aborted) throw new DOMException('Importação cancelada', 'AbortError')
      const complete = await fetch('/api/media/uploads/complete', { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reservationId: upload.reservationId, asset: {
        kind: dbKind, filename: file.name, duration_seconds,
        metadata: { mime_type: file.type, thumbnail, last_modified: file.lastModified, ...(dims || {}), original_type: type === 'asset' ? 'asset' : undefined }
      } }) })
      const asset = await complete.json()
      if (!complete.ok) throw new Error(asset.error || 'Falha ao registrar mídia')
      return asset as Asset
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

// Delete asset
export function useDeleteAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (asset: Asset) => {
      await deleteMedia(asset.id)
    },
    onSuccess: (_, asset) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
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

    // Timeout: se metadata não carregar em 10s, desiste (arquivo grande ou codec incompat)
    const timeoutId = setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, 10000)

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
    }

    video.onloadedmetadata = () => {
      const v = video as HTMLVideoElement
      if (v.videoWidth && v.videoHeight) lastDims = { width: v.videoWidth, height: v.videoHeight }
      const d = video.duration
      const src = video.src
      cleanup()
      URL.revokeObjectURL(src)
      resolve(Number.isFinite(d) ? Math.round(d * 100) / 100 : undefined)
    }

    video.onerror = () => {
      cleanup()
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

    // Timeout: se thumbnail não gerar em 5s, resolve sem ela
    const timeoutId = setTimeout(() => {
      finish(undefined)
    }, 5000)

    // Detach the element BEFORE revoking the blob URL, otherwise the browser keeps
    // requesting the revoked blob (ERR_FILE_NOT_FOUND noise in the console)
    const finish = (thumb?: string) => {
      clearTimeout(timeoutId)
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
      console.log('[useUpdateAsset] Updating asset:', { id, patch })
      
      const { data, error } = await supabase
        .from('assets')
        .update(patch)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[useUpdateAsset] Error:', error)
        throw error
      }
      
      console.log('[useUpdateAsset] Success, updated data:', data)
      return data
    },
    onSuccess: (data, { id }) => {
      console.log('[useUpdateAsset] Invalidating queries for assets')
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
      const blob = await downloadMedia(asset)

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
      queryClient.invalidateQueries({ queryKey: ['assets'] })
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
          const blob = await downloadMedia(asset)

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
