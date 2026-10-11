/**
 * Client-side MP4 rendering using mediabunny + WebCodecs.
 * Takes a timeline (scenes + narration + overlays) and renders it to a downloadable MP4 file.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  Quality,
  type VideoEncodingConfig,
  type AudioEncodingConfig,
} from 'mediabunny'
import type { TimedScene } from '../timeline'
import type { Asset, NarrationSegment, AudioClip, OverlayClip } from '@/types/project'

export interface RenderOptions {
  /** Width of the output video */
  width: number
  /** Height of the output video */
  height: number
  /** Frame rate (fps) */
  frameRate: number
  /** Video codec ('avc' | 'vp9' | 'av1') */
  videoCodec?: 'avc' | 'vp9' | 'av1'
  /** Video quality (bitrate in bps or Quality instance) */
  videoQuality?: number | Quality
  /** Audio codec ('aac' | 'opus') */
  audioCodec?: 'aac' | 'opus'
  /** Audio quality (bitrate in bps or Quality instance) */
  audioQuality?: number | Quality
  /** Progress callback (0..1) */
  onProgress?: (progress: number) => void
  /** Optional abort signal */
  signal?: AbortSignal
}

export interface RenderInput {
  timeline: TimedScene[]
  narration: NarrationSegment[]
  audioClips: AudioClip[]
  overlays: OverlayClip[]
  /** Total duration in seconds */
  duration: number
}

/**
 * Renders a timeline to MP4. Returns a Uint8Array (the MP4 file).
 */
export async function renderMp4(input: RenderInput, options: RenderOptions): Promise<Uint8Array> {
  const {
    width,
    height,
    frameRate,
    videoCodec = 'avc',
    videoQuality,
    audioCodec = 'aac',
    audioQuality,
    onProgress,
    signal,
  } = options

  if (signal?.aborted) throw new Error('Render aborted')

  // Create offscreen canvas for rendering frames
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Failed to create canvas context')

  // Video encoding config
  const videoConfig: VideoEncodingConfig = {
    codec: videoCodec,
    quality: videoQuality
      ? typeof videoQuality === 'number'
        ? new Quality({ bitrate: videoQuality })
        : videoQuality
      : new Quality('high'),
  }

  // Audio encoding config
  const audioConfig: AudioEncodingConfig = {
    codec: audioCodec,
    quality: audioQuality
      ? typeof audioQuality === 'number'
        ? new Quality({ bitrate: audioQuality })
        : audioQuality
      : new Quality({ bitrate: 128e3 }),
  }

  // Create output
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' as const }),
    target: new BufferTarget(),
  })

  // Create sources
  const videoSource = new CanvasSource(canvas, videoConfig)
  const audioSource = new AudioBufferSource(audioConfig)

  // Add tracks
  output.addVideoTrack(videoSource, { frameRate })
  output.addAudioTrack(audioSource)

  await output.start()

  // Preload all video/image assets
  const assetCache = new Map<string, HTMLVideoElement | HTMLImageElement>()
  await preloadAssets(input.timeline, assetCache, signal)

  // Render frames
  const frameDuration = 1 / frameRate
  const totalFrames = Math.ceil(input.duration * frameRate)
  let frameIndex = 0

  for (let t = 0; t < input.duration; t += frameDuration) {
    if (signal?.aborted) {
      await output.cancel()
      throw new Error('Render aborted')
    }

    // Render the frame at time t
    await renderFrame(ctx, input, assetCache, t, width, height)

    // Capture canvas state and add to video track
    await videoSource.add(t, frameDuration)

    frameIndex++
    onProgress?.(frameIndex / totalFrames)
  }

  // Mix audio and add to audio track
  await mixAndAddAudio(audioSource, input, signal)

  // Finalize
  await output.finalize()

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Output buffer is null')

  return new Uint8Array(buffer)
}

/**
 * Preloads all video and image assets used in the timeline.
 */
async function preloadAssets(
  timeline: TimedScene[],
  cache: Map<string, HTMLVideoElement | HTMLImageElement>,
  signal?: AbortSignal
): Promise<void> {
  const promises: Promise<void>[] = []

  for (const scene of timeline) {
    const asset = scene.videoAsset || scene.imageAsset
    if (!asset || cache.has(asset.id)) continue

    if (asset.type === 'video') {
      promises.push(
        new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(new Error('Aborted'))
          const video = document.createElement('video')
          video.crossOrigin = 'anonymous'
          video.preload = 'auto'
          video.src = asset.url
          video.muted = true
          video.onloadeddata = () => {
            cache.set(asset.id, video)
            resolve()
          }
          video.onerror = () => reject(new Error(`Failed to load video: ${asset.filename}`))
          if (signal) signal.addEventListener('abort', () => reject(new Error('Aborted')))
        })
      )
    } else if (asset.type === 'image') {
      promises.push(
        new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(new Error('Aborted'))
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.src = asset.url
          img.onload = () => {
            cache.set(asset.id, img)
            resolve()
          }
          img.onerror = () => reject(new Error(`Failed to load image: ${asset.filename}`))
          if (signal) signal.addEventListener('abort', () => reject(new Error('Aborted')))
        })
      )
    }
  }

  await Promise.all(promises)
}

