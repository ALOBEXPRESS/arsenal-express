'use client'

import { use, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal, FolderDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useProject } from '@/lib/hooks/useProjects'
import {
  useScenes,
  useAutoAssemble,
  useSaveSyncSettings,
  useApplyEffects,
  nextOrderIndex,
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
import { SoundEffectsLibrary } from '@/components/sfx/SoundEffectsLibrary'
import { Timeline } from '@/components/timeline/Timeline'
import { SceneEditor } from '@/components/timeline/SceneEditor'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { Inspector } from '@/components/editor/Inspector'
import { AssemblySheet } from '@/components/sync/AssemblySheet'
import { ExportMenu } from '@/components/project/ExportMenu'
import { LogoMark } from '@/components/brand/Logo'
import { buildTimeline, formatTime } from '@/lib/timeline'
import { withDefaults, type SyncSettings } from '@/lib/sync/presets'
import type { Asset, Scene, Subproject } from '@/types/project'
import { MAIN_SUB, scenesOf } from '@/lib/subprojects'
import type { TimelineInput } from '@/lib/capcut/draft'
import { cn } from '@/lib/utils'

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
  const [activeSub, setActiveSubState] = useState<string>(MAIN_SUB)
  useEffect(() => {
    const saved = localStorage.getItem(`syncexpress.sub.${id}`)
    if (saved) setActiveSubState(saved)
  }, [id])
  const tracks = useTracks(id, activeSub)
  const subId = tracks.sub.id // falls back to the first subproject if the saved one is gone
  const setActiveSub = useCallback(
    (sid: string) => {
      setActiveSubState(sid)
      localStorage.setItem(`syncexpress.sub.${id}`, sid)
    },
    [id]
  )
  const { setCurrentProject, setScenes, setAssets } = useProjectStore()
  const { selection, select } = useSelection()
  const autoAssemble = useAutoAssemble()
  const saveSettings = useSaveSyncSettings()
  const applyEffects = useApplyEffects()

  const [showSceneEditor, setShowSceneEditor] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showAssembly, setShowAssembly] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'assets' | 'sfx'>('assets')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const inspectorRef = useRef<HTMLDivElement>(null)

  const [editingScene, setEditingScene] = useState<Scene | null>(null)
  const [status, setStatus] = useState<string>()

  const knownSubs = useMemo(() => new Set(tracks.subprojects.map((s) => s.id)), [tracks.subprojects])
  const subScenes = useMemo(() => scenesOf(scenes || [], subId, knownSubs), [scenes, subId, knownSubs])
  const timeline = useMemo(() => buildTimeline(subScenes, assets || []), [subScenes, assets])
  const narrationTrack = tracks.narrationTrack
  const syncSettings = useMemo(() => withDefaults(project?.settings?.sync), [project])
  const assetById = useMemo(() => new Map((assets || []).map((a) => [a.id, a])), [assets])
  const audioCount = useMemo(() => (assets || []).filter((a) => a.type === 'audio').length, [assets])

  // Get current playhead position
  const activeSceneIndex = usePlayhead((s) => s.time)

  // every subproject resolved for the CapCut export (one CapCut timeline each)
  const exportTimelines = useMemo<(TimelineInput & { id: string })[]>(() => {
    // Resolve asset references (normal assets or sfx: pseudo-references)
    const resolveAsset = (assetId: string): Asset | null => {
      // Check if it's a sound effect reference (sfx:effect-id)
      if (assetId.startsWith('sfx:')) {
        const effectId = assetId.substring(4) // remove "sfx:" prefix
        // Create pseudo-asset for SFX
        // Note: The actual path will be determined from manifest when rendering
        // For now, we just mark it as an SFX with the effect ID
        return {
          id: assetId,
          project_id: id,
          type: 'audio',
          kind: 'audio',
          filename: effectId,
          storage_path: assetId, // Keep the sfx:id reference
          url: assetId, // Will be resolved to actual path at render time
          duration: null,
          duration_seconds: null,
          file_size_bytes: null,
          metadata: { isSFX: true, effectId },
          created_at: new Date().toISOString(),
        } as Asset
      }
      // Normal asset lookup
      return assetById.get(assetId) || null
    }

    const resolve = <T extends { asset_id: string }>(list: T[]) =>
      list.flatMap((clip) => {
        const asset = resolveAsset(clip.asset_id)
        return asset ? [{ clip, asset }] : []
      })
    return tracks.subprojects.map((sp: Subproject) => ({
      id: sp.id,
      name: sp.name,
      timeline: buildTimeline(scenesOf(scenes || [], sp.id, knownSubs), assets || []),
      narration: sp.narration_track
        .map((seg) => ({ asset: assetById.get(seg.asset_id)!, start: seg.start, duration: seg.duration }))
        .filter((n) => n.asset),
      overlays: resolve(sp.overlays),
      audioClips: resolve(sp.audio_clips),
      adjustments: sp.adjustments,
    }))
  }, [tracks.subprojects, scenes, assets, assetById, knownSubs])
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
  // a new project / subproject starts with nothing selected
  useEffect(() => () => select(null), [id, subId, select])

  const seek = usePlayhead((s) => s.requestSeek)

  const runAssemble = async (mode: AutoAssembleMode, settings: SyncSettings = syncSettings) => {
    const s = withDefaults(settings)
    const perAudio = mode === 'scenes_with_audio' && s.narration.split === 'per_audio' && audioCount > 1
    const affected = perAudio ? (scenes || []).length : subScenes.length
    if (affected > 0) {
      const ok = await confirmDialog({
        title: perAudio ? 'Remontar os subprojetos?' : `Substituir as cenas de ${tracks.sub.name}?`,
        description: perAudio
          ? `Cada narração vira um subprojeto e as ${affected} cenas atuais são remontadas. Sobreposições, áudios extras e ajustes continuam onde estão.`
          : `As ${affected} cenas deste subprojeto são remontadas do zero. Os outros subprojetos não mudam.`,
        confirmLabel: 'Remontar',
      })
      if (!ok) return
    }
    const loading = toast.loading('Montando a timeline…')
    try {
      const r = await autoAssemble.mutateAsync({ projectId: id, mode, settings, subId, onStatus: setStatus })
      const durs = r.subs.flatMap((x) => x.durations)
      const lines: string[] = []
      if (r.subs.length > 1) {
        for (const x of r.subs) {
          lines.push(
            `${x.name}: ${x.scenes} cenas · narração ${formatTime(x.narration)}${x.uncovered > 0.5 ? ` · ${formatTime(x.uncovered)} sem cenas` : ''}`
          )
        }
      } else if (mode === 'scenes_with_audio' && durs.length) {
        const x = r.subs[0]
        lines.push(
          r.variableRhythm && x.uncovered < 0.5
            ? `Ritmo variável: ${r.pausesFound} pausas detectadas · cenas de ${Math.min(...durs).toFixed(1)}s a ${Math.max(...durs).toFixed(1)}s.`
            : `Narração ${formatTime(x.narration)} · ${x.scenes} cenas.`
        )
      }
      const uncovered = r.subs.filter((x) => x.uncovered > 0.5)
      if (uncovered.length) lines.push('A narração continua na timeline onde ainda não tem cena — arraste os clipes dela pra faixa Mídia.')
      if (s.animation.enabled) lines.push(`Animações: ${s.animation.mode === 'fixo' ? '1 fixa' : `${s.animation.selected.length} em rodízio`} · fluxo ${s.animation.flow}:3.`)
      if (r.heldFrameScenes > 0) lines.push(`${r.heldFrameScenes} cena(s) com clipe mais curto que a fala — adicione mais clipes pra evitar frame congelado.`)
      if (r.skippedDuplicateAudios.length) lines.push(`Áudios idênticos ignorados: ${r.skippedDuplicateAudios.join(', ')}`)
      const title = `${r.totalScenes} cenas organizadas ${ORDER_LABEL[s.order.by]}${s.order.reverse ? ' (invertida)' : ''}${
        r.subs.length > 1 ? ` em ${r.subs.length} subprojetos` : ''
      }`
      const warn = r.heldFrameScenes > 0 || r.skippedDuplicateAudios.length > 0
      ;(warn ? toast.warning : toast.success)(title, { id: loading, description: lines.join('\n'), duration: 8000 })
      setShowAssembly(false)
      if (r.subs.length > 1) setActiveSub(r.subs[0].id)
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
  const hasTimeline = exportTimelines.some((t) => t.timeline.length > 0 || t.narration.length > 0 || (t.overlays?.length ?? 0) > 0)

  const removeSub = async (sid: string) => {
    const sp = tracks.subprojects.find((x) => x.id === sid)
    const n = scenesOf(scenes || [], sid, knownSubs).length
    const ok = await confirmDialog({
      title: `Excluir ${sp?.name ?? 'o subprojeto'}?`,
      description: `${n} cena(s), a narração e as camadas dele saem do projeto. As mídias continuam na biblioteca.`,
      confirmLabel: 'Excluir subprojeto',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const next = await tracks.removeSubproject(sid)
      if (next && sid === subId) setActiveSub(next[0].id)
      toast.success(`${sp?.name ?? 'Subprojeto'} excluído`)
    } catch (e) {
      toast.error('Não foi possível excluir o subprojeto', { description: e instanceof Error ? e.message : undefined })
    }
  }

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
          <ExportMenu
            projectTitle={project.title}
            timelines={exportTimelines}
            activeSubId={subId}
            settings={syncSettings}
            extraAssets={assets?.filter((a) => a.type === 'asset')}
            disabled={!hasTimeline}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Collapse toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute left-0 top-1/2 z-50 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-surface-1 text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground"
          style={{
            left: sidebarCollapsed ? '0px' : 'calc(16rem - 1.5rem)', // w-64 = 16rem
            transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Media bin with tabs */}
        <aside
          ref={sidebarRef}
          className="flex-shrink-0 border-r border-border bg-surface-1 flex flex-col overflow-hidden"
          style={{
            width: sidebarCollapsed ? '0px' : '16rem', // w-64
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Tab switcher */}
          <div className="flex border-b border-border bg-surface-0">
            <button
              onClick={() => setSidebarTab('assets')}
              className={cn(
                'flex-1 px-3 py-2 text-[12px] font-medium transition-colors',
                sidebarTab === 'assets'
                  ? 'border-b-2 border-primary bg-surface-1 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-1/50'
              )}
            >
              Mídias
            </button>
            <button
              onClick={() => setSidebarTab('sfx')}
              className={cn(
                'flex-1 px-3 py-2 text-[12px] font-medium transition-colors',
                sidebarTab === 'sfx'
                  ? 'border-b-2 border-primary bg-surface-1 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-1/50'
              )}
            >
              Efeitos Sonoros
            </button>
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'assets' ? (
              <AssetLibrary projectId={id} />
            ) : (
              <SoundEffectsLibrary projectId={id} />
            )}
          </div>
        </aside>

        {/* Monitor + timeline (min-w-0 keeps the lanes from widening the page) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-surface-0 p-4">
              <div className="h-full w-full max-w-5xl">
                <VideoPreview
                  key={subId}
                  scenes={subScenes}
                  assets={assets || []}
                  narrationTrack={narrationTrack}
                  overlays={tracks.overlays}
                  imageOverlays={tracks.imageOverlays}
                  audioClips={tracks.audioClips}
                  adjustments={tracks.adjustments}
                  transitionDuration={syncSettings.transition.duration}
                  format={project.settings?.output_format || 'auto'}
                  selectedOverlayId={selection?.kind === 'overlay' ? selection.id : null}
                  onSelectOverlay={(oid) => select({ kind: 'overlay', id: oid })}
                  onOverlayChange={tracks.updateOverlay}
                  overlayBarHeight={syncSettings.overlay_bars.height_override}
                />
              </div>
            </div>

            {/* Properties */}
            <aside
              ref={inspectorRef}
              className="flex-shrink-0 border-l border-border bg-surface-1 overflow-y-auto"
              style={{
                width: sidebarCollapsed ? 'calc(18rem + 16rem)' : '18rem', // w-72 + w-64 when collapsed
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              aria-label="Propriedades do clipe"
            >
              <Inspector
                projectId={id}
                scenes={subScenes}
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

          <div className="h-[330px] flex-shrink-0 border-t border-border">
            <Timeline
              key={`${subId}-${sidebarCollapsed}`} // Force re-render on collapse to recalc widths
              projectId={id}
              scenes={subScenes}
              subId={subId}
              subprojects={tracks.subprojects}
              activeSub={subId}
              onSelectSub={(sid) => {
                setActiveSub(sid)
                seek(0)
              }}
              onAddSub={() => {
                const sp = tracks.addSubproject()
                setActiveSub(sp.id)
                seek(0)
                toast.success(`${sp.name} criado`, { description: 'Arraste a narração e os clipes dele pra timeline.' })
              }}
              onRenameSub={tracks.renameSubproject}
              onRemoveSub={(sid) => void removeSub(sid)}
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
        sceneCount={subScenes.length}
        nextOrder={nextOrderIndex(scenes || [])}
        subId={subId}
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
        audioCount={audioCount}
        assets={assets || []}
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
            await applyEffects.mutateAsync({ projectId: id, scenes: subScenes, settings: s })
            toast.success('Efeitos aplicados', { description: `Animações e transições atualizadas em ${tracks.sub.name} (tempos mantidos).` })
            setShowAssembly(false)
          } catch (e) {
            toast.error('Falha ao aplicar efeitos', { description: e instanceof Error ? e.message : undefined })
          }
        }}
        onAssemble={(s) => runAssemble('scenes_with_audio', s)}
        onAssembleScenes={(s) => runAssemble('scenes', s)}
      />
    </div>
  )
}
