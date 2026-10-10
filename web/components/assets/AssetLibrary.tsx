'use client'

import { useState } from 'react'
import { useAssets, useUploadAsset, useDeleteAsset } from '@/lib/hooks/useAssets'
import { AssetCard } from './AssetCard'
import { AssetUpload } from './AssetUpload'
import type { Asset, AssetType } from '@/types/project'
import { Button } from '@/components/ui/button'

interface AssetLibraryProps {
  projectId: string
  onSelectAsset?: (asset: Asset) => void
}

export function AssetLibrary({ projectId, onSelectAsset }: AssetLibraryProps) {
  const { data: assets, isLoading } = useAssets(projectId)
  const uploadAsset = useUploadAsset()
  const deleteAsset = useDeleteAsset()
  const [activeTab, setActiveTab] = useState<AssetType | 'all'>('all')
  const [showUpload, setShowUpload] = useState<AssetType | null>(null)

  const handleUpload = async (type: AssetType, file: File) => {
    await uploadAsset.mutateAsync({ project_id: projectId, type, file })
    setShowUpload(null)
  }

  const handleDelete = async (asset: Asset) => {
    await deleteAsset.mutateAsync(asset)
  }

  const filteredAssets =
    activeTab === 'all'
      ? assets
      : assets?.filter((a) => a.type === activeTab)

  const videoAssets = assets?.filter((a) => a.type === 'video') || []
  const audioAssets = assets?.filter((a) => a.type === 'audio') || []
  const imageAssets = assets?.filter((a) => a.type === 'image') || []

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h2 className="font-semibold mb-4">Asset Library</h2>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-4 text-sm">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded ${
              activeTab === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            All ({assets?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`px-3 py-1 rounded ${
              activeTab === 'video'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Videos ({videoAssets.length})
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-3 py-1 rounded ${
              activeTab === 'audio'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Audio ({audioAssets.length})
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`px-3 py-1 rounded ${
              activeTab === 'image'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Images ({imageAssets.length})
          </button>
        </div>

        {/* Upload buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowUpload('video')}
            className="flex-1"
          >
            + Video
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowUpload('audio')}
            className="flex-1"
          >
            + Audio
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowUpload('image')}
            className="flex-1"
          >
            + Image
          </Button>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Upload {showUpload}</h3>
              <button
                onClick={() => setShowUpload(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AssetUpload
              projectId={projectId}
              type={showUpload}
              onUpload={(file) => handleUpload(showUpload, file)}
            />
          </div>
        </div>
      )}

      {/* Asset Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {!filteredAssets || filteredAssets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">No {activeTab === 'all' ? 'assets' : activeTab} yet</p>
            <p className="text-xs">Upload files to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDelete={handleDelete}
                onSelect={onSelectAsset}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
