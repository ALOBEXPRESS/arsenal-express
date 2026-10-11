'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal, FolderDown } from 'lucide-react'
import { toast } from 'sonner'
import { useProject } from '@/lib/hooks/useProjects'
import {
  useScenes,
  useAutoAssemble,
  useSaveSyncSettings,
  useApplyEffects,
  type AutoAssembleMode,
} from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import { useTracks } from '@/lib/hooks/useTracks'
import { useProjectStore } from '@/lib/stores/projectStore'
import { useSelection } from '@/lib/stores/selection'
import { usePlayhead } from '@/lib/stores/playhead'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/components/ui/confirm'
import { AssetLibrary } from '@/components/assets/AssetLibrary'
import { Timeline } from '@/components/timeline/Timeline'
import { SceneEditor } from '@/components/timeline/SceneEditor'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { Inspector } from '@/components/editor/Inspector'
import { AssemblySheet } from '@/components/sync/AssemblySheet'
import { CapCutExportSheet } from '@/components/sync/CapCutExportSheet'
import { LogoMark } from '@/components/brand/Logo'
import { buildTimeline, formatTime } from '@/lib/timeline'
import { withDefaults, type SyncSettings } from '@/lib/sync/presets'
import type { Scene } from '@/types/project'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

const ORDER_LABEL: Record<SyncSettings['order']['by'], string> = {
  modified: 'pela data de modificação',
  upload: 'pela ordem de envio',
  name: 'pelo nome do arquivo',
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const { data: project, isLoading, error } = useProject(id)
  const { data: scenes, isLoading: scenesLoading } = useScenes(id)
  const { data: assets } = useAssets(id)
  const tracks = useTracks(id)
  const { setCurrentProject, setScenes, setAssets } = useProjectStore()
  const { selection, select } = useSelection()
  const autoAssemble = useAutoAssemble()
  const saveSettings = useSaveSyncSettings()
  const applyEffects = useApplyEffects()

  const [showSceneEditor, setShowSceneEditor] = useState(false)
  const [showAssembly, setShowAssembly] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editingScene, setEditingScene] = useState<Scene | null>(null)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)
  const [status, setStatus] = useState<string>()

  const timeline = useMemo(() => buildTimeline(scenes || [], assets || []), [scenes, assets])
  const narrationTrack = useMemo(() => project?.settings?.narration_track || [], [project])
  const syncSettings = useMemo(() => withDefaults(project?.settings?.sync), [project])
  const assetById = useMemo(() => new Map((assets || []).map((a) => [a.id, a])), [assets])
  const narration = useMemo(
    () =>
      narrationTrack
        .map((seg) => ({ asset: assetById.get(seg.asset_id)!, start: seg.start, duration: seg.duration }))
        .filter((n) => n.asset),
    [narrationTrack, assetById]
  )
  const thumbs = useMemo<[string | undefined, string | undefined]>(() => {
    const t = timeline.map((i) => i.videoAsset?.metadata?.thumbnail as string | undefined).filter(Boolean)
    const v = (assets || []).filter((a) => a.type === 'video').map((a) => a.metadata?.thumbnail as string | undefined)
    return [t[0] || v[0], t[1] || v[1]]
  }, [timeline, assets])

  useEffect(() => {
    if (project) setCurrentProject(project)
  }, [project, setCurrentProject])
  useEffect(() => {
    if (scenes) setScenes(scenes)
  }, [scenes, setScenes])
  useEffect(() => {
    if (assets) setAssets(assets)
  }, [assets, setAssets])
  // a new project starts with nothing selected
  useEffect(() => () => select(null), [id, select])

  const seek = usePlayhead((s) => s.requestSeek)

  const runAssemble = async (mode: AutoAssembleMode, settings: SyncSettings = syncSettings) => {
    if (scenes && scenes.length > 0) {
      const ok = await confirmDialog({
        title: 'Substituir as cenas da timeline?',
        description: `As ${scenes.length} cenas atuais serão remontadas do zero com os clipes da biblioteca. Sobreposições e áudios extras continuam onde estão.`,
        confirmLabel: 'Remontar timeline',
      })
      if (!ok) return
    }
    const loading = toast.loading('Montando a timeline…')
    try {
      const r = await autoAssemble.mutateAsync({ projectId: id, mode, settings, onStatus: setStatus })
      const s = withDefaults(settings)
      const durs = r.durations
      const lines: string[] = []
      if (mode === 'scenes_with_audio') {
        lines.push(
          r.variableRhythm
            ? `Ritmo variável: ${r.pausesFound} pausas detectadas · cenas de ${Math.min(...durs).toFixed(1)}s a ${Math.max(...durs).toFixed(1)}s.`
            : `Narração ${formatTime(r.narrationDuration)} dividida em ${(r.narrationDuration / durs.length).toFixed(1)}s por cena.`
        )
      }
      if (s.animation.enabled) lines.push(`Animações: ${s.animation.mode === 'fixo' ? '1 fixa' : `${s.animation.selected.length} em rodízio`}.`)
      if (r.heldFrameScenes > 0) lines.push(`${r.heldFrameScenes} cena(s) com clipe mais curto que a fala — adicione mais clipes pra evitar frame congelado.`)
      if (r.skippedDuplicateAudios.length) lines.push(`Áudios duplicados ignorados: ${r.skippedDuplicateAudios.join(', ')}`)
      const title = `${r.scenes.length} cenas organizadas ${ORDER_LABEL[s.order.by]}${s.order.reverse ? ' (invertida)' : ''}`
      const warn = r.heldFrameScenes > 0 || r.skippedDuplicateAudios.length > 0
      ;(warn ? toast.warning : toast.success)(title, { id: loading, description: lines.join('\n'), duration: 7000 })
      setShowAssembly(false)
      select(null)
      seek(0)
    } catch (e) {
      console.error('[Auto Assemble]', e)
      toast.error('Falha ao montar as cenas', {
        id: loading,
        description: e instanceof Error ? e.message : (e as { message?: string })?.message || 'Tente novamente.',
      })
    } finally {
      setStatus(undefined)
    }
  }

  const editingIndex = editingScene ? timeline.findIndex((t) => t.scene.id === editingScene.id) : timeline.length
  const editingStart = editingScene
    ? timeline[editingIndex]?.start ?? 0
    : timeline.length
      ? timeline[timeline.length - 1].start + timeline[timeline.length - 1].duration
      : 0
  const previousThumb = timeline[editingIndex - 1]?.videoAsset?.metadata?.thumbnail as string | undefined

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-0">
        <LogoMark animated className="h-12 w-12" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <h2 className="mb-4 font-display text-2xl font-bold">Projeto não encontrado</h2>
          <Link href="/dashboard">
            <Button>Voltar aos projetos</Button>
          </Link>
        </div>
      </div>
    )
  }

  const busy = autoAssemble.isPending || applyEffects.isPending
  const hasTimeline = timeline.length > 0 || tracks.overlays.length > 0 || tracks.audioClips.length > 0

  return (
    // Full-viewport editor: covers the dashboard header so the timeline is never cut off
    <div className="fixed inset-0 z-40 flex flex-col bg-surface-0">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface-1 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" aria-label="Voltar aos projetos">
            <Button variant="ghost" size="icon">
              <ArrowLeft />
            </Button>
          </Link>
          <LogoMark className="h-7 w-7" />
          <div className="min-w-0">
            <p className="eyebrow !text-[9px]">SyncExpress</p>
            <h1 className="truncate font-display text-[15px] font-bold leading-tight">{project.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAssembly(true)}>
            <SlidersHorizontal /> Montagem
          </Button>
          <Button size="sm" disabled={!hasTimeline} onClick={() => setShowExport(true)} className="font-semibold">
            <FolderDown /> Exportar CapCut
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Media bin */}
        <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-border bg-surface-1 xl:w-72">
          <AssetLibrary projectId={id} />
        </aside>

        {/* Monitor + timeline (min-w-0 keeps the lanes from widening the page) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-surface-0 p-4">
              <div className="h-full w-full max-w-5xl">
                <VideoPreview
                  scenes={scenes || []}
                  assets={assets || []}
                  narrationTrack={narrationTrack}
                  overlays={tracks.overlays}
                  audioClips={tracks.audioClips}
                  onSceneChange={setActiveSceneIndex}
                  transitionDuration={syncSettings.transition.duration}
                  format={project.settings?.output_format || 'auto'}
                  selectedOverlayId={selection?.kind === 'overlay' ? selection.id : null}
                  onSelectOverlay={(oid) => select({ kind: 'overlay', id: oid })}
                  onOverlayChange={tracks.updateOverlay}
                />
              </div>
            </div>

            {/* Properties */}
            <aside className="w-72 flex-shrink-0 border-l border-border bg-surface-1" aria-label="Propriedades do clipe">
              <Inspector
                projectId={id}
                scenes={scenes || []}
                assets={assets || []}
                narrationTrack={narrationTrack}
                tracks={tracks}
                onEditScene={(scene) => {
                  setEditingScene(scene)
                  setShowSceneEditor(true)
                }}
              />
            </aside>
          </div>

          <div className="h-[300px] flex-shrink-0 border-t border-border">
            <Timeline
              projectId={id}
              scenes={scenes || []}
              assets={assets || []}
              isLoading={scenesLoading}
              narrationTrack={narrationTrack}
              tracks={tracks}
              activeSceneIndex={activeSceneIndex}
              onSeek={seek}
              onAddScene={() => {
                setEditingScene(null)
                setShowSceneEditor(true)
              }}
              onEditScene={(scene) => {
                setEditingScene(scene)
                setShowSceneEditor(true)
              }}
              onOpenAssembly={() => setShowAssembly(true)}
              onAssemble={(mode) => runAssemble(mode)}
              busy={busy}
              status={status}
            />
          </div>
        </div>
      </div>

      <SceneEditor
        open={showSceneEditor}
        onOpenChange={setShowSceneEditor}
        projectId={id}
        scene={editingScene}
        sceneCount={scenes?.length || 0}
        sceneIndex={editingIndex}
        sceneStart={editingStart}
        previousThumb={previousThumb}
        defaultParams={syncSettings.animation.params}
      />

      <AssemblySheet
        open={showAssembly}
        onOpenChange={setShowAssembly}
        settings={project.settings?.sync}
        thumbs={thumbs}
        hasScenes={timeline.length > 0}
        busy={busy || saveSettings.isPending}
        status={status}
        onSave={async (s) => {
          await saveSettings.mutateAsync({ projectId: id, settings: s })
          toast.success('Preferências de montagem salvas')
          setShowAssembly(false)
        }}
        onApplyEffects={async (s) => {
          try {
            await saveSettings.mutateAsync({ projectId: id, settings: s })
            await applyEffects.mutateAsync({ projectId: id, scenes: scenes || [], settings: s })
            toast.success('Efeitos aplicados', { description: 'Animações e transições atualizadas nas cenas atuais (tempos mantidos).' })
            setShowAssembly(false)
          } catch (e) {
            toast.error('Falha ao aplicar efeitos', { description: e instanceof Error ? e.message : undefined })
          }
        }}
        onAssemble={(s) => runAssemble('scenes_with_audio', s)}
      />

      <CapCutExportSheet
        open={showExport}
        onOpenChange={setShowExport}
        projectTitle={project.title}
        timeline={timeline}
        narration={narration}
        overlays={tracks.overlays}
        audioClips={tracks.audioClips}
        assets={assets || []}
        settings={syncSettings}
        defaultFormat={project.settings?.output_format}
      />
    </div>
  )
}
