import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { callRpc } from '@/lib/supabase/rpc'
import type { Scene, CreateSceneInput, Asset, Subproject, OverlayClip, AudioClip } from '@/types/project'
import { sortByModificationDate, sortAssets, clipRate, DEFAULT_SCENE_DURATION, STILL_DURATION } from '@/lib/timeline'
import { allocateClips, canCover } from '@/lib/sync/assemble'
import { emptySub, getSubprojects, globalInsertIndex, mergeSubOrder, narrationEnd, relayNarration, sceneSub, MAIN_SUB } from '@/lib/subprojects'
import { withDefaults, pickAnimation, pickTransition, type SyncSettings } from '@/lib/sync/presets'
import { decodeAudio, detectPauses, planVariableRhythm, type Pause } from '@/lib/sync/rhythm'

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

async function persistOrder(projectId: string, scenes: Scene[]) {
  // Preferred: one atomic UPDATE in Postgres (deferrable unique)
  const { missing } = await callRpc(supabase, 'reorder_scenes', {
    p_project_id: projectId,
    p_scene_ids: scenes.map((s) => s.id),
  })
  if (!missing) return

  // Fallback (migration 002 not applied): two phases to respect unique(project_id, order_index)
  const OFFSET = 100000
  const phase = async (offset: number) => {
    const results = await Promise.all(
      scenes.map((scene, index) => supabase.from('scenes').update({ order_index: index + offset }).eq('id', scene.id))
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) throw failed.error
  }
  await phase(OFFSET)
  await phase(0)
}

/**
 * Reorders the scenes of ONE subproject (optimistic). Other subprojects keep their
 * positions in the global order_index sequence.
 */
export function useReorderScenes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, scenes }: { projectId: string; scenes: Scene[] }) => {
      const all = mergeSubOrder(queryClient.getQueryData<Scene[]>(['scenes', projectId]) || scenes, scenes)
      await persistOrder(projectId, all)
      return scenes
    },
    onMutate: ({ projectId, scenes }) => {
      const all = mergeSubOrder(queryClient.getQueryData<Scene[]>(['scenes', projectId]) || scenes, scenes)
      queryClient.setQueryData<Scene[]>(['scenes', projectId], all.map((s, i) => ({ ...s, order_index: i })))
    },
    onSettled: (_, __, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}

/** Inserts a scene at local `index` of a subproject (e.g. media dropped between two clips) */
export function useInsertScene() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      scenes,
      index,
      input,
    }: {
      projectId: string
      /** scenes of the target subproject */
      scenes: Scene[]
      index: number
      input: Omit<CreateSceneInput, 'project_id' | 'order_index'>
    }) => {
      const all = [...(queryClient.getQueryData<Scene[]>(['scenes', projectId]) || scenes)].sort((a, b) => a.order_index - b.order_index)
      const nextOrder = all.reduce((m, s) => Math.max(m, s.order_index), -1) + 1
      const { data, error } = await supabase
        .from('scenes')
        .insert([{ ...input, project_id: projectId, order_index: nextOrder }])
        .select()
        .single()
      if (error) throw error
      const created = data as Scene
      const at = globalInsertIndex(all, scenes, index)
      if (at < all.length) {
        const ordered = [...all]
        ordered.splice(at, 0, created)
        await persistOrder(projectId, ordered)
      }
      return created
    },
    onSettled: (_, __, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}

/** Next free order_index across every subproject */
export const nextOrderIndex = (all: Scene[]) => all.reduce((m, s) => Math.max(m, s.order_index), -1) + 1

/**
 * Live scene edits from the inspector: cache updated instantly (preview reacts),
 * DB write debounced so dragging a slider doesn't flood Supabase.
 */
