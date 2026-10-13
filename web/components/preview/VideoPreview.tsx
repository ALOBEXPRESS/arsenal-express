'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Scene, Asset, NarrationSegment, OverlayClip, AudioClip, AdjustClip } from '@/types/project'
import { Play, Pause, Mic, Clock, Info, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import {
  buildTimeline,
  totalDuration,
  sceneAt,
  narrationAt,
  sceneProps,
  formatTime,
  formatTimecode,
  TRANSITION_DURATION,
  type TimedScene,
} from '@/lib/timeline'
import { normalizeTransition } from '@/lib/sync/presets'
import { animationPose, poseToTransform, transitionStyle } from '@/lib/sync/visual'
import { usePlayhead } from '@/lib/stores/playhead'
import { adjustmentsAt, adjustStyle } from '@/lib/sync/adjust'
import { cn } from '@/lib/utils'
import { useSFXManifest } from '@/hooks/useSFXManifest'

interface VideoPreviewProps {
  scenes: Scene[]
  assets: Asset[]
  narrationTrack?: NarrationSegment[]
  overlays?: OverlayClip[]
  imageOverlays?: OverlayClip[]
  audioClips?: AudioClip[]
  /** adjustment layers (filters) applied over the main track + overlays */
  adjustments?: AdjustClip[]
  /** Change `nonce` to request a seek to `time` (e.g. clicking a scene card) */
  seekRequest?: { time: number; nonce: number }
  onSceneChange?: (index: number) => void
  transitionDuration?: number
  /** Output frame; "auto" follows the clips */
  format?: string
  selectedOverlayId?: string | null
  onSelectOverlay?: (id: string) => void
  /** Overlay moved by dragging it on the monitor (committed on pointer up) */
  onOverlayChange?: (id: string, patch: Partial<OverlayClip>) => void
  /** Manual bar height (0 = auto) */
  overlayBarHeight?: number
}

// Clip audio is kept low under narration (config.yaml -> audio.clipes.volume_db: -18)
export const CLIP_VOLUME_UNDER_NARRATION = 0.125
const DRIFT_TOLERANCE = 0.3
const HARD_SEEK = 0.6

function safePlay(el: HTMLMediaElement) {
  if (!el.paused) return
  el.play().catch((err: DOMException) => {
    // AbortError = play() interrupted by pause()/src change; harmless during scrubbing
    if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
      console.warn('[Preview] play() failed:', err)
    }
  })
}

function hasTransition(item?: TimedScene) {
  return !!item && item.index > 0 && normalizeTransition(item.scene.transition_in) !== 'cut'
}

/**
 * Keeps a media element on the master clock.
 * local = position inside the source; end = last playable second.
 */
function syncMedia(el: HTMLMediaElement, local: number, rate: number, playing: boolean, active: boolean, end = Infinity) {
  if (!active || local < 0) {
    if (!el.paused) el.pause()
    if (el.currentTime > 0.05 && el.readyState > 0 && local < 0) el.currentTime = 0
    return
  }
  if (local >= end) {
    // source shorter than the slot: hold the last frame
    if (!el.paused) el.pause()
    if (Number.isFinite(end) && Math.abs(el.currentTime - end) > 0.1 && el.readyState > 0) el.currentTime = end
    return
  }
  if (el.readyState > 0) {
    const drift = local - el.currentTime
    if (!playing) {
      if (el.playbackRate !== rate) el.playbackRate = rate
      if (Math.abs(drift) > 0.04) el.currentTime = local
    } else if (Math.abs(drift) > HARD_SEEK) {
      el.playbackRate = rate
      el.currentTime = local
    } else if (el.playbackRate !== rate) {
      el.playbackRate = rate
    }
  }
  if (playing) safePlay(el)
  else if (!el.paused) el.pause()
}

