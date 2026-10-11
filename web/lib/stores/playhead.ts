import { create } from 'zustand'

/**
 * Shared playhead so the timeline can follow the preview (and scrub it) without
 * re-rendering the whole editor page on every pointer move.
 */
interface PlayheadState {
  time: number
  setTime: (t: number) => void
  /** last seek requested by the timeline / scrubbers; the preview applies it */
  seekReq: { t: number; n: number } | null
  requestSeek: (t: number) => void
}

let n = 0
export const usePlayhead = create<PlayheadState>((set) => ({
  time: 0,
  setTime: (time) => set({ time }),
  seekReq: null,
  requestSeek: (t) => set({ seekReq: { t, n: ++n }, time: Math.max(0, t) }),
}))
