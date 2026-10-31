// Lanes of the active subproject (narration, overlays, extra audio, adjustment layers) +
// subproject management. Stored in projects.config.subprojects (no schema change).
// Edits update the React Query cache at once (preview follows live) and are persisted
// with a debounced atomic jsonb merge.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useProject } from './useProjects'
import { patchProjectConfig } from './useScenes'
import { emptySub, getSubprojects, relayNarration, MAIN_SUB, sceneSub } from '@/lib/subprojects'
import type { AdjustClip, AudioClip, Asset, OverlayClip, Project, Scene, Subproject } from '@/types/project'
import type { SyncSettings } from '@/lib/sync/presets'

const supabase = createClient()

export const newClipId = () => crypto.randomUUID()

export function useTracks(projectId: string, subId: string) {
  const { data: project } = useProject(projectId)
  const queryClient = useQueryClient()
  const pending = useRef<Subproject[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const subprojects = useMemo(() => getSubprojects(project?.settings), [project])
  const sub = subprojects.find((s) => s.id === subId) || subprojects[0]

  const flush = useCallback(async () => {
    const list = pending.current
    pending.current = null
    if (!list) return
    try {
      await patchProjectConfig(projectId, { subprojects: list })
    } catch (e) {
      toast.error('Não foi possível salvar a timeline', { description: e instanceof Error ? e.message : undefined })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    }
  }, [projectId, queryClient])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void flush()
    },
    [flush]
  )

  const read = useCallback(
    () => getSubprojects(queryClient.getQueryData<Project>(['project', projectId])?.settings),
    [projectId, queryClient]
  )

  /** Writes the whole subproject list (cache now, DB debounced) */
  const commitList = useCallback(
    (list: Subproject[], immediate = false) => {
      queryClient.setQueryData<Project>(['project', projectId], (old) =>
        old ? { ...old, settings: { ...old.settings, subprojects: list } } : old
      )
      pending.current = list
      clearTimeout(timer.current)
      if (immediate) void flush()
      else timer.current = setTimeout(() => void flush(), 450)
    },
    [projectId, queryClient, flush]
  )

  /** Patch of the active subproject */
  const commit = useCallback(
    (fn: (s: Subproject) => Partial<Subproject>) => {
      const list = read()
      const id = list.some((s) => s.id === subId) ? subId : list[0].id
      commitList(list.map((s) => (s.id === id ? { ...s, ...fn(s) } : s)))
    },
    [read, commitList, subId]
  )

  /** Add requested bars without replacing scenes or existing timeline layers. */
  const applyAssemblyBars = useCallback(async (settings: SyncSettings, assets: Asset[], duration: number) => {
    await flush()
    if (!settings.overlay_bars.enabled) return
    const favoriteId = settings.overlay_bars.favorite_asset_id
    const favorite = favoriteId ? assets.find(a => a.id === favoriteId) : undefined
    if (favoriteId && !favorite) throw new Error('O asset selecionado não foi encontrado na biblioteca.')
    if (!favorite) throw new Error('Selecione um asset favorito para adicionar as barras sem remontar.')
    const list = read()
    const id = list.some(s => s.id === subId) ? subId : list[0].id
    const target = list.find(s => s.id === id)!
    const positions: ('top' | 'bottom')[] = settings.overlay_bars.position === 'both' ? ['top', 'bottom'] : [settings.overlay_bars.position]
    const config = queryClient.getQueryData<Project>(['project', projectId])?.settings
    const oldFavorite = config?.sync?.overlay_bars?.favorite_asset_id
    const isAssemblyBar = (o: OverlayClip) => !!o.assembly_bar || (!!oldFavorite && o.asset_id === oldFavorite && o.start === 0 && o.x === 0 && Math.abs(o.y) === 1.2 && o.volume === 0)
    const canvasHeight = config?.output_format === '16:9' || config?.output_format === '1:1' ? 1080 : 1920
    const barHeight = settings.overlay_bars.height_override ? settings.overlay_bars.height_override / canvasHeight : 0.08
    const added: OverlayClip[] = positions.map(position => ({
      id: crypto.randomUUID(), assembly_bar: position,
      assembly_bar_height: barHeight,
      asset_id: favorite.id,
      kind: /\.(mp4|mov|webm|gif)$/i.test(favorite.filename) ? 'video' : 'image',
      start: 0, duration, scale: 1, x: 0,
      y: position === 'top' ? 1 - barHeight : -1 + barHeight,
      opacity: 1, speed: 1, volume: 0,
    }))
    const next = list.map(s => s.id === id ? { ...s, overlays: [...s.overlays.filter(o => !isAssemblyBar(o)), ...added] } : s)
    await patchProjectConfig(projectId, { subprojects: next })
    queryClient.setQueryData<Project>(['project', projectId], old => old ? { ...old, settings: { ...old.settings, subprojects: next } } : old)
  }, [flush, read, subId, projectId, queryClient])

  const api = useMemo(
    () => ({
      updateOverlay: (id: string, patch: Partial<OverlayClip>) =>
        commit((s) => ({ overlays: s.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      addOverlay: (clip: OverlayClip) => commit((s) => ({ overlays: [...s.overlays, clip] })),
      removeOverlay: (id: string) => commit((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) })),
      updateImageOverlay: (id: string, patch: Partial<OverlayClip>) =>
        commit((s) => ({ image_overlays: s.image_overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      addImageOverlay: (clip: OverlayClip) => commit((s) => ({ image_overlays: [...s.image_overlays, clip] })),
      removeImageOverlay: (id: string) => commit((s) => ({ image_overlays: s.image_overlays.filter((o) => o.id !== id) })),
      updateAudio: (id: string, patch: Partial<AudioClip>) =>
        commit((s) => ({ audio_clips: s.audio_clips.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      addAudio: (clip: AudioClip) => commit((s) => ({ audio_clips: [...s.audio_clips, clip] })),
      removeAudio: (id: string) => commit((s) => ({ audio_clips: s.audio_clips.filter((a) => a.id !== id) })),
      updateAdjust: (id: string, patch: Partial<AdjustClip>) =>
        commit((s) => ({ adjustments: s.adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      addAdjust: (clip: AdjustClip) => commit((s) => ({ adjustments: [...s.adjustments, clip] })),
      removeAdjust: (id: string) => commit((s) => ({ adjustments: s.adjustments.filter((a) => a.id !== id) })),
      /** Appends a narration file at the end of the subproject's narration */
      appendNarration: (asset: Asset) =>
        commit((s) => ({
          narration_track: relayNarration([...s.narration_track, { asset_id: asset.id, duration: asset.duration || 0 }]),
        })),
      /** Removes narration file #index (the next ones move back to close the gap) */
      removeNarration: (index: number) =>
        commit((s) => ({ narration_track: relayNarration(s.narration_track.filter((_, i) => i !== index)) })),
    }),
    [commit]
  )

  // ---- Subproject management ------------------------------------------------------
  const addSubproject = useCallback(() => {
    const list = read()
    const sub = emptySub(newClipId(), list.length)
    commitList([...list, sub], true)
    return sub
  }, [read, commitList])

  const renameSubproject = useCallback(
    (id: string, name: string) => commitList(read().map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)), true),
    [read, commitList]
  )

  /** Deletes the subproject and its scenes */
  const removeSubproject = useCallback(
    async (id: string) => {
      const list = read()
      if (list.length <= 1) return
      const scenes = queryClient.getQueryData<Scene[]>(['scenes', projectId]) || []
      const ids = scenes.filter((s) => sceneSub(s) === id).map((s) => s.id)
      if (ids.length) {
        const { error } = await supabase.from('scenes').delete().in('id', ids)
        if (error) throw error
      }
      let next = list.filter((s) => s.id !== id)
      // the first subproject keeps id 'main' so old scenes without metadata.sub stay attached
      if (id === MAIN_SUB && next.length) {
        const promoted = next[0].id
        const moved = scenes.filter((s) => sceneSub(s) === promoted)
        await Promise.all(
          moved.map((s) => supabase.from('scenes').update({ metadata: { ...(s.metadata || {}), sub: MAIN_SUB } }).eq('id', s.id))
        )
        next = [{ ...next[0], id: MAIN_SUB }, ...next.slice(1)]
      }
      commitList(next, true)
      queryClient.invalidateQueries({ queryKey: ['scenes', projectId] })
      return next
    },
    [read, commitList, queryClient, projectId]
  )

  return {
    flush,
    applyAssemblyBars,
    subprojects,
    sub,
    overlays: sub.overlays,
    imageOverlays: sub.image_overlays,
    audioClips: sub.audio_clips,
    adjustments: sub.adjustments,
    narrationTrack: sub.narration_track,
    ...api,
    addSubproject,
    renameSubproject,
    removeSubproject,
  }
}

export type Tracks = ReturnType<typeof useTracks>
