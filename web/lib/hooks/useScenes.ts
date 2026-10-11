import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { callRpc } from '@/lib/supabase/rpc'
import type { Scene, CreateSceneInput, Asset, NarrationSegment } from '@/types/project'
import { sortByModificationDate, sortAssets, clipRate, DEFAULT_SCENE_DURATION } from '@/lib/timeline'
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

// Reorder scenes (update order field for all scenes) — optimistic
export function useReorderScenes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, scenes }: { projectId: string; scenes: Scene[] }) => {
      await persistOrder(projectId, scenes)
      return scenes
    },
    onMutate: ({ projectId, scenes }) => {
      queryClient.setQueryData<Scene[]>(['scenes', projectId], scenes.map((s, i) => ({ ...s, order_index: i })))
    },
    onSettled: (_, __, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}

/** Inserts a scene at `index` (e.g. media dropped between two clips) */
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
      scenes: Scene[]
      index: number
      input: Omit<CreateSceneInput, 'project_id' | 'order_index'>
    }) => {
      const nextOrder = scenes.reduce((m, s) => Math.max(m, s.order_index), -1) + 1
      const { data, error } = await supabase
        .from('scenes')
        .insert([{ ...input, project_id: projectId, order_index: nextOrder }])
        .select()
        .single()
      if (error) throw error
      const created = data as Scene
      if (index < scenes.length) {
        const ordered = [...scenes]
        ordered.splice(Math.max(0, index), 0, created)
        await persistOrder(projectId, ordered)
      }
      return created
    },
    onSettled: (_, __, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
    },
  })
}

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

export interface AutoAssembleResult {
  scenes: Scene[]
  narrationDuration: number
  durations: number[]
  pausesFound: number
  variableRhythm: boolean
  skippedDuplicateAudios: string[]
  heldFrameScenes: number
}

/**
 * Auto Assemble (same rules as the CLI assembler):
 * - Clips ordered by file modification date (not by name)
 * - 'scenes': each scene lasts as long as its clip
 * - 'scenes_with_audio': narration files joined back-to-back; scene durations are either
 *   an even split or "ritmo variável" (cuts snapped to real speech pauses)
 * - Clip longer than scene -> cut end; slightly shorter -> slowed (>=0.8x); else hold last frame
 * - Animations/transitions assigned per scene from the project's sync settings
 */
