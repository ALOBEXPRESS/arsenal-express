import type { AudioClip } from '@/types/project'

/** Timeline seconds become source seconds after applying playback speed. */
export function splitAudioClip(clip: AudioClip, time: number, rightId: string): [AudioClip, AudioClip] | null {
  const elapsed = time - clip.start
  if (!Number.isFinite(time) || elapsed <= 0.05 || elapsed >= clip.duration - 0.05) return null
  const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1
  return [
    { ...clip, duration: elapsed },
    { ...clip, id: rightId, start: time, duration: clip.duration - elapsed, in_point: (clip.in_point || 0) + elapsed * speed },
  ]
}
