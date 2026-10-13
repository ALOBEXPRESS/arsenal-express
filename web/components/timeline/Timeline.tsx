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
  SlidersVertical,
  X,
  Scissors,
  Type,
  Image as ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteScene, useReorderScenes, useInsertScene, type AutoAssembleMode, usePatchScene } from '@/lib/hooks/useScenes'
import { newClipId, type Tracks } from '@/lib/hooks/useTracks'
import { useSFXManifest } from '@/hooks/useSFXManifest'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/components/ui/confirm'
import { buildTimeline, totalDuration, formatTime, formatClock, type TimedScene } from '@/lib/timeline'
import { normalizeAnimation, normalizeTransition, ANIMATION_BY_ID, TRANSITION_BY_ID } from '@/lib/sync/presets'
import { usePlayhead } from '@/lib/stores/playhead'
import { useDragAsset, ASSET_MIME } from '@/lib/stores/drag'
import { useSelection } from '@/lib/stores/selection'
import type { AdjustClip, Asset, AudioClip, NarrationSegment, OverlayClip, Scene, Subproject } from '@/types/project'
import { LOOK_BY_ID, LOOKS, matchesLook } from '@/lib/sync/adjust'
import { cn } from '@/lib/utils'

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
  subprojects: Subproject[]
  activeSub: string
  onSelectSub: (id: string) => void
  onAddSub: () => void
  onRenameSub: (id: string, name: string) => void
  onRemoveSub: (id: string) => void
  /** metadata.sub for scenes created on this timeline */
  subId: string
}

type Lane = 'main' | 'overlay' | 'audio' | 'sfx' | 'adjust' | 'narration'

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
    <div className="absolute bottom-0 top-0 z-30 w-0 pointer-events-none" style={{ left: x }}>
      {/* Line with glow effect */}
      <div 
        className="absolute -left-0.5 bottom-0 top-0 w-0.5 bg-gradient-to-b from-brand-cyan via-brand-cyan to-brand-cyan/60 shadow-[0_0_12px_rgba(34,211,238,0.6)]" 
        aria-hidden 
      />
      {/* Draggable head */}
      <span
        role="slider"
        aria-label="Agulha da timeline (arraste)"
        aria-valuenow={Math.round(time)}
        tabIndex={-1}
        onPointerDown={onGrab}
        className="absolute -left-2.5 -top-1 h-5 w-5 cursor-ew-resize touch-none rounded-md bg-gradient-to-br from-brand-cyan to-cyan-600 shadow-lg shadow-brand-cyan/40 pointer-events-auto transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
      >
        <div className="h-2 w-2 rounded-sm bg-white/90" />
      </span>
      {/* Wide invisible grab area */}
      <div
        role="slider"
        aria-label="Agulha da timeline (arraste)"
        aria-valuenow={Math.round(time)}
        tabIndex={-1}
        onPointerDown={onGrab}
        className="absolute -left-[10px] bottom-0 top-0 w-[20px] cursor-ew-resize touch-none pointer-events-auto"
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
        <span key={i} className={cn('w-[2px] shrink-0 rounded-full', className)} style={{ height: `${h(i).toFixed(2)}%` }} />
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
  onTrim: (newDuration: number, newAudioStart?: number) => void
}

