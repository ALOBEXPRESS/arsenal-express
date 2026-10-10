'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useProject } from '@/lib/hooks/useProjects'
import { useScenes } from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import { useProjectStore } from '@/lib/stores/projectStore'
import { Button } from '@/components/ui/button'
import { AssetLibrary } from '@/components/assets/AssetLibrary'
import { Timeline } from '@/components/timeline/Timeline'
import { SceneEditor } from '@/components/timeline/SceneEditor'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { RenderModal } from '@/components/render/RenderModal'
import type { Scene } from '@/types/project'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const { data: project, isLoading, error } = useProject(id)
  const { data: scenes } = useScenes(id)
  const { data: assets } = useAssets(id)
  const { setCurrentProject, setScenes, setAssets } = useProjectStore()
  const [showSceneEditor, setShowSceneEditor] = useState(false)
  const [showRenderModal, setShowRenderModal] = useState(false)
  const [editingScene, setEditingScene] = useState<Scene | null>(null)
  const [previewTime, setPreviewTime] = useState(0)

  useEffect(() => {
    if (project) {
      setCurrentProject(project)
    }
  }, [project, setCurrentProject])

  useEffect(() => {
    if (scenes) {
      setScenes(scenes)
    }
  }, [scenes, setScenes])

  useEffect(() => {
    if (assets) {
      setAssets(assets)
    }
  }, [assets, setAssets])

  const handleAddScene = () => {
    setEditingScene(null)
    setShowSceneEditor(true)
  }

  const handleEditScene = (scene: Scene) => {
    setEditingScene(scene)
    setShowSceneEditor(true)
  }

  const handleRender = () => {
    if (!scenes || scenes.length === 0) {
      alert('Add scenes before rendering')
      return
    }
    setShowRenderModal(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Project not found</h2>
          <Link href="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Top Toolbar */}
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">{project.title}</h1>
              <p className="text-sm text-gray-400">
                {project.mode === 'upload' ? 'Upload Mode' : 'Script-to-Prompt'} ·{' '}
                {scenes?.length || 0} scene{scenes?.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Save
            </Button>
            <Button 
              size="sm" 
              disabled={!scenes || scenes.length === 0}
              onClick={handleRender}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Render
            </Button>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Asset Library */}
        <div className="w-80 border-r border-gray-800 bg-gray-900 overflow-y-auto">
          <AssetLibrary projectId={id} />
        </div>

        {/* Center - Preview & Timeline */}
        <div className="flex-1 flex flex-col">
          {/* Preview Area */}
          <div className="flex-1 flex items-center justify-center bg-black p-8">
            <div className="aspect-video w-full max-w-4xl">
              <VideoPreview
                scenes={scenes || []}
                assets={assets || []}
                currentTime={previewTime}
                onTimeUpdate={setPreviewTime}
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="h-72 border-t border-gray-800 bg-gray-900">
            <Timeline
              projectId={id}
              onAddScene={handleAddScene}
              onEditScene={handleEditScene}
            />
          </div>
        </div>
      </div>

      {/* Scene Editor Modal */}
      <SceneEditor
        open={showSceneEditor}
        onOpenChange={setShowSceneEditor}
        projectId={id}
        scene={editingScene}
        sceneCount={scenes?.length || 0}
      />

      {/* Render Modal */}
      {project && scenes && assets && (
        <RenderModal
          open={showRenderModal}
          onOpenChange={setShowRenderModal}
          project={project}
          scenes={scenes}
          assets={assets}
        />
      )}
    </div>
  )
}
