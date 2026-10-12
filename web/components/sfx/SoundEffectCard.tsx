'use client'

import { useState } from 'react'
import { Volume2, StopCircle, Plus, Heart } from 'lucide-react'
import type { SoundEffect } from '@/types/project'
import { formatTime } from '@/lib/timeline'
import { getSFXPlayer } from '@/lib/audio/sfxPlayer'
import { cn } from '@/lib/utils'

interface SoundEffectCardProps {
  effect: SoundEffect
  onAdd: (effect: SoundEffect) => void
  isFavorite?: boolean
  onToggleFavorite?: (effectId: string) => void
}

export function SoundEffectCard({ effect, onAdd, isFavorite = false, onToggleFavorite }: SoundEffectCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handlePlayPreview = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (isPlaying) {
      // Stop playback
      getSFXPlayer().stop()
      setIsPlaying(false)
      return
    }

    try {
      setIsLoading(true)
      const player = getSFXPlayer()
      
      // Load and play
      await player.load(effect.path)
      player.play(0.8) // 80% volume for preview
      setIsPlaying(true)

      // Auto-stop when finished (duration + small buffer)
      setTimeout(() => {
        setIsPlaying(false)
      }, effect.duration * 1000 + 100)
    } catch (error) {
      console.error('Erro ao reproduzir efeito:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Stop preview if playing
    if (isPlaying) {
      getSFXPlayer().stop()
      setIsPlaying(false)
    }
    
    onAdd(effect)
  }

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors duration-200 hover:border-primary/50"
      title={effect.name}
    >
      <div className="relative aspect-video overflow-hidden bg-surface-0">
        {/* Waveform visualization */}
        <div className="absolute inset-0 flex items-center justify-center gap-[3px] bg-track-audio/25 px-4" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <span
              key={i}
              className={cn(
                'w-[3px] rounded-full transition-all duration-200',
                isPlaying ? 'bg-primary' : 'bg-track-audio'
              )}
              style={{ 
                height: `${(20 + Math.abs(Math.sin(i * 0.8 + effect.id.charCodeAt(i % effect.id.length))) * 55).toFixed(2)}%`,
                animation: isPlaying ? `pulse ${0.5 + (i * 0.05)}s ease-in-out infinite` : 'none'
              }}
            />
          ))}
        </div>

        {/* Category badge */}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] capitalize text-white/90">
          {effect.category}
        </span>

        {/* Favorite button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(effect.id)
            }}
            className={cn(
              'absolute right-1.5 top-1.5 rounded-full p-1 transition-all',
              isFavorite 
                ? 'bg-red-500/90 text-white opacity-100' 
                : 'bg-black/50 text-white/60 opacity-0 hover:bg-black/80 hover:text-white group-hover:opacity-100'
            )}
            aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Heart className={cn('h-3 w-3', isFavorite && 'fill-current')} />
          </button>
        )}

        {/* Duration */}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1 font-mono text-[10px] tabular-nums text-white/90">
          {formatTime(effect.duration)}
        </span>

        {/* Play/Stop button */}
        <button
          onClick={handlePlayPreview}
          disabled={isLoading}
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-2 transition-all',
            isPlaying 
              ? 'bg-destructive/90 text-white opacity-100 hover:bg-destructive' 
              : 'bg-primary/90 text-white opacity-0 hover:bg-primary group-hover:opacity-100',
            isLoading && 'opacity-50 cursor-wait'
          )}
          aria-label={isPlaying ? 'Parar prévia' : 'Reproduzir prévia'}
        >
          {isPlaying ? (
            <StopCircle className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <p className="truncate text-[11px] text-foreground/85" title={effect.name}>
          {effect.name}
        </p>
        
        {/* Add button */}
        <button
          onClick={handleAdd}
          className="shrink-0 cursor-pointer rounded bg-primary/10 p-1 text-primary transition-colors hover:bg-primary hover:text-white"
          aria-label={`Adicionar ${effect.name}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
