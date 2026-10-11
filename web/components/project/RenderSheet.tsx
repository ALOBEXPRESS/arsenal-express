'use client'

import { useState } from 'react'
import { Video, Download, Loader2, AlertCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { renderMp4, type RenderOptions } from '@/lib/render/mp4'
import type { TimelineInput } from '@/lib/capcut/draft'

interface RenderSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectTitle: string
  timelines: (TimelineInput & { id: string })[]
  activeSubId: string
}

type PresetKey = '720p' | '1080p' | 'shorts'

const PRESETS: Record<PresetKey, { label: string; width: number; height: number; fps: number }> = {
  '720p': { label: '720p (HD)', width: 1280, height: 720, fps: 30 },
  '1080p': { label: '1080p (Full HD)', width: 1920, height: 1080, fps: 30 },
  shorts: { label: 'Shorts/Reels (9:16)', width: 1080, height: 1920, fps: 30 },
}

export function RenderSheet({ open, onOpenChange, projectTitle, timelines, activeSubId }: RenderSheetProps) {
  const chosen = timelines.find((t) => t.id === activeSubId) || timelines[0]
  if (!chosen) return null

  // Auto-detect format from first scene
  const firstScene = chosen.timeline[0]
  const firstAsset = firstScene?.videoAsset || firstScene?.imageAsset
  const srcWidth = Number(firstAsset?.metadata?.width) || 1920
  const srcHeight = Number(firstAsset?.metadata?.height) || 1080
  const isVertical = srcHeight > srcWidth

  const defaultPreset: PresetKey = isVertical ? 'shorts' : '1080p'

  const [preset, setPreset] = useState<PresetKey>(defaultPreset)
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  const handleRender = async () => {
    setRendering(true)
    setProgress(0)
    setError(null)
    setResultUrl(null)

    try {
      const config = PRESETS[preset]
      
      // Detect source aspect ratio and auto-fit
      const srcIsVertical = srcHeight > srcWidth
      const targetIsVertical = config.height > config.width
      
      let renderWidth = config.width
      let renderHeight = config.height
      
      // Match orientation: if source is vertical but target is horizontal (or vice-versa), swap
      if (srcIsVertical !== targetIsVertical) {
        ;[renderWidth, renderHeight] = [renderHeight, renderWidth]
      }

      const options: RenderOptions = {
        width: renderWidth,
        height: renderHeight,
        frameRate: config.fps,
        videoCodec: 'avc',
        videoQuality: 2_000_000, // 2 Mbps
        audioCodec: 'aac',
        audioQuality: 128_000, // 128 kbps
        onProgress: (p) => setProgress(Math.round(p * 100)),
      }

      const totalDuration = Math.max(...chosen.timeline.map((s) => s.start + s.duration), 0)

      const mp4 = await renderMp4(
        {
          timeline: chosen.timeline,
          narration: chosen.narration as any,
          audioClips: chosen.audioClips as any || [],
          overlays: chosen.overlays as any || [],
          duration: totalDuration,
        },
        options
      )

      // Create download (force cast to BlobPart - mp4 is already Uint8Array from mediabunny)
      const blob = new Blob([mp4 as unknown as BlobPart], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      setResultUrl(url)

      // Auto-download
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_${preset}.mp4`
      a.click()
    } catch (err) {
      console.error('Render failed:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setRendering(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Renderizar e Exportar
        </SheetTitle>
        <SheetDescription>Gera um arquivo MP4 pronto pra usar, com áudio e efeitos aplicados.</SheetDescription>

        <div className="mt-6 space-y-4">
          {/* Source format indicator */}
          <div className="rounded-lg border border-border bg-surface-2/50 p-3">
            <p className="text-xs text-muted-foreground">Formato detectado dos clipes</p>
            <p className="font-mono text-sm font-semibold">
              {srcWidth}×{srcHeight} {isVertical ? '(Vertical)' : '(Horizontal)'}
            </p>
          </div>

          <div>
            <Label>Qualidade / Formato de Saída</Label>
            <Select value={preset} onValueChange={(v: string) => setPreset(v as PresetKey)} disabled={rendering}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {val.label} — {val.width}×{val.height} @ {val.fps}fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {isVertical
                ? 'Recomendado: Shorts/Reels para vídeos verticais'
                : 'Recomendado: 1080p ou 720p para vídeos horizontais'}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {rendering && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Renderizando...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {resultUrl && (
            <Alert>
              <Download className="h-4 w-4" />
              <AlertDescription>
                Vídeo pronto! O download começou automaticamente.{' '}
                <a href={resultUrl} download className="underline">
                  Clique aqui se não iniciou
                </a>
                .
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={handleRender} disabled={rendering} className="w-full">
            {rendering ? <Loader2 className="animate-spin" /> : <Video />}
            {rendering ? 'Renderizando...' : 'Renderizar e Baixar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
