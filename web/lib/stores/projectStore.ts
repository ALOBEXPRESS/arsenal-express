import { create } from 'zustand'
import type { Project, Scene, Asset } from '@/types/project'

interface ProjectStore {
  // Current project being edited
  currentProject: Project | null
  scenes: Scene[]
  assets: Asset[]
  
  // UI state
  isLoading: boolean
  error: string | null
  
  // Actions
  setCurrentProject: (project: Project | null) => void
  setScenes: (scenes: Scene[]) => void
  setAssets: (assets: Asset[]) => void
  addScene: (scene: Scene) => void
  updateScene: (sceneId: string, updates: Partial<Scene>) => void
  removeScene: (sceneId: string) => void
  reorderScenes: (scenes: Scene[]) => void
  addAsset: (asset: Asset) => void
  removeAsset: (assetId: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  currentProject: null,
  scenes: [],
  assets: [],
  isLoading: false,
  error: null,

  setCurrentProject: (project) => set({ currentProject: project }),
  
  setScenes: (scenes) => set({ scenes }),
  
  setAssets: (assets) => set({ assets }),
  
  addScene: (scene) => 
    set((state) => ({ 
      scenes: [...state.scenes, scene].sort((a, b) => a.order_index - b.order_index)
    })),
  
  updateScene: (sceneId, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      ),
    })),
  
  removeScene: (sceneId) =>
    set((state) => ({
      scenes: state.scenes.filter((scene) => scene.id !== sceneId),
    })),
  
  reorderScenes: (scenes) => set({ scenes }),
  
  addAsset: (asset) =>
    set((state) => ({
      assets: [...state.assets, asset],
    })),
  
  removeAsset: (assetId) =>
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== assetId),
    })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
  
  reset: () =>
    set({
      currentProject: null,
      scenes: [],
      assets: [],
      isLoading: false,
      error: null,
    }),
}))
