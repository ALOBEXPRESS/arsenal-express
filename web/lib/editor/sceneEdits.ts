import type { Scene } from '@/types/project'

export interface ScenePropertyEdit {
  id: string
  before: Partial<Scene>
  after: Partial<Scene>
}

/** Apply only the requested fields, preserving each selected scene's own metadata. */
export function buildScenePropertyEdits(scenes: Scene[], ids: string[], patch: Partial<Scene>): ScenePropertyEdit[] {
  const selected = new Set(ids)
  return scenes.filter(scene => selected.has(scene.id)).flatMap(scene => {
    const after = patch.metadata ? { ...patch, metadata: { ...(scene.metadata || {}), ...patch.metadata } } : patch
    const changed = Object.keys(after).some(key => JSON.stringify(scene[key as keyof Scene]) !== JSON.stringify(after[key as keyof Scene]))
    if (!changed) return []
    const before = Object.fromEntries(Object.keys(after).map(key => [key, scene[key as keyof Scene]])) as Partial<Scene>
    return [{ id: scene.id, before, after }]
  })
}

/** A slider gesture keeps its initial values and the most recent values for every scene. */
export function mergeScenePropertyEdits(previous: ScenePropertyEdit[], next: ScenePropertyEdit[]): ScenePropertyEdit[] {
  const merged = new Map(previous.map(edit => [edit.id, edit]))
  for (const edit of next) {
    const initial = merged.get(edit.id)
    merged.set(edit.id, initial ? { ...edit, before: initial.before } : edit)
  }
  return [...merged.values()]
}