/**
 * Renders a single frame at the given time.
 */
async function renderFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  input: RenderInput,
  cache: Map<string, HTMLVideoElement | HTMLImageElement>,
  time: number,
  width: number,
  height: number
): Promise<void> {
  // Clear canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Find the active scene
  const scene = input.timeline.find((s) => time >= s.start && time < s.start + s.duration)
  if (!scene) return

  const asset = scene.videoAsset || scene.imageAsset
  if (!asset) return

  const media = cache.get(asset.id)
  if (!media) return

  // Calculate time within the scene
  const sceneTime = time - scene.start
  const clipTime = scene.trim + sceneTime * scene.rate

  // Seek video if needed
  if (media instanceof HTMLVideoElement) {
    if (Math.abs(media.currentTime - clipTime) > 0.05) {
      media.currentTime = clipTime
      await new Promise((resolve) => {
        media.onseeked = () => resolve(undefined)
        setTimeout(resolve, 100) // fallback
      })
    }
  }

  // Apply animation (zoom, pan, etc.)
  const transform = calculateTransform(scene, sceneTime, width, height, asset.metadata?.width, asset.metadata?.height)

  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.scale, transform.scale)
  ctx.drawImage(media, 0, 0, transform.width, transform.height)
  ctx.restore()

  // TODO: Draw overlays (text, images)
}

/**
 * Calculates the transform (position, scale) for a scene based on its animation.
 */
function calculateTransform(
  scene: TimedScene,
  sceneTime: number,
  canvasW: number,
  canvasH: number,
  srcW = 1920,
  srcH = 1080
): { x: number; y: number; scale: number; width: number; height: number } {
  // Simple zoom animation as an example
  const progress = scene.duration > 0 ? sceneTime / scene.duration : 0
  const baseScale = Math.max(canvasW / srcW, canvasH / srcH)

  let scale = baseScale
  let x = (canvasW - srcW * scale) / 2
  let y = (canvasH - srcH * scale) / 2

  // Apply animation type
  switch (scene.scene.animation_type) {
    case 'zoom_suave':
      scale = baseScale * (1 + progress * 0.1)
      break
    case 'zoom_out':
      scale = baseScale * (1.1 - progress * 0.1)
      break
    case 'pan':
      x += progress * canvasW * 0.1
      break
    // Add more animation types as needed
  }

  return { x, y, scale, width: srcW, height: srcH }
}

/**
 * Mixes all audio (narration + clips) and adds it to the audio source.
 */
async function mixAndAddAudio(
  audioSource: AudioBufferSource,
  input: RenderInput,
  signal?: AbortSignal
): Promise<void> {
  // Create an offline audio context to mix all audio
  const sampleRate = 48000
  const duration = Math.ceil(input.duration)
  const audioCtx = new OfflineAudioContext(2, duration * sampleRate, sampleRate)

  // Load narration segments
  for (const narr of input.narration) {
    if (signal?.aborted) throw new Error('Aborted')
    const buffer = await loadAudioBuffer((narr as any).audio_url || '', audioCtx)
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioCtx.destination)
    source.start(narr.start)
  }

  // Load audio clips
  for (const clip of input.audioClips) {
    if (signal?.aborted) throw new Error('Aborted')
    const asset = (clip as any).audio_asset
    if (!asset) continue
    const buffer = await loadAudioBuffer(asset.url, audioCtx)
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    const gain = audioCtx.createGain()
    gain.gain.value = (clip as any).volume ?? 1
    source.connect(gain)
    gain.connect(audioCtx.destination)
    source.start((clip as any).start, (clip as any).in_point || 0, (clip as any).duration)
  }

  // Render the mixed audio
  const renderedBuffer = await audioCtx.startRendering()

  // Add to audio source
  await audioSource.add(renderedBuffer)
}

/**
 * Loads an audio file and decodes it to an AudioBuffer.
 */
async function loadAudioBuffer(url: string, audioCtx: BaseAudioContext): Promise<AudioBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch audio: ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  return await audioCtx.decodeAudioData(arrayBuffer)
}
