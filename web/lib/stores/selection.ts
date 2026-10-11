import { create } from 'zustand'

/**
 * What the inspector is editing (CapCut-style single selection).
 * narration: id = index of the file in the subproject's narration track (as string)
 */
export type SelectionKind = 'scene' | 'overlay' | 'audio' | 'adjust' | 'narration'
export type Selection = { kind: SelectionKind; id: string } | null

interface SelectionState {
  selection: Selection
  select: (s: Selection) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
}))
