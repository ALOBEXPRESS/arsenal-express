import { create } from 'zustand'
import type { Asset } from '@/types/project'

/** Media being dragged from the library (dataTransfer can't be read during dragover) */
interface DragState {
  asset: Asset | null
  setAsset: (a: Asset | null) => void
}

export const useDragAsset = create<DragState>((set) => ({
  asset: null,
  setAsset: (asset) => set({ asset }),
}))

export const ASSET_MIME = 'application/x-syncexpress-asset'
