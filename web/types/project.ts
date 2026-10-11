// Types para o sistema de projetos, assets e cenas
import type { SyncSettings, AnimationParams } from '@/lib/sync/presets'

export type ProjectMode = 'upload' | 'script-to-prompt'
export type ProjectStatus = 'draft' | 'in_progress' | 'ready' | 'completed'
export type OutputFormat = 'auto' | '16:9' | '9:16' | '1:1'
export type TransitionType = 'cut' | 'dissolve' | 'fade' | 'wipe' | 'slide' | 'fadeblack' | 'fadewhite'
export type AnimationType = 'none' | 'zoom' | 'pan' | 'ken-burns'
export type AssetType = 'video' | 'audio' | 'image'

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
  overlays: OverlayClip[]
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
  kind: 'image' | 'video'
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
}

export interface AudioClip {
  id: string
  asset_id: string
  start: number
  duration: number
  /** 0..2 (1 = original) */
  volume: number
  speed: number
}

/** Per-scene editable properties kept in scenes.metadata */
export interface SceneProps {
  /** user playback speed (overrides the automatic slow-down) */
  speed?: number
  /** clip audio level 0..2 (default: low under narration) */
  volume?: number
  anim?: Partial<AnimationParams>
}

export interface NarrationSegment {
  asset_id: string
  /** Global start time on the project timeline (seconds) */
  start: number
  duration: number
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
