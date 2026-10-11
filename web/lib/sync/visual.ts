// Visual math shared by the preview monitor and the effect picker tiles,
// so what you see in the picker is exactly what plays (and what goes to CapCut).
import { ANIMATION_BY_ID, normalizeAnimation, poseWithParams, type AnimationParams, type TransitionId } from './presets'

export function animationPose(
  animationId: string | null | undefined,
  local: number,
  duration: number,
  params?: Partial<AnimationParams> | null
) {
  const preset = ANIMATION_BY_ID.get(normalizeAnimation(animationId) as never)
  if (!preset || duration <= 0) return { scale: 1, x: 0 }
  return poseWithParams(preset, local, duration, params)
}

export function poseToTransform(p: { scale: number; x: number }, extraScale = 1) {
  // translate3d + rounded scale → composited on the GPU, no sub-pixel shimmer
  return `translate3d(${(p.x * 50).toFixed(3)}%, 0, 0) scale(${(p.scale * extraScale).toFixed(4)})`
}

/** Incoming/outgoing layer treatment during a transition (p: 0→1) */
export function transitionStyle(type: TransitionId, p: number) {
  switch (type) {
    case 'flash_branco':
    case 'flash_preto':
      return { incoming: p >= 0.5 ? 1 : 0, flash: 1 - Math.abs(2 * p - 1), inScale: 1, outScale: 1 }
    case 'empurrar':
      return { incoming: p, flash: 0, inScale: 1.15 - 0.15 * p, outScale: 1 + 0.25 * p }
    case 'afastar':
      return { incoming: p, flash: 0, inScale: 0.85 + 0.15 * p, outScale: 1 - 0.15 * p }
    case 'cut':
      return { incoming: 1, flash: 0, inScale: 1, outScale: 1 }
    default:
      return { incoming: p, flash: 0, inScale: 1, outScale: 1 }
  }
}
