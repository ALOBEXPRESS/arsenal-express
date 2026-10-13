// Types para o sistema de projetos, assets e cenas
import type { SyncSettings, AnimationParams } from '@/lib/sync/presets'

export type ProjectMode = 'upload' | 'script-to-prompt'
export type ProjectStatus = 'draft' | 'in_progress' | 'ready' | 'completed'
export type OutputFormat = 'auto' | '16:9' | '9:16' | '1:1'
export type TransitionType = 'cut' | 'dissolve' | 'fade' | 'wipe' | 'slide' | 'fadeblack' | 'fadewhite'
export type AnimationType = 'none' | 'zoom' | 'pan' | 'ken-burns'
export type AssetType = 'video' | 'audio' | 'image' | 'asset'
export type AssetSubtype = 'gif' | 'mov' | 'lottie' | 'sticker-png' | 'sticker-svg' | 'sticker-gif'

export interface Project {
  id: string
  user_id: string
  title: string
  description?: string | null
  mode: ProjectMode
  status: ProjectStatus
  settings: ProjectSettings
  created_at: string
  updated_at: string
}

export interface ProjectSettings {
  output_format: OutputFormat
  target_duration?: number
  default_transition: TransitionType
  fps?: number
  audio_bitrate?: string
  video_codec?: string
  /** Continuous narration built by Auto Assemble (N audio files played back-to-back) */
  narration_track?: NarrationSegment[]
  /** SyncExpress assembly options (rhythm, animations, transitions) */
  sync?: Partial<SyncSettings>
  /** Image/video layers above the main track (CapCut "Sobreposição") — legacy, single timeline */
  overlays?: OverlayClip[]
  /** Extra audio (music, SFX) dropped on the audio lane — legacy, single timeline */
  audio_clips?: AudioClip[]
  /** Independent timelines (CapCut "Linha do tempo 01, 02…"). Scenes link via metadata.sub */
  subprojects?: Subproject[]
}

export interface Subproject {
  id: string
  name: string
  narration_track: NarrationSegment[]
  /** Text/bar overlays (top layer) */
  overlays: OverlayClip[]
  /** Image/video overlays (middle layer - between text overlays and main media) */
  image_overlays: OverlayClip[]
  audio_clips: AudioClip[]
  adjustments: AdjustClip[]
}

/** Adjustment layer clip (CapCut "Ajuste"): look preset + editable values (CapCut units) */
export interface AdjustClip {
  id: string
  start: number
  duration: number
  /** look preset id (lib/sync/adjust LOOKS) or null = custom */
  look: string | null
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  fade: number
  vignette: number
  /** strength of the CapCut catalog filter, when the look has one (0..1) */
  filter_intensity?: number
}

/** Overlay layer. x/y/scale use CapCut units: x,y = fraction of HALF canvas (y up), scale 1 = fit canvas */
export interface OverlayClip {
  id: string
  asset_id: string
  kind: 'image' | 'video' | 'text'
  /** timeline seconds */
  start: number
  duration: number
  scale: number
  x: number
  y: number
  /** 0..1 */
  opacity: number
  /** video only */
  speed: number
  /** video only, 0..2 (1 = original) */
  volume: number
  /** seconds of the source skipped at the start (set by the cut tool) */
  in_point?: number
  /** CapCut animation for entrance */
  animation_in?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'
  /** CapCut animation for exit */
  animation_out?: 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'
  /** Animation duration in seconds (default: 0.3) */
  animation_duration?: number
  /** Text overlay fields */
  text_content?: string
  text_style?: {
    font_family?: string
    font_size?: number
    font_weight?: 'normal' | 'bold' | 'bolder' | 'lighter'
    color?: string
    background_color?: string
    background_opacity?: number
    padding?: number
    alignment?: 'left' | 'center' | 'right'
  }
}

export interface AudioClip {
  id: string
  asset_id: string
  start: number
  duration: number
  /** 0..2 (1 = original) */
  volume: number
  speed: number
  /** seconds of the source skipped at the start (set by the cut tool) */
  in_point?: number
}

/** Per-scene editable properties kept in scenes.metadata */
export interface SceneProps {
  /** user playback speed (overrides the automatic slow-down) */
  speed?: number
  /** clip audio level 0..2 (default: low under narration) */
  volume?: number
  /** seconds of the source skipped at the start (set by the cut tool) */
  in_point?: number
  /** duration after trim (from in_point to out_point in seconds) */
  trim?: number
  anim?: Partial<AnimationParams>
}

export interface NarrationSegment {
  asset_id: string
  /** Global start time on the project timeline (seconds) */
  start: number
  duration: number
  /** Playback speed multiplier (0.5x to 2x, default: 1) */
  speed?: number
}

export interface Asset {
  id: string
  project_id: string
  type: AssetType
  kind?: AssetType
  filename: string
  storage_path: string
  /** Signed URL generated on fetch (bucket is private) */
  url: string
  duration?: number | null
  duration_seconds?: number | null
  file_size_bytes?: number | null
  /** For audio assets: true = narration track, false/undefined = music/SFX track */
  is_narration?: boolean
  /** For video/image assets: marks asset as favorite for quick access in overlays */
  is_favorite?: boolean
  /** For 'asset' type: subtype classification (gif, mov, lottie, sticker-*) */
  subtype?: AssetSubtype
  metadata?: Record<string, any> | null
  created_at: string
}

export interface Scene {
  id: string
  project_id: string
  order_index: number
  section_index?: number | null
  narration_text: string
  image_prompt?: string | null
  video_prompt?: string | null
  media_type: 'video_clip' | 'still_image'
  image_asset_id?: string | null
  video_asset_id?: string | null
  audio_asset_id?: string | null
  audio_start?: number | null
  audio_duration?: number | null
  animation_type?: string | null
  transition_in?: string | null
  generated_in_flow: boolean
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  // Trim fields (from metadata)
  in_point?: number
  trim?: number
}

export interface CreateProjectInput {
  title: string
  description?: string
  mode: ProjectMode
  settings: ProjectSettings
}

export interface UpdateProjectInput {
  title?: string
  description?: string
  status?: ProjectStatus
  settings?: Partial<ProjectSettings>
}

export interface CreateSceneInput {
  project_id: string
  order_index: number
  narration_text: string
  section_index?: number
  image_prompt?: string
  video_prompt?: string
  media_type?: 'video_clip' | 'still_image'
  image_asset_id?: string
  video_asset_id?: string
  audio_asset_id?: string
  audio_start?: number
  audio_duration?: number
  animation_type?: string
  transition_in?: string
  generated_in_flow?: boolean
  metadata?: Record<string, any>
}

export interface UploadAssetInput {
  project_id: string
  type: AssetType
  file: File
}

// Sound Effects Library Types
export type SFXCategory = 
  | 'whoosh' 
  | 'wish'
  | 'ui' 
  | 'impact' 
  | 'glitch' 
  | 'suspense' 
  | 'cinematic' 
  | 'comedy' 
  | 'ambient'
  | 'custom'

export interface SoundEffect {
  id: string
  category: SFXCategory
  name: string
  filename: string
  path: string
  duration: number
  tags: string[]
  license: string
  attribution: string | null
}

export interface SFXManifest {
  version: string
  info: {
    description: string
    license: string
    sources: string[]
  }
  effects: SoundEffect[]
}