function ClipBlock({ item, pps, active, selected, dragging, onSelect, onEdit, onDelete, onDragStart, onDragEnd, onTrim }: ClipBlockProps) {
  const media: Asset | undefined = item.videoAsset || item.imageAsset
  const thumb = (media?.metadata?.thumbnail as string | undefined) || (item.imageAsset ? item.imageAsset.url : undefined)
  
  const width = Math.max(item.duration * pps, 6)
  const anim = ANIMATION_BY_ID.get(normalizeAnimation(item.scene.animation_type) as never)
  const name = media?.filename.replace(/\.[^.]+$/, '') || item.scene.narration_text
  const compact = width < 90
  const [draft, setDraft] = useState<{ duration: number; audioStart?: number } | null>(null)
  const d = draft?.duration ?? item.duration
  const audioStart = draft?.audioStart ?? (item.scene.audio_start || 0)

  const beginTrim = (e: React.PointerEvent, edge: 'start' | 'end') => {
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let latest = { duration: item.duration, audioStart: item.scene.audio_start || 0 }
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pps
      
      if (edge === 'end') {
        // Trim end: adjust duration
        let nd = Math.max(0.2, item.duration + dt)
        // Limit to source duration if video
        const sourceDur = media?.duration
        if (sourceDur && media?.type === 'video') {
          const rate = item.rate || 1
          nd = Math.min(nd, sourceDur / rate - latest.audioStart)
        }
        latest = { duration: Math.round(nd * 1000) / 1000, audioStart: latest.audioStart }
      } else {
        // Trim start: adjust audio_start offset + reduce duration
        let newStart = Math.max(0, (item.scene.audio_start || 0) + dt)
        const sourceDur = media?.duration
        if (sourceDur && media?.type === 'video') {
          const rate = item.rate || 1
          newStart = Math.min(newStart, sourceDur / rate - 0.2)
        }
        const deltaStart = newStart - (item.scene.audio_start || 0)
        latest = {
          audioStart: Math.round(newStart * 1000) / 1000,
          duration: Math.max(0.2, item.duration - deltaStart),
        }
      }
      setDraft(latest)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setDraft(null)
      if (latest.duration !== item.duration || latest.audioStart !== (item.scene.audio_start || 0)) {
        onTrim(latest.duration, latest.audioStart)
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

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
        'group relative cursor-pointer overflow-hidden rounded-lg shadow-lg transition-all duration-200',
        selected 
          ? 'z-10 ring-2 ring-brand-cyan ring-offset-2 ring-offset-neutral-900 scale-[1.02]' 
          : active 
            ? 'z-10 ring-2 ring-violet-500 ring-offset-1 ring-offset-neutral-900' 
            : 'hover:ring-1 hover:ring-white/30 hover:shadow-xl',
        dragging && 'opacity-50 scale-95'
      )}
      style={{ 
        position: 'absolute',
        bottom: 4,
        top: 4,
        left: item.start * pps + 2, 
        width: d * pps - 4,
        minWidth: 32
      }}
    >
      {/* Background with gradient overlay */}
      {thumb ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${thumb})`,
              filter: 'brightness(0.85) contrast(1.1)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-blue-900/20 to-purple-900/30">
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
            {media?.type === 'video' ? (
              <Film className="h-12 w-12 text-white" strokeWidth={1.5} aria-hidden />
            ) : (
              <ImageIcon className="h-12 w-12 text-white" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
          <div 
            className="absolute inset-0 opacity-20" 
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.03) 10px, rgba(255,255,255,.03) 20px)'
            }}
          />
        </div>
      )}

      {/* Content overlay */}
      <div className="relative flex h-full flex-col justify-between p-2 text-shadow">
        {/* Top badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold backdrop-blur-sm',
              active 
                ? 'bg-violet-500/90 text-white shadow-lg shadow-violet-500/50' 
                : 'bg-black/70 text-white/95'
            )}
          >
            {String(item.index + 1).padStart(2, '0')}
          </span>
          {!compact && anim && (
            <span 
              className="inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-cyan-300"
              title={`Animação: ${anim.label}`}
            >
              <Sparkles className="h-3 w-3" aria-hidden /> 
              <span className="hidden sm:inline">{anim.label}</span>
            </span>
          )}
          {!compact && item.manualSpeed && (
            <span 
              className="inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 font-mono text-[10px] text-amber-300"
              title="Velocidade manual"
            >
              <Gauge className="h-3 w-3" aria-hidden /> {item.rate.toFixed(2)}×
            </span>
          )}
        </div>

        {/* Bottom info */}
        {!compact && (
          <div className="space-y-0.5">
            <p className="truncate text-xs font-semibold text-white drop-shadow-lg">
              {name}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-white/80">
              {item.duration.toFixed(1)}s
              {!item.manualSpeed && item.rate < 1 && (
                <span className="ml-1 text-white/60">· {item.rate.toFixed(2)}×</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="rounded-md bg-black/80 backdrop-blur-sm p-1.5 text-white transition-colors hover:bg-violet-600 hover:shadow-lg"
          aria-label={`Editar cena ${item.index + 1}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded-md bg-black/80 backdrop-blur-sm p-1.5 text-white transition-colors hover:bg-red-600 hover:shadow-lg"
          aria-label={`Excluir cena ${item.index + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Trim handles with visual indicators */}
      <span
        className="absolute inset-y-0 left-0 w-4 cursor-ew-resize bg-gradient-to-r from-brand-cyan/0 via-brand-cyan/20 to-transparent opacity-0 transition-opacity hover:opacity-100 active:opacity-100 group-hover:opacity-60"
        aria-label="Arraste para cortar início"
        onPointerDown={(e) => beginTrim(e, 'start')}
      >
        <div className="absolute left-1 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-brand-cyan shadow-lg shadow-brand-cyan/50" />
      </span>
      <span
        className="absolute inset-y-0 right-0 w-4 cursor-ew-resize bg-gradient-to-l from-brand-cyan/0 via-brand-cyan/20 to-transparent opacity-0 transition-opacity hover:opacity-100 active:opacity-100 group-hover:opacity-60"
        aria-label="Arraste para cortar fim"
        onPointerDown={(e) => beginTrim(e, 'end')}
      >
        <div className="absolute right-1 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-brand-cyan shadow-lg shadow-brand-cyan/50" />
      </span>
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
  tone: 'overlay' | 'audio' | 'adjust'
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
        'group relative cursor-grab touch-none overflow-hidden rounded-lg shadow-md transition-all duration-150 active:cursor-grabbing active:shadow-xl',
        tone === 'overlay'
          ? 'bg-gradient-to-br from-violet-500/40 via-purple-500/30 to-violet-600/40 border border-violet-400/50'
          : tone === 'adjust'
            ? 'bg-gradient-to-r from-brand-cyan/30 via-violet-500/25 to-brand-pink/30 border border-brand-cyan/60'
            : 'bg-gradient-to-br from-emerald-500/30 via-green-500/25 to-teal-500/30 border border-emerald-400/50',
        selected && 'z-10 ring-2 ring-brand-cyan ring-offset-1 ring-offset-neutral-900 scale-[1.02]',
        draft && 'z-20 shadow-2xl scale-105'
      )}
      style={{ 
        position: 'absolute',
        top: 4,
        bottom: 4,
        left: s * pps + 2, 
        width: width - 4,
        minWidth: 24
      }}
      data-id={id}
    >
      {/* Background thumbnail or pattern */}
      {thumb ? (
        <>
          <div
            className="absolute inset-0 opacity-60 bg-cover bg-center"
            style={{ backgroundImage: `url(${thumb})`, filter: 'brightness(0.8)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
        </>
      ) : tone === 'audio' ? (
        <Waveform seed={id} width={width} className="bg-emerald-400/70" />
      ) : (
        <div 
          className="absolute inset-0 opacity-30" 
          style={{
            backgroundImage: tone === 'overlay'
              ? 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(139, 92, 246, 0.15) 8px, rgba(139, 92, 246, 0.15) 16px)'
              : 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(16, 185, 129, 0.15) 8px, rgba(16, 185, 129, 0.15) 16px)'
          }}
        />
      )}

      {/* Content */}
      <div className="relative flex items-center h-full px-2">
        <span className="truncate font-mono text-[10px] font-semibold text-white drop-shadow-lg">
          {label}
        </span>
        {meta && (
          <span className="ml-1.5 font-mono text-[9px] text-white/70 drop-shadow">
            {meta}
          </span>
        )}
      </div>

      {/* Trim handle with visual indicator */}
      <span
        onPointerDown={(e) => begin(e, 'trim')}
        className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-gradient-to-l from-white/0 via-white/10 to-transparent opacity-0 transition-opacity hover:opacity-100 active:opacity-100 group-hover:opacity-60"
        aria-hidden
      >
        <div className="absolute right-0.5 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-white/80 shadow-lg" />
      </span>
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
  subprojects,
  activeSub,
  onSelectSub,
  onAddSub,
  onRenameSub,
  onRemoveSub,
  subId,
}: TimelineProps) {
  const deleteScene = useDeleteScene()
  const reorderScenes = useReorderScenes()
  const insertScene = useInsertScene()
  const patchScene = usePatchScene(projectId)
  const dragAsset = useDragAsset((s) => s.asset)
  const { selection, select } = useSelection()
  const { data: sfxManifest } = useSFXManifest()
  const [draggedScene, setDraggedScene] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<{ lane: Lane; time: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [pps, setPps] = useState<number | null>(null) // null = fit
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)

  // Undo/Redo history for cuts
  const [cutHistory, setCutHistory] = useState<Array<{ sceneId: string; beforeDuration: number; afterDuration: number }>>([])
  const [cutHistoryIndex, setCutHistoryIndex] = useState(-1)

  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  
  // Map SFX IDs to names from manifest
  const sfxById = useMemo(() => {
    const map = new Map<string, string>()
    if (sfxManifest?.effects) {
      sfxManifest.effects.forEach((sfx) => map.set(sfx.id, sfx.name))
    }
    return map
  }, [sfxManifest])
  
  const { overlays, imageOverlays, audioClips, adjustments } = tracks
  
  // Separate audio clips into regular audio and SFX
  const regularAudioClips = useMemo(() => audioClips.filter((c) => !c.asset_id.startsWith('sfx:')), [audioClips])
  const sfxClips = useMemo(() => audioClips.filter((c) => c.asset_id.startsWith('sfx:')), [audioClips])
  
  const sceneEnd = totalDuration(timeline)
  const narrationEndT = narrationTrack.reduce((a, s) => Math.max(a, s.start + s.duration), 0)
  const total = Math.max(
    sceneEnd,
    narrationEndT,
    ...overlays.map((o) => o.start + o.duration),
    ...imageOverlays.map((o) => o.start + o.duration),
    ...regularAudioClips.map((c) => c.start + c.duration),
    ...sfxClips.map((c) => c.start + c.duration),
    ...adjustments.map((c) => c.start + c.duration),
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
    regularAudioClips.forEach((c) => pts.push(c.start, c.start + c.duration))
    sfxClips.forEach((c) => pts.push(c.start, c.start + c.duration))
    adjustments.forEach((c) => pts.push(c.start, c.start + c.duration))
    narrationTrack.forEach((n) => pts.push(n.start, n.start + n.duration))
    return pts
  }, [timeline, overlays, regularAudioClips, sfxClips, adjustments, narrationTrack])
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
    else if (selection.kind === 'adjust') tracks.removeAdjust(selection.id)
    else if (selection.kind === 'narration') {
      const seg = narrationTrack[Number(selection.id)]
      const name = seg ? assetById.get(seg.asset_id)?.filename : undefined
      void confirmDialog({
        title: `Tirar ${name ? `“${name}”` : 'esse áudio'} da narração?`,
        description: 'Os próximos áudios andam pra trás. As cenas não mudam — use “Juntar com áudio” pra ressincronizar.',
        confirmLabel: 'Tirar da narração',
        tone: 'danger',
      }).then((ok) => {
        if (!ok) return
        tracks.removeNarration(Number(selection.id))
        select(null)
      })
      return
    } else {
      const item = timeline.find((t) => t.scene.id === selection.id)
      if (item) void removeScene(item.scene, item.index)
      return
    }
    select(null)
  }, [selection, tracks, timeline, removeScene, select, narrationTrack, assetById])

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

  const addAdjust = () => {
    const at = Math.min(usePlayhead.getState().time, Math.max(0, total - 0.5))
    const end = sceneEnd > at + 1 ? sceneEnd : at + 5
    const look = LOOKS[0]
    const clip: AdjustClip = {
      id: newClipId(),
      start: Math.round(at * 1000) / 1000,
      duration: Math.round(Math.max(1, end - at) * 1000) / 1000,
      look: look.id,
      ...look.values,
      filter_intensity: 1,
    }
    tracks.addAdjust(clip)
    select({ kind: 'adjust', id: clip.id })
    toast.success('Camada de ajuste adicionada', { description: `${look.label} · escolha outro filtro no painel à direita.` })
  }

  const appendNarration = (asset: Asset) => {
    if (!asset.duration) {
      toast.error('Áudio sem duração', { description: 'Remova e faça upload novamente.' })
      return
    }
    tracks.appendNarration(asset)
    toast.success('Narração adicionada', { description: `${asset.filename} no fim da narração deste subprojeto.` })
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
          metadata: { sub: subId, video_filename: asset.filename, clip_duration: asset.duration },
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

  const laneDragOver = (lane: Lane) => (e: React.DragEvent) => {
    const types = e.dataTransfer.types
    const isScene = types.includes(SCENE_MIME)
    const isAsset = types.includes(ASSET_MIME)
    if (!isScene && !isAsset) return
    if (isScene && lane !== 'main') return
    if (lane === 'adjust') return
    e.preventDefault()
    e.dataTransfer.dropEffect = isScene ? 'move' : 'copy'
    const t = timeAt(e.clientX)
    const isAudio = dragAsset?.type === 'audio'
    const effectiveLane: Lane = isAsset && isAudio ? (lane === 'narration' ? 'narration' : 'audio') : lane === 'narration' ? 'main' : lane
    const target =
      effectiveLane === 'narration' ? narrationEndT : isScene || effectiveLane === 'main' ? boundaryTime(insertIndexAt(t)) : t
    if (dropHint?.lane !== effectiveLane || Math.abs((dropHint?.time ?? -1) - target) > 1e-3) setDropHint({ lane: effectiveLane, time: target })
  }

  const laneDrop = (lane: Lane) => (e: React.DragEvent) => {
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
    if (asset.type === 'audio') return lane === 'narration' ? appendNarration(asset) : addAudioClip(asset, t)
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

  const isSelected = (kind: 'scene' | 'overlay' | 'audio' | 'adjust' | 'narration', id: string) =>
    selection?.kind === kind && selection.id === id
  const accepting = (lane: Lane) => {
    if (!dragAsset) return false
    if (dragAsset.type === 'audio') return lane === 'audio' || lane === 'narration' || lane === 'sfx'
    return lane === 'main' || lane === 'overlay'
  }
  const laneClass = (lane: Lane) =>
    cn('relative rounded-md transition-colors', accepting(lane) && 'bg-primary/[0.06] outline outline-1 outline-dashed outline-primary/40')

  const sourceMax = (assetId: string, speed: number) => {
    const a = assetById.get(assetId)
    return a?.type === 'image' || !a?.duration ? undefined : a.duration / (speed || 1)
  }

  // ---- Split scene at playhead ----------------------------------------------------
  const selectedSceneAtPlayhead = useMemo(() => {
    if (activeSceneIndex === undefined) return null
    // Find the scene under the playhead
    const scene = timeline.find((t) => activeSceneIndex >= t.start && activeSceneIndex < t.start + t.duration)
    return scene && scene.videoAsset ? scene.scene : null
  }, [timeline, activeSceneIndex])

  const handleSplitAtPlayhead = useCallback(async () => {
    console.log('[Cut] Starting cut at playhead:', activeSceneIndex)
    
    if (activeSceneIndex === undefined) {
      console.log('[Cut] No playhead position')
      return
    }
    
    const scene = selectedSceneAtPlayhead
    console.log('[Cut] Selected scene:', scene)
    
    if (!scene) {
      toast.info('Nenhuma cena no playhead', { description: 'Posicione o playhead sobre uma cena de vídeo para cortar.' })
      return
    }
    
    const timedScene = timeline.find((t) => t.scene.id === scene.id)
    if (!timedScene) return

    const splitPoint = activeSceneIndex - timedScene.start
    console.log('[Cut] Split point:', splitPoint, 'Scene duration:', timedScene.duration)
    
    if (splitPoint <= 0.1) {
      toast.info('Posição muito próxima do início', { description: 'Mova a linha de tempo para um ponto dentro da cena.' })
      return
    }
    
    if (splitPoint >= timedScene.duration - 0.1) {
      toast.info('Posição muito próxima do fim', { description: 'A cena já termina aqui.' })
      return
    }

    try {
      console.log('[Cut] Cutting scene', scene.id, 'at', splitPoint, 'seconds')
      
      // Save to history before cutting (for undo)
      const newHistory = cutHistory.slice(0, cutHistoryIndex + 1)
      newHistory.push({
        sceneId: scene.id,
        beforeDuration: timedScene.duration, // Original duration before cut
        afterDuration: splitPoint, // New duration after cut
      })
      setCutHistory(newHistory)
      setCutHistoryIndex(newHistory.length - 1)
      
      // Update the scene: reduce the audio_duration
      // This makes the scene shorter and following scenes move up
      patchScene(scene.id, {
        audio_duration: splitPoint,
      })

      const removed = timedScene.duration - splitPoint
      console.log('[Cut] Success! Removed', removed, 'seconds')
      toast.success('Cena cortada', { description: `${removed.toFixed(1)}s removidos · Ctrl+Z para desfazer` })
      select(null)
    } catch (err) {
      console.error('[Cut] Failed:', err)
      toast.error('Falha ao cortar', { description: err instanceof Error ? err.message : 'Erro desconhecido' })
    }
  }, [selectedSceneAtPlayhead, timeline, activeSceneIndex, projectId, select, patchScene, cutHistory, cutHistoryIndex])

  // Undo last cut
  const handleUndo = useCallback(() => {
    if (cutHistoryIndex < 0) {
      toast.info('Nada para desfazer')
      return
    }

    const entry = cutHistory[cutHistoryIndex]
    const scene = scenes.find((s) => s.id === entry.sceneId)
    if (!scene) {
      toast.error('Cena não encontrada')
      return
    }

    console.log('[Undo] Restoring scene', entry.sceneId, 'to duration', entry.beforeDuration)
    patchScene(entry.sceneId, {
      audio_duration: entry.beforeDuration,
    })

    setCutHistoryIndex(cutHistoryIndex - 1)
    toast.success('Corte desfeito', { description: 'Ctrl+Y para refazer' })
  }, [cutHistory, cutHistoryIndex, scenes, patchScene])

  // Redo last undone cut
  const handleRedo = useCallback(() => {
    if (cutHistoryIndex >= cutHistory.length - 1) {
      toast.info('Nada para refazer')
      return
    }

    const nextIndex = cutHistoryIndex + 1
    const entry = cutHistory[nextIndex]
    const scene = scenes.find((s) => s.id === entry.sceneId)
    if (!scene) {
      toast.error('Cena não encontrada')
      return
    }

    console.log('[Redo] Re-applying cut to scene', entry.sceneId, 'duration', entry.afterDuration)
    patchScene(entry.sceneId, {
      audio_duration: entry.afterDuration,
    })

    setCutHistoryIndex(nextIndex)
    toast.success('Corte refeito', { description: 'Ctrl+Z para desfazer' })
  }, [cutHistory, cutHistoryIndex, scenes, patchScene])

  // Keyboard shortcuts for undo/redo and split
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      else if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault()
        handleRedo()
      }
      // Cut: Ctrl+B or S
      else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        handleSplitAtPlayhead()
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        handleSplitAtPlayhead()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSplitAtPlayhead, handleUndo, handleRedo])

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="sr-only">Timeline</h2>
          <div role="tablist" aria-label="Subprojetos" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-0 p-0.5">
            {subprojects.map((sp) => {
              const active = sp.id === activeSub
              const dur = Math.max(
                sp.narration_track.reduce((a, n) => Math.max(a, n.start + n.duration), 0),
                active ? total : 0
              )
              return (
                <div key={sp.id} className="group/tab relative flex shrink-0 items-center">
                  {renaming === sp.id ? (
                    <input
                      autoFocus
                      defaultValue={sp.name}
                      aria-label="Nome do subprojeto"
                      className="h-7 w-36 rounded-md border border-primary bg-surface-1 px-2 font-display text-[13px] font-bold outline-none"
                      onBlur={(e) => {
                        onRenameSub(sp.id, e.currentTarget.value)
                        setRenaming(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onSelectSub(sp.id)}
                      onDoubleClick={() => setRenaming(sp.id)}
                      title="Duplo clique pra renomear"
                      className={cn(
                        'flex h-7 cursor-pointer items-center gap-2 rounded-md px-2.5 transition-colors duration-150',
                        subprojects.length > 1 && 'pr-6',
                        active ? 'bg-surface-3 text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                      )}
                    >
                      <span className="font-display text-[13px] font-bold">{sp.name}</span>
                      <span className="font-mono text-[10px] tabular-nums opacity-80">{formatTime(dur)}</span>
                    </button>
                  )}
                  {subprojects.length > 1 && renaming !== sp.id && (
                    <button
                      type="button"
                      onClick={() => onRemoveSub(sp.id)}
                      aria-label={`Excluir ${sp.name}`}
                      className="absolute right-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-white focus-visible:opacity-100 group-hover/tab:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              onClick={onAddSub}
              aria-label="Novo subprojeto"
              title="Novo subprojeto (vira outra linha do tempo no CapCut)"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
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
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleSplitAtPlayhead} 
            disabled={busy || !selectedSceneAtPlayhead}
            title="Cortar cena na posição atual (Ctrl+B)"
          >
            <Scissors /> Cortar
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={onAddScene} aria-label="Adicionar cena manualmente">
            <Plus />
          </Button>
        </div>
      </div>

      {/* Lanes */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        {isLoading ? (
          <div className="flex gap-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 w-32 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        ) : (
          <div className="relative flex h-full min-h-[400px]" style={{ width: contentWidth + GUTTER }}>
            {/* Sticky lane labels */}
            <div className="sticky left-0 z-40 flex h-full shrink-0 flex-col border-r border-border/80 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-[11px] text-muted-foreground shadow-lg" style={{ width: GUTTER }}>
              <div className="h-7 shrink-0 border-b border-border/50 bg-gradient-to-b from-neutral-900 to-neutral-950" />
              <div className="mt-1.5 flex h-7 shrink-0 items-center gap-1.5 pl-2.5 pr-1 transition-colors hover:bg-white/5">
                <SlidersVertical className="h-3.5 w-3.5 text-brand-cyan" aria-hidden /> 
                <span className="font-medium">Ajuste</span>
                <button
                  type="button"
                  onClick={addAdjust}
                  aria-label="Adicionar camada de ajuste"
                  title="Adicionar camada de ajuste (filtro) no ponto da agulha"
                  className="ml-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-all hover:border-brand-cyan/60 hover:bg-brand-cyan/10 hover:text-brand-cyan"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-1.5 flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Type className="h-3.5 w-3.5 text-amber-400" aria-hidden /> 
                <span className="font-medium">Texto</span>
              </div>
              <div className="mt-1.5 flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Layers className="h-3.5 w-3.5 text-blue-400" aria-hidden /> 
                <span className="font-medium">Overlays</span>
              </div>
              <div className="mt-1.5 flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Layers className="h-3.5 w-3.5 text-violet-400" aria-hidden /> 
                <span className="font-medium">Sobrepor</span>
              </div>
              <div className="flex flex-1 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Clapperboard className="h-3.5 w-3.5 text-blue-500" aria-hidden /> 
                <span className="font-semibold">Mídia</span>
              </div>
              <div className="flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Mic className="h-3.5 w-3.5 text-violet-400" aria-hidden /> 
                <span className="font-medium">Narração</span>
              </div>
              <div className="flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Music className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> 
                <span className="font-medium">Áudio</span>
              </div>
              <div className="mb-1.5 flex h-9 shrink-0 items-center gap-1.5 px-2.5 transition-colors hover:bg-white/5">
                <Sparkles className="h-3.5 w-3.5 text-pink-400" aria-hidden /> 
                <span className="font-medium">SFX</span>
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
                  className="ruler relative h-7 shrink-0 cursor-ew-resize touch-none border-b border-border/50 bg-gradient-to-b from-neutral-900 to-neutral-950"
                  style={{ ['--major' as string]: `${step * scale}px` } as React.CSSProperties}
                  aria-label="Régua de tempo — clique ou arraste para posicionar"
                >
                  {/* Tick marks */}
                  <div className="absolute inset-x-0 bottom-0 h-2 opacity-40">
                    {Array.from({ length: Math.floor((contentWidth - 24) / scale) + 1 }, (_, i) => {
                      const isMajor = i % step === 0
                      return (
                        <div
                          key={i}
                          className={cn(
                            'absolute bottom-0 w-px',
                            isMajor ? 'h-2 bg-white/40' : 'h-1 bg-white/20'
                          )}
                          style={{ left: i * scale }}
                        />
                      )
                    })}
                  </div>
                  {/* Time labels */}
                  {Array.from({ length: Math.floor((contentWidth - 24) / scale / step) + 1 }, (_, i) => (
                    <span 
                      key={i} 
                      className="pointer-events-none absolute top-1 font-mono text-[10px] font-medium tabular-nums text-white/70 drop-shadow-sm" 
                      style={{ left: i * step * scale + 4 }}
                    >
                      {formatTime(i * step)}
                    </span>
                  ))}
                </div>

                {/* Adjustment lane (filters over everything below) */}
                <div className="relative mt-1.5 h-7 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5" onDoubleClick={(e) => {
                  if (!(e.target as HTMLElement).closest('[data-clip]')) addAdjust()
                }}>
                  {adjustments.length === 0 && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Camada de ajuste: clique em + (ou duplo clique aqui) pra pôr um filtro sobre os vídeos
                    </span>
                  )}
                  {adjustments.map((a) => {
                    const look = a.look ? LOOK_BY_ID.get(a.look) : undefined
                    return (
                      <LaneClip
                        key={a.id}
                        id={a.id}
                        start={a.start}
                        duration={a.duration}
                        pps={scale}
                        tone="adjust"
                        label={matchesLook(a) && look ? look.label : 'Ajuste personalizado'}
                        meta={look?.capcutFilter ? 'filtro CapCut' : ''}
                        selected={isSelected('adjust', a.id)}
                        snapTo={snapWithPlayhead()}
                        onSelect={() => select({ kind: 'adjust', id: a.id })}
                        onCommit={(p) => tracks.updateAdjust(a.id, p)}
                      />
                    )
                  })}
                </div>

                {/* Text overlay lane (text bars from assembly) */}
                <div
                  className={cn(laneClass('overlay'), 'relative mt-1.5 h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('overlay')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('overlay')}
                >
                  {overlays.filter(o => o.kind === 'text').length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Barras de texto aparecem aqui
                    </span>
                  )}
                  {overlays.filter(o => o.kind === 'text').map((o) => {
                    return (
                      <LaneClip
                        key={o.id}
                        id={o.id}
                        start={o.start}
                        duration={o.duration}
                        pps={scale}
                        tone="overlay"
                        thumb={undefined}
                        label={o.text_content || 'Texto'}
                        meta=""
                        selected={isSelected('overlay', o.id)}
                        maxDuration={undefined}
                        snapTo={snapWithPlayhead()}
                        onSelect={() => select({ kind: 'overlay', id: o.id })}
                        onCommit={(p) => tracks.updateOverlay(o.id, p)}
                      />
                    )
                  })}
                  {dropHint?.lane === 'overlay' && <DropMarker x={dropHint.time * scale} />}
                </div>

                {/* Image/video overlay lane (from assembly - imageOverlays) */}
                <div
                  className={cn(laneClass('overlay'), 'relative mt-1.5 h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('overlay')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('overlay')}
                >
                  {imageOverlays.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Imagens da montagem aparecem aqui
                    </span>
                  )}
                  {imageOverlays.map((o) => {
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
                        onCommit={(p) => tracks.updateImageOverlay(o.id, p)}
                      />
                    )
                  })}
                  {dropHint?.lane === 'overlay' && <DropMarker x={dropHint.time * scale} />}
                </div>

                {/* Manual overlay lane (Sobrepor - user dragged) */}
                <div
                  className={cn(laneClass('overlay'), 'relative mt-1.5 h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('overlay')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('overlay')}
                >
                  {overlays.filter(o => o.kind !== 'text').length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Arraste uma imagem ou vídeo aqui pra sobrepor
                    </span>
                  )}
                  {overlays.filter(o => o.kind !== 'text').map((o) => {
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
                  className={cn(laneClass('main'), 'relative my-2 flex-1 min-h-[100px] rounded-lg bg-gradient-to-b from-neutral-900/50 to-neutral-950/30 border border-white/10 shadow-inner')}
                  onDragOver={laneDragOver('main')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('main')}
                >
                  {timeline.length === 0 && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center text-[13px] text-muted-foreground" style={{ width: Math.min(viewport, contentWidth - 24) }}>
                      {narrationTrack.length > 0 ? (
                        <span className="mx-auto px-4 text-center">
                          Narração pronta — arraste os clipes dela pra cá ou clique em <span className="text-violet-400 font-semibold">Juntar com áudio</span>
                        </span>
                      ) : (
                        <span className="mx-auto rounded-lg border-2 border-dashed border-white/20 bg-black/20 backdrop-blur-sm px-6 py-4 text-center">
                          Clique em <span className="text-violet-400 font-semibold">Juntar com áudio</span> ou arraste clipes da biblioteca pra cá
                        </span>
                      )}
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
                      onTrim={(newDuration, newAudioStart) => {
                        const patch: Partial<Scene> = { audio_duration: newDuration }
                        if (newAudioStart !== undefined) patch.audio_start = newAudioStart
                        patchScene(item.scene.id, patch)
                        toast.success('Cena cortada', { description: `${newDuration.toFixed(2)}s` })
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
                  {timeline.length > 0 && narrationEndT > sceneEnd + 0.5 && (
                    <div
                      className="pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border border-dashed border-primary/40 bg-primary/[0.04] px-2 text-center text-[11px] text-muted-foreground"
                      style={{ left: sceneEnd * scale + 2, width: (narrationEndT - sceneEnd) * scale - 4 }}
                    >
                      <span className="truncate">
                        {formatTime(narrationEndT - sceneEnd)} de narração sem cenas — arraste clipes aqui
                      </span>
                    </div>
                  )}
                  {timeline.length === 0 && narrationTrack.length > 0 && (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center rounded-md border border-dashed border-primary/40 bg-primary/[0.04] text-[12px] text-muted-foreground"
                      style={{ width: narrationEndT * scale }}
                    />
                  )}
                  {dropHint?.lane === 'main' && <DropMarker x={dropHint.time * scale} strong />}
                </div>

                {/* Narration lane (drop an audio to append it) */}
                <div
                  className={cn(laneClass('narration'), 'relative h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('narration')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('narration')}
                >
                  {narrationTrack.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Arraste a narração deste subprojeto aqui
                    </span>
                  )}
                  {narrationTrack.map((seg, i) => {
                    const a = assetById.get(seg.asset_id)
                    const w = seg.duration * scale
                    const sel = isSelected('narration', String(i))
                    return (
                      <div
                        key={seg.asset_id + seg.start}
                        data-clip
                        role="button"
                        tabIndex={0}
                        aria-pressed={sel}
                        aria-label={`Narração ${a?.filename ?? ''}, ${formatClock(seg.start)} a ${formatClock(seg.start + seg.duration)}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          select({ kind: 'narration', id: String(i) })
                          onSeek(timeAt(e.clientX))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            select({ kind: 'narration', id: String(i) })
                          }
                        }}
                        className={cn(
                          'absolute inset-y-0 cursor-pointer overflow-hidden rounded-md border bg-brand-cyan/20',
                          sel ? 'z-10 border-brand-cyan ring-1 ring-brand-cyan' : 'border-brand-cyan/50 hover:border-brand-cyan'
                        )}
                        style={{ left: seg.start * scale, width: w - 2 }}
                        title={a?.filename}
                      >
                        <Waveform seed={seg.asset_id} width={w} className="bg-brand-cyan/80" />
                        <span className="pointer-events-none absolute left-1.5 top-0.5 truncate font-mono text-[9px] font-semibold text-brand-cyan">
                          {a?.filename} · {formatTime(seg.duration)}
                        </span>
                      </div>
                    )
                  })}
                  {dropHint?.lane === 'narration' && <DropMarker x={dropHint.time * scale} />}
                </div>

                {/* Extra audio lane */}
                <div
                  className={cn(laneClass('audio'), 'relative mt-1.5 h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('audio')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('audio')}
                >
                  {regularAudioClips.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Arraste música ou efeito sonoro aqui
                    </span>
                  )}
                  {regularAudioClips.map((c) => {
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

                {/* SFX lane (sound effects) */}
                <div
                  className={cn(laneClass('sfx'), 'relative mb-1.5 mt-1.5 h-9 shrink-0 rounded-lg bg-neutral-950/40 border border-white/5')}
                  onDragOver={laneDragOver('sfx')}
                  onDragLeave={laneDragLeave}
                  onDrop={laneDrop('sfx')}
                >
                  {sfxClips.length === 0 && !dragAsset && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 italic">
                      Efeitos sonoros adicionados aparecem aqui
                    </span>
                  )}
                  {sfxClips.map((c) => {
                    // Extract effect ID from sfx:effect-id reference
                    const effectId = c.asset_id.startsWith('sfx:') ? c.asset_id.substring(4) : c.asset_id
                    const sfxName = sfxById.get(effectId) || effectId
                    return (
                      <LaneClip
                        key={c.id}
                        id={c.id}
                        start={c.start}
                        duration={c.duration}
                        pps={scale}
                        tone="audio"
                        label={sfxName}
                        meta={`${Math.round(c.volume * 100)}%`}
                        selected={isSelected('audio', c.id)}
                        maxDuration={sourceMax(c.asset_id, c.speed)}
                        snapTo={snapWithPlayhead()}
                        onSelect={() => select({ kind: 'audio', id: c.id })}
                        onCommit={(p) => tracks.updateAudio(c.id, p)}
                      />
                    )
                  })}
                  {dropHint?.lane === 'sfx' && <DropMarker x={dropHint.time * scale} />}
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