export function useAutoAssemble() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
      settings: rawSettings,
      onStatus,
    }: {
      projectId: string
      mode: AutoAssembleMode
      settings?: Partial<SyncSettings>
      onStatus?: (message: string) => void
    }): Promise<AutoAssembleResult> => {
      const settings = withDefaults(rawSettings)
      onStatus?.('Lendo mídias...')

      const { data: rows, error: assetsError } = await supabase
        .from('assets')
        .select('id, kind, filename, duration_seconds, file_size_bytes, metadata, created_at, storage_path, project_id')
        .eq('project_id', projectId)
        .in('kind', ['video', 'audio'])
      if (assetsError) throw assetsError

      const assets = (rows || []).map((a) => ({
        ...a,
        type: a.kind,
        duration: a.duration_seconds,
        url: '',
      })) as Asset[]

      const videos = sortAssets(assets.filter((a) => a.type === 'video'), settings.order.by, settings.order.reverse)
      if (videos.length === 0) throw new Error('Nenhum vídeo encontrado. Faça upload dos clipes primeiro.')

      // Narration: ordered by modification date, identical files (same size + duration) skipped
      const skippedDuplicateAudios: string[] = []
      const narration: Asset[] = []
      if (mode === 'scenes_with_audio') {
        const seen = new Set<string>()
        for (const audio of sortByModificationDate(assets.filter((a) => a.type === 'audio'))) {
          const key = `${audio.file_size_bytes}-${audio.duration}`
          if (seen.has(key)) {
            skippedDuplicateAudios.push(audio.filename)
            continue
          }
          seen.add(key)
          narration.push(audio)
        }
        if (narration.length === 0) throw new Error('Nenhum áudio de narração encontrado.')
        if (narration.some((a) => !a.duration)) {
          throw new Error('Algum áudio está sem duração. Remova e faça upload novamente.')
        }
      }

      // Continuous narration track
      const narrationTrack: NarrationSegment[] = []
      let narrationDuration = 0
      for (const audio of narration) {
        narrationTrack.push({ asset_id: audio.id, start: narrationDuration, duration: audio.duration! })
        narrationDuration += audio.duration!
      }

      // Scene durations
      let durations: number[]
      let pausesFound = 0
      const useVariable = narration.length > 0 && settings.variable_rhythm
      if (narration.length === 0) {
        durations = videos.map((v) => v.duration || DEFAULT_SCENE_DURATION)
      } else if (useVariable) {
        onStatus?.('Analisando pausas da narração...')
        const pauses: Pause[] = []
        for (const seg of narrationTrack) {
          const audio = narration.find((a) => a.id === seg.asset_id)!
          const { data: blob, error } = await supabase.storage.from('media').download(audio.storage_path)
          if (error || !blob) throw error || new Error(`Falha ao baixar ${audio.filename}`)
          const buffer = await decodeAudio(blob)
          for (const p of detectPauses(buffer)) pauses.push({ start: p.start + seg.start, end: p.end + seg.start })
          // file boundary is a natural cut
          if (seg.start > 0) pauses.push({ start: seg.start - 0.01, end: seg.start + 0.01 })
        }
        pausesFound = pauses.length
        onStatus?.('Calculando ritmo...')
        durations = planVariableRhythm(
          videos.map((v) => v.duration || DEFAULT_SCENE_DURATION),
          narrationDuration,
          pauses
        )
      } else {
        durations = videos.map(() => narrationDuration / videos.length)
      }

      onStatus?.('Montando timeline...')
      let cursor = 0
      let heldFrameScenes = 0
      const newScenes = videos.map((video, index) => {
        const duration = durations[index]
        const rate = clipRate(video.duration, duration)
        if (video.duration && video.duration * rate < duration - 0.05) heldFrameScenes++

        const seg = narrationTrack.find((s) => cursor >= s.start && cursor < s.start + s.duration)
        const animation = pickAnimation(settings, index)
        const scene = {
          project_id: projectId,
          order_index: index,
          narration_text: `Cena ${index + 1}`,
          media_type: 'video_clip' as const,
          video_asset_id: video.id,
          audio_asset_id: seg?.asset_id ?? null,
          audio_start: seg ? Math.round((cursor - seg.start) * 1000) / 1000 : null,
          audio_duration: Math.round(duration * 1000) / 1000,
          transition_in: pickTransition(settings, index),
          animation_type: animation,
          generated_in_flow: false,
          metadata: {
            video_filename: video.filename,
            timeline_start: Math.round(cursor * 1000) / 1000,
            playback_rate: rate,
            clip_duration: video.duration,
            ...(animation !== 'none' ? { anim: settings.animation.params } : {}),
          },
        }
        cursor += duration
        return scene
      })

      const configPatch = { narration_track: narrationTrack, sync: settings }

      // Preferred: replace scenes + merge config in ONE transaction (no half-written timeline)
      let inserted: Scene[] | null = null
      const rpc = await callRpc<Scene[]>(supabase, 'replace_scenes', {
        p_project_id: projectId,
        p_scenes: newScenes,
        p_config_patch: configPatch,
      })
      if (!rpc.missing) {
        inserted = rpc.data
      } else {
        // Fallback (migration 002 not applied yet)
        const { error: deleteError } = await supabase.from('scenes').delete().eq('project_id', projectId)
        if (deleteError) throw deleteError
        const { data, error: insertError } = await supabase.from('scenes').insert(newScenes).select()
        if (insertError) throw insertError
        inserted = data as Scene[]
        await patchProjectConfig(projectId, configPatch)
      }

      return {
        scenes: ((inserted || []) as Scene[]).sort((a, b) => a.order_index - b.order_index),
        narrationDuration,
        durations,
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