export function VideoPreview({
  scenes,
  assets,
  narrationTrack = [],
  overlays = [],
  imageOverlays = [],
  audioClips = [],
  adjustments = [],
  seekRequest,
  onSceneChange,
  transitionDuration = TRANSITION_DURATION,
  format = 'auto',
  selectedOverlayId,
  onSelectOverlay,
  onOverlayChange,
  overlayBarHeight = 0,
}: VideoPreviewProps) {
  const TRANSITION = transitionDuration
  const { data: sfxManifest } = useSFXManifest()
  const publishTime = usePlayhead((s) => s.setTime)
  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const total = useMemo(
    () =>
      Math.max(
        totalDuration(timeline),
        ...overlays.map((o) => o.start + o.duration),
        ...imageOverlays.map((o) => o.start + o.duration),
        ...audioClips.map((a) => a.start + a.duration),
        ...narrationTrack.map((n) => n.start + n.duration),
        0
      ),
    [timeline, overlays, imageOverlays, audioClips, narrationTrack]
  )

  const sceneEnd = totalDuration(timeline)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [showTimecode, setShowTimecode] = useState(true)
  const [showDetails, setShowDetails] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = fit, >1 = zoomed

  const hasContent = timeline.length > 0 || overlays.length > 0 || narrationTrack.length > 0
  // Fallback for assets uploaded before width/height were stored: read the loaded <video>
  const [probedVertical, setProbedVertical] = useState(false)

  // Output frame: explicit format, else follow the clips (majority vertical → 9:16)
  const aspect = useMemo(() => {
    if (format === '9:16') return { w: 9, h: 16 }
    if (format === '16:9') return { w: 16, h: 9 }
    if (format === '1:1') return { w: 1, h: 1 }
    const dims = assets
      .filter((a) => a.type === 'video')
      .map((a) => ({ w: Number(a.metadata?.width) || 0, h: Number(a.metadata?.height) || 0 }))
      .filter((d) => d.w && d.h)
    const vertical = dims.length ? dims.filter((d) => d.h > d.w).length * 2 >= dims.length : probedVertical
    return vertical ? { w: 9, h: 16 } : { w: 16, h: 9 }
  }, [format, assets, probedVertical])

  const monitorRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = monitorRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasContent])
  const stage = useMemo(() => {
    if (!box.w || !box.h) return { w: 0, h: 0 }
    const s = Math.min(box.w / aspect.w, box.h / aspect.h)
    return { w: Math.floor(aspect.w * s), h: Math.floor(aspect.h * s) }
  }, [box, aspect])

  const clockRef = useRef(0)
  const playingRef = useRef(false)
  const hostRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const audioRef = useRef<HTMLAudioElement>(null)
  const overlayEls = useRef(new Map<string, HTMLDivElement>())
  const audioEls = useRef(new Map<string, HTMLAudioElement>())

  // natural size of overlay media → fitted box ("contain" in the canvas, like CapCut scale 1)
  const [natural, setNatural] = useState<Record<string, { w: number; h: number }>>({})

  // ---- Derived render state -------------------------------------------------
  const currentIndex = timeline.length ? sceneAt(timeline, time) : 0
  const current = timeline[currentIndex]
  const sinceStart = current ? time - current.start : 0
  const inTransition = hasTransition(current) && sinceStart < TRANSITION
  const progress = inTransition ? Math.min(1, sinceStart / TRANSITION) : 1

  // Two layers (A/B) so the next clip is preloaded and can crossfade in
  const slotScene: (number | null)[] = [null, null]
  if (current) {
    const slot = currentIndex % 2
    slotScene[slot] = currentIndex
    const other = inTransition ? currentIndex - 1 : currentIndex + 1
    slotScene[1 - slot] = other >= 0 && other < timeline.length ? other : null
  }

  // ---- Media + motion sync (runs every animation frame) ----------------------
  const sync = useCallback(
    (t: number, playing: boolean) => {
      const idx = timeline.length ? sceneAt(timeline, t) : 0
      const cur = timeline[idx]
      const transitioning = hasTransition(cur) && t - (cur?.start ?? 0) < TRANSITION
      const narrationActive = narrationTrack.length > 0

      hostRefs.forEach((ref) => {
        const host = ref.current
        if (!host) return
        const k = host.dataset.scene === undefined || host.dataset.scene === '' ? -1 : Number(host.dataset.scene)
        const item = timeline[k]
        if (!item) {
          host.style.transform = ''
          return
        }
        // Clip animation: pose computed from the master clock and written straight to the
        // compositor-friendly transform (no React render, no WAAPI restart at the cut)
        const since = t - item.start
        const pose = animationPose(item.scene.animation_type, since, item.duration, sceneProps(item.scene).anim)
        host.style.transform = poseToTransform(pose)

        const el = host.querySelector('video')
        if (!el) return
        const props = sceneProps(item.scene)
        el.volume = Math.min(1, props.volume ?? (narrationActive ? CLIP_VOLUME_UNDER_NARRATION : 1))
        const clipDur = item.videoAsset?.duration || (Number.isFinite(el.duration) ? el.duration : 0)
        const visible = t < sceneEnd && (k === idx || (transitioning && k === idx - 1))
        // item.trim = part of the clip removed by the cut tool (source starts later)
        syncMedia(el, item.trim + since * item.rate, item.rate, playing, visible, clipDur > 0 ? clipDur - 0.05 : Infinity)
      })

      // Overlays: visibility per frame + video sync (text bars)
      for (const o of overlays) {
        const host = overlayEls.current.get(o.id)
        if (!host) continue
        const active = t >= o.start && t < o.start + o.duration
        host.style.visibility = active ? 'visible' : 'hidden'
        const v = host.querySelector('video')
        if (v) {
          const a = assetById.get(o.asset_id)
          v.volume = Math.min(1, Math.max(0, o.volume ?? 1))
          const end = a?.duration ? a.duration - 0.05 : Infinity
          syncMedia(v, (o.in_point || 0) + (t - o.start) * (o.speed || 1), o.speed || 1, playing, active, end)
        }
      }

      // Image overlays: visibility per frame + video sync
      for (const o of imageOverlays) {
        const host = overlayEls.current.get(o.id)
        if (!host) continue
        const active = t >= o.start && t < o.start + o.duration
        host.style.visibility = active ? 'visible' : 'hidden'
        const v = host.querySelector('video')
        if (v) {
          const a = assetById.get(o.asset_id)
          v.volume = Math.min(1, Math.max(0, o.volume ?? 1))
          const end = a?.duration ? a.duration - 0.05 : Infinity
          syncMedia(v, (o.in_point || 0) + (t - o.start) * (o.speed || 1), o.speed || 1, playing, active, end)
        }
      }

      // Extra audio lane (music / SFX)
      for (const c of audioClips) {
        const el = audioEls.current.get(c.id)
        if (!el) continue
        
        // Get duration from asset or SFX manifest
        let duration: number | undefined
        if (c.asset_id.startsWith('sfx:')) {
          const effectId = c.asset_id.substring(4)
          const effect = sfxManifest?.effects.find((e) => e.id === effectId)
          duration = effect?.duration
        } else {
          const a = assetById.get(c.asset_id)
          duration = a?.duration ?? undefined
        }
        
        const active = t >= c.start && t < c.start + c.duration
        el.volume = Math.min(1, Math.max(0, c.volume ?? 1))
        const end = duration ? duration - 0.02 : Infinity
        if (!active) {
          if (!el.paused) el.pause()
          continue
        }
        syncMedia(el, (c.in_point || 0) + (t - c.start) * (c.speed || 1), c.speed || 1, playing, true, end)
      }

      // Narration: N files played back-to-back on one continuous track
      const audio = audioRef.current
      if (audio) {
        const seg = narrationAt(narrationTrack, t)
        const url = seg ? assetById.get(seg.asset_id)?.url : undefined
        if (!seg || !url) {
          if (!audio.paused) audio.pause()
        } else {
          if (audio.dataset.asset !== seg.asset_id) {
            audio.dataset.asset = seg.asset_id
            audio.src = url
          }
          const local = t - seg.start
          const tolerance = playing ? DRIFT_TOLERANCE : 0.04
          if (Math.abs(audio.currentTime - local) > tolerance && audio.readyState > 0) audio.currentTime = local
          if (playing) safePlay(audio)
          else if (!audio.paused) audio.pause()
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeline, narrationTrack, overlays, audioClips, assetById, TRANSITION, sceneEnd]
  )

  // Master clock
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    let lastIdx = -1
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) {
        let next = clockRef.current + dt
        // Smooth clock (rAF) gently pulled toward the narration. audio.currentTime only updates
        // in coarse steps, so snapping to it made animations move in jerks.
        const audio = audioRef.current
        const seg = narrationAt(narrationTrack, clockRef.current)
        if (audio && seg && !audio.paused && audio.readyState >= 3 && audio.dataset.asset === seg.asset_id) {
          const err = seg.start + audio.currentTime - next
          if (Math.abs(err) > 0.08 && Math.abs(err) < 0.5) next += err * 0.05
        }
        clockRef.current = Math.min(total, Math.max(clockRef.current, next))
        if (clockRef.current >= total) {
          playingRef.current = false
          setIsPlaying(false)
        }
        // React re-render budget: ~15fps for slate/timecode/playhead; every frame only around
        // a cut (layer swap + transition opacity).
        const t = clockRef.current
        const idx = timeline.length ? sceneAt(timeline, t) : 0
        const item = timeline[idx]
        const nearCut =
          idx !== lastIdx ||
          (!!item && hasTransition(item) && t - item.start < TRANSITION + 0.05) ||
          (!!timeline[idx + 1] && timeline[idx + 1].start - t < 0.05)
        if (nearCut || now - lastUi > 66 || !playingRef.current) {
          lastUi = now
          lastIdx = idx
          setTime(t)
          publishTime(t)
        }
      }
      sync(clockRef.current, playingRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sync, total, narrationTrack, publishTime, timeline, TRANSITION])

  // Pause everything on unmount
  useEffect(() => {
    const hosts = hostRefs.map((r) => r.current)
    const audio = audioRef.current
    const extra = audioEls.current
    const layers = overlayEls.current
    return () => {
      hosts.forEach((h) => h?.querySelector('video')?.pause())
      audio?.pause()
      extra.forEach((a) => a.pause())
      layers.forEach((l) => l.querySelector('video')?.pause())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seek = useCallback(
    (t: number) => {
      clockRef.current = Math.max(0, Math.min(total, t))
      setTime(clockRef.current)
      publishTime(clockRef.current)
    },
    [total, publishTime]
  )

  useEffect(() => {
    if (seekRequest) seek(seekRequest.time)
  }, [seekRequest, seek])

  // Seeks requested through the shared playhead store (timeline scrubbing)
  useEffect(
    () =>
      usePlayhead.subscribe((s, prev) => {
        if (s.seekReq && s.seekReq !== prev.seekReq) seek(s.seekReq.t)
      }),
    [seek]
  )

  // Keep clock inside bounds when timeline changes
  useEffect(() => {
    if (clockRef.current > total) seek(total)
  }, [total, seek])

  useEffect(() => {
    onSceneChange?.(currentIndex)
  }, [currentIndex, onSceneChange])

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false
      setIsPlaying(false)
      return
    }
    if (clockRef.current >= total - 0.05) seek(0)
    playingRef.current = true
    setIsPlaying(true)
  }, [total, seek])

  // Space bar toggles playback (ignored while typing in inputs / using sliders)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (e.code !== 'Space' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.getAttribute?.('role') === 'slider') return
      if (tag === 'BUTTON') return // let buttons handle their own Space
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  // ---- Overlay drag on the monitor -------------------------------------------
  const dragRef = useRef<{ id: string; px: number; py: number; x: number; y: number; moved: boolean } | null>(null)
  const fitted = (o: OverlayClip) => {
    const n = natural[o.id]
    const a = assetById.get(o.asset_id)
    const w = n?.w || Number(a?.metadata?.width) || 1
    const h = n?.h || Number(a?.metadata?.height) || 1
    const s = Math.min(stage.w / w, stage.h / h)
    return { w: w * s, h: h * s }
  }
  const overlayTransform = (o: { x: number; y: number; scale: number }) =>
    `translate3d(${((o.x * stage.w) / 2).toFixed(2)}px, ${((-o.y * stage.h) / 2).toFixed(2)}px, 0) scale(${o.scale.toFixed(4)})`
  
  const overlayFilter = (o: OverlayClip) => {
    const filters: string[] = []
    if (o.brightness && o.brightness !== 0) filters.push(`brightness(${100 + o.brightness}%)`)
    if (o.contrast && o.contrast !== 0) filters.push(`contrast(${100 + o.contrast}%)`)
    if (o.saturation && o.saturation !== 0) filters.push(`saturate(${100 + o.saturation}%)`)
    return filters.length > 0 ? filters.join(' ') : undefined
  }
  
  const overlayMixBlendMode = (o: OverlayClip): React.CSSProperties['mixBlendMode'] => {
    const mode = o.blend_mode || 'normal'
    // CSS mix-blend-mode values
    const validModes: React.CSSProperties['mixBlendMode'][] = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 
      'color-dodge', 'color-burn', 'hard-light', 'soft-light', 
      'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
    ]
    return validModes.includes(mode as any) ? (mode as React.CSSProperties['mixBlendMode']) : 'normal'
  }

  if (!hasContent) {
    return (
      <div className="grain flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
        <div className="text-center">
          <span className="tally mb-4" aria-hidden />
          <p className="font-display text-lg font-bold">Monitor vazio</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suba clipes + narração e clique em <span className="text-primary">Juntar com áudio</span>
            <br />
            ou arraste mídias da biblioteca pra timeline
          </p>
        </div>
      </div>
    )
  }

  const look = adjustStyle(adjustmentsAt(adjustments, time))
  // narration (or other lanes) continue after the last scene → empty frame, not a frozen clip
  const beyond = timeline.length > 0 && time >= sceneEnd - 1e-3 && total > sceneEnd + 0.05
  const narrationSeg = narrationAt(narrationTrack, time)
  const narrationName = narrationSeg ? assetById.get(narrationSeg.asset_id)?.filename : undefined
  const transitionType = inTransition ? normalizeTransition(current?.scene.transition_in) : 'cut'
  const fx = transitionStyle(transitionType, progress)

  return (
    <div className="flex h-full w-full flex-col">
      {/* Monitor */}
      <div
        ref={monitorRef}
        className="relative flex-1 cursor-pointer overflow-hidden rounded-xl border border-border"
        onClick={togglePlay}
      >
        {/* Stage = the actual output frame (9:16, 16:9…). Clips fill it (cover) and animations
            zoom INSIDE it — same framing the CapCut export uses. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-surface-0 shadow-[0_0_0_1px_hsl(var(--border))] transition-transform duration-200"
          style={{ 
            width: stage.w, 
            height: stage.h,
            transform: `translate(-50%, -50%) scale(${zoomLevel})`,
          }}
          data-stage={`${aspect.w}:${aspect.h}`}
        >
          {/* everything below the adjustment layer (main track + overlays) is filtered */}
          <div className="absolute inset-0" style={{ filter: look.filter }} data-adjusted={look.filter ? '' : undefined}>
          {[0, 1].map((slot) => {
            const k = slotScene[slot]
            const item = k !== null ? timeline[k] : undefined
            const isCurrent = k === currentIndex
            const opacity = !item || beyond ? 0 : isCurrent ? fx.incoming : inTransition ? 1 : 0
            const extra = !inTransition ? 1 : isCurrent ? fx.inScale : fx.outScale
            const still = item && !item.videoAsset ? item.imageAsset : undefined
            return (
              // layer: opacity + transition scale (only during the short transition window)
              <div
                key={slot}
                className="absolute inset-0"
                style={{ opacity, zIndex: isCurrent ? 2 : 1, transform: extra !== 1 ? `scale(${extra.toFixed(4)})` : undefined }}
              >
                {/* host: clip animation written every frame by the master clock */}
                <div ref={hostRefs[slot]} data-scene={k ?? ''} data-anim-host className="absolute inset-0 will-change-transform">
                  {still ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={still.url} alt={still.filename} className="absolute inset-0 h-full w-full object-contain" />
                  ) : (
                    <video
                      src={item?.videoAsset?.url || undefined}
                      poster={item?.videoAsset?.metadata?.thumbnail as string | undefined}
                      preload="auto"
                      playsInline
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget
                        if (v.videoWidth && v.videoHeight) setProbedVertical(v.videoHeight > v.videoWidth)
                      }}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  )}
                </div>
              </div>
            )
          })}

          {/* Flash overlay for flash transitions */}
          {fx.flash > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 4, opacity: fx.flash, background: transitionType === 'flash_branco' ? '#fff' : '#000' }}
            />
          )}

          {/* Overlay layers (Sobreposição) — text bars on top */}
          {overlays.map((o, i) => {
            // Text overlay bars (no asset needed)
            if (o.kind === 'text') {
              const barHeight = overlayBarHeight > 0 
                ? overlayBarHeight 
                : Math.max(40, Math.min(80, stage.h * 0.08)) // 8% of video height, min 40px, max 80px
              const maxFontSize = Math.max(12, Math.min(24, barHeight * 0.35)) // 35% of bar height, smaller ratio
              const actualFontSize = o.text_style?.font_size ? Math.min(o.text_style.font_size, maxFontSize) : maxFontSize
              const selected = o.id === selectedOverlayId
              // Better responsive padding: vertical based on bar height, horizontal based on width
              const verticalPadding = Math.max(8, barHeight * 0.15)
              const horizontalPadding = Math.max(20, stage.w * 0.04) // 4% of width, min 20px
              
              return (
                <div
                  key={o.id}
                  ref={(el) => {
                    if (el) overlayEls.current.set(o.id, el)
                    else overlayEls.current.delete(o.id)
                  }}
                  data-overlay={o.id}
                  className="absolute cursor-pointer"
                  style={{
                    zIndex: 10 + i,
                    width: stage.w,
                    height: barHeight,
                    left: 0,
                    top: o.y < 0 ? 0 : stage.h - barHeight, // Top or bottom
                    opacity: o.opacity,
                    visibility: time >= o.start && time < o.start + o.duration ? 'visible' : 'hidden',
                    backgroundColor: o.text_style?.background_color || '#000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: o.text_style?.alignment || 'center',
                    padding: `${verticalPadding}px ${horizontalPadding}px`,
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectOverlay?.(o.id)
                  }}
                >
                  <span
                    style={{
                      fontFamily: o.text_style?.font_family || 'Arial',
                      fontSize: `${actualFontSize}px`,
                      fontWeight: o.text_style?.font_weight || 'bold',
                      color: o.text_style?.color || '#FFFFFF',
                      textAlign: o.text_style?.alignment || 'center',
                      width: '100%',
                      lineHeight: '1.3',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {o.text_content || 'TEXTO'}
                  </span>
                  {selected && <span className="pointer-events-none absolute inset-0 outline outline-2 outline-offset-0 outline-brand-cyan" aria-hidden />}
                </div>
              )
            }
            
            const a = assetById.get(o.asset_id)
            if (!a) return null
            const f = fitted(o)
            const selected = o.id === selectedOverlayId
            return (
              <div
                key={o.id}
                ref={(el) => {
                  if (el) overlayEls.current.set(o.id, el)
                  else overlayEls.current.delete(o.id)
                }}
                data-overlay={o.id}
                className={cn('absolute touch-none', onOverlayChange && 'cursor-move')}
                style={{
                  zIndex: 10 + i,
                  width: f.w,
                  height: f.h,
                  left: (stage.w - f.w) / 2,
                  top: (stage.h - f.h) / 2,
                  opacity: o.opacity,
                  transform: overlayTransform(o),
                  visibility: time >= o.start && time < o.start + o.duration ? 'visible' : 'hidden',
                  filter: overlayFilter(o),
                  mixBlendMode: overlayMixBlendMode(o),
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelectOverlay?.(o.id)
                  if (!onOverlayChange) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragRef.current = { id: o.id, px: e.clientX, py: e.clientY, x: o.x, y: o.y, moved: false }
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current
                  if (!d || d.id !== o.id || !stage.w) return
                  const nx = d.x + ((e.clientX - d.px) * 2) / stage.w
                  const ny = d.y - ((e.clientY - d.py) * 2) / stage.h
                  d.moved = true
                  e.currentTarget.style.transform = overlayTransform({ x: nx, y: ny, scale: o.scale })
                  e.currentTarget.dataset.nx = String(nx)
                  e.currentTarget.dataset.ny = String(ny)
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current
                  dragRef.current = null
                  if (!d?.moved) return
                  const round = (v: number) => Math.round(v * 1000) / 1000
                  onOverlayChange?.(o.id, { x: round(Number(e.currentTarget.dataset.nx)), y: round(Number(e.currentTarget.dataset.ny)) })
                }}
              >
                {a.type === 'video' ? (
                  <video
                    src={a.url || undefined}
                    preload="auto"
                    playsInline
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.videoWidth) setNatural((p) => ({ ...p, [o.id]: { w: v.videoWidth, h: v.videoHeight } }))
                    }}
                    className="pointer-events-none h-full w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.filename}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth) setNatural((p) => ({ ...p, [o.id]: { w: img.naturalWidth, h: img.naturalHeight } }))
                    }}
                    className="pointer-events-none h-full w-full select-none object-contain"
                  />
                )}
                {selected && <span className="pointer-events-none absolute inset-0 outline outline-2 outline-offset-0 outline-brand-cyan" aria-hidden />}
              </div>
            )
          })}

          {/* Image overlay layers (on top of text bars) */}
          {imageOverlays.map((o, i) => {
            const a = assetById.get(o.asset_id)
            if (!a) return null
            const f = fitted(o)
            const selected = o.id === selectedOverlayId
            return (
              <div
                key={o.id}
                ref={(el) => {
                  if (el) overlayEls.current.set(o.id, el)
                  else overlayEls.current.delete(o.id)
                }}
                data-overlay={o.id}
                className={cn('absolute touch-none', onOverlayChange && 'cursor-move')}
                style={{
                  zIndex: 20 + i,
                  width: f.w,
                  height: f.h,
                  left: (stage.w - f.w) / 2,
                  top: (stage.h - f.h) / 2,
                  opacity: o.opacity,
                  transform: overlayTransform(o),
                  visibility: time >= o.start && time < o.start + o.duration ? 'visible' : 'hidden',
                  filter: overlayFilter(o),
                  mixBlendMode: overlayMixBlendMode(o),
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelectOverlay?.(o.id)
                  if (!onOverlayChange) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragRef.current = { id: o.id, px: e.clientX, py: e.clientY, x: o.x, y: o.y, moved: false }
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current
                  if (!d || d.id !== o.id || !stage.w) return
                  const nx = d.x + ((e.clientX - d.px) * 2) / stage.w
                  const ny = d.y - ((e.clientY - d.py) * 2) / stage.h
                  d.moved = true
                  e.currentTarget.style.transform = overlayTransform({ x: nx, y: ny, scale: o.scale })
                  e.currentTarget.dataset.nx = String(nx)
                  e.currentTarget.dataset.ny = String(ny)
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current
                  dragRef.current = null
                  if (!d?.moved) return
                  const round = (v: number) => Math.round(v * 1000) / 1000
                  onOverlayChange?.(o.id, { x: round(Number(e.currentTarget.dataset.nx)), y: round(Number(e.currentTarget.dataset.ny)) })
                }}
              >
                {a.type === 'video' ? (
                  <video
                    src={a.url || undefined}
                    preload="auto"
                    playsInline
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.videoWidth) setNatural((p) => ({ ...p, [o.id]: { w: v.videoWidth, h: v.videoHeight } }))
                    }}
                    className="pointer-events-none h-full w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.filename}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth) setNatural((p) => ({ ...p, [o.id]: { w: img.naturalWidth, h: img.naturalHeight } }))
                    }}
                    className="pointer-events-none h-full w-full select-none object-contain"
                  />
                )}
                {selected && <span className="pointer-events-none absolute inset-0 outline outline-2 outline-offset-0 outline-brand-cyan" aria-hidden />}
              </div>
            )
          })}
          </div>

          {/* adjustment layer: temperature tint + vignette */}
          {look.tint && (
            <div
              className="pointer-events-none absolute inset-0 mix-blend-overlay"
              style={{ zIndex: 60, background: `rgb(${look.tint.color})`, opacity: look.tint.opacity }}
              aria-hidden
            />
          )}
          {look.vignette > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 61, background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${(0.85 * look.vignette).toFixed(3)}) 100%)` }}
              aria-hidden
            />
          )}
          {(!timeline.length || beyond) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
              Narração sem cenas aqui — arraste clipes da biblioteca pra faixa Mídia
            </div>
          )}
        </div>

        <audio ref={audioRef} preload="auto" className="hidden" />
        {audioClips.map((c) => {
          // Check if it's a SFX pseudo-asset
          let audioUrl: string | undefined
          if (c.asset_id.startsWith('sfx:')) {
            const effectId = c.asset_id.substring(4) // Remove "sfx:" prefix
            const effect = sfxManifest?.effects.find((e) => e.id === effectId)
            audioUrl = effect ? effect.path : undefined
          } else {
            const a = assetById.get(c.asset_id)
            audioUrl = a?.url
          }
          
          return (
            <audio
              key={c.id}
              ref={(el) => {
                if (el) audioEls.current.set(c.id, el)
                else audioEls.current.delete(c.id)
              }}
              src={audioUrl}
              preload="auto"
              className="hidden"
            />
          )
        })}

        {/* Slate overlay */}
        <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-[60%] rounded-lg border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-md">
          <p className="eyebrow !text-primary">
            {timeline.length === 0 || beyond
              ? 'Sem cena'
              : `Cena ${String(currentIndex + 1).padStart(2, '0')} / ${String(timeline.length).padStart(2, '0')}`}
          </p>
          <p className="mt-0.5 truncate text-xs text-foreground/90">{(current?.videoAsset || current?.imageAsset)?.filename}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatTime(Math.max(0, sinceStart))} / {formatTime(current?.duration ?? 0)}
            {current && current.rate !== 1 && ` · ${current.rate.toFixed(2)}x`}
          </p>
          {narrationName && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-track-audio">
              <Mic className="h-3 w-3" aria-hidden /> {narrationName}
            </p>
          )}
        </div>

        {/* Timecode */}
        <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-md bg-black/65 px-2 py-1 font-mono text-xs tabular-nums text-brand-cyan backdrop-blur-md">
          {formatTimecode(time)}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
          className="absolute bottom-4 left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.45)] transition-transform duration-200 hover:scale-105"
        >
          {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
        </button>
      </div>

      {/* Scrubber with scene markers (click or drag) */}
      <div className="mt-3 px-1">
        <div
          role="slider"
          aria-label="Posição na timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          className="group relative h-2 cursor-pointer touch-none rounded-full bg-surface-3"
          onPointerDown={(e) => {
            const el = e.currentTarget
            el.setPointerCapture(e.pointerId)
            const at = (x: number) => {
              const rect = el.getBoundingClientRect()
              seek(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * total)
            }
            at(e.clientX)
            const move = (ev: PointerEvent) => at(ev.clientX)
            const up = () => {
              el.removeEventListener('pointermove', move)
              el.removeEventListener('pointerup', up)
              el.removeEventListener('pointercancel', up)
            }
            el.addEventListener('pointermove', move)
            el.addEventListener('pointerup', up)
            el.addEventListener('pointercancel', up)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(time + 1)
            if (e.key === 'ArrowLeft') seek(time - 1)
          }}
        >
          <div className="absolute h-full rounded-full bg-gradient-to-r from-brand-pink to-brand-orange" style={{ width: `${total ? (time / total) * 100 : 0}%` }} />
          {timeline.slice(1).map((item) => (
            <div key={item.scene.id} className="absolute top-0 h-full w-px bg-background/80" style={{ left: `${(item.start / total) * 100}%` }} />
          ))}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${total ? (time / total) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{formatTime(time)}</span>
          <span>{formatTime(total)}</span>
        </div>
      </div>
    </div>
  )
}
