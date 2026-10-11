'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  Mic,
  Pencil,
  Trash2,
  Plus,
  Wand2,
  Film,
  SlidersHorizontal,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Layers,
  Music,
  Gauge,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteScene, useReorderScenes, useInsertScene, type AutoAssembleMode } from '@/lib/hooks/useScenes'
import { newClipId, type useTracks } from '@/lib/hooks/useTracks'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/components/ui/confirm'
import { buildTimeline, totalDuration, formatTime, formatClock, type TimedScene } from '@/lib/timeline'
import { normalizeAnimation, normalizeTransition, ANIMATION_BY_ID, TRANSITION_BY_ID } from '@/lib/sync/presets'
import { usePlayhead } from '@/lib/stores/playhead'
import { useDragAsset, ASSET_MIME } from '@/lib/stores/drag'
import { useSelection } from '@/lib/stores/selection'
import type { Asset, AudioClip, NarrationSegment, OverlayClip, Scene } from '@/types/project'
import { cn } from '@/lib/utils'

type Tracks = ReturnType<typeof useTracks>

interface TimelineProps {
  projectId: string
  scenes: Scene[]
  assets: Asset[]
  isLoading?: boolean
  narrationTrack: NarrationSegment[]
  tracks: Tracks
  activeSceneIndex?: number
  onSeek: (time: number) => void
  onAddScene?: () => void
  onEditScene?: (scene: Scene) => void
  onOpenAssembly?: () => void
  onAssemble: (mode: AutoAssembleMode) => void
  busy: boolean
  status?: string
}

const GUTTER = 92
const MIN_PPS = 4
const MAX_PPS = 160
const SNAP_PX = 7
const IMAGE_DEFAULT_S = 5
const SCENE_MIME = 'application/x-syncexpress-scene'

function rulerStep(pps: number) {
  // seconds between labels so labels are >= ~70px apart
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120]) if (s * pps >= 70) return s
  return 300
}

/** Playhead subscribes to the store on its own so lanes don't re-render every frame */
function Playhead({
  pps,
  scroller,
  onGrab,
}: {
  pps: number
  scroller: React.RefObject<HTMLDivElement | null>
  onGrab: (e: React.PointerEvent) => void
}) {
  const time = usePlayhead((s) => s.time)
  const x = time * pps
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft
    const right = left + el.clientWidth - GUTTER
    if (x < left || x > right - 40) el.scrollLeft = Math.max(0, x - 80)
  }, [x, scroller])
  return (
    <div className="absolute bottom-0 top-0 z-30 w-0" style={{ left: x }}>
      {/* wide invisible grab area so the line can be dragged over the clips */}
      <div
        role="slider"
        aria-label="Agulha da timeline (arraste)"
        aria-valuenow={Math.round(time)}
        tabIndex={-1}
        onPointerDown={onGrab}
        className="absolute -left-[7px] bottom-0 top-0 w-[14px] cursor-ew-resize touch-none"
      />
      <div className="pointer-events-none absolute -left-px bottom-0 top-0 w-0.5 bg-brand-cyan shadow-[0_0_10px_hsl(var(--brand-cyan))]" aria-hidden />
      <span
        onPointerDown={onGrab}
        className="absolute -left-[7px] -top-0.5 h-3.5 w-3.5 cursor-ew-resize touch-none rounded-[3px] bg-brand-cyan [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]"
      />
    </div>
  )
}

