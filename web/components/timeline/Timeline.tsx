'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import { useScenes, useDeleteScene, useReorderScenes, type AutoAssembleMode } from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import { Button } from '@/components/ui/button'
import { buildTimeline, totalDuration, formatTime, type TimedScene } from '@/lib/timeline'
import { normalizeAnimation, normalizeTransition, ANIMATION_BY_ID, TRANSITION_BY_ID } from '@/lib/sync/presets'
import { usePlayhead } from '@/lib/stores/playhead'
import type { Asset, NarrationSegment, Scene } from '@/types/project'
import { cn } from '@/lib/utils'

interface TimelineProps {
  projectId: string
  narrationTrack: NarrationSegment[]
  activeSceneIndex?: number
  onSelectScene?: (index: number) => void
  onSeek?: (time: number) => void
  onAddScene?: () => void
  onEditScene?: (scene: Scene) => void
  onOpenAssembly?: () => void
  onAssemble: (mode: AutoAssembleMode) => void
  busy: boolean
  status?: string
}

const GUTTER = 76
const MIN_PPS = 4
const MAX_PPS = 120

function rulerStep(pps: number) {
  // seconds between labels so labels are >= ~70px apart
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120]) if (s * pps >= 70) return s
  return 300
}

/** Playhead subscribes to the store on its own so lanes don't re-render every frame */
function Playhead({ pps, scroller }: { pps: number; scroller: React.RefObject<HTMLDivElement | null> }) {
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
    <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-brand-cyan shadow-[0_0_10px_hsl(var(--brand-cyan))]" style={{ left: x }} aria-hidden>
      <span className="absolute -left-[5px] -top-0.5 h-3 w-3 rotate-45 rounded-[2px] bg-brand-cyan" />
    </div>
  )
}

function Waveform({ seed, width }: { seed: string; width: number }) {
  const bars = Math.max(4, Math.floor(width / 4))
  const h = (i: number) => 22 + Math.abs(Math.sin(i * 0.61 + seed.charCodeAt(i % seed.length)) * Math.cos(i * 0.17)) * 70
  return (
    <div className="absolute inset-x-1 inset-y-1.5 flex items-center gap-[2px] overflow-hidden" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="w-[2px] shrink-0 rounded-full bg-brand-cyan/80" style={{ height: `${h(i)}%` }} />
      ))}
    </div>
  )
}

