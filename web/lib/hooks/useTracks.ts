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
