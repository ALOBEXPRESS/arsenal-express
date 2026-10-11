// Overlay + extra-audio lanes. Stored in projects.config (overlays / audio_clips) so no schema
// change is needed. Edits update the React Query cache at once (preview follows live) and are
// persisted with a debounced atomic jsonb merge.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useProject } from './useProjects'
import { patchProjectConfig } from './useScenes'
import type { AudioClip, OverlayClip, Project, ProjectSettings } from '@/types/project'

type TrackPatch = { overlays?: OverlayClip[]; audio_clips?: AudioClip[] }

export const newClipId = () => crypto.randomUUID()

export function useTracks(projectId: string) {
  const { data: project } = useProject(projectId)
  const queryClient = useQueryClient()
  const pending = useRef<TrackPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const overlays = useMemo(() => project?.settings?.overlays || [], [project])
  const audioClips = useMemo(() => project?.settings?.audio_clips || [], [project])

  const flush = useCallback(async () => {
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    try {
      await patchProjectConfig(projectId, patch)
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

  const commit = useCallback(
    (patch: TrackPatch) => {
      queryClient.setQueryData<Project>(['project', projectId], (old) =>
        old ? { ...old, settings: { ...old.settings, ...patch } } : old
      )
      pending.current = { ...pending.current, ...patch }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 450)
    },
    [projectId, queryClient, flush]
  )

  const current = useCallback(
    (): Partial<ProjectSettings> => queryClient.getQueryData<Project>(['project', projectId])?.settings || {},
    [projectId, queryClient]
  )

  const updateOverlay = useCallback(
    (id: string, patch: Partial<OverlayClip>) =>
      commit({ overlays: (current().overlays || []).map((o) => (o.id === id ? { ...o, ...patch } : o)) }),
    [commit, current]
  )
  const addOverlay = useCallback(
    (clip: OverlayClip) => commit({ overlays: [...(current().overlays || []), clip] }),
    [commit, current]
  )
  const removeOverlay = useCallback(
    (id: string) => commit({ overlays: (current().overlays || []).filter((o) => o.id !== id) }),
    [commit, current]
  )
  const updateAudio = useCallback(
    (id: string, patch: Partial<AudioClip>) =>
      commit({ audio_clips: (current().audio_clips || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
    [commit, current]
  )
  const addAudio = useCallback(
    (clip: AudioClip) => commit({ audio_clips: [...(current().audio_clips || []), clip] }),
    [commit, current]
  )
  const removeAudio = useCallback(
    (id: string) => commit({ audio_clips: (current().audio_clips || []).filter((a) => a.id !== id) }),
    [commit, current]
  )

  return { overlays, audioClips, updateOverlay, addOverlay, removeOverlay, updateAudio, addAudio, removeAudio }
}