export function usePatchScene(projectId: string) {
  const queryClient = useQueryClient()
  const pending = useRef(new Map<string, Partial<Scene>>())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = useCallback(async () => {
    const batch = [...pending.current.entries()]
    pending.current.clear()
    const results = await Promise.all(batch.map(([id, updates]) => supabase.from('scenes').update(updates).eq('id', id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      toast.error('Não foi possível salvar a alteração da cena', { description: failed.error.message })
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    }
  }, [projectId, queryClient])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pending.current.size) void flush()
    },
    [flush]
  )

  return useCallback(
    (sceneId: string, updates: Partial<Scene>) => {
      queryClient.setQueryData<Scene[]>(['scenes', projectId], (old) =>
        old?.map((s) => (s.id === sceneId ? { ...s, ...updates } : s))
      )
      pending.current.set(sceneId, { ...(pending.current.get(sceneId) || {}), ...updates })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 450)
    },
    [projectId, queryClient, flush]
  )
}


export type AutoAssembleMode = 'scenes' | 'scenes_with_audio'

export interface AssembledSub {
  id: string
  name: string
  scenes: number
  narration: number
  /** narration seconds without scenes (waiting for more clips) */
  uncovered: number
  durations: number[]
}

export interface AutoAssembleResult {
  subs: AssembledSub[]
  totalScenes: number
  pausesFound: number
  variableRhythm: boolean
  skippedDuplicateAudios: string[]
  heldFrameScenes: number
}

