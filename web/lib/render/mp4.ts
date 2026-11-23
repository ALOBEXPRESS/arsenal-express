import { sceneMixVolume } from '@/lib/narrationMix'
import { audioFade } from '@/lib/audioFade'
/**
 * Client-side MP4 rendering using mediabunny + WebCodecs.
 * Takes a timeline (scenes + narration + overlays) and renders it to a downloadable MP4 file.
 */

import {
  Input,
  BlobSource,
  ALL_FORMATS,
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
import { barLayout } from '@/lib/sync/barLayout'
import { mediaUrl } from '@/lib/storage/media'
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
  try {
  await preloadAssets(input, assetCache, signal)

  // Render frames
  const frameDuration = 1 / frameRate
  const totalFrames = Math.ceil(input.duration * frameRate)
  let frameIndex = 0
  let lastProgress = -1

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
    const progress = Math.floor(frameIndex * 100 / totalFrames)
    if (progress !== lastProgress) { lastProgress = progress; onProgress?.(frameIndex / totalFrames) }
  }

  // Mix audio and add to audio track
  await mixAndAddAudio(audioSource, input, assetCache, signal)

  // Finalize
  await output.finalize()

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Output buffer is null')

  return new Uint8Array(buffer)
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  } finally {
    for (const media of assetCache.values()) {
      const url = media.src
      if (media instanceof HTMLVideoElement) { media.pause(); media.removeAttribute('src'); media.load() }
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    assetCache.clear()
  }
}

/**
 * Preloads all video and image assets used in the timeline and overlays.
 */
