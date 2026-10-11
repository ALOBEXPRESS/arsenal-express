'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Scene, Asset, NarrationSegment } from '@/types/project'
import { Play, Pause, Mic } from 'lucide-react'
import {
  buildTimeline,
  totalDuration,
  sceneAt,
  narrationAt,
  formatTime,
  formatTimecode,
  TRANSITION_DURATION,
  type TimedScene,
} from '@/lib/timeline'
import { ANIMATION_BY_ID, normalizeAnimation, normalizeTransition } from '@/lib/sync/presets'
import { animationPose, poseToTransform, transitionStyle } from '@/lib/sync/visual'
import { usePlayhead } from '@/lib/stores/playhead'

interface VideoPreviewProps {
  scenes: Scene[]
  assets: Asset[]
  narrationTrack?: NarrationSegment[]
  /** Change `nonce` to request a seek to `time` (e.g. clicking a scene card) */
  seekRequest?: { time: number; nonce: number }
  onSceneChange?: (index: number) => void
  transitionDuration?: number
  /** Output frame; "auto" follows the clips */
  format?: string
}


// Clip audio is kept low under narration (config.yaml -> audio.clipes.volume_db: -18)
const CLIP_VOLUME_UNDER_NARRATION = 0.125
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

export function VideoPreview({
  scenes,
  assets,
  narrationTrack = [],
  seekRequest,
  onSceneChange,
  transitionDuration = TRANSITION_DURATION,
  format = "auto",
}: VideoPreviewProps) {
  const TRANSITION = transitionDuration
  const publishTime = usePlayhead((s) => s.setTime)
  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const total = totalDuration(timeline)
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])

  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)

  const hasScenes = timeline.length > 0
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
  }, [hasScenes])
  const stage = useMemo(() => {
    if (!box.w || !box.h) return { w: 0, h: 0 }
    const s = Math.min(box.w / aspect.w, box.h / aspect.h)
    return { w: Math.floor(aspect.w * s), h: Math.floor(aspect.h * s) }
  }, [box, aspect])

  const clockRef = useRef(0)
  const playingRef = useRef(false)
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const animRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const animations = useRef<(Animation | null)[]>([null, null])
  const audioRef = useRef<HTMLAudioElement>(null)

  /**
   * Clip animation on the compositor thread. Keyframes = the same samples exported to CapCut
   * (linear between keyframes, exactly like CapCut). Main-thread jank can't make it stutter.
   */
  const driveAnimation = useCallback((slot: number, item: TimedScene | undefined, local: number, run: boolean) => {
    const host = animRefs[slot].current
    if (!host) return
    const key = item ? `${item.scene.id}|${item.scene.animation_type}|${item.duration.toFixed(3)}` : ''
    let anim = animations.current[slot]
    if (host.dataset.anim !== key) {
      anim?.cancel()
      anim = null
      host.dataset.anim = key
      const preset = item ? ANIMATION_BY_ID.get(normalizeAnimation(item.scene.animation_type) as never) : undefined
      if (item && preset && item.duration > 0) {
        const times = [...new Set([0, ...preset.samples(item.duration), item.duration])].sort((a, b) => a - b)
        anim = host.animate(
          times.map((s) => ({ offset: Math.min(1, s / item.duration), transform: poseToTransform(preset.pose(s, item.duration)) })),
          { duration: item.duration * 1000, fill: 'both', easing: 'linear' }
        )
        anim.pause()
      }
      animations.current[slot] = anim
    }
    if (!anim) return
    const target = Math.max(0, Math.min(item!.duration, local)) * 1000
    const drift = Math.abs(Number(anim.currentTime ?? 0) - target)
    if (!run) {
      if (anim.playState !== 'paused') anim.pause()
      if (drift > 1) anim.currentTime = target
    } else {
      if (drift > 120) anim.currentTime = target // only on seek / scene entry
      if (anim.playState !== 'running') anim.play()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Derived render state -------------------------------------------------
  const currentIndex = timeline.length ? sceneAt(timeline, time) : 0
  const current = timeline[currentIndex]
  const sinceStart = current ? time - current.start : 0
  const inTransition = hasTransition(current) && sinceStart < TRANSITION
  const progress = inTransition ? Math.min(1, sinceStart / TRANSITION) : 1

  // Two video layers (A/B) so the next clip is preloaded and can crossfade in
  const slotScene: (number | null)[] = [null, null]
  if (current) {
    const slot = currentIndex % 2
    slotScene[slot] = currentIndex
    const other = inTransition ? currentIndex - 1 : currentIndex + 1
    slotScene[1 - slot] = other >= 0 && other < timeline.length ? other : null
  }

  // ---- Media sync (runs every animation frame) ------------------------------
  const sync = useCallback(
    (t: number, playing: boolean) => {
      const idx = timeline.length ? sceneAt(timeline, t) : 0
      const cur = timeline[idx]
      const transitioning = hasTransition(cur) && t - (cur?.start ?? 0) < TRANSITION
      const narrationActive = narrationTrack.length > 0

      videoRefs.forEach((ref, slot) => {
        const el = ref.current
        if (!el || el.dataset.scene === undefined || el.dataset.scene === '') {
          driveAnimation(slot, undefined, 0, false)
          return
        }
        const k = Number(el.dataset.scene)
        const item = timeline[k]
        if (!item) return

        el.volume = narrationActive ? CLIP_VOLUME_UNDER_NARRATION : 1
        const clipDur = item.videoAsset?.duration || (Number.isFinite(el.duration) ? el.duration : 0)
        const local = (t - item.start) * item.rate
        const visible = k === idx || (transitioning && k === idx - 1)
        driveAnimation(slot, item, t - item.start, playing && visible && t >= item.start)

        if (!visible || local < 0) {
          // Preloaded next clip waits on its first frame
          if (!el.paused) el.pause()
          if (el.currentTime > 0.05 && el.readyState > 0) el.currentTime = 0
          return
        }

        const end = clipDur > 0 ? clipDur - 0.05 : Infinity
        if (local >= end) {
          // Clip shorter than scene: hold last frame (same as CLI 'segurar_frame')
          if (!el.paused) el.pause()
          if (Number.isFinite(end) && Math.abs(el.currentTime - end) > 0.1 && el.readyState > 0) el.currentTime = end
          return
        }

        if (el.readyState > 0) {
          const drift = local - el.currentTime // >0: video is behind the master clock
          if (!playing) {
            if (el.playbackRate !== item.rate) el.playbackRate = item.rate
            if (Math.abs(drift) > 0.04) el.currentTime = local
          } else if (Math.abs(drift) > HARD_SEEK) {
            // Only jump when really out of sync (scrub, scene start, stall)
            el.playbackRate = item.rate
            el.currentTime = local
          } else if (el.playbackRate !== item.rate) {
            // Exact speed: changing playbackRate repeatedly re-times the decoder (micro-stutter).
            // Small drift (<0.6s) is invisible on a clip; big drift is fixed by the seek above.
            el.playbackRate = item.rate
          }
        }
        if (playing) safePlay(el)
        else if (!el.paused) el.pause()
      })

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
    [timeline, narrationTrack, assetById, TRANSITION, driveAnimation]
  )

  // Master clock
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) {
        let next = clockRef.current + dt
        // Smooth clock (rAF) gently pulled toward the narration. audio.currentTime only updates
        // in coarse steps, so snapping to it made animations move in jerks ("tremendo").
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
        // a cut (layer swap + transition opacity). Fewer main-thread renders = no frame drops.
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
    let lastUi = 0
    let lastIdx = -1
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sync, total, narrationTrack, publishTime, timeline, TRANSITION])

  // Pause everything on unmount
  useEffect(() => {
    const vids = videoRefs.map((r) => r.current)
    const audio = audioRef.current
    const anims = animations.current
    return () => {
      vids.forEach((v) => v?.pause())
      audio?.pause()
      anims.forEach((a) => a?.cancel())
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

  // Keep clock inside bounds when timeline changes
  useEffect(() => {
    if (clockRef.current > total) seek(total)
  }, [total, seek])

  useEffect(() => {
    onSceneChange?.(currentIndex)
  }, [currentIndex, onSceneChange])

  const togglePlay = () => {
    if (playingRef.current) {
      playingRef.current = false
      setIsPlaying(false)
      return
    }
    if (clockRef.current >= total - 0.05) seek(0)
    playingRef.current = true
    setIsPlaying(true)
  }

  // Space bar toggles playback (ignored while typing in inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.code !== 'Space' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (timeline.length === 0) {
    return (
      <div className="grain flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
        <div className="text-center">
          <span className="tally mb-4" aria-hidden />
          <p className="font-display text-lg font-bold">Monitor vazio</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suba clipes + narração e clique em <span className="text-primary">Juntar com áudio</span>
          </p>
        </div>
      </div>
    )
  }

  const narrationSeg = narrationAt(narrationTrack, time)
  const narrationName = narrationSeg ? assetById.get(narrationSeg.asset_id)?.filename : undefined
  const transitionType = inTransition ? normalizeTransition(current?.scene.transition_in) : 'cut'
  const fx = transitionStyle(transitionType, progress)

  return (
    <div className="flex h-full w-full flex-col">
      {/* Monitor */}
      <div
        ref={monitorRef}
        className="relative flex-1 cursor-pointer overflow-hidden rounded-xl border border-border bg-black"
        onClick={togglePlay}
      >
        {/* Stage = the actual output frame (9:16, 16:9…). Clips fill it (cover) and animations
            zoom INSIDE it — same framing the CapCut export uses. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-surface-0 shadow-[0_0_0_1px_hsl(var(--border))]"
          style={{ width: stage.w, height: stage.h }}
          data-stage={`${aspect.w}:${aspect.h}`}
        >
        {[0, 1].map((slot) => {
          const k = slotScene[slot]
          const item = k !== null ? timeline[k] : undefined
          const isCurrent = k === currentIndex
          const opacity = !item ? 0 : isCurrent ? fx.incoming : inTransition ? 1 : 0
          const extra = !inTransition ? 1 : isCurrent ? fx.inScale : fx.outScale
          return (
            // layer: opacity + transition scale (JS, only during the short transition window)
            <div
              key={slot}
              className="absolute inset-0"
              style={{ opacity, zIndex: isCurrent ? 2 : 1, transform: extra !== 1 ? `scale(${extra.toFixed(4)})` : undefined }}
            >
              {/* host: clip animation runs on the compositor (Web Animations API), not in React */}
              <div ref={animRefs[slot]} className="absolute inset-0 will-change-transform">
                <video
                  ref={videoRefs[slot]}
                  data-scene={k ?? ''}
                  src={item?.videoAsset?.url || undefined}
                  poster={item?.videoAsset?.metadata?.thumbnail as string | undefined}
                  preload="auto"
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget
                    if (v.videoWidth && v.videoHeight) setProbedVertical(v.videoHeight > v.videoWidth)
                  }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          )
        })}

        {current?.imageAsset && !current.videoAsset && (
          <img
            src={current.imageAsset.url}
            alt={current.imageAsset.filename}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: fx.incoming,
              zIndex: 3,
              transform: (() => {
                const a = animationPose(current.scene.animation_type, sinceStart, current.duration)
                return poseToTransform(a)
              })(),
            }}
          />
        )}

        {/* Flash overlay for flash transitions */}
        {fx.flash > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: 4, opacity: fx.flash, background: transitionType === 'flash_branco' ? '#fff' : '#000' }}
          />
        )}
        </div>

        <audio ref={audioRef} preload="auto" className="hidden" />

        {/* Slate overlay */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[60%] rounded-lg border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-md">
          <p className="eyebrow !text-primary">
            Cena {String(currentIndex + 1).padStart(2, '0')} / {String(timeline.length).padStart(2, '0')}
          </p>
          <p className="mt-0.5 truncate text-xs text-foreground/90">{current?.videoAsset?.filename}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatTime(Math.max(0, sinceStart))} / {formatTime(current?.duration ?? 0)}
            {current && current.rate < 1 && ` · ${current.rate.toFixed(2)}x`}
          </p>
          {narrationName && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-track-audio">
              <Mic className="h-3 w-3" aria-hidden /> {narrationName}
            </p>
          )}
        </div>

        {/* Timecode */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md bg-black/65 px-2 py-1 font-mono text-xs tabular-nums text-brand-cyan backdrop-blur-md">
          {formatTimecode(time)}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
          className="absolute bottom-4 left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.45)] transition-transform duration-200 hover:scale-105"
        >
          {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
        </button>
      </div>

      {/* Scrubber with scene markers */}
      <div className="mt-3 px-1">
        <div
          role="slider"
          aria-label="Posição na timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          className="group relative h-2 cursor-pointer rounded-full bg-surface-3"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - rect.left) / rect.width) * total)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(time + 1)
            if (e.key === 'ArrowLeft') seek(time - 1)
          }}
        >
          <div className="absolute h-full rounded-full bg-gradient-to-r from-brand-pink to-brand-orange" style={{ width: `${total ? (time / total) * 100 : 0}%` }} />
          {timeline.slice(1).map((item) => (
            <div
              key={item.scene.id}
              className="absolute top-0 h-full w-px bg-background/80"
              style={{ left: `${(item.start / total) * 100}%` }}
            />
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
