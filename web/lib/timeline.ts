// Shared timeline math used by Auto Assemble, Timeline, Preview and Render.
// Mirrors the CLI assembler (video_assembler/core/scene_timing.py + edl.py).
import type { Asset, Scene, NarrationSegment, SceneProps } from '@/types/project'

/** A still image on its own (no narration to fill) */
export const STILL_DURATION = 5
export const DEFAULT_SCENE_DURATION = 6.6 // config.yaml -> cenas.duracao_padrao
export const TRANSITION_DURATION = 0.5 // seconds (default; project setting overrides)
export const MIN_SLOWDOWN_RATE = 0.8 // config.yaml -> ajuste_duracao.limite_desacelerar

/**
 * Sort key that represents the file's modification date.
 * 1. metadata.last_modified (File.lastModified captured at upload)
 * 2. timestamp embedded in the filename (..._20261009101121.mp4)
 * 3. created_at (upload time) as last resort
 */
export function assetSortKey(asset: Asset): number {
  const lm = Number(asset.metadata?.last_modified)
  if (Number.isFinite(lm) && lm > 0) return lm

  const stamps = asset.filename.match(/\d{14}/g)
  if (stamps) {
    const s = stamps[stamps.length - 1]
    const n = (from: number, len: number) => Number(s.slice(from, from + len))
    const date = new Date(n(0, 4), n(4, 2) - 1, n(6, 2), n(8, 2), n(10, 2), n(12, 2))
    if (!Number.isNaN(date.getTime())) return date.getTime()
  }

  return new Date(asset.created_at).getTime()
}

export function sortByModificationDate<T extends Asset>(assets: T[]): T[] {
  return [...assets].sort((a, b) => assetSortKey(a) - assetSortKey(b) || a.filename.localeCompare(b.filename))
}

/**
 * Clip order for Auto Assemble.
 * - modified: file modification date (File.lastModified)
 * - upload: order the files were sent (= order they were listed in Explorer when picked)
 * - name: natural filename order
 */
export function sortAssets<T extends Asset>(assets: T[], by: 'modified' | 'upload' | 'name', reverse = false): T[] {
  const name = (a: Asset, b: Asset) => a.filename.localeCompare(b.filename, 'pt-BR', { numeric: true, sensitivity: 'base' })
  const uploaded = (a: Asset) => new Date(a.created_at).getTime()
  const sorted =
    by === 'name'
      ? [...assets].sort(name)
      : by === 'upload'
        ? [...assets].sort((a, b) => uploaded(a) - uploaded(b) || name(a, b))
        : sortByModificationDate(assets)
  return reverse ? sorted.reverse() : sorted
}

export interface TimedScene {
  scene: Scene
  index: number
  start: number
  duration: number
  videoAsset?: Asset
  imageAsset?: Asset
  /** Playback rate applied to the clip (user speed, or slow-down when the clip is a bit short) */
  rate: number
  /** true when the user set the speed by hand */
  manualSpeed: boolean
  /** seconds of the source clip skipped at the start (cut tool) */
  trim: number
}

/** Editable per-scene properties stored in scenes.metadata */
export function sceneProps(scene: Scene): SceneProps {
  const m = (scene.metadata || {}) as Record<string, unknown>
  const speed = m.speed == null ? NaN : Number(m.speed)
  const volume = m.volume == null ? NaN : Number(m.volume)
  const trim = m.trim == null ? NaN : Number(m.trim)
  const scale = m.scale == null ? NaN : Number(m.scale)
  const x = m.x == null ? NaN : Number(m.x)
  const y = m.y == null ? NaN : Number(m.y)
  const rotation = m.rotation == null ? NaN : Number(m.rotation)
  
  return {
    trim: Number.isFinite(trim) && trim > 0 ? trim : undefined,
    speed: Number.isFinite(speed) && speed > 0 ? speed : undefined,
    volume: Number.isFinite(volume) && volume >= 0 ? volume : undefined,
    anim: (m.anim as SceneProps['anim']) || undefined,
    scale: Number.isFinite(scale) ? scale : undefined,
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    rotation: Number.isFinite(rotation) ? rotation : undefined,
  }
}

export function sceneDuration(scene: Scene, videoAsset?: Asset): number {
  if (scene.audio_duration && scene.audio_duration > 0) return scene.audio_duration
  if (videoAsset?.duration && videoAsset.duration > 0) return videoAsset.duration
  return DEFAULT_SCENE_DURATION
}

/** Same rule as the CLI EDL: clip longer -> cut end; slightly shorter -> slow down (>=0.8x); else hold last frame */
export function clipRate(clipDuration: number | null | undefined, sceneDur: number): number {
  if (!clipDuration || clipDuration <= 0 || clipDuration >= sceneDur) return 1
  const rate = clipDuration / sceneDur
  return rate >= MIN_SLOWDOWN_RATE ? rate : 1
}

export function buildTimeline(scenes: Scene[], assets: Asset[]): TimedScene[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  let cursor = 0
  return scenes.map((scene, index) => {
    const videoAsset = scene.video_asset_id ? byId.get(scene.video_asset_id) : undefined
    const imageAsset = scene.image_asset_id ? byId.get(scene.image_asset_id) : undefined
    const duration = sceneDuration(scene, videoAsset)
    const props = sceneProps(scene)
    const manual = props.speed
    const trim = props.trim ?? 0
    const trimEnd = Number(scene.metadata?.trim_end)
    const sourceEnd = Number.isFinite(trimEnd) && trimEnd > trim ? Math.min(trimEnd, videoAsset?.duration || trimEnd) : videoAsset?.duration
    const available = sourceEnd ? Math.max(0.05, sourceEnd - trim) : sourceEnd
    const timed: TimedScene = {
      scene,
      index,
      start: cursor,
      duration,
      videoAsset,
      imageAsset,
      rate: manual ?? clipRate(available, duration),
      manualSpeed: manual !== undefined,
      trim,
    }
    cursor += duration
    return timed
  })
}

export function totalDuration(timeline: TimedScene[]): number {
  const last = timeline[timeline.length - 1]
  return last ? last.start + last.duration : 0
}

export function sceneAt(timeline: TimedScene[], t: number): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (t >= timeline[i].start) return i
  }
  return 0
}

/** Narration segment playing at global time t (narration is one continuous track made of N files) */
export function narrationAt(track: NarrationSegment[], t: number) {
  return track.find((seg) => t >= seg.start && t < seg.start + seg.duration)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** mm:ss:ff at 30fps — editor-style timecode */
export function formatTimecode(seconds: number, fps = 30): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const frames = Math.floor((seconds % 1) * fps)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

/** m:ss.d — unambiguous short clock for in/out points */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${mins}:${secs}`
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0s'
  return `${seconds.toFixed(1)}s`
}

/** Assigns each clip to the first row where it doesn't overlap (CapCut tracks can't overlap) */
export function packRows<T>(clips: T[], key: (c: T) => { start: number; duration: number }): T[][] {
  const rows: T[][] = []
  for (const clip of [...clips].sort((a, b) => key(a).start - key(b).start)) {
    const row = rows.find((r) => {
      const last = key(r[r.length - 1])
      return last.start + last.duration <= key(clip).start + 1e-3
    })
    if (row) row.push(clip)
    else rows.push([clip])
  }
  return rows
}
