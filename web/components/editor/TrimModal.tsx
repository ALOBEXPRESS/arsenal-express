'use client'

import { useState, useRef, useEffect } from 'react'
import { Scissors, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Asset } from '@/types/project'

interface TrimModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset
  currentInPoint?: number // in seconds
  currentOutPoint?: number // in seconds (null = use full duration)
  onSave: (inPoint: number, outPoint: number | null) => void
}

export function TrimModal({ open, onOpenChange, asset, currentInPoint = 0, currentOutPoint, onSave }: TrimModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [inPoint, setInPoint] = useState(currentInPoint)
  const [outPoint, setOutPoint] = useState(currentOutPoint ?? asset.duration ?? 0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(asset.duration ?? 0)

  useEffect(() => {
    if (open) {
      setInPoint(currentInPoint)
      setOutPoint(currentOutPoint ?? asset.duration ?? 0)
      setCurrentTime(currentInPoint)
    }
  }, [open, currentInPoint, currentOutPoint, asset.duration])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoadedMetadata = () => {
      setDuration(video.duration)
      if (!currentOutPoint) setOutPoint(video.duration)
    }

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      // Auto pause at out point
      if (video.currentTime >= outPoint) {
        video.pause()
        setIsPlaying(false)
      }
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [outPoint, currentOutPoint])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      // If at out point, restart from in point
      if (video.currentTime >= outPoint) {
        video.currentTime = inPoint
      }
      video.play()
    } else {
      video.pause()
    }
  }

  const handleSeek = (time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
  }

  const handleSetInPoint = () => {
    const newIn = Math.min(currentTime, outPoint - 0.1)
    setInPoint(newIn)
    handleSeek(newIn)
  }

  const handleSetOutPoint = () => {
    const newOut = Math.max(currentTime, inPoint + 0.1)
    setOutPoint(newOut)
  }

  const handleSave = () => {
    // If out point is at the end, save as null (no trim)
    const finalOut = Math.abs(outPoint - duration) < 0.05 ? null : outPoint
    onSave(inPoint, finalOut)
    onOpenChange(false)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(2)
    return `${mins}:${secs.padStart(5, '0')}`
  }

  const trimmedDuration = outPoint - inPoint

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Cortar Vídeo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Player */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              src={asset.url}
              className="h-full w-full object-contain"
              playsInline
            />
            {/* Playhead overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <div className="text-center font-mono text-sm text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <div className="relative h-12 rounded-md border border-border bg-surface-2">
              {/* Full range */}
              <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-muted" />
              
              {/* Trimmed range */}
              <div
                className="absolute top-1/2 h-2 -translate-y-1/2 bg-primary"
                style={{
                  left: `${(inPoint / duration) * 100}%`,
                  width: `${(trimmedDuration / duration) * 100}%`,
                }}
              />

              {/* In point marker */}
              <div
                className="absolute top-0 h-full w-1 bg-green-500"
                style={{ left: `${(inPoint / duration) * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-green-500 px-1 text-xs font-bold text-white">
                  IN
                </div>
              </div>

              {/* Out point marker */}
              <div
                className="absolute top-0 h-full w-1 bg-red-500"
                style={{ left: `${(outPoint / duration) * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1 text-xs font-bold text-white">
                  OUT
                </div>
              </div>

              {/* Current time marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-white"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />

              {/* Clickable seek area */}
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>0:00.00</span>
              <span className="font-semibold text-foreground">
                Duração cortada: {formatTime(trimmedDuration)}
              </span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handlePlayPause} variant="default">
              {isPlaying ? 'Pausar' : 'Play'}
            </Button>
            
            <div className="h-6 w-px bg-border" />

            <Button onClick={handleSetInPoint} variant="outline" size="sm">
              <span className="text-green-500">▶</span> Definir Início
            </Button>

            <Button onClick={handleSetOutPoint} variant="outline" size="sm">
              <span className="text-red-500">◀</span> Definir Fim
            </Button>

            <Button
              onClick={() => {
                setInPoint(0)
                setOutPoint(duration)
                handleSeek(0)
              }}
              variant="outline"
              size="sm"
            >
              <X className="h-4 w-4" /> Limpar Corte
            </Button>

            <div className="ml-auto flex gap-2">
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancelar
              </Button>
              <Button onClick={handleSave} variant="default">
                <Scissors className="h-4 w-4" /> Aplicar Corte
              </Button>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              <strong>Dica:</strong> Use os botões "Definir Início" e "Definir Fim" para marcar os pontos de corte,
              ou clique na timeline para navegar. O corte será aplicado na exportação.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
