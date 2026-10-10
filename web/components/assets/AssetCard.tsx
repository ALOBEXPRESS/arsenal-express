'use client'

import type { Asset } from '@/types/project'
import { Button } from '@/components/ui/button'

interface AssetCardProps {
  asset: Asset
  onDelete?: (asset: Asset) => void
  onSelect?: (asset: Asset) => void
}

export function AssetCard({ asset, onDelete, onSelect }: AssetCardProps) {
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const getIcon = () => {
    switch (asset.type) {
      case 'video':
        return '🎬'
      case 'audio':
        return '🎵'
      case 'image':
        return '🖼️'
      default:
        return '📄'
    }
  }

  return (
    <div
      className="group relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-600 transition-all cursor-pointer"
      onClick={() => onSelect?.(asset)}
    >
      {/* Thumbnail/Preview */}
      <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
        {asset.type === 'image' ? (
          <img
            src={asset.url}
            alt={asset.filename}
            className="w-full h-full object-cover"
          />
        ) : asset.type === 'video' ? (
          <video
            src={asset.url}
            className="w-full h-full object-cover"
            muted
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
          />
        ) : (
          <div className="text-4xl">{getIcon()}</div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-sm font-medium truncate" title={asset.filename}>
          {asset.filename}
        </p>
        <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
          {asset.duration && <span>{formatDuration(asset.duration)}</span>}
          {asset.metadata?.size && (
            <span>{formatSize(asset.metadata.size as number)}</span>
          )}
        </div>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this asset?')) {
              onDelete(asset)
            }
          }}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1 rounded"
          title="Delete asset"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
