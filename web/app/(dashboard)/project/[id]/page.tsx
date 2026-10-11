'use client'

import { use, useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal, FolderDown } from 'lucide-react'
import { useProject } from '@/lib/hooks/useProjects'
import {
  useScenes,
  useAutoAssemble,
  useSaveSyncSettings,
  useApplyEffects,
  type AutoAssembleMode,
} from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import { useProjectStore } from '@/lib/stores/projectStore'
import { Button } from '@/components/ui/button'
import { AssetLibrary } from '@/components/assets/AssetLibrary'
import { Timeline } from '@/components/timeline/Timeline'
import { SceneEditor } from '@/components/timeline/SceneEditor'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { AssemblySheet } from '@/components/sync/AssemblySheet'
import { CapCutExportSheet } from '@/components/sync/CapCutExportSheet'
import { LogoMark } from '@/components/brand/Logo'
import { buildTimeline, formatTime } from '@/lib/timeline'
import { withDefaults, type SyncSettings } from '@/lib/sync/presets'
import type { Scene } from '@/types/project'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const { data: project, isLoading, error } = useProject(id)
  const { data: scenes } = useScenes(id)
  const { data: assets } = useAssets(id)
  const { setCurrentProject, setScenes, setAssets } = useProjectStore()
  const autoAssemble = useAutoAssemble()
  const saveSettings = useSaveSyncSettings()
  const applyEffects = useApplyEffects()

  const [showSceneEditor, setShowSceneEditor] = useState(false)
  const [showAssembly, setShowAssembly] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editingScene, setEditingScene] = useState<Scene | null>(null)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ time: number; nonce: number }>()
  const [status, setStatus] = useState<string>()
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; lines: string[] } | null>(null)

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

  const seek = useCallback((time: number) => setSeekRequest({ time, nonce: Date.now() }), [])
  const handleSelectScene = useCallback(
    (index: number) => {
      const item = timeline[index]
      if (item) seek(item.start)
    },
    [timeline, seek]
  )

  const runAssemble = async (mode: AutoAssembleMode, settings: SyncSettings = syncSettings) => {
    if (scenes && scenes.length > 0 && !confirm('Isso substitui as cenas atuais da timeline. Continuar?')) return
    setNotice(null)
    try {
      const r = await autoAssemble.mutateAsync({ projectId: id, mode, settings, onStatus: setStatus })
      const durs = r.durations
      const lines = [`${r.scenes.length} cenas organizadas pela data de modificação.`]
      if (mode === 'scenes_with_audio') {
        lines.push(
          r.variableRhythm
            ? `Ritmo variável: ${r.pausesFound} pausas detectadas · cenas de ${Math.min(...durs).toFixed(1)}s a ${Math.max(...durs).toFixed(1)}s.`
            : `Narração ${formatTime(r.narrationDuration)} dividida em ${(r.narrationDuration / durs.length).toFixed(1)}s por cena.`
        )
      }
      if (r.heldFrameScenes > 0) lines.push(`${r.heldFrameScenes} cena(s) com clipe mais curto que a fala — adicione mais clipes pra evitar frame congelado.`)
      if (r.skippedDuplicateAudios.length) lines.push(`Áudios duplicados ignorados: ${r.skippedDuplicateAudios.join(', ')}`)
      setNotice({ tone: r.heldFrameScenes || r.skippedDuplicateAudios.length ? 'warn' : 'ok', lines })
      setShowAssembly(false)
      seek(0)
    } catch (e) {
      console.error('[Auto Assemble]', e)
      setNotice({ tone: 'error', lines: [e instanceof Error ? e.message : (e as { message?: string })?.message || 'Falha ao montar cenas'] })
    } finally {
      setStatus(undefined)
    }
  }

  const editingIndex = editingScene ? timeline.findIndex((t) => t.scene.id === editingScene.id) : timeline.length
  const editingStart = editingScene ? timeline[editingIndex]?.start ?? 0 : timeline.length ? timeline[timeline.length - 1].start + timeline[timeline.length - 1].duration : 0
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
          <Button size="sm" disabled={timeline.length === 0} onClick={() => setShowExport(true)} className="font-semibold">
            <FolderDown /> Exportar CapCut
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Media bin */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto border-r border-border bg-surface-1">
          <AssetLibrary projectId={id} />
        </aside>

        {/* Monitor + timeline (min-w-0 keeps the lanes from widening the page) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-surface-0 p-4">
            {notice && (
              <div
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`absolute left-1/2 top-3 z-30 w-[min(560px,90%)] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-[13px] shadow-xl backdrop-blur ${
                  notice.tone === 'error'
                    ? 'border-destructive/50 bg-destructive/15'
                    : notice.tone === 'warn'
                      ? 'border-primary/50 bg-surface-2/95'
                      : 'border-track-audio/50 bg-surface-2/95'
                }`}
              >
                <button onClick={() => setNotice(null)} className="float-right ml-3 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Fechar aviso">
                  ×
                </button>
                {notice.lines.map((l, i) => (
                  <p key={i} className={i === 0 ? 'font-medium' : 'mt-0.5 text-muted-foreground'}>
                    {l}
                  </p>
                ))}
              </div>
            )}
            <div className="h-full w-full max-w-5xl">
              <VideoPreview
                scenes={scenes || []}
                assets={assets || []}
                narrationTrack={narrationTrack}
                seekRequest={seekRequest}
                onSceneChange={setActiveSceneIndex}
                transitionDuration={syncSettings.transition.duration}
                format={project.settings?.output_format || "auto"}
              />
            </div>
          </div>

          <div className="h-[260px] flex-shrink-0 border-t border-border">
            <Timeline
              projectId={id}
              narrationTrack={narrationTrack}
              activeSceneIndex={activeSceneIndex}
              onSelectScene={handleSelectScene}
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
          setShowAssembly(false)
        }}
        onApplyEffects={async (s) => {
          await saveSettings.mutateAsync({ projectId: id, settings: s })
          await applyEffects.mutateAsync({ projectId: id, scenes: scenes || [], settings: s })
          setNotice({ tone: 'ok', lines: ['Animações e transições aplicadas nas cenas atuais (tempos mantidos).'] })
          setShowAssembly(false)
        }}
        onAssemble={(s) => runAssemble('scenes_with_audio', s)}
      />

      <CapCutExportSheet
        open={showExport}
        onOpenChange={setShowExport}
        projectTitle={project.title}
        timeline={timeline}
        narration={narration}
        settings={syncSettings}
        defaultFormat={project.settings?.output_format}
      />
    </div>
  )
}
