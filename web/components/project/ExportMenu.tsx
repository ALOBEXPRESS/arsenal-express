'use client'

import { useState } from 'react'
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

  const handleExportAudio = async () => {
    // Mix narration + audio clips into a single WAV
    setIsExportingAudio(true)
    try {
      const chosen = timelines.find((t) => t.id === activeSubId) || timelines[0]
      if (!chosen) {
        alert('Nenhuma timeline encontrada')
        return
      }

      if (!chosen.narration || chosen.narration.length === 0) {
        alert('Nenhuma narração encontrada para exportar')
        return
      }

      // Create offline audio context to mix all audio
      const duration = Math.max(...chosen.timeline.map((s: any) => s.start + s.duration), 0)
      const sampleRate = 48000
      const audioCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)

      let audioCount = 0
      // Load and schedule narration segments
      for (const narr of chosen.narration) {
        const audioUrl = (narr as any).audio_url
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
          source.start(narr.start)
          audioCount++
        } catch (err) {
          console.error('Erro ao carregar narração:', err)
        }
      }

      if (audioCount === 0) {
        alert('Nenhum áudio foi carregado. Verifique se os arquivos de narração estão acessíveis.')
        return
      }

      // Render the mixed audio
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

      console.log('Audio exported successfully')
    } catch (err) {
      console.error('Audio export failed:', err)
      alert(`Erro ao exportar áudio: ${err instanceof Error ? err.message : 'Desconhecido'}`)
    } finally {
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
            <FileDown /> Exportar
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
