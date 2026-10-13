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
  select: (s: Selection) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
}))
