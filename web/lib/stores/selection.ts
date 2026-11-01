import { create } from 'zustand'

/**
 * What the inspector is editing (CapCut-style single selection).
 * narration: id = index of the file in the subproject's narration track (as string)
 * asset: id = asset_id → bulk-edit all scenes using this asset
 */
export type SelectionKind = 'scene' | 'overlay' | 'audio' | 'adjust' | 'narration' | 'asset'
export type Selection = { kind: SelectionKind; id: string } | null

interface SelectionState {
  selection: Selection
  selectedItems: NonNullable<Selection>[]
  append: (items: NonNullable<Selection>[]) => void
  allScenes: boolean
  selectAllScenes: (firstId: string) => void
  select: (s: Selection) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selection: null,
  allScenes: false,
  selectedItems: [],
  append: (items) => set(state => { const selectedItems = [...state.selectedItems]; for (const item of items) if (!selectedItems.some(s => s.kind === item.kind && s.id === item.id)) selectedItems.push(item); return { selectedItems, selection: selectedItems[0] || null, allScenes: false } }),
  selectAllScenes: (id) => set({ selection: { kind: "scene", id }, selectedItems: [{ kind: "scene", id }], allScenes: true }),
  select: (selection) => set({ selection, selectedItems: selection ? [selection] : [], allScenes: false }),
}))
