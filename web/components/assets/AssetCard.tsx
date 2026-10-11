'use client'

import { useRef } from 'react'
import { AudioLines, Clapperboard, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { Asset } from '@/types/project'
import { formatTime } from '@/lib/timeline'

interface AssetCardProps {
  asset: Asset
  onDelete?: (asset: Asset) => void
  onSelect?: (asset: Asset) => void
}

const ICONS = { video: Clapperboard, audio: AudioLines, image: ImageIcon }

export function AssetCard({ asset, onDelete, onSelect }: AssetCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const thumb = asset.metadata?.thumbnail as string | undefined
  const Icon = ICONS[asset.type] || Clapperboard

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors duration-200 hover:border-primary/50"
      onClick={() => onSelect?.(asset)}
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = videoRef.current
        if (v) {
          v.pause()
          v.currentTime = 0
        }
      }}
      title={asset.filename}
    >
      <div className="relative aspect-video overflow-hidden bg-surface-0">
        {thumb || (asset.type === 'image' && asset.url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb || asset.url} alt={asset.filename} className="absolute inset-0 h-full w-full object-cover" />
        ) : asset.type === 'audio' ? (
          <div className="absolute inset-0 flex items-center justify-center gap-[3px] bg-track-audio/25 px-4" aria-hidden>
            {Array.from({ length: 22 }, (_, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-track-audio"
                style={{ height: `${20 + Math.abs(Math.sin(i * 0.8 + asset.id.charCodeAt(i % asset.id.length))) * 55}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Icon className="h-6 w-6" aria-hidden />
          </div>
        )}
        {asset.type === 'video' && asset.url && (
          <video
            ref={videoRef}
            src={asset.url}
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 p-1 text-white/90">
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        {asset.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1 font-mono text-[10px] tabular-nums text-white/90">
            {formatTime(asset.duration)}
          </span>
        ) : null}
      </div>

      <p className="truncate px-2 py-1.5 text-[11px] text-foreground/85">{asset.filename}</p>

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Excluir "${asset.filename}"?`)) onDelete(asset)
          }}
          className="absolute right-1.5 top-1.5 cursor-pointer rounded bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Excluir ${asset.filename}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
