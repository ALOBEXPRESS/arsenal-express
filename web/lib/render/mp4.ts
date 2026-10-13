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
  await preloadAssets(input, assetCache, signal)

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
 * Preloads all video and image assets used in the timeline and overlays.
 */
async function preloadAssets(
  input: RenderInput,
  cache: Map<string, HTMLVideoElement | HTMLImageElement>,
  signal?: AbortSignal
): Promise<void> {
  const promises: Promise<void>[] = []
  const loadedIds = new Set<string>()

  // Helper to add load promise
  const addLoadPromise = (asset: { id: string; type: string; url: string; filename: string }) => {
    if (loadedIds.has(asset.id)) return
    loadedIds.add(asset.id)

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

  // Preload scene assets
  for (const scene of input.timeline) {
    const asset = scene.videoAsset || scene.imageAsset
    if (asset) addLoadPromise(asset)
  }

  // Preload overlay assets
  for (const overlay of input.overlays) {
    if (overlay.kind === 'image' || overlay.kind === 'video') {
      // Need to find the asset by ID from the scene or somewhere
      // For now, we'll assume overlays have the asset embedded
      const overlayAsset = (overlay as any).asset
      if (overlayAsset) addLoadPromise(overlayAsset)
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

  // Draw overlays (images, videos, text)
  for (const overlay of input.overlays) {
    if (time < overlay.start || time >= overlay.start + overlay.duration) continue

    if (overlay.kind === 'text' && overlay.text_content) {
      // Draw text overlay
      const style = overlay.text_style || {}
      ctx.save()
      
      // Convert CapCut units to canvas pixels
      // CapCut: x,y are fraction of HALF canvas (y up), scale 1 = fit canvas
      const overlayX = width / 2 + overlay.x * (width / 2)
      const overlayY = height / 2 - overlay.y * (height / 2)
      
      ctx.globalAlpha = overlay.opacity
      ctx.font = `${style.font_weight || 'normal'} ${style.font_size || 24}px ${style.font_family || 'sans-serif'}`
      ctx.fillStyle = style.color || '#ffffff'
      ctx.textAlign = (style.alignment as CanvasTextAlign) || 'center'
      ctx.textBaseline = 'middle'
      
      // Background
      if (style.background_color) {
        const metrics = ctx.measureText(overlay.text_content)
        const textWidth = metrics.width
        const textHeight = (style.font_size || 24) * 1.2
        const padding = style.padding || 10
        
        ctx.globalAlpha = (style.background_opacity || 1) * overlay.opacity
        ctx.fillStyle = style.background_color
        ctx.fillRect(
          overlayX - textWidth / 2 - padding,
          overlayY - textHeight / 2 - padding,
          textWidth + padding * 2,
          textHeight + padding * 2
        )
        ctx.globalAlpha = overlay.opacity
        ctx.fillStyle = style.color || '#ffffff'
      }
      
      ctx.fillText(overlay.text_content, overlayX, overlayY)
      ctx.restore()
    } else if (overlay.kind === 'image' || overlay.kind === 'video') {
      // Draw image/video overlay
      const overlayAsset = cache.get(overlay.asset_id)
      if (!overlayAsset) continue
      
      // Seek video if needed
      if (overlayAsset instanceof HTMLVideoElement) {
        const overlayTime = (time - overlay.start) * overlay.speed + (overlay.in_point || 0)
        if (Math.abs(overlayAsset.currentTime - overlayTime) > 0.05) {
          overlayAsset.currentTime = overlayTime
          await new Promise((resolve) => {
            overlayAsset.onseeked = () => resolve(undefined)
            setTimeout(resolve, 50)
          })
        }
      }
      
      ctx.save()
      ctx.globalAlpha = overlay.opacity
      
      // Convert CapCut units to canvas pixels
      const overlayX = width / 2 + overlay.x * (width / 2)
      const overlayY = height / 2 - overlay.y * (height / 2)
      const overlayW = (overlayAsset.width || width) * overlay.scale
      const overlayH = (overlayAsset.height || height) * overlay.scale
      
      ctx.drawImage(
        overlayAsset,
        overlayX - overlayW / 2,
        overlayY - overlayH / 2,
        overlayW,
        overlayH
      )
      ctx.restore()
    }
  }
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

  // Load audio from scenes (áudio de narração ou voz)
  for (const scene of input.timeline) {
    if (signal?.aborted) throw new Error('Aborted')
    
    // Scene audio is specified via audio_asset_id in the Scene object
    const sceneAudio = (scene.scene as any).audio_asset
    if (!sceneAudio?.url) continue
    
    try {
      const buffer = await loadAudioBuffer(sceneAudio.url, audioCtx)
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      
      // Apply speed/rate
      source.playbackRate.value = scene.rate || 1
      
      // Connect to destination
      source.connect(audioCtx.destination)
      
      // Start at scene time, from trim point
      source.start(scene.start, scene.trim || 0, scene.duration)
    } catch (err) {
      console.warn('[mixAndAddAudio] Failed to load scene audio:', err)
    }
  }

  // Load audio clips (música, SFX)
  for (const clip of input.audioClips) {
    if (signal?.aborted) throw new Error('Aborted')
    
    const asset = (clip as any).asset
    if (!asset?.url) continue
    
    try {
      const buffer = await loadAudioBuffer(asset.url, audioCtx)
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = clip.speed || 1
      
      const gain = audioCtx.createGain()
      gain.gain.value = clip.volume ?? 1
      
      source.connect(gain)
      gain.connect(audioCtx.destination)
      source.start(clip.start, clip.in_point || 0, clip.duration)
    } catch (err) {
      console.warn('[mixAndAddAudio] Failed to load audio clip:', err)
    }
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
