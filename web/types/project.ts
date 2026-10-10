// Types para o sistema de projetos, assets e cenas

export type ProjectMode = 'upload' | 'script-to-prompt'
export type ProjectStatus = 'draft' | 'in_progress' | 'ready' | 'completed'
export type OutputFormat = '16:9' | '9:16' | '1:1'
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
}

export interface Asset {
  id: string
  project_id: string
  type: AssetType
  filename: string
  storage_path: string
  url: string
  duration?: number | null
  metadata?: Record<string, any> | null
  created_at: string
}

export interface Scene {
  id: string
  project_id: string
  order: number
  duration: number
  video_asset_id?: string | null
  audio_asset_id?: string | null
  image_asset_id?: string | null
  transition_in: TransitionType
  transition_out: TransitionType
  animation?: AnimationType | null
  veo_prompt?: string | null
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
  order: number
  duration: number
  video_asset_id?: string
  audio_asset_id?: string
  image_asset_id?: string
  transition_in?: TransitionType
  transition_out?: TransitionType
  animation?: AnimationType
  veo_prompt?: string
}

export interface UploadAssetInput {
  project_id: string
  type: AssetType
  file: File
}