async function preloadAssets(
  input: RenderInput,
  cache: Map<string, HTMLVideoElement | HTMLImageElement>,
  signal?: AbortSignal
): Promise<void> {
  const assets = new Map<string, Asset>()
  for (const scene of input.timeline) { const asset = scene.videoAsset || scene.imageAsset; if (asset) assets.set(asset.id, asset) }
  for (const overlay of input.overlays) { const asset = (overlay as OverlayClip & { asset?: Asset }).asset; if (asset) assets.set(asset.id, asset) }
  // Load sequentially and use local blobs: avoids simultaneous remote media requests
  // and lets downloads finish before their signed URLs expire during rendering.
  for (const asset of assets.values()) {
    if (signal?.aborted) throw new Error('Renderização cancelada')
    const url = await mediaUrl(asset)
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Não foi possível baixar ${asset.filename} (HTTP ${response.status}).`)
    const blob = await response.blob()
    if (!blob.size) throw new Error(`O arquivo ${asset.filename} está vazio.`)
    const isVideo = asset.type === 'video' || (asset.type === 'asset' && /\.(mp4|mov|webm)$/i.test(asset.filename))
    const localUrl = URL.createObjectURL(blob)
    const media = isVideo ? document.createElement('video') : new Image()
    cache.set(asset.id, media)
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
        media.onload = null; media.onerror = null
        if (media instanceof HTMLVideoElement) media.onloadeddata = null
        error ? reject(error) : resolve()
      }
      const abort = () => finish(new Error('Renderização cancelada'))
      const timeout = setTimeout(() => finish(new Error(`Tempo esgotado ao abrir ${asset.filename}.`)), 30000)
      signal?.addEventListener('abort', abort, { once: true })
      media.onerror = () => finish(new Error(`Não foi possível decodificar ${asset.filename}. O arquivo foi baixado; confira o codec ou exporte-o novamente como MP4 H.264.`))
      if (media instanceof HTMLVideoElement) { media.preload = 'auto'; media.muted = true; media.onloadeddata = () => finish(); media.src = localUrl; media.load() }
      else { media.onload = () => finish(); media.src = localUrl }
    })
  }
}

/**
 * Renders a single frame at the given time.
 */
/**
 * Maps CSS blend modes to canvas globalCompositeOperation values.
 */
function mapBlendModeToComposite(blendMode: string): GlobalCompositeOperation {
  const map: Record<string, GlobalCompositeOperation> = {
    normal: 'source-over',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    'soft-light': 'soft-light',
    'hard-light': 'hard-light',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity',
  }
  return map[blendMode] || 'source-over'
}

/**
 * Applies brightness, contrast, and saturation filters to image data.
 */
function applyFiltersToImageData(
  imageData: ImageData,
  brightness: number,
  contrast: number,
  saturation: number
): ImageData {
  const data = imageData.data
  const brightnessFactor = 1 + brightness / 100
  const contrastFactor = 1 + contrast / 100
  const contrastOffset = (1 - contrastFactor) * 128
  const saturationFactor = 1 + saturation / 100

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]

    // Apply brightness
    r = Math.min(255, r * brightnessFactor)
    g = Math.min(255, g * brightnessFactor)
    b = Math.min(255, b * brightnessFactor)

    // Apply contrast
    r = Math.min(255, Math.max(0, r * contrastFactor + contrastOffset))
    g = Math.min(255, Math.max(0, g * contrastFactor + contrastOffset))
    b = Math.min(255, Math.max(0, b * contrastFactor + contrastOffset))

    // Apply saturation (convert to HSL, adjust S, convert back to RGB)
    if (saturationFactor !== 1) {
      const max = Math.max(r, g, b) / 255
      const min = Math.min(r, g, b) / 255
      const l = (max + min) / 2
      let s = max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min)
      s = Math.max(0, Math.min(1, s * saturationFactor))
      const c = (1 - Math.abs(2 * l - 1)) * s
      const x = c * (1 - (((l * 2) % 2) % 1 === 0 ? 1 : -1))
      const m = l - c / 2
      let [rp, gp, bp] = [0, 0, 0]
      if (l < 0.33) {
        [rp, gp, bp] = [c, x, 0]
      } else if (l < 0.66) {
        [rp, gp, bp] = [x, c, 0]
      } else {
        [rp, gp, bp] = [0, c, x]
      }
      r = Math.round((rp + m) * 255)
      g = Math.round((gp + m) * 255)
      b = Math.round((bp + m) * 255)
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }

  return imageData
}

/**
 * Draws an image with filters applied via canvas.filter or pixel manipulation.
 */
async function drawImageWithFilters(
  ctx: OffscreenCanvasRenderingContext2D,
  image: HTMLVideoElement | HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
  saturation: number
): Promise<void> {
  if (brightness === 0 && contrast === 0 && saturation === 0) {
    ctx.drawImage(image, x, y, width, height)
    return
  }
  // Try using canvas.filter first
  if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
    const filters: string[] = []
    if (brightness !== 0) filters.push(`brightness(${100 + brightness}%)`)
    if (contrast !== 0) filters.push(`contrast(${100 + contrast}%)`)
    if (saturation !== 0) filters.push(`saturate(${100 + saturation}%)`)
    
    if (filters.length > 0) {
      try {
        ctx.filter = filters.join(' ')
        ctx.drawImage(image, x, y, width, height)
        ctx.filter = 'none'
        return
      } catch (e) {
        // Filter not supported, try pixel manipulation fallback
        console.warn('Canvas filter not supported, using pixel manipulation:', e)
      }
    }
  }

  // Fallback: Draw to temporary canvas and apply filters via pixel manipulation
  const tempCanvas = new OffscreenCanvas(width, height)
  const tempCtx = tempCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  
  tempCtx.drawImage(image, 0, 0, width, height)
  const imageData = tempCtx.getImageData(0, 0, width, height)
  const filtered = applyFiltersToImageData(imageData, brightness, contrast, saturation)
  tempCtx.putImageData(filtered, 0, 0)
  
  ctx.drawImage(tempCanvas, x, y, width, height)
}

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
  // Decode dimensions belong to this file; imported metadata may be absent or stale.
  const nativeW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
  const nativeH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
  if (!(nativeW > 0 && nativeH > 0)) throw new Error(`Dimensões do arquivo indisponíveis: ${asset.filename}`)
  const transform = calculateTransform(scene, sceneTime, width, height, nativeW, nativeH)

  ctx.save()
  ctx.translate(transform.x + (transform.width * transform.scale) / 2, transform.y + (transform.height * transform.scale) / 2)
  if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180)
  ctx.scale(transform.scale, transform.scale)
  ctx.drawImage(media, -transform.width / 2, -transform.height / 2, transform.width, transform.height)
  ctx.restore()

  // Draw overlays (images, videos, text)
  for (const overlay of input.overlays) {
    if (time < overlay.start || time >= overlay.start + overlay.duration) continue

    if (overlay.kind === 'text' && overlay.auto_caption && overlay.text_content) {
      ctx.save();const size=height/34;ctx.font=`bold ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=overlay.opacity
      const words=overlay.text_content.split(/\s+/),lines:string[]=[];let line=''
      for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width*0.88){lines.push(line);line=word}else line=next}if(line)lines.push(line)
      lines.forEach((text,i)=>{const y=height*0.8+(i-(lines.length-1)/2)*size*1.25;const w=ctx.measureText(text).width;ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect((width-w)/2-size*0.2,y-size*0.65,w+size*0.4,size*1.3);ctx.fillStyle=overlay.text_style?.color||'#fff';ctx.fillText(text,width/2,y)})
      ctx.restore()
    } else if (overlay.kind === 'text' && overlay.text_content) {
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
      const nativeW = overlayAsset instanceof HTMLVideoElement ? overlayAsset.videoWidth : overlayAsset.naturalWidth
      const nativeH = overlayAsset instanceof HTMLVideoElement ? overlayAsset.videoHeight : overlayAsset.naturalHeight
      const fit = Math.min(width / nativeW, height / nativeH) * overlay.scale
      const overlayW = nativeW * fit
      const overlayH = nativeH * fit
      if (overlay.assembly_bar && overlay.assembly_bar_height) {
        const bar = barLayout({ canvasWidth: width, canvasHeight: height, mediaWidth: nativeW, mediaHeight: nativeH, position: overlay.assembly_bar, storedHeight: overlay.assembly_bar_height, storedY: overlay.y, customHeight: overlay.assembly_bar_custom_height, auto: overlay.assembly_bar_custom_height == null && overlay.assembly_bar_height === 0.08 })
        if (bar) {
          const bh = height * bar.height, by = (height - bh) / 2 - bar.y * height / 2
          ctx.beginPath(); ctx.rect(0, by, width, bh); ctx.clip()
          const cover = Math.max(width / nativeW, bh / nativeH) * overlay.scale
          const iw = nativeW * cover, ih = nativeH * cover
          const pos = Math.max(0, Math.min(1, overlay.crop_position_y ?? 0))
          await drawImageWithFilters(ctx, overlayAsset, (width - iw) / 2 + overlay.x * width / 2, by - (ih - bh) * pos, iw, ih, overlay.brightness ?? 0, overlay.contrast ?? 0, overlay.saturation ?? 0)
          ctx.restore(); continue
        }
      }
      
      // Apply blend mode (must be set before drawing)
      const blendMode = overlay.blend_mode || 'normal'
      if (blendMode !== 'normal') {
        ctx.globalCompositeOperation = mapBlendModeToComposite(blendMode)
      }
      
      // Apply color filters using canvas filter property
      const brightness = overlay.brightness ?? 0
      const contrast = overlay.contrast ?? 0
      const saturation = overlay.saturation ?? 0
      
      await drawImageWithFilters(
        ctx,
        overlayAsset,
        overlayX - overlayW / 2,
        overlayY - overlayH / 2,
        overlayW,
        overlayH,
        brightness,
        contrast,
        saturation
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
): { x: number; y: number; scale: number; width: number; height: number; rotation: number } {
  // Simple zoom animation as an example
  const progress = scene.duration > 0 ? sceneTime / scene.duration : 0
  const baseScale = Math.max(canvasW / srcW, canvasH / srcH)

  let animScale = 1
  let animX = 0

  // Apply animation type
  switch (scene.scene.animation_type) {
    case 'zoom_suave':
      animScale = 1 + progress * 0.1
      break
    case 'zoom_out':
      animScale = 1.1 - progress * 0.1
      break
    case 'pan':
      animX = progress * 0.1 // fraction of half-canvas
      break
    // Add more animation types as needed
  }

  // Read manual transform from scene metadata
  const meta = (scene.scene.metadata || {}) as Record<string, unknown>
  const manualScale = typeof meta.scale === 'number' ? meta.scale : 1
  const manualX = typeof meta.x === 'number' ? meta.x : 0
  const manualY = typeof meta.y === 'number' ? meta.y : 0
  const manualRotation = typeof meta.rotation === 'number' ? meta.rotation : 0

  // Merge: manual scale multiplies animation scale, manual X/Y adds to animation X
  const finalScale = baseScale * manualScale * animScale
  const x = (canvasW - srcW * finalScale) / 2 + (manualX + animX) * (canvasW / 2)
  const y = (canvasH - srcH * finalScale) / 2 - manualY * (canvasH / 2)

  return { x, y, scale: finalScale, width: srcW, height: srcH, rotation: manualRotation }
}

/**
 * Mixes all audio (narration + clips) and adds it to the audio source.
 */
async function mixAndAddAudio(
  audioSource: AudioBufferSource,
  input: RenderInput,
  assetCache: Map<string, HTMLVideoElement | HTMLImageElement>,
  signal?: AbortSignal
): Promise<void> {
  // Create an offline audio context to mix all audio
  const sampleRate = 48000
  const duration = Math.ceil(input.duration)
  const audioCtx = new OfflineAudioContext(2, duration * sampleRate, sampleRate)

  const decoded = new Map<string, AudioBuffer | null>()
  const load = async (asset: Asset, required = false) => {
    if (signal?.aborted) throw new Error('Renderização cancelada')
    if (!decoded.has(asset.id)) {
      try {
        // Video preload already fetched a fresh authorized URL. Reuse its blob.
        const url = assetCache.get(asset.id)?.src || await mediaUrl(asset)
        const buffer = await loadAudioBuffer(url, audioCtx, signal)
        decoded.set(asset.id, buffer)
      } catch {
        throw new Error(`Não foi possível carregar o áudio de "${asset.filename}". A exportação foi interrompida para evitar um vídeo sem som. Tente novamente.`)
      }
    }
    const buffer = decoded.get(asset.id)!
    if (required && !buffer) throw new Error(`O arquivo "${asset.filename}" não contém uma faixa de áudio.`)
    return buffer
  }
  for (const narration of input.narration as any[]) {
    if (!narration.asset) throw new Error('Narração sem arquivo de áudio disponível.')
    const buffer = (await load(narration.asset, true))!
    const source = audioCtx.createBufferSource(); source.buffer = buffer
    const gain = audioCtx.createGain(); gain.gain.value = narration.volume ?? 1
    source.playbackRate.value = narration.speed || 1
    source.connect(gain); gain.connect(audioCtx.destination)
    const offset = narration.in_point || 0
    source.start(narration.start, offset, Math.min(narration.duration * source.playbackRate.value, buffer.duration - offset))
  }
  // Load audio from scenes (áudio de narração ou voz)
  for (const scene of input.timeline) {
    if (signal?.aborted) throw new Error('Aborted')
    
    // Scene audio is specified via audio_asset_id in the Scene object
    const sceneAudio = scene.videoAsset
    if (!sceneAudio) continue
    
    try {
      const buffer = await load(sceneAudio)
      if (!buffer) continue
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      
      // Apply speed/rate
      source.playbackRate.value = scene.rate || 1
      
      // Connect to destination
      const gain = audioCtx.createGain()
      const intervals=(scene.scene.metadata?.voice_mute_intervals || undefined) as {start:number;end:number}[] | undefined
      const points=[scene.start,...input.narration.flatMap(n=>[n.start,n.start+n.duration]),...(intervals||[]).flatMap(v=>[scene.start+v.start,scene.start+v.end])]
      for(const time of [...new Set(points)].filter(t=>t>=scene.start&&t<scene.start+scene.duration).sort((a,b)=>a-b)) {
        gain.gain.setValueAtTime(sceneMixVolume(time,scene.start,scene.scene.metadata?.volume,input.narration,intervals),time)
      }
      source.connect(gain).connect(audioCtx.destination)
      const offset = scene.trim || 0
      if (offset < buffer.duration) { source.start(scene.start, offset, Math.min(scene.duration * source.playbackRate.value, buffer.duration - offset)) }
    } catch (err) {
      throw err
    }
  }

  // Load audio clips (música, SFX)
  for (const clip of input.audioClips) {
    if (signal?.aborted) throw new Error('Aborted')
    
    const asset = (clip as any).asset
    if (!asset) throw new Error('Faixa de áudio sem arquivo disponível.')
    
    try {
      const buffer = (await load(asset, true))!
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = clip.speed || 1
      
      const gain = audioCtx.createGain()
      const volume=clip.volume ?? 1
      const fade=audioFade(clip.duration,clip.fade_in,clip.fade_out)
      gain.gain.setValueAtTime(fade.fadeIn ? 0 : volume,clip.start)
      if(fade.fadeIn) gain.gain.linearRampToValueAtTime(volume,clip.start+fade.fadeIn)
      gain.gain.setValueAtTime(volume,clip.start+clip.duration-fade.fadeOut)
      if(fade.fadeOut) gain.gain.linearRampToValueAtTime(0,clip.start+clip.duration)
      
      source.connect(gain)
      gain.connect(audioCtx.destination)
      source.start(clip.start, clip.in_point || 0, Math.min(clip.duration * source.playbackRate.value, buffer.duration - (clip.in_point || 0)))
    } catch (err) {
      throw err
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
async function loadAudioBuffer(url: string, audioCtx: BaseAudioContext, signal?: AbortSignal): Promise<AudioBuffer | null> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Falha ao baixar áudio')
  const blob = await response.blob()
  const media = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    // A genuinely silent video is valid; a failed download/decode is not.
    if (!await media.getPrimaryAudioTrack()) return null
    return await audioCtx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    media.dispose()
  }
}