const sha256 = async (blob: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Scene row → input accepted by replace_scenes (keeps everything the editor uses) */
const toSceneInput = (s: Scene) => ({
  narration_text: s.narration_text,
  media_type: s.media_type,
  image_asset_id: s.image_asset_id ?? null,
  video_asset_id: s.video_asset_id ?? null,
  audio_asset_id: s.audio_asset_id ?? null,
  audio_start: s.audio_start ?? null,
  audio_duration: s.audio_duration ?? null,
  animation_type: s.animation_type ?? null,
  transition_in: s.transition_in ?? null,
  generated_in_flow: s.generated_in_flow,
  metadata: s.metadata || {},
})

/**
 * Auto Assemble (same rules as the CLI assembler):
 * - Clips ordered by the chosen order (modification date by default)
 * - 'scenes': each scene lasts as long as its clip (active subproject)
 * - 'scenes_with_audio': narration files → one subproject each (default) or one continuous
 *   timeline. Clips are shared out by narration length / scene pace. When a subproject has
 *   clips enough, scene durations follow the narration (even split or "ritmo variável");
 *   otherwise clips keep their own length and the narration continues past them.
 * - Identical narration files (same bytes) are skipped; same size/length alone is NOT a duplicate
 * - Other subprojects are preserved (one atomic replace)
 */
export function useAutoAssemble() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
      settings: rawSettings,
      subId,
      onStatus,
    }: {
      projectId: string
      mode: AutoAssembleMode
      settings?: Partial<SyncSettings>
      /** active subproject (target for 'scenes' and for continuous narration) */
      subId: string
      onStatus?: (message: string) => void
    }): Promise<AutoAssembleResult> => {
      const settings = withDefaults(rawSettings)
      onStatus?.('Lendo mídias...')

      const [{ data: rows, error: assetsError }, { data: projectRow, error: projectError }, { data: sceneRows, error: scenesError }] =
        await Promise.all([
          supabase
            .from('assets')
            .select('id, kind, filename, duration_seconds, file_size_bytes, metadata, created_at, storage_path, project_id')
            .eq('project_id', projectId)
            .in('kind', ['video', 'image', 'audio']),
          supabase.from('projects').select('config').eq('id', projectId).single(),
          supabase.from('scenes').select('*').eq('project_id', projectId).order('order_index', { ascending: true }),
        ])
      if (assetsError) throw assetsError
      if (projectError) throw projectError
      if (scenesError) throw scenesError

      const assets = (rows || []).map((a) => ({ ...a, type: a.kind, duration: a.duration_seconds, url: '' })) as Asset[]
      
      // Filter media by user settings
      const allowedTypes: string[] = []
      if (settings.media.with_videos) allowedTypes.push('video')
      if (settings.media.with_images) allowedTypes.push('image')
      if (allowedTypes.length === 0) throw new Error('Selecione pelo menos um tipo de mídia (imagens ou vídeos) nas configurações de montagem.')
      
      // Separate images and videos for different handling
      const images = sortAssets(
        assets.filter((a) => a.type === 'image'),
        settings.order.by,
        settings.order.reverse
      )
      const videoClips = sortAssets(
        assets.filter((a) => a.type === 'video'),
        settings.order.by,
        settings.order.reverse
      )
      
      // Decide media strategy based on settings
      let videos: Asset[] = []
      let overlayImages: Asset[] = []
      
      if (settings.media.with_videos && settings.media.with_images) {
        // Both enabled: videos go to main track, images become overlays
        videos = videoClips
        overlayImages = images
        if (videos.length === 0) throw new Error('Nenhum vídeo encontrado para a trilha principal. Adicione vídeos ou desative "Juntar cenas com vídeos".')
      } else if (settings.media.with_videos) {
        // Only videos
        videos = videoClips
        if (videos.length === 0) throw new Error('Nenhum vídeo encontrado. Faça upload dos clipes primeiro.')
      } else {
        // Only images
        videos = images
        if (videos.length === 0) throw new Error('Nenhuma imagem encontrada. Faça upload das imagens primeiro.')
      }

      const blobs = new Map<string, Blob>()
      const download = async (a: Asset) => {
        const cached = blobs.get(a.id)
        if (cached) return cached
        const { data: blob, error } = await supabase.storage.from('media').download(a.storage_path)
        if (error || !blob) throw error || new Error(`Falha ao baixar ${a.filename}`)
        blobs.set(a.id, blob)
        return blob
      }

      // Narration: ordered by modification date. Only byte-identical files are duplicates
      // (two parts of the same narration often have the same length and size).
      const skippedDuplicateAudios: string[] = []
      const narration: Asset[] = []
      const musicAudios: Asset[] = [] // Non-narration audio → audio track
      if (mode === 'scenes_with_audio') {
        const allAudios = sortByModificationDate(assets.filter((a) => a.type === 'audio'))
        const narrationAudios = allAudios.filter((a) => a.is_narration)
        musicAudios.push(...allAudios.filter((a) => !a.is_narration))
        if (narrationAudios.length === 0) throw new Error('Nenhum áudio de narração encontrado. Marque áudios como narração na biblioteca.')
        if (narrationAudios.some((a) => !a.duration)) throw new Error('Algum áudio está sem duração. Remova e faça upload novamente.')
        const sameShape = new Map<string, number>()
        narrationAudios.forEach((a) => sameShape.set(`${a.file_size_bytes}-${a.duration}`, (sameShape.get(`${a.file_size_bytes}-${a.duration}`) || 0) + 1))
        const hashes = new Set<string>()
        for (const audio of narrationAudios) {
          if ((sameShape.get(`${audio.file_size_bytes}-${audio.duration}`) || 0) > 1) {
            onStatus?.(`Comparando ${audio.filename}...`)
            const h = await sha256(await download(audio))
            if (hashes.has(h)) {
              skippedDuplicateAudios.push(audio.filename)
              continue
            }
            hashes.add(h)
          }
          narration.push(audio)
        }
      }

      // Targets (subprojects to rebuild)
      const subsNow = getSubprojects(projectRow?.config)
      const active = subsNow.find((s) => s.id === subId) || subsNow[0]
      const perAudio = mode === 'scenes_with_audio' && settings.narration.split === 'per_audio' && narration.length > 1
      const targets: { sub: Subproject; audios: Asset[] }[] = perAudio
        ? narration.map((a, i) => ({ sub: subsNow[i] || emptySub(i === 0 ? MAIN_SUB : crypto.randomUUID(), i), audios: [a] }))
        : [{ sub: active, audios: narration }]

      const counts = allocateClips(
        videos.length,
        targets.map((t) => t.audios.reduce((a, x) => a + (x.duration || 0), 0)),
        settings.narration.pace
      )

      let cursorClip = 0
      let pausesFound = 0
      let heldFrameScenes = 0
      const useVariable = mode === 'scenes_with_audio' && settings.variable_rhythm
      const built: { sub: Subproject; scenes: ReturnType<typeof toSceneInput>[]; info: AssembledSub }[] = []

      for (const [ti, target] of targets.entries()) {
        const clips = videos.slice(cursorClip, cursorClip + counts[ti])
        cursorClip += counts[ti]
        const track = relayNarration(target.audios.map((a) => ({ asset_id: a.id, duration: a.duration! })))
        // Apply speed to narration segments if enabled
        const trackWithSpeed = track.map(seg => ({
          ...seg,
          ...(settings.speed.enabled ? { speed: settings.speed.value } : {}),
        }))
        const narrationDuration = narrationEnd(track)
        // image = no length of its own: unlimited when it must fill a phrase, STILL_DURATION alone
        const clipDurs = clips.map((v) => (v.type === 'image' ? Number.POSITIVE_INFINITY : v.duration || DEFAULT_SCENE_DURATION))
        const ownDurs = clips.map((v) => (v.type === 'image' ? STILL_DURATION : v.duration || DEFAULT_SCENE_DURATION))

        // Scene durations
        let durations: number[] = []
        if (clips.length === 0) durations = []
        else if (mode === 'scenes' || narrationDuration === 0 || !canCover(clipDurs, narrationDuration)) durations = ownDurs
        else if (useVariable) {
          onStatus?.(targets.length > 1 ? `${target.sub.name}: analisando pausas...` : 'Analisando pausas da narração...')
          const pauses: Pause[] = []
          for (const seg of track) {
            const audio = target.audios.find((a) => a.id === seg.asset_id)!
            const buffer = await decodeAudio(await download(audio))
            for (const p of detectPauses(buffer)) pauses.push({ start: p.start + seg.start, end: p.end + seg.start })
            if (seg.start > 0) pauses.push({ start: seg.start - 0.01, end: seg.start + 0.01 }) // file boundary = natural cut
          }
          pausesFound += pauses.length
          onStatus?.('Calculando ritmo...')
          durations = planVariableRhythm(clipDurs, narrationDuration, pauses)
        } else durations = clips.map(() => narrationDuration / clips.length)

        onStatus?.('Montando timeline...')
        let cursor = 0
        const scenes = clips.map((video, index) => {
          const duration = durations[index]
          const isImage = video.type === 'image'
          const rate = isImage ? 1 : clipRate(video.duration, duration)
          if (!isImage && video.duration && video.duration * rate < duration - 0.05) heldFrameScenes++
          const seg = track.find((s) => cursor >= s.start && cursor < s.start + s.duration)
          const animation = pickAnimation(settings, index)
          const scene = {
            narration_text: `Cena ${index + 1}`,
            media_type: (isImage ? 'still_image' : 'video_clip') as Scene['media_type'],
            image_asset_id: isImage ? video.id : null,
            video_asset_id: isImage ? null : video.id,
            audio_asset_id: seg?.asset_id ?? null,
            audio_start: seg ? Math.round((cursor - seg.start) * 1000) / 1000 : null,
            audio_duration: Math.round(duration * 1000) / 1000,
            transition_in: pickTransition(settings, index),
            animation_type: animation,
            generated_in_flow: false,
            metadata: {
              sub: target.sub.id,
              video_filename: video.filename,
              timeline_start: Math.round(cursor * 1000) / 1000,
              playback_rate: rate,
              clip_duration: isImage ? null : video.duration,
              ...(animation !== 'none' ? { anim: settings.animation.params } : {}),
              ...(settings.speed.enabled ? { speed: settings.speed.value } : {}),
            },
          }
          cursor += duration
          return scene
        })
        const covered = durations.reduce((a, b) => a + b, 0)
        
        // Add image overlays if both videos and images are enabled
        const imageOverlays: OverlayClip[] = []
        const textOverlays: OverlayClip[] = []
        const overlays: OverlayClip[] = [] // For video overlays (bars with favorite video)
        const sfxClips: AudioClip[] = []
        
        // Add music/audio clips for non-narration audio (goes to Audio track)
        const musicClips: AudioClip[] = musicAudios.map((audio, idx) => ({
          id: crypto.randomUUID(),
          asset_id: audio.id,
          start: 0, // User can reposition in timeline
          duration: audio.duration || 0,
          volume: 0.3, // Lower volume for background music
          speed: settings.speed.enabled ? settings.speed.value : 1,
        }))
        
        if (settings.media.with_videos && settings.media.with_images && overlayImages.length > 0) {
          const everyN = settings.media.images_as_overlay_every
          let imageIndex = 0
          let sceneStart = 0
          
          // Use favorite image if selected, otherwise cycle through all images
          const imagesToUse = settings.media.favorite_image_id 
            ? overlayImages.filter(img => img.id === settings.media.favorite_image_id)
            : overlayImages
          
          if (imagesToUse.length === 0 && settings.media.favorite_image_id) {
            // Favorite not found, fallback to all images
            imagesToUse.push(...overlayImages)
          }
          
          for (let i = 0; i < scenes.length; i++) {
            const sceneDur = durations[i]
            
            // Add image overlay every N scenes
            if ((i + 1) % everyN === 0 && imagesToUse.length > 0) {
              const image = imagesToUse[imageIndex % imagesToUse.length]
              const overlayDur = Math.min(sceneDur, 5) // Max 5s overlay
              const overlayStart = sceneStart + (sceneDur - overlayDur) / 2 // Center in scene
              
              imageOverlays.push({
                id: crypto.randomUUID(),
                asset_id: image.id,
                kind: 'image',
                start: overlayStart,
                duration: overlayDur,
                scale: 0.3, // 30% of canvas
                x: 0,
                y: 0,
                opacity: 1,
                speed: settings.speed.enabled ? settings.speed.value : 1,
                volume: 1,
                animation_in: 'fade',
                animation_out: 'fade',
                animation_duration: 0.3,
              })
              
              // Add SFX clip if enabled and effect selected
              if (settings.sfx.enabled && settings.sfx.selected_effect_id) {
                sfxClips.push({
                  id: crypto.randomUUID(),
                  asset_id: `sfx:${settings.sfx.selected_effect_id}`, // Use sfx: prefix for SFX pseudo-assets
                  start: overlayStart,
                  duration: overlayDur,
                  volume: 1,
                  speed: settings.speed.enabled ? settings.speed.value : 1,
                })
              }
              
              imageIndex++
            }
            
            sceneStart += sceneDur
          }
        }
        
        // Add overlay from favorite assets if enabled
        if (settings.overlay_bars.enabled) {
          // Check for favorite assets in priority order: asset > image > video
          const favoriteAsset = settings.overlay_bars.favorite_asset_id 
            ? assets.find(a => a.id === settings.overlay_bars.favorite_asset_id)
            : null
            
          const favoriteImage = settings.overlay_bars.favorite_image_id 
            ? assets.find(a => a.id === settings.overlay_bars.favorite_image_id)
            : null
          
          // Use only asset or image (NOT video)
          const overlayAsset = favoriteAsset || favoriteImage
          
          console.log('[Overlay Bars]', {
            enabled: settings.overlay_bars.enabled,
            favorite_asset_id: settings.overlay_bars.favorite_asset_id,
            favorite_image_id: settings.overlay_bars.favorite_image_id,
            overlayAsset: overlayAsset?.filename,
            position: settings.overlay_bars.position
          })
          
          if (overlayAsset) {
            // Calculate total duration across all scenes
            const totalDuration = durations.reduce((sum, dur) => sum + dur, 0)
            
            // Determine positions based on setting
            const positions: number[] = []
            
            if (settings.overlay_bars.position === 'top') {
              positions.push(0.60) // Topo: 60%
            } else if (settings.overlay_bars.position === 'bottom') {
              positions.push(-0.60) // Rodapé: -60%
            } else {
              // Ambos: duplicar - uma no topo e outra no rodapé
              positions.push(0.60)  // Topo
              positions.push(-0.60) // Rodapé
            }
            
            // Create ONE overlay per position that spans all scenes
            for (const yPos of positions) {
              overlays.push({
                id: crypto.randomUUID(),
                asset_id: overlayAsset.id,
                kind: overlayAsset.type === 'video' || (overlayAsset.type === 'asset' && overlayAsset.kind === 'video') ? 'video' : 'image',
                start: 0,
                duration: totalDuration,
                scale: 0.25, // 25% - barra horizontal
                x: 0, // Centralizado horizontalmente
                y: yPos,
                opacity: 1,
                speed: 1,
                volume: 0, // Muted
                animation_in: 'none',
                animation_out: 'none',
                animation_duration: 0,
              })
            }
          }
        }
        
        const sub: Subproject = mode === 'scenes' 
          ? { ...target.sub, overlays: [...textOverlays, ...overlays], image_overlays: imageOverlays, audio_clips: [...sfxClips, ...musicClips] } 
          : { ...target.sub, narration_track: trackWithSpeed, overlays: [...textOverlays, ...overlays], image_overlays: imageOverlays, audio_clips: [...sfxClips, ...musicClips] }
        built.push({
          sub,
          scenes,
          info: {
            id: sub.id,
            name: sub.name,
            scenes: scenes.length,
            narration: narrationDuration,
            uncovered: Math.max(0, narrationDuration - covered),
            durations,
          },
        })
      }

      // Subproject list: rebuilt targets replace theirs, the rest stay untouched
      const targetIds = new Set(built.map((b) => b.sub.id))
      let nextSubs: Subproject[]
      if (perAudio) {
        nextSubs = [...built.map((b) => b.sub), ...subsNow.slice(built.length).filter((s) => !targetIds.has(s.id))]
      } else {
        nextSubs = subsNow.map((s) => built.find((b) => b.sub.id === s.id)?.sub || s)
      }
      const keptIds = new Set(nextSubs.map((s) => s.id))

      // Scenes: other subprojects preserved (re-sent so the replace stays atomic)
      const preserved = ((sceneRows || []) as Scene[]).filter((s) => !targetIds.has(sceneSub(s)) && keptIds.has(sceneSub(s)))
      const newScenes = [...preserved.map(toSceneInput), ...built.flatMap((b) => b.scenes)].map((s, i) => ({
        ...s,
        project_id: projectId,
        order_index: i,
      }))

      const configPatch = { subprojects: nextSubs, narration_track: nextSubs[0].narration_track, sync: settings }

      // Preferred: replace scenes + merge config in ONE transaction (no half-written timeline)
      const rpc = await callRpc<Scene[]>(supabase, 'replace_scenes', {
        p_project_id: projectId,
        p_scenes: newScenes,
        p_config_patch: configPatch,
      })
      if (rpc.missing) {
        // Fallback (migration 002 not applied yet)
        const { error: deleteError } = await supabase.from('scenes').delete().eq('project_id', projectId)
        if (deleteError) throw deleteError
        if (newScenes.length) {
          const { error: insertError } = await supabase.from('scenes').insert(newScenes)
          if (insertError) throw insertError
        }
        await patchProjectConfig(projectId, configPatch)
      }

      return {
        subs: built.map((b) => b.info),
        totalScenes: built.reduce((a, b) => a + b.scenes.length, 0),
        pausesFound,
        variableRhythm: useVariable,
        skippedDuplicateAudios,
        heldFrameScenes,
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

/** Atomic jsonb merge on projects.config (RPC); falls back to read-modify-write */
export async function patchProjectConfig(projectId: string, patch: Record<string, unknown>) {
  const { missing } = await callRpc(supabase, 'patch_project_config', { p_project_id: projectId, p_patch: patch })
  if (!missing) return
  const { data: project, error } = await supabase.from('projects').select('config').eq('id', projectId).single()
  if (error) throw error
  const { error: updateError } = await supabase
    .from('projects')
    .update({ config: { ...(project?.config || {}), ...patch } })
    .eq('id', projectId)
  if (updateError) throw updateError
}

/** Saves sync settings into projects.config.sync (merge, keeps narration_track etc.) */
export function useSaveSyncSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, settings }: { projectId: string; settings: SyncSettings }) => {
      await patchProjectConfig(projectId, { sync: settings })
      return settings
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

/** Applies current animation/transition settings to existing scenes without re-timing them */
export function useApplyEffects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, scenes, settings }: { projectId: string; scenes: Scene[]; settings: SyncSettings }) => {
      const results = await Promise.all(
        scenes.map((scene, index) =>
          supabase
            .from('scenes')
            .update({
              animation_type: pickAnimation(settings, index),
              transition_in: pickTransition(settings, index),
              metadata: { ...(scene.metadata || {}), anim: settings.animation.params },
            })
            .eq('id', scene.id)
        )
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}
