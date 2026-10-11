// Subprojects = independent timelines inside one project (exported as CapCut
// "Linha do tempo 01, 02…" of the same CapCut project).
// - Lanes (narration, overlays, extra audio, adjustments) live in projects.config.subprojects
// - Scenes stay in the scenes table and point to their subproject via metadata.sub
// - Projects saved before subprojects existed read as one subproject with id 'main'
import type { NarrationSegment, ProjectSettings, Scene, Subproject } from '@/types/project'

export const MAIN_SUB = 'main'

export const subName = (index: number) => `Subprojeto ${index + 1}`

export function emptySub(id: string, index: number): Subproject {
  return { id, name: subName(index), narration_track: [], overlays: [], audio_clips: [], adjustments: [] }
}

export function getSubprojects(settings?: Partial<ProjectSettings> | null): Subproject[] {
  const list = settings?.subprojects
  if (list && list.length) {
    return list.map((s, i) => ({
      id: s.id || (i === 0 ? MAIN_SUB : `sub-${i}`),
      name: s.name || subName(i),
      narration_track: s.narration_track || [],
      overlays: s.overlays || [],
      audio_clips: s.audio_clips || [],
      adjustments: s.adjustments || [],
    }))
  }
  return [
    {
      id: MAIN_SUB,
      name: subName(0),
      narration_track: settings?.narration_track || [],
      overlays: settings?.overlays || [],
      audio_clips: settings?.audio_clips || [],
      adjustments: [],
    },
  ]
}

export const sceneSub = (scene: Pick<Scene, 'metadata'>) => (scene.metadata?.sub as string | undefined) || MAIN_SUB

/** Scenes of one subproject, in timeline order */
export function scenesOf(scenes: Scene[], subId: string, knownIds?: Set<string>) {
  return scenes
    .filter((s) => {
      const id = sceneSub(s)
      // scenes pointing to a deleted subproject fall back to the first one
      return id === subId || (!!knownIds && !knownIds.has(id) && subId === [...knownIds][0])
    })
    .sort((a, b) => a.order_index - b.order_index)
}

/**
 * Global order after reordering one subproject: the subproject's scenes take the
 * positions they already occupied in the full list (other subprojects stay put).
 */
export function mergeSubOrder(all: Scene[], reorderedSub: Scene[]) {
  const ids = new Set(reorderedSub.map((s) => s.id))
  const sorted = [...all].sort((a, b) => a.order_index - b.order_index)
  let k = 0
  return sorted.map((s) => (ids.has(s.id) ? reorderedSub[k++] : s))
}

/** Global position to insert a new scene at local index `index` of a subproject */
export function globalInsertIndex(all: Scene[], subScenes: Scene[], index: number) {
  const sorted = [...all].sort((a, b) => a.order_index - b.order_index)
  if (subScenes.length === 0) return sorted.length
  if (index >= subScenes.length) return sorted.findIndex((s) => s.id === subScenes[subScenes.length - 1].id) + 1
  return sorted.findIndex((s) => s.id === subScenes[Math.max(0, index)].id)
}

export const narrationEnd = (track: NarrationSegment[]) => track.reduce((m, s) => Math.max(m, s.start + s.duration), 0)

/** Narration segments laid back-to-back (after removing / appending a file) */
export function relayNarration(track: { asset_id: string; duration: number }[]): NarrationSegment[] {
  let t = 0
  return track.map((s) => {
    const seg = { asset_id: s.asset_id, start: Math.round(t * 1000) / 1000, duration: s.duration }
    t += s.duration
    return seg
  })
}

/** Total narration across all subprojects (project cards) */
export function totalNarration(settings?: Partial<ProjectSettings> | null) {
  const subs = getSubprojects(settings)
  return {
    files: subs.reduce((n, s) => n + s.narration_track.length, 0),
    seconds: subs.reduce((n, s) => n + s.narration_track.reduce((a, x) => a + x.duration, 0), 0),
  }
}
