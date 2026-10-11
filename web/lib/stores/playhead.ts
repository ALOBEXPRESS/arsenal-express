import { create } from 'zustand'

/** Shared playhead so the timeline can follow the preview without re-rendering the page */
interface PlayheadState {
  time: number
  setTime: (t: number) => void
}

export const usePlayhead = create<PlayheadState>((set) => ({
  time: 0,
  setTime: (time) => set({ time }),
}))