interface ClipBlockProps {
  item: TimedScene
  pps: number
  active: boolean
  dragging: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function ClipBlock({ item, pps, active, dragging, onSelect, onEdit, onDelete, onDragStart, onDragEnter, onDragEnd }: ClipBlockProps) {
  const media: Asset | undefined = item.videoAsset || item.imageAsset
  const thumb = media?.metadata?.thumbnail as string | undefined
  const width = Math.max(item.duration * pps, 6)
  const anim = ANIMATION_BY_ID.get(normalizeAnimation(item.scene.animation_type) as never)
  const name = media?.filename.replace(/\.[^.]+$/, '') || item.scene.narration_text
  const compact = width < 90

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Cena ${item.index + 1}: ${name}, ${item.duration.toFixed(1)} segundos`}
      aria-pressed={active}
      draggable
      onClick={onSelect}
      onDoubleClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEdit()
        if (e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      title={`${media?.filename ?? ''} · ${item.duration.toFixed(2)}s · duplo clique pra editar`}
      className={cn(
        'group absolute bottom-0 top-0 cursor-pointer overflow-hidden rounded-md border transition-[border-color,opacity] duration-150',
        active ? 'z-10 border-primary ring-1 ring-primary' : 'border-white/10 hover:border-white/40',
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
          <span className={cn('rounded px-1 font-mono text-[10px] font-semibold', active ? 'bg-primary-fill text-primary-foreground' : 'bg-black/60 text-white/90')}>
            {String(item.index + 1).padStart(3, '0')}
          </span>
          {!compact && anim && (
            <span className="flex items-center gap-0.5 rounded bg-black/60 px-1 text-[9px] text-white/85" title={`Animação: ${anim.label}`}>
              <Sparkles className="h-2.5 w-2.5" aria-hidden /> {anim.label}
            </span>
          )}
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-white">{name}</p>
            <p className="font-mono text-[10px] tabular-nums text-white/70">
              {item.duration.toFixed(1)}s{item.rate < 1 && ` · ${item.rate.toFixed(2)}×`}
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
            if (confirm(`Excluir a cena ${item.index + 1}?`)) onDelete()
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

export function Timeline({
  projectId,
  narrationTrack,
  activeSceneIndex,
  onSelectScene,
  onSeek,
  onAddScene,
  onEditScene,
  onOpenAssembly,
  onAssemble,
  busy,
  status,
}: TimelineProps) {
  const { data: scenes, isLoading } = useScenes(projectId)
  const { data: assets } = useAssets(projectId)
  const deleteScene = useDeleteScene()
  const reorderScenes = useReorderScenes()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [pps, setPps] = useState<number | null>(null) // null = fit
  const scroller = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)

  const timeline = useMemo(() => buildTimeline(scenes || [], assets || []), [scenes, assets])
  const total = Math.max(totalDuration(timeline), narrationTrack.reduce((a, s) => Math.max(a, s.start + s.duration), 0))
  const assetById = useMemo(() => new Map((assets || []).map((a) => [a.id, a])), [assets])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewport(el.clientWidth - GUTTER - 24))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitPps = total > 0 ? Math.min(MAX_PPS, Math.max(MIN_PPS, viewport / total)) : 24
  const scale = pps ?? fitPps
  const contentWidth = Math.max(viewport, total * scale + 40)
  const step = rulerStep(scale)

  const zoom = (factor: number) => setPps(Math.min(MAX_PPS, Math.max(MIN_PPS, scale * factor)))

  const handleDragEnter = (index: number) => {
    if (draggedIndex === null || draggedIndex === index || !scenes) return
    const next = [...scenes]
    const [moved] = next.splice(draggedIndex, 1)
    next.splice(index, 0, moved)
    reorderScenes.mutate({ projectId, scenes: next.map((s, i) => ({ ...s, order_index: i })) })
    setDraggedIndex(index)
  }

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek?.(Math.max(0, Math.min(total, (e.clientX - rect.left) / scale)))
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
          <div className="relative flex h-full min-h-[150px]" style={{ width: contentWidth + GUTTER }}>
            {/* Sticky lane labels */}
            <div className="sticky left-0 z-30 flex h-full shrink-0 flex-col border-r border-border bg-surface-1" style={{ width: GUTTER }}>
              <div className="h-6 border-b border-border" />
              <div className="flex flex-1 items-center gap-1.5 px-2.5 text-[11px] text-muted-foreground">
                <Clapperboard className="h-3.5 w-3.5 text-track-video" aria-hidden /> Mídia
              </div>
              <div className="flex h-11 items-center gap-1.5 px-2.5 text-[11px] text-muted-foreground">
                <Mic className="h-3.5 w-3.5 text-track-audio" aria-hidden /> Narração
              </div>
            </div>

            <div className="relative h-full flex-1 px-3">
              <div className="relative flex h-full flex-col" style={{ width: contentWidth - 24 }}>
                {/* Ruler (click to seek) */}
                <div
                  className="ruler relative h-6 shrink-0 cursor-pointer border-b border-border"
                  style={{ ['--major' as string]: `${step * scale}px` } as React.CSSProperties}
                  onClick={seekFromEvent}
                  aria-label="Régua de tempo — clique para posicionar"
                >
                  {Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => (
                    <span key={i} className="absolute top-0.5 font-mono text-[9px] tabular-nums text-muted-foreground" style={{ left: i * step * scale + 3 }}>
                      {formatTime(i * step)}
                    </span>
                  ))}
                </div>

                {/* Video lane */}
                <div className="relative my-1.5 flex-1">
                  {timeline.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-border text-[13px] text-muted-foreground">
                      Clique em <span className="mx-1 text-primary">Juntar com áudio</span> pra montar a timeline
                    </div>
                  )}
                  {timeline.map((item) => (
                    <ClipBlock
                      key={item.scene.id}
                      item={item}
                      pps={scale}
                      active={activeSceneIndex === item.index}
                      dragging={draggedIndex === item.index}
                      onSelect={() => onSelectScene?.(item.index)}
                      onEdit={() => onEditScene?.(item.scene)}
                      onDelete={() => deleteScene.mutate(item.scene)}
                      onDragStart={(e) => {
                        setDraggedIndex(item.index)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault()
                        handleDragEnter(item.index)
                      }}
                      onDragEnd={() => setDraggedIndex(null)}
                    />
                  ))}
                  {/* transition markers */}
                  {timeline.slice(1).map((item) => {
                    const tr = normalizeTransition(item.scene.transition_in)
                    if (tr === 'cut') return null
                    return (
                      <span
                        key={`tr-${item.scene.id}`}
                        className="absolute top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-surface-0 bg-express"
                        style={{ left: item.start * scale - 1 }}
                        title={`Transição: ${TRANSITION_BY_ID.get(tr as never)?.label}`}
                        aria-hidden
                      />
                    )
                  })}
                </div>

                {/* Narration lane */}
                <div className="relative mb-1.5 h-9 shrink-0">
                  {narrationTrack.map((seg) => {
                    const a = assetById.get(seg.asset_id)
                    const w = seg.duration * scale
                    return (
                      <div
                        key={seg.asset_id + seg.start}
                        className="absolute inset-y-0 overflow-hidden rounded-md border border-brand-cyan/50 bg-brand-cyan/20"
                        style={{ left: seg.start * scale, width: w - 2 }}
                        title={a?.filename}
                      >
                        <Waveform seed={seg.asset_id} width={w} />
                        <span className="absolute left-1.5 top-0.5 truncate font-mono text-[9px] font-semibold text-brand-cyan">
                          {a?.filename} · {formatTime(seg.duration)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <Playhead pps={scale} scroller={scroller} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
