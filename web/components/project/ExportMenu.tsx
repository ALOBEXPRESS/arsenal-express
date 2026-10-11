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

interface ExportMenuProps {
  projectTitle: string
  timelines: any[] // TimelineInput with id
  activeSubId: string
  settings: any // SyncSettings
  disabled?: boolean
}

export function ExportMenu({ projectTitle, timelines, activeSubId, settings, disabled }: ExportMenuProps) {
  const [capCutOpen, setCapCutOpen] = useState(false)
  const [renderOpen, setRenderOpen] = useState(false)

  const handleExportAudio = () => {
    // TODO: Export only the audio (narration + clips mixed)
    console.log('Export audio not yet implemented')
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
          <DropdownMenuItem onClick={handleExportAudio}>
            <Music className="mr-2 h-4 w-4" />
            Exportar Áudio
            <span className="ml-auto text-xs text-muted-foreground">.mp3</span>
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