function Waveform({ seed, width, className }: { seed: string; width: number; className?: string }) {
  const bars = Math.max(4, Math.min(600, Math.floor(width / 4)))
  const h = (i: number) => 22 + Math.abs(Math.sin(i * 0.61 + seed.charCodeAt(i % seed.length)) * Math.cos(i * 0.17)) * 70
  return (
    <div className="pointer-events-none absolute inset-x-1 inset-y-1.5 flex items-center gap-[2px] overflow-hidden" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={cn('w-[2px] shrink-0 rounded-full', className)} style={{ height: `${h(i)}%` }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main-track scene block (HTML5 drag = reorder)
// ---------------------------------------------------------------------------

interface ClipBlockProps {
  item: TimedScene
  pps: number
  active: boolean
  selected: boolean
  dragging: boolean
  /** clientX of the click (moves the playhead there) */
  onSelect: (clientX?: number) => void
  onEdit: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function ClipBlock({ item, pps, active, selected, dragging, onSelect, onEdit, onDelete, onDragStart, onDragEnd }: ClipBlockProps) {
  const media: Asset | undefined = item.videoAsset || item.imageAsset
  const thumb = (media?.metadata?.thumbnail as string | undefined) || (item.imageAsset ? item.imageAsset.url : undefined)
  const width = Math.max(item.duration * pps, 6)
  const anim = ANIMATION_BY_ID.get(normalizeAnimation(item.scene.animation_type) as never)
  const name = media?.filename.replace(/\.[^.]+$/, '') || item.scene.narration_text
  const compact = width < 90

  return (
    <div
      role="button"
      tabIndex={0}
      data-clip
      aria-label={`Cena ${item.index + 1}: ${name}, ${item.duration.toFixed(1)} segundos`}
      aria-pressed={selected}
      draggable
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e.clientX)
      }}
      onDoubleClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEdit()
        if (e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${media?.filename ?? ''} · ${item.duration.toFixed(2)}s · arraste pra reordenar · duplo clique pra editar`}
      className={cn(
        'group absolute bottom-0 top-0 cursor-pointer overflow-hidden rounded-md border transition-[border-color,opacity] duration-150',
        selected ? 'z-10 border-brand-cyan ring-1 ring-brand-cyan' : active ? 'z-10 border-primary ring-1 ring-primary' : 'border-white/10 hover:border-white/40',
        dragging && 'opacity-40'
      )}
      style={{ left: item.start * pps, width: width - 2 }}
    >
      {/* filmstrip */}
      <div
        className="absolute inset-0 bg-track-video"
        style={thumb ? { backgroundImage: `url(${thumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' } : undefined}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/40" />

      <div className="relative flex h-full flex-col justify-between p-1.5">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'rounded px-1 font-mono text-[10px] font-semibold',
              active ? 'bg-primary-fill text-primary-foreground' : 'bg-black/60 text-white/90'
            )}
          >
            {String(item.index + 1).padStart(3, '0')}
          </span>
          {!compact && anim && (
            <span className="flex items-center gap-0.5 rounded bg-black/60 px-1 text-[9px] text-white/85" title={`Animação: ${anim.label}`}>
              <Sparkles className="h-2.5 w-2.5" aria-hidden /> {anim.label}
            </span>
          )}
          {!compact && item.manualSpeed && (
            <span className="flex items-center gap-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-brand-cyan" title="Velocidade manual">
              <Gauge className="h-2.5 w-2.5" aria-hidden /> {item.rate.toFixed(2)}×
            </span>
          )}
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-white">{name}</p>
            <p className="font-mono text-[10px] tabular-nums text-white/70">
              {item.duration.toFixed(1)}s{!item.manualSpeed && item.rate < 1 && ` · ${item.rate.toFixed(2)}×`}
            </p>
          </div>
        )}
      </div>

      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="cursor-pointer rounded bg-black/70 p-1 text-white hover:bg-primary-fill hover:text-primary-foreground"
          aria-label={`Editar cena ${item.index + 1}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="cursor-pointer rounded bg-black/70 p-1 text-white hover:bg-destructive"
          aria-label={`Excluir cena ${item.index + 1}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Free-position clip (overlay / audio lanes): drag to move, right edge to trim
// ---------------------------------------------------------------------------

interface LaneClipProps {
  id: string
  start: number
  duration: number
  pps: number
  selected: boolean
  /** longest the clip can be (source length / speed); undefined = unlimited (images) */
  maxDuration?: number
  snapTo: number[]
  label: string
  meta: string
  tone: 'overlay' | 'audio'
  thumb?: string
  onSelect: () => void
  onCommit: (patch: { start: number; duration: number }) => void
}

function LaneClip({ id, start, duration, pps, selected, maxDuration, snapTo, label, meta, tone, thumb, onSelect, onCommit }: LaneClipProps) {
  const [draft, setDraft] = useState<{ start: number; duration: number } | null>(null)
  const s = draft?.start ?? start
  const d = draft?.duration ?? duration

  const snap = (t: number) => {
    let best = t
    let dist = SNAP_PX / pps
    for (const p of snapTo) {
      if (Math.abs(p - t) < dist) {
        dist = Math.abs(p - t)
        best = p
      }
    }
    return best
  }

  const begin = (e: React.PointerEvent, mode: 'move' | 'trim') => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const x0 = e.clientX
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let latest = { start, duration }
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps
      if (mode === 'move') {
        let ns = Math.max(0, start + dt)
        const snappedStart = snap(ns)
        const snappedEnd = snap(ns + duration)
        if (snappedStart !== ns) ns = snappedStart
        else if (snappedEnd !== ns + duration) ns = Math.max(0, snappedEnd - duration)
        latest = { start: Math.round(ns * 1000) / 1000, duration }
      } else {
        let nd = Math.max(0.2, snap(start + duration + dt) - start)
        if (maxDuration) nd = Math.min(nd, maxDuration)
        latest = { start, duration: Math.round(nd * 1000) / 1000 }
      }
      setDraft(latest)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setDraft(null)
      if (latest.start !== start || latest.duration !== duration) onCommit(latest)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const width = Math.max(d * pps, 8)
  return (
    <div
      data-clip
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}, ${formatClock(s)} a ${formatClock(s + d)}`}
      onPointerDown={(e) => begin(e, 'move')}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
        // keyboard nudge: ← → move 0.1s (Shift = 1s), Alt+← → trim the end
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1)
          if (e.altKey) {
            let nd = Math.max(0.2, duration + delta)
            if (maxDuration) nd = Math.min(nd, maxDuration)
            onCommit({ start, duration: Math.round(nd * 1000) / 1000 })
          } else {
            onCommit({ start: Math.round(Math.max(0, start + delta) * 1000) / 1000, duration })
          }
        }
      }}
      title={`${label} · ${d.toFixed(2)}s · arraste pra mover, puxe a borda direita pra cortar (setas: ajuste fino)`}
      className={cn(
        'group absolute inset-y-0 cursor-grab touch-none overflow-hidden rounded-md border active:cursor-grabbing',
        tone === 'overlay' ? 'border-violet-300/40 bg-violet-500/25' : 'border-express/50 bg-express/15',
        selected && 'z-10 border-brand-cyan ring-1 ring-brand-cyan',
        draft && 'z-20 shadow-lg'
      )}
      style={{ left: s * pps, width: width - 2 }}
      data-id={id}
    >
      {thumb && (
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: `url(${thumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }}
        />
      )}
      {tone === 'audio' && <Waveform seed={id} width={width} className="bg-express/80" />}
      <span className="pointer-events-none relative block truncate px-1.5 pt-0.5 font-mono text-[9px] font-semibold text-white drop-shadow">
        {label} <span className="font-normal text-white/70">{meta}</span>
      </span>
      {/* trim handle */}
      <span
        onPointerDown={(e) => begin(e, 'trim')}
        className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/25 group-focus-visible:bg-white/25"
        aria-hidden
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

export function Timeline({
  projectId,
  scenes,
  assets,
  isLoading,
  narrationTrack,
  tracks,
  activeSceneIndex,
  onSeek,
  onAddScene,
  onEditScene,
  onOpenAssembly,
  onAssemble,
  busy,
  status,
}: TimelineProps) {
  const deleteScene = useDeleteScene()
  const reorderScenes = useReorderScenes()
  const insertScene = useInsertScene()
  const dragAsset = useDragAsset((s) => s.asset)
  const { selection, select } = useSelection()
  const [draggedScene, setDraggedScene] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<{ lane: 'main' | 'overlay' | 'audio'; time: number } | null>(null)
  const [pps, setPps] = useState<number | null>(null) // null = fit
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)

  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const { overlays, audioClips } = tracks
  const total = Math.max(
    totalDuration(timeline),
    narrationTrack.reduce((a, s) => Math.max(a, s.start + s.duration), 0),
    ...overlays.map((o) => o.start + o.duration),
    ...audioClips.map((c) => c.start + c.duration),
    0
  )

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewport(el.clientWidth - GUTTER - 24))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitPps = total > 0 ? Math.min(MAX_PPS, Math.max(MIN_PPS, viewport / total)) : 24
  const scale = pps ?? fitPps
  const contentWidth = Math.max(viewport, (total + 10) * scale + 40)
  const step = rulerStep(scale)
  const zoom = (factor: number) => setPps(Math.min(MAX_PPS, Math.max(MIN_PPS, scale * factor)))

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = content.current?.getBoundingClientRect()
      return rect ? Math.max(0, (clientX - rect.left) / scale) : 0
    },
    [scale]
  )

  // ---- Scrubbing: drag on the ruler, the empty lane area or the playhead itself --------
  const startScrub = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const max = Math.max(total, 0)
      const go = (x: number) => onSeek(Math.min(max, timeAt(x)))
      go(e.clientX)
      const move = (ev: PointerEvent) => go(ev.clientX)
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'ew-resize'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [onSeek, timeAt, total]
  )

  const snapPoints = useMemo(() => {
    const pts = [0, ...timeline.map((t) => t.start), totalDuration(timeline)]
    overlays.forEach((o) => pts.push(o.start, o.start + o.duration))
    audioClips.forEach((c) => pts.push(c.start, c.start + c.duration))
    return pts
  }, [timeline, overlays, audioClips])
  const snapWithPlayhead = () => [...snapPoints, usePlayhead.getState().time]

  // ---- Delete -------------------------------------------------------------------------
  const removeScene = useCallback(
    async (scene: Scene, index: number) => {
      const ok = await confirmDialog({
        title: `Excluir a cena ${index + 1}?`,
        description: 'As cenas seguintes andam pra trás pra fechar o buraco.',
        confirmLabel: 'Excluir cena',
        tone: 'danger',
      })
      if (!ok) return
      deleteScene.mutate(scene, { onError: (e) => toast.error('Falha ao excluir a cena', { description: e.message }) })
      if (selection?.id === scene.id) select(null)
    },
    [deleteScene, selection, select]
  )

  const removeSelected = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'overlay') tracks.removeOverlay(selection.id)
    else if (selection.kind === 'audio') tracks.removeAudio(selection.id)
    else {
      const item = timeline.find((t) => t.scene.id === selection.id)
      if (item) void removeScene(item.scene, item.index)
      return
    }
    select(null)
  }, [selection, tracks, timeline, removeScene, select])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selection) return
        e.preventDefault()
        removeSelected()
      }
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, removeSelected, select])

  // ---- Drop handling ------------------------------------------------------------------
  const insertIndexAt = (t: number) => {
    const i = timeline.findIndex((item) => t < item.start + item.duration / 2)
    return i === -1 ? timeline.length : i
  }
  const boundaryTime = (index: number) =>
    index < timeline.length ? timeline[index].start : totalDuration(timeline)

  const addAudioClip = (asset: Asset, start: number) => {
    const clip: AudioClip = {
      id: newClipId(),
      asset_id: asset.id,
      start: Math.round(start * 1000) / 1000,
      duration: asset.duration || 5,
      volume: 1,
      speed: 1,
    }
    tracks.addAudio(clip)
    select({ kind: 'audio', id: clip.id })
    toast.success('Áudio adicionado', { description: `${asset.filename} em ${formatClock(start)}` })
  }

  const addOverlay = (asset: Asset, start: number) => {
    const clip: OverlayClip = {
      id: newClipId(),
      asset_id: asset.id,
      kind: asset.type === 'video' ? 'video' : 'image',
      start: Math.round(start * 1000) / 1000,
      duration: asset.type === 'video' ? asset.duration || 5 : IMAGE_DEFAULT_S,
      scale: 0.5,
      x: 0,
      y: 0,
      opacity: 1,
      speed: 1,
      volume: 0,
    }
    tracks.addOverlay(clip)
    select({ kind: 'overlay', id: clip.id })
    toast.success('Sobreposição adicionada', { description: 'Ajuste escala, posição e opacidade no painel à direita.' })
  }

  const addSceneAt = (asset: Asset, index: number) => {
    const isImage = asset.type === 'image'
    const duration = isImage ? IMAGE_DEFAULT_S : asset.duration || IMAGE_DEFAULT_S
    insertScene.mutate(
      {
        projectId,
        scenes,
        index,
        input: {
          narration_text: `Cena ${index + 1}`,
          media_type: isImage ? 'still_image' : 'video_clip',
          video_asset_id: isImage ? undefined : asset.id,
          image_asset_id: isImage ? asset.id : undefined,
          audio_duration: Math.round(duration * 1000) / 1000,
          animation_type: 'none',
          transition_in: 'cut',
          generated_in_flow: false,
          metadata: { video_filename: asset.filename, clip_duration: asset.duration },
        },
      },
      {
        onSuccess: (scene) => {
          select({ kind: 'scene', id: scene.id })
          toast.success(`Cena inserida na posição ${index + 1}`, { description: asset.filename })
        },
        onError: (e) => toast.error('Não foi possível inserir a cena', { description: e.message }),
      }
    )
  }

  const laneDragOver = (lane: 'main' | 'overlay' | 'audio') => (e: React.DragEvent) => {
    const types = e.dataTransfer.types
    const isScene = types.includes(SCENE_MIME)
    const isAsset = types.includes(ASSET_MIME)
    if (!isScene && !isAsset) return
    if (isScene && lane !== 'main') return
    e.preventDefault()
    e.dataTransfer.dropEffect = isScene ? 'move' : 'copy'
    const t = timeAt(e.clientX)
    const target = isScene || (lane === 'main' && dragAsset?.type !== 'audio') ? boundaryTime(insertIndexAt(t)) : t
    const effectiveLane = isAsset && dragAsset?.type === 'audio' ? 'audio' : lane
    if (dropHint?.lane !== effectiveLane || Math.abs((dropHint?.time ?? -1) - target) > 1e-3) setDropHint({ lane: effectiveLane, time: target })
  }

  const laneDrop = (lane: 'main' | 'overlay' | 'audio') => (e: React.DragEvent) => {
    e.preventDefault()
    setDropHint(null)
    const t = timeAt(e.clientX)

    // Scene reorder
    const fromScene = e.dataTransfer.getData(SCENE_MIME)
    if (fromScene !== '') {
      const from = Number(fromScene)
      let to = insertIndexAt(t)
      if (from < to) to -= 1
      setDraggedScene(null)
      if (Number.isNaN(from) || from === to) return
      const next = [...scenes]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      reorderScenes.mutate(
        { projectId, scenes: next },
        { onError: (err) => toast.error('Falha ao reordenar', { description: err.message }) }
      )
      return
    }

    // Media from the library
    const asset = assetById.get(e.dataTransfer.getData(ASSET_MIME)) || dragAsset
    if (!asset) return
    if (asset.type === 'audio') return addAudioClip(asset, t)
    if (lane === 'audio') {
      toast.info('Essa faixa é só de áudio', { description: 'Solte vídeos e imagens na faixa Mídia ou Sobreposição.' })
      return
    }
    if (lane === 'overlay') return addOverlay(asset, t)
    addSceneAt(asset, insertIndexAt(t))
  }

  const laneDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHint(null)
  }

  const isSelected = (kind: 'scene' | 'overlay' | 'audio', id: string) => selection?.kind === kind && selection.id === id
  const accepting = (lane: 'main' | 'overlay' | 'audio') => {
    if (!dragAsset) return false
    if (dragAsset.type === 'audio') return lane === 'audio'
    return lane !== 'audio'
  }
  const laneClass = (lane: 'main' | 'overlay' | 'audio') =>
    cn('relative rounded-md transition-colors', accepting(lane) && 'bg-primary/[0.06] outline outline-1 outline-dashed outline-primary/40')

  const sourceMax = (assetId: string, speed: number) => {
    const a = assetById.get(assetId)
    return a?.type === 'image' || !a?.duration ? undefined : a.duration / (speed || 1)
  }

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[15px] font-bold">Timeline</h2>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {timeline.length} cenas · {formatTime(total)}
          </span>
          {busy && status && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-primary" role="status">
              <Loader2 className="h-3 w-3 animate-spin" /> {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="mr-1 flex items-center rounded-md border border-border" role="group" aria-label="Zoom da timeline">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoom(1 / 1.5)} aria-label="Diminuir zoom">
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPps(null)} aria-label="Ajustar à largura">
              <Maximize2 />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoom(1.5)} aria-label="Aumentar zoom">
              <ZoomIn />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onOpenAssembly} disabled={busy}>
            <SlidersHorizontal /> Montagem
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAssemble('scenes')} disabled={busy}>
            <Film /> Juntar cenas
          </Button>
          <Button size="sm" onClick={() => onAssemble('scenes_with_audio')} disabled={busy}>
            <Wand2 /> Juntar com áudio
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={onAddScene} aria-label="Adicionar cena manualmente">
            <Plus />
          </Button>
        </div>
      </div>

      {/* Lanes */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {isLoading ? (
          <div className="flex gap-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 w-32 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : (
          <div className="relative flex h-full min-h-[190px]" style={{ width: contentWidth + GUTTER }}>
            {/* Sticky lane labels */}
            <div className="sticky left-0 z-40 flex h-full shrink-0 flex-col border-r border-border bg-surface-1 text-[11px] text-muted-foreground" style={{ width: GUTTER }}>
              <div className="h-6 shrink-0 border-b border-border" />
              <div className="mt-1 flex h-8 shrink-0 items-center gap-1.5 px-2.5">
                <Layers className="h-3.5 w-3.5 text-violet-300" aria-hidden /> Sobrepor
              </div>
              <div className="flex flex-1 items-center gap-1.5 px-2.5">
                <Clapperboard className="h-3.5 w-3.5 text-track-video" aria-hidden /> Mídia
              </div>
              <div className="flex h-8 shrink-0 items-center gap-1.5 px-2.5">
                <Mic className="h-3.5 w-3.5 text-track-audio" aria-hidden /> Narração
              </div>
              <div className="mb-1 flex h-8 shrink-0 items-center gap-1.5 px-2.5">
                <Music className="h-3.5 w-3.5 text-express" aria-hidden /> Áudio
              </div>
            </div>

            <div className="relative h-full flex-1 px-3">
              <div
                ref={content}
                className="relative flex h-full flex-col"
                style={{ width: contentWidth - 24 }}
                onPointerDown={(e) => {
                  // empty lane area → scrub + clear selection
                  const target = e.target as HTMLElement
                  if (target.closest('[data-clip]')) return
                  if (!target.closest('.ruler')) select(null) // ruler scrubs but keeps the selection
                  startScrub(e)
                }}
              >
                {/* Ruler (click or drag to scrub) */}
                <div
                  className="ruler relative h-6 shrink-0 cursor-ew-resize touch-none border-b border-border"
                  style={{ ['--major' as string]: `${step * scale}px` } as React.CSSProperties}
                  aria-label="Régua de tempo — clique ou arraste para posicionar"
                >
                  {Array.from({ length: Math.floor((contentWidth - 24) / scale / step) + 1 }, (_, i) => (
                    <span key={i} className="pointer-events-none absolute top-0.5 font-mono text-[9px] tabular-nums text-muted-foreground" style={{ left: i * step * scale + 3 }}>
                      {formatTime(i * step)}
                    </span>
                  ))}
                </div>

                {/* Overlay lane */}
                <div
                  className={cn(laneClass('overlay'), 'mt-1 h-8 shrink-0')}
                  onDragOver={laneDragOver('overlay')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('overlay')}
                >
                  {overlays.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
                      Arraste uma imagem ou vídeo aqui pra sobrepor
                    </span>
                  )}
                  {overlays.map((o) => {
                    const a = assetById.get(o.asset_id)
                    return (
                      <LaneClip
                        key={o.id}
                        id={o.id}
                        start={o.start}
                        duration={o.duration}
                        pps={scale}
                        tone="overlay"
                        thumb={(a?.metadata?.thumbnail as string | undefined) || (a?.type === 'image' ? a.url : undefined)}
                        label={a?.filename.replace(/\.[^.]+$/, '') || 'mídia removida'}
                        meta={`${Math.round(o.opacity * 100)}% · ${o.scale.toFixed(2)}×`}
                        selected={isSelected('overlay', o.id)}
                        maxDuration={o.kind === 'video' ? sourceMax(o.asset_id, o.speed) : undefined}
                        snapTo={snapWithPlayhead()}
                        onSelect={() => select({ kind: 'overlay', id: o.id })}
                        onCommit={(p) => tracks.updateOverlay(o.id, p)}
                      />
                    )
                  })}
                  {dropHint?.lane === 'overlay' && <DropMarker x={dropHint.time * scale} />}
                </div>

                {/* Main (video) lane */}
                <div
                  className={cn(laneClass('main'), 'my-1 flex-1')}
                  onDragOver={laneDragOver('main')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('main')}
                >
                  {timeline.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-border text-[13px] text-muted-foreground">
                      Clique em <span className="mx-1 text-primary">Juntar com áudio</span> ou arraste clipes da biblioteca pra cá
                    </div>
                  )}
                  {timeline.map((item) => (
                    <ClipBlock
                      key={item.scene.id}
                      item={item}
                      pps={scale}
                      active={activeSceneIndex === item.index}
                      selected={isSelected('scene', item.scene.id)}
                      dragging={draggedScene === item.index}
                      onSelect={(clientX) => {
                        select({ kind: 'scene', id: item.scene.id })
                        onSeek(clientX !== undefined ? timeAt(clientX) : item.start)
                      }}
                      onEdit={() => onEditScene?.(item.scene)}
                      onDelete={() => void removeScene(item.scene, item.index)}
                      onDragStart={(e) => {
                        setDraggedScene(item.index)
                        e.dataTransfer.setData(SCENE_MIME, String(item.index))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDraggedScene(null)
                        setDropHint(null)
                      }}
                    />
                  ))}
                  {/* transition markers */}
                  {timeline.slice(1).map((item) => {
                    const tr = normalizeTransition(item.scene.transition_in)
                    if (tr === 'cut') return null
                    return (
                      <span
                        key={`tr-${item.scene.id}`}
                        className="pointer-events-none absolute top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-surface-0 bg-express"
                        style={{ left: item.start * scale - 1 }}
                        title={`Transição: ${TRANSITION_BY_ID.get(tr as never)?.label}`}
                        aria-hidden
                      />
                    )
                  })}
                  {dropHint?.lane === 'main' && <DropMarker x={dropHint.time * scale} strong />}
                </div>

                {/* Narration lane */}
                <div className="relative h-8 shrink-0">
                  {narrationTrack.map((seg) => {
                    const a = assetById.get(seg.asset_id)
                    const w = seg.duration * scale
                    return (
                      <div
                        key={seg.asset_id + seg.start}
                        className="pointer-events-none absolute inset-y-0 overflow-hidden rounded-md border border-brand-cyan/50 bg-brand-cyan/20"
                        style={{ left: seg.start * scale, width: w - 2 }}
                        title={a?.filename}
                      >
                        <Waveform seed={seg.asset_id} width={w} className="bg-brand-cyan/80" />
                        <span className="absolute left-1.5 top-0.5 truncate font-mono text-[9px] font-semibold text-brand-cyan">
                          {a?.filename} · {formatTime(seg.duration)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Extra audio lane */}
                <div
                  className={cn(laneClass('audio'), 'mb-1 mt-1 h-8 shrink-0')}
                  onDragOver={laneDragOver('audio')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('audio')}
                >
                  {audioClips.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
                      Arraste música ou efeito sonoro aqui
                    </span>
                  )}
                  {audioClips.map((c) => {
                    const a = assetById.get(c.asset_id)
                    return (
                      <LaneClip
                        key={c.id}
                        id={c.id}
                        start={c.start}
                        duration={c.duration}
                        pps={scale}
                        tone="audio"
                        label={a?.filename || 'áudio removido'}
                        meta={`${Math.round(c.volume * 100)}%${c.speed !== 1 ? ` · ${c.speed.toFixed(2)}×` : ''}`}
                        selected={isSelected('audio', c.id)}
                        maxDuration={sourceMax(c.asset_id, c.speed)}
                        snapTo={snapWithPlayhead()}
                        onSelect={() => select({ kind: 'audio', id: c.id })}
                        onCommit={(p) => tracks.updateAudio(c.id, p)}
                      />
                    )
                  })}
                  {dropHint?.lane === 'audio' && <DropMarker x={dropHint.time * scale} />}
                </div>

                <Playhead pps={scale} scroller={scroller} onGrab={startScrub} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DropMarker({ x, strong }: { x: number; strong?: boolean }) {
  return (
    <span
      className={cn('pointer-events-none absolute -bottom-0.5 -top-0.5 z-30 w-[3px] -translate-x-1/2 rounded-full bg-primary', strong && 'shadow-[0_0_12px_hsl(var(--primary))]')}
      style={{ left: x }}
      aria-hidden
    />
  )
}
