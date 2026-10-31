import type { CreateSceneInput, Scene } from '@/types/project'

/** Produce two adjacent source ranges without dropping any timeline time. */
export function splitSceneData(scene: Scene, point: number, duration: number, trim: number, rate: number) {
  if (!(point > 0 && point < duration && rate > 0 && trim >= 0)) throw new Error('Posição de divisão inválida.')
  const right: Omit<CreateSceneInput, 'project_id' | 'order_index'> = {
    narration_text: scene.narration_text,
    ...(scene.section_index != null ? { section_index: scene.section_index } : {}),
    ...(scene.image_prompt != null ? { image_prompt: scene.image_prompt } : {}),
    ...(scene.video_prompt != null ? { video_prompt: scene.video_prompt } : {}),
    media_type: scene.media_type,
    ...(scene.image_asset_id ? { image_asset_id: scene.image_asset_id } : {}),
    ...(scene.video_asset_id ? { video_asset_id: scene.video_asset_id } : {}),
    ...(scene.audio_asset_id ? { audio_asset_id: scene.audio_asset_id } : {}),
    ...(scene.audio_start != null ? { audio_start: scene.audio_start + point } : {}),
    audio_duration: duration - point,
    ...(scene.animation_type ? { animation_type: scene.animation_type } : {}),
    transition_in: 'cut',
    generated_in_flow: scene.generated_in_flow,
    metadata: { ...scene.metadata, trim: trim + point * rate, speed: rate },
  }
  return { left: { audio_duration: point, metadata: { ...scene.metadata, trim, speed: rate } }, right }
}
