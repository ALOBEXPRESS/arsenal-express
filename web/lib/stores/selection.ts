import { create } from 'zustand'

/** What the inspector is editing (CapCut-style single selection) */
export type Selection = { kind: 'scene' | 'overlay' | 'audio'; id: string } | null

interface SelectionState {
  selection: Selection
  select: (s: Selection) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
}))
