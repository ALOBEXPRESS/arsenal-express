import type { Scene, Asset, Project } from '@/types/project'

interface FFmpegCommand {
  input: string
  filters: string[]
  output: string
}

interface RenderConfig {
  project: Project
  scenes: Scene[]
  assets: Asset[]
}

/**
 * Gera comando FFmpeg completo baseado nas cenas do projeto
 * Baseado no assembler Python validado na Fase 0
 */
export function generateFFmpegCommand(config: RenderConfig): string {
  const { project, scenes, assets } = config

  if (scenes.length === 0) {
    throw new Error('No scenes to render')
  }

  // Get output settings
  const settings = project.settings
  const fps = settings.fps || 30
  const outputFormat = settings.output_format || '16:9'
  const videoBitrate = '5000k'
  const audioBitrate = settings.audio_bitrate || '192k'

  // Calculate resolution based on output format
  const resolution = getResolution(outputFormat)

  // Build filter complex
  const filterComplex: string[] = []
  const inputs: string[] = []
  let inputIndex = 0

  // Process each scene
  scenes.forEach((scene, sceneIndex) => {
    const videoAsset = assets.find((a) => a.id === scene.video_asset_id)
    const imageAsset = assets.find((a) => a.id === scene.image_asset_id)
    const audioAsset = assets.find((a) => a.id === scene.audio_asset_id)

    // Video/Image input
    if (videoAsset) {
      inputs.push(`-i "${videoAsset.storage_path}"`)
      
      // Trim video to scene duration
      filterComplex.push(
        `[${inputIndex}:v]trim=0:${scene.duration},setpts=PTS-STARTPTS,` +
        `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,` +
        `pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${fps}[v${sceneIndex}]`
      )
      inputIndex++
    } else if (imageAsset) {
      inputs.push(`-loop 1 -t ${scene.duration} -i "${imageAsset.storage_path}"`)
      
      // Apply animation if specified
      const animation = getAnimationFilter(scene.animation, scene.duration, resolution)
      filterComplex.push(
        `[${inputIndex}:v]${animation},` +
        `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,` +
        `pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,` +
        `setsar=1,fps=${fps}[v${sceneIndex}]`
      )
      inputIndex++
    } else {
      // Black frame if no media
      filterComplex.push(
        `color=c=black:s=${resolution.width}x${resolution.height}:d=${scene.duration}:r=${fps}[v${sceneIndex}]`
      )
    }

    // Audio input
    if (audioAsset) {
      inputs.push(`-i "${audioAsset.storage_path}"`)
      filterComplex.push(
        `[${inputIndex}:a]atrim=0:${scene.duration},asetpts=PTS-STARTPTS[a${sceneIndex}]`
      )
      inputIndex++
    } else {
      // Silent audio
      filterComplex.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${scene.duration}[a${sceneIndex}]`
      )
    }
  })

  // Concatenate video streams with transitions
  const videoConcat = scenes.map((scene, i) => {
    const transition = getTransitionFilter(scene.transition_out, 1.0) // 1 second transition
    return `[v${i}]`
  }).join('')
  
  filterComplex.push(
    `${videoConcat}concat=n=${scenes.length}:v=1:a=0[vout]`
  )

  // Concatenate audio streams
  const audioConcat = scenes.map((_, i) => `[a${i}]`).join('')
  filterComplex.push(
    `${audioConcat}concat=n=${scenes.length}:v=0:a=1[aout]`
  )

  // Build final command
  const command = [
    'ffmpeg',
    ...inputs,
    '-filter_complex',
    `"${filterComplex.join(';')}"`,
    '-map "[vout]"',
    '-map "[aout]"',
    `-c:v ${settings.video_codec || 'libx264'}`,
    '-preset medium',
    '-crf 23',
    `-b:v ${videoBitrate}`,
    '-c:a aac',
    `-b:a ${audioBitrate}`,
    '-movflags +faststart',
    'output.mp4',
  ].join(' ')

  return command
}

/**
 * Gera configuração de cena individual para salvar como JSON
 * (compatível com o assembler.py da Fase 0)
 */
export function generateScenesJSON(config: RenderConfig): string {
  const { scenes, assets } = config

  const scenesData = scenes.map((scene, index) => {
    const videoAsset = assets.find((a) => a.id === scene.video_asset_id)
    const imageAsset = assets.find((a) => a.id === scene.image_asset_id)
    const audioAsset = assets.find((a) => a.id === scene.audio_asset_id)

    return {
      id: index + 1,
      media: {
        type: videoAsset ? 'video' : imageAsset ? 'image' : 'none',
        path: videoAsset?.storage_path || imageAsset?.storage_path || null,
      },
      audio: {
        path: audioAsset?.storage_path || null,
      },
      duration: scene.duration,
      transition: scene.transition_out,
      animation: scene.animation || 'none',
    }
  })

  return JSON.stringify({ scenes: scenesData }, null, 2)
}

// Helper functions

function getResolution(format: string): { width: number; height: number } {
  switch (format) {
    case '16:9':
      return { width: 1920, height: 1080 }
    case '9:16':
      return { width: 1080, height: 1920 }
    case '1:1':
      return { width: 1080, height: 1080 }
    default:
      return { width: 1920, height: 1080 }
  }
}

function getAnimationFilter(
  animation: string | null | undefined,
  duration: number,
  resolution: { width: number; height: number }
): string {
  if (!animation || animation === 'none' || duration > 40) {
    // Skip animation for long scenes (performance)
    return 'null'
  }

  switch (animation) {
    case 'zoom':
      return `zoompan=z='min(zoom+0.0015,1.5)':d=${duration * 30}:s=${resolution.width}x${resolution.height}`
    
    case 'pan':
      return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+${duration}*5':d=${duration * 30}:s=${resolution.width}x${resolution.height}`
    
    case 'ken-burns':
      return `zoompan=z='min(max(zoom,pzoom)+0.001,1.5)':d=${duration * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${resolution.width}x${resolution.height}`
    
    default:
      return 'null'
  }
}

function getTransitionFilter(transition: string, duration: number): string {
  switch (transition) {
    case 'dissolve':
      return `xfade=transition=fade:duration=${duration}:offset=0`
    
    case 'fade':
    case 'fadeblack':
      return `xfade=transition=fadeblack:duration=${duration}:offset=0`
    
    case 'fadewhite':
      return `xfade=transition=fadewhite:duration=${duration}:offset=0`
    
    case 'wipe':
      return `xfade=transition=wipeleft:duration=${duration}:offset=0`
    
    case 'slide':
      return `xfade=transition=slideleft:duration=${duration}:offset=0`
    
    case 'cut':
    default:
      return ''
  }
}

/**
 * Valida se todas as cenas têm os assets necessários
 */
export function validateScenes(scenes: Scene[], assets: Asset[]): string[] {
  const errors: string[] = []

  scenes.forEach((scene, index) => {
    // Check if scene has at least video OR image
    const hasVideo = scene.video_asset_id && assets.some((a) => a.id === scene.video_asset_id)
    const hasImage = scene.image_asset_id && assets.some((a) => a.id === scene.image_asset_id)

    if (!hasVideo && !hasImage) {
      errors.push(`Scene ${index + 1}: No video or image asset`)
    }

    // Check audio if specified
    if (scene.audio_asset_id && !assets.some((a) => a.id === scene.audio_asset_id)) {
      errors.push(`Scene ${index + 1}: Audio asset not found`)
    }

    // Check duration
    if (scene.duration < 1 || scene.duration > 120) {
      errors.push(`Scene ${index + 1}: Invalid duration (${scene.duration}s)`)
    }
  })

  return errors
}
