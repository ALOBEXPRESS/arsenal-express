'use client'

import { useRef, useState } from 'react'
import { AudioLines, Clapperboard, Image as ImageIcon, Trash2, Mic, Package, Heart } from 'lucide-react'
import type { Asset } from '@/types/project'
import { formatTime } from '@/lib/timeline'
import { confirmDialog } from '@/components/ui/confirm'
import { useDragAsset, ASSET_MIME } from '@/lib/stores/drag'
import { useUpdateAsset } from '@/lib/hooks/useAssets'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AssetCardProps {
  asset: Asset
  onDelete?: (asset: Asset) => void
  onSelect?: (asset: Asset) => void
}

const ICONS = { video: Clapperboard, audio: AudioLines, image: ImageIcon, asset: Package }

export function AssetCard({ asset, onDelete, onSelect }: AssetCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const thumb = asset.metadata?.thumbnail as string | undefined
  const Icon = ICONS[asset.type] || Clapperboard
  const setDragAsset = useDragAsset((s) => s.setAsset)
  const updateAsset = useUpdateAsset()

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isUpdating) return
    
    setIsUpdating(true)
    try {
      await updateAsset.mutateAsync(
        { id: asset.id, patch: { is_favorite: !asset.is_favorite } },
        {
          onSuccess: () => {
            toast.success(
              !asset.is_favorite ? '❤️ Adicionado aos favoritos' : 'Removido dos favoritos',
              { duration: 2000 }
            )
          },
          onError: (err) => {
            toast.error('Falha ao atualizar', { 
              description: (err as Error).message,
              duration: 3000 
            })
          },
        }
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const handleNarrationToggle = async (checked: boolean) => {
    setIsUpdating(true)
    try {
      await updateAsset.mutateAsync(
        { id: asset.id, patch: { is_narration: checked } },
        {
          onSuccess: () => {
            toast.success(checked ? '🎤 Marcado como narração' : 'Desmarcado como narração', {
              duration: 2000
            })
          },
          onError: (err) => {
            toast.error('Falha ao atualizar', { 
              description: (err as Error).message,
              duration: 3000  
            })
          },
        }
      )
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={asset.type === 'video' ? `Pré-visualizar ${asset.filename}` : `Selecionar ${asset.filename}`}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect?.(asset)
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_MIME, asset.id)
        e.dataTransfer.setData('text/plain', asset.filename)
        e.dataTransfer.effectAllowed = 'copy'
        const img = e.currentTarget.querySelector('img')
        if (img) e.dataTransfer.setDragImage(img, 40, 24)
        setDragAsset(asset)
      }}
      onDragEnd={() => setDragAsset(null)}
      className="group relative cursor-grab overflow-hidden rounded-lg border border-border bg-surface-2 transition-all duration-200 hover:border-primary/50 hover:shadow-[0_0_20px_-5px_rgba(123,97,255,0.3)] active:cursor-grabbing"
      onClick={() => {
        videoRef.current?.pause()
        onSelect?.(asset)
      }}
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
        {thumb || (asset.type === 'image' && asset.url) || (asset.type === 'asset' && asset.url && (asset.subtype === 'gif' || asset.subtype === 'sticker-png' || asset.subtype === 'sticker-svg')) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb || asset.url} alt={asset.filename} className="absolute inset-0 h-full w-full object-cover" />
        ) : asset.type === 'audio' ? (
          <div className="absolute inset-0 flex items-center justify-center gap-[3px] bg-track-audio/25 px-4" aria-hidden>
            {Array.from({ length: 22 }, (_, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-track-audio"
                style={{ height: `${(20 + Math.abs(Math.sin(i * 0.8 + asset.id.charCodeAt(i % asset.id.length))) * 55).toFixed(2)}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Icon className="h-6 w-6" aria-hidden />
            {asset.type === 'asset' && asset.subtype && (
              <span className="text-[9px] font-mono uppercase text-muted-foreground/70">
                {asset.subtype.replace('sticker-', '')}
              </span>
            )}
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
        
        {/* Type Badge */}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 p-1 text-white/90 backdrop-blur-sm">
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        
        {/* Duration Badge */}
        {asset.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/90 backdrop-blur-sm">
            {formatTime(asset.duration)}
          </span>
        ) : null}

        {/* Favorite Button - Neon Style */}
        {(asset.type === 'video' || asset.type === 'image' || asset.type === 'asset') && (
          <button
            onClick={handleFavoriteToggle}
            disabled={isUpdating}
            className={cn(
              "absolute right-1.5 top-1.5 rounded-full p-1.5 backdrop-blur-sm transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              asset.is_favorite
                ? "bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.6)] hover:shadow-[0_0_20px_rgba(236,72,153,0.8)]"
                : "bg-black/65 text-white/70 opacity-0 hover:text-white hover:opacity-100 group-hover:opacity-100",
              isUpdating && "animate-pulse cursor-wait"
            )}
            aria-label={asset.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            title={asset.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Heart 
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                asset.is_favorite && "fill-current scale-110"
              )} 
            />
          </button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={async (e) => {
              e.stopPropagation()
              const ok = await confirmDialog({
                title: `Excluir "${asset.filename}"?`,
                description: 'O arquivo sai da biblioteca. Cenas que usam essa mídia ficam sem clipe.',
                confirmLabel: 'Excluir',
                tone: 'danger',
              })
              if (ok) onDelete(asset)
            }}
            className="absolute left-1.5 top-1.5 rounded-full bg-black/65 p-1.5 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-destructive hover:shadow-[0_0_15px_rgba(239,68,68,0.6)] focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Excluir ${asset.filename}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filename */}
      <p className="truncate px-2 py-1.5 text-[11px] text-foreground/85">{asset.filename}</p>

      {/* Narration Toggle - Audio Only */}
      {asset.type === 'audio' && (
        <div className="mx-2 mb-2 flex items-center gap-1.5 rounded-md border border-border bg-surface-0 px-2 py-1.5 transition-colors hover:border-primary/30">
          <input
            type="checkbox"
            checked={asset.is_narration || false}
            onChange={(e) => {
              e.stopPropagation()
              handleNarrationToggle(e.target.checked)
            }}
            disabled={isUpdating}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary transition-transform hover:scale-110 disabled:cursor-wait disabled:opacity-50"
            id={`narration-${asset.id}`}
          />
          <label 
            htmlFor={`narration-${asset.id}`} 
            className={cn(
              "flex flex-1 cursor-pointer items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground",
              isUpdating && "cursor-wait opacity-50"
            )}
          >
            <Mic className="h-3 w-3" aria-hidden /> Narração
          </label>
        </div>
      )}
    </div>
  )
}
