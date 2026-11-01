'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileDown, Music, Video, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { CapCutExportSheet } from '@/components/sync/CapCutExportSheet'
import { RenderSheet } from './RenderSheet'
import type { Asset } from '@/types/project'

interface ExportMenuProps {
  projectTitle: string
  timelines: any[] // TimelineInput with id
  activeSubId: string
  settings: any // SyncSettings
  extraAssets?: Asset[] // Extra assets (GIF, MOV, Lottie, stickers)
  disabled?: boolean
}

export function ExportMenu({ projectTitle, timelines, activeSubId, settings, extraAssets, disabled }: ExportMenuProps) {
  const [capCutOpen, setCapCutOpen] = useState(false)
  const [renderOpen, setRenderOpen] = useState(false)
  const [isExportingAudio, setIsExportingAudio] = useState(false)
  const exportingAudio = useRef(false)

  const handleExportAudio = async () => {
    // Mix narration + audio clips into a single WAV
    if (exportingAudio.current) return
    exportingAudio.current = true
    setIsExportingAudio(true)
    const toastId = toast.loading("Exportando áudio...", { description: "Preparando as faixas da timeline." })
    try {
      const chosen = timelines.find((t) => t.id === activeSubId) || timelines[0]
      if (!chosen) {
        toast.error('Nenhuma timeline encontrada', { id: toastId })
        return
      }

      // Create offline audio context to mix all audio
      const duration = Math.max(...chosen.timeline.map((s: any) => s.start + s.duration), ...(chosen.narration || []).map((s: any) => s.start + s.duration), ...(chosen.audioClips || []).map((s: any) => s.clip.start + s.clip.duration), 0)
      if (duration <= 0) { toast.error("Nenhum áudio disponível para exportar.", { id: toastId }); return }
      const sampleRate = 48000
      const audioCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)

      let audioCount = 0
      // Load and schedule narration segments
      for (const narr of chosen.narration || []) {
        const audioUrl = narr.asset?.url || narr.audio_url
        if (!audioUrl) {
          console.warn('Narração sem audio_url:', narr)
          continue
        }
        
        try {
          const response = await fetch(audioUrl)
          if (!response.ok) throw new Error(`Falha ao buscar áudio: ${response.status}`)
          
          const arrayBuffer = await response.arrayBuffer()
          const buffer = await audioCtx.decodeAudioData(arrayBuffer)
          const source = audioCtx.createBufferSource()
          source.buffer = buffer
          source.connect(audioCtx.destination)
          source.start(narr.start, 0, Math.min(narr.duration, buffer.duration))
          audioCount++
        } catch (err) {
          console.error('Erro ao carregar narração:', err)
        }
      }

      for (const scene of chosen.timeline || []) {
        const url = scene.videoAsset?.url
        if (!url) continue
        try {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`Falha ao buscar vídeo: ${response.status}`)
          const buffer = await audioCtx.decodeAudioData(await response.arrayBuffer())
          const source = audioCtx.createBufferSource()
          source.buffer = buffer
          source.playbackRate.value = scene.rate || 1
          const gain = audioCtx.createGain()
          const explicitVolume = scene.scene.metadata?.volume
          const voiceIntervals = scene.scene.metadata?.voice_mute_intervals as { start: number; end: number }[] | undefined
          if (voiceIntervals) {
            const base = Math.max(0, Math.min(1, Number(explicitVolume ?? 1)))
            gain.gain.setValueAtTime(base, 0)
            for (const interval of voiceIntervals) { gain.gain.setValueAtTime(0, scene.start + interval.start); gain.gain.setValueAtTime(base, scene.start + interval.end) }
          } else if (explicitVolume != null) gain.gain.value = Math.max(0, Math.min(1, Number(explicitVolume)))
          else {
            const ranges = (chosen.narration || []).map((n: any) => ({ start: Math.max(scene.start, n.start), end: Math.min(scene.start + scene.duration, n.start + n.duration) })).filter((n: any) => n.end > n.start).sort((a: any, b: any) => a.start - b.start)
            const merged: { start: number; end: number }[] = []
            for (const range of ranges) { const last = merged[merged.length - 1]; if (last && range.start <= last.end) last.end = Math.max(last.end, range.end); else merged.push({ ...range }) }
            gain.gain.setValueAtTime(1, 0)
            for (const range of merged) { gain.gain.setValueAtTime(0.125, range.start); gain.gain.setValueAtTime(1, range.end) }
          }
          source.connect(gain).connect(audioCtx.destination)
          const offset = scene.trim || 0
          if (offset < buffer.duration) { source.start(scene.start, offset, Math.min(scene.duration * source.playbackRate.value, buffer.duration - offset)); audioCount++ }
        } catch (err) { console.warn('Não foi possível carregar áudio do clipe:', err) }
      }
      for (const { clip, asset } of chosen.audioClips || []) {
        if (!asset?.url) continue
        try {
          const response = await fetch(asset.url)
          if (!response.ok) throw new Error(`Falha ao buscar áudio: ${response.status}`)
          const buffer = await audioCtx.decodeAudioData(await response.arrayBuffer())
          const source = audioCtx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = clip.speed || 1
          const gain = audioCtx.createGain(); gain.gain.value = clip.volume ?? 1
          source.connect(gain).connect(audioCtx.destination)
          const offset = clip.in_point || 0
          if (offset < buffer.duration) { source.start(clip.start, offset, Math.min(clip.duration * source.playbackRate.value, buffer.duration - offset)); audioCount++ }
        } catch (err) { console.warn('Não foi possível carregar faixa de áudio:', err) }
      }

      if (audioCount === 0) {
        toast.error('Nenhum áudio foi carregado.', { id: toastId, description: 'Verifique se os arquivos de mídia estão acessíveis.' })
        return
      }

      // Render the mixed audio
      toast.loading("Exportando áudio...", { id: toastId, description: "Mixando e preparando o arquivo WAV." })
      const renderedBuffer = await audioCtx.startRendering()

      // Convert AudioBuffer to WAV (PCM)
      const wav = audioBufferToWav(renderedBuffer)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)

      // Download
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_audio.wav`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100)

      toast.success('Áudio exportado', { id: toastId, description: 'O download do arquivo WAV foi iniciado.' })
    } catch (err) {
      console.error('Audio export failed:', err)
      toast.error('Erro ao exportar áudio', { id: toastId, description: err instanceof Error ? err.message : 'Erro desconhecido' })
    } finally {
      exportingAudio.current = false
      setIsExportingAudio(false)
    }
  }

  // Simple WAV encoder (PCM)
  function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numberOfChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16

    const bytesPerSample = bitDepth / 8
    const blockAlign = numberOfChannels * bytesPerSample

    const data = new Float32Array(buffer.length * numberOfChannels)
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const channelData = buffer.getChannelData(i)
      for (let j = 0; j < buffer.length; j++) {
        data[j * numberOfChannels + i] = channelData[j]
      }
    }

    const dataLength = data.length * bytesPerSample
    const bufferLength = 44 + dataLength
    const arrayBuffer = new ArrayBuffer(bufferLength)
    const view = new DataView(arrayBuffer)

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, bufferLength - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, format, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, dataLength, true)

    // Write PCM samples
    let offset = 44
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }

    return arrayBuffer
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={disabled}>
            {isExportingAudio ? <Loader2 className="animate-spin" /> : <FileDown />} {isExportingAudio ? "Exportando áudio..." : "Exportar"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setCapCutOpen(true)}>
            <Video className="mr-2 h-4 w-4" />
            Exportar CapCut
            <span className="ml-auto text-xs text-muted-foreground">Editar</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportAudio} disabled={isExportingAudio}>
            {isExportingAudio ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Music className="mr-2 h-4 w-4" />
            )}
            {isExportingAudio ? 'Exportando...' : 'Exportar Áudio'}
            <span className="ml-auto text-xs text-muted-foreground">.wav</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRenderOpen(true)}>
            <Video className="mr-2 h-4 w-4" />
            Renderizar e Exportar
            <span className="ml-auto text-xs text-muted-foreground">.mp4</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CapCutExportSheet
        open={capCutOpen}
        onOpenChange={setCapCutOpen}
        projectTitle={projectTitle}
        timelines={timelines}
        activeSubId={activeSubId}
        settings={settings}
        extraAssets={extraAssets}
      />

      <RenderSheet
        open={renderOpen}
        onOpenChange={setRenderOpen}
        projectTitle={projectTitle}
        timelines={timelines}
        activeSubId={activeSubId}
      />
    </>
  )
}
