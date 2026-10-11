// SyncExpress presets: clip animations, scene transitions and assembly settings.
// Animations are expressed as keyframes (scale + x offset) so the SAME definition drives
// the browser preview and the CapCut export (KFTypeScaleX / KFTypePositionX keyframes).
// That keeps them free, version-agnostic and identical in both places.

export type AnimationId = 'none' | 'zoom_suave' | 'zoom_dinamico' | 'dobrar_zoom' | 'quicar' | 'zoom_out' | 'pan'
export type TransitionId = 'cut' | 'fusao' | 'flash_branco' | 'flash_preto' | 'empurrar' | 'afastar'
export type PickMode = 'variado' | 'fixo'

/** A pose at normalized time t (0..1) within the clip */
export interface Pose {
  t: number
  scale: number
  /** horizontal offset in fractions of half-canvas width (CapCut KFTypePositionX unit) */
  x: number
}

export interface AnimationPreset {
  id: Exclude<AnimationId, 'none'>
  label: string
  hint: string
  /** Returns the pose at absolute seconds `s` of a clip lasting `dur` seconds */
  pose: (s: number, dur: number) => { scale: number; x: number }
  /** Sample times (seconds) that represent the curve well for keyframe export */
  samples: (dur: number) => number[]
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
const clamp01 = (p: number) => Math.max(0, Math.min(1, p))
const evenly = (dur: number, n: number) => Array.from({ length: n + 1 }, (_, i) => (dur * i) / n)

export const ANIMATIONS: AnimationPreset[] = [
  {
    id: 'zoom_suave',
    label: 'Zoom suave',
    hint: 'Aproxima devagar, o tempo todo',
    pose: (s, dur) => ({ scale: 1 + 0.18 * clamp01(s / dur), x: 0 }),
    samples: (dur) => [0, dur],
  },
  {
    id: 'zoom_dinamico',
    label: 'Zoom dinâmico',
    hint: 'Entra rápido e assenta',
    pose: (s, dur) => ({ scale: 1 + 0.22 * easeOut(clamp01(s / Math.min(dur, 2.2))), x: 0 }),
    samples: (dur) => {
      const end = Math.min(dur, 2.2)
      return [...evenly(end, 5), ...(dur > end ? [dur] : [])]
    },
  },
  {
    id: 'dobrar_zoom',
    label: 'Dobrar zoom',
    hint: 'Dois empurrões de câmera',
    pose: (s, dur) => {
      const half = dur / 2
      const a = easeOut(clamp01(s / Math.min(half, 0.6)))
      const b = s > half ? easeOut(clamp01((s - half) / Math.min(half, 0.6))) : 0
      return { scale: 1 + 0.1 * a + 0.12 * b, x: 0 }
    },
    samples: (dur) => {
      const half = dur / 2
      const k = Math.min(half, 0.6)
      return [0, k / 2, k, half, half + k / 2, half + k, dur].filter((v, i, a) => v <= dur && a.indexOf(v) === i)
    },
  },
  {
    id: 'quicar',
    label: 'Quicar',
    hint: 'Bounce na entrada da cena',
    pose: (s) => {
      // damped bounce over the first 0.9s, then rest slightly zoomed
      if (s >= 0.9) return { scale: 1.04, x: 0 }
      const p = s / 0.9
      return { scale: 1.04 + 0.07 * Math.exp(-5 * p) * Math.cos(p * Math.PI * 2), x: 0 }
    },
    samples: (dur) => [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, dur].filter((v) => v <= dur),
  },
  {
    id: 'zoom_out',
    label: 'Afastar',
    hint: 'Começa perto e abre o quadro',
    pose: (s, dur) => ({ scale: 1.16 - 0.16 * easeInOut(clamp01(s / dur)), x: 0 }),
    samples: (dur) => evenly(dur, 4),
  },
  {
    id: 'pan',
    label: 'Panorâmica',
    hint: 'Desliza de lado com leve zoom',
    // scale - 1 >= |x| keeps the frame edges outside the canvas
    pose: (s, dur) => ({ scale: 1.2, x: -0.12 + 0.24 * easeInOut(clamp01(s / dur)) }),
    samples: (dur) => evenly(dur, 4),
  },
]

export const ANIMATION_BY_ID = new Map(ANIMATIONS.map((a) => [a.id, a]))

// ---------------------------------------------------------------------------
// Per-clip animation properties (scene.metadata.anim; defaults in settings)
// ---------------------------------------------------------------------------

export interface AnimationParams {
  /** 1 = motion spans the whole clip; 2 = finishes in half the time and holds */
  speed: number
  /** multiplies zoom amount and pan distance (1 = preset) */
  intensity: number
  /** plays the motion backwards (zoom in ↔ out, pan left ↔ right) */
  reverse: boolean
}

export const DEFAULT_ANIMATION_PARAMS: AnimationParams = { speed: 1, intensity: 1, reverse: false }

export function normalizeParams(p?: Partial<AnimationParams> | null): AnimationParams {
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
  }
  return {
    speed: num(p?.speed, 1, 0.25, 4),
    intensity: num(p?.intensity, 1, 0, 3),
    reverse: !!p?.reverse,
  }
}

/** Pose of a preset at second `s` of a `dur`-long clip, with speed/intensity/reverse applied */
export function poseWithParams(preset: AnimationPreset, s: number, dur: number, params?: Partial<AnimationParams> | null) {
  const p = normalizeParams(params)
  // speed compresses the motion (then it holds); reverse plays the preset curve backwards
  const timed = Math.min(dur, Math.max(0, Math.min(dur, s)) * p.speed)
  const base = preset.pose(p.reverse ? dur - timed : timed, dur)
  return { scale: 1 + (base.scale - 1) * p.intensity, x: base.x * p.intensity }
}

/** Keyframe times (seconds) that follow the curve well once speed/reverse are applied */
export function sampleTimes(preset: AnimationPreset, dur: number, params?: Partial<AnimationParams> | null) {
  const p = normalizeParams(params)
  const motionEnd = dur / p.speed
  const curve = preset.samples(dur).map((t) => (p.reverse ? dur - t : t) / p.speed)
  const times = [0, dur, ...curve, ...evenly(Math.min(dur, motionEnd), 10)]
  return [...new Set(times.filter((t) => t >= 0 && t <= dur).map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b)
}

export interface TransitionPreset {
  id: Exclude<TransitionId, 'cut'>
  label: string
  hint: string
  /** CapCut free transition (resource_id / effect_id from the CapCut effect catalog) */
  capcut: { name: string; resourceId: string }
}

export const TRANSITIONS: TransitionPreset[] = [
  { id: 'fusao', label: 'Fusão', hint: 'Uma imagem dissolve na outra', capcut: { name: '叠化', resourceId: '6724845717472416269' } },
  { id: 'flash_branco', label: 'Flash branco', hint: 'Estouro de luz no corte', capcut: { name: '闪白', resourceId: '6724845376098013708' } },
  { id: 'flash_preto', label: 'Esmaecer', hint: 'Mergulho rápido no preto', capcut: { name: '闪黑', resourceId: '6724239388189921806' } },
  { id: 'empurrar', label: 'Empurrar', hint: 'Câmera avança pra próxima', capcut: { name: '推近', resourceId: '6724226861666144779' } },
  { id: 'afastar', label: 'Recuar', hint: 'Câmera recua pra próxima', capcut: { name: '拉远', resourceId: '6724226338418332167' } },
]

export const TRANSITION_BY_ID = new Map(TRANSITIONS.map((t) => [t.id, t]))

/** Legacy values saved before the preset system */
export function normalizeTransition(value?: string | null): TransitionId {
  if (!value || value === 'cut') return 'cut'
  if (value === 'dissolve' || value === 'fade') return 'fusao'
  if (value === 'fadewhite') return 'flash_branco'
  if (value === 'fadeblack') return 'flash_preto'
  return (TRANSITION_BY_ID.has(value as TransitionPreset['id']) ? value : 'fusao') as TransitionId
}

export function normalizeAnimation(value?: string | null): AnimationId {
  return value && ANIMATION_BY_ID.has(value as AnimationPreset['id']) ? (value as AnimationId) : 'none'
}

// ---------------------------------------------------------------------------
// Assembly settings (stored in projects.config.sync)
// ---------------------------------------------------------------------------

export type SceneOrderBy = 'modified' | 'upload' | 'name'

export interface SyncSettings {
  /** Each scene lasts as long as its narration phrase (cuts snap to speech pauses) */
  variable_rhythm: boolean
  /** How clips are ordered when the timeline is assembled */
  order: { by: SceneOrderBy; reverse: boolean }
  animation: {
    enabled: boolean
    mode: PickMode
    selected: AnimationPreset['id'][]
    fixed: AnimationPreset['id']
    /** default properties written to every scene on assemble */
    params: AnimationParams
  }
  transition: {
    enabled: boolean
    mode: PickMode
    selected: TransitionPreset['id'][]
    fixed: TransitionPreset['id']
    /** seconds */
    duration: number
  }
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  variable_rhythm: true,
  order: { by: 'modified', reverse: false },
  animation: {
    enabled: false,
    mode: 'variado',
    selected: ['zoom_suave', 'pan'],
    fixed: 'zoom_suave',
    params: DEFAULT_ANIMATION_PARAMS,
  },
  transition: { enabled: false, mode: 'fixo', selected: ['fusao', 'flash_branco'], fixed: 'fusao', duration: 0.5 },
}

export function withDefaults(s?: Partial<SyncSettings> | null): SyncSettings {
  const animation = { ...DEFAULT_SYNC_SETTINGS.animation, ...(s?.animation || {}) }
  return {
    variable_rhythm: s?.variable_rhythm ?? DEFAULT_SYNC_SETTINGS.variable_rhythm,
    order: { ...DEFAULT_SYNC_SETTINGS.order, ...(s?.order || {}) },
    animation: { ...animation, params: normalizeParams(animation.params) },
    transition: { ...DEFAULT_SYNC_SETTINGS.transition, ...(s?.transition || {}) },
  }
}

/** Animation for scene i according to settings ("variado" rotates without repeating neighbours) */
export function pickAnimation(settings: SyncSettings, index: number): AnimationId {
  const a = settings.animation
  if (!a.enabled) return 'none'
  if (a.mode === 'fixo' || a.selected.length === 0) return a.fixed
  return a.selected[index % a.selected.length]
}

export function pickTransition(settings: SyncSettings, index: number): TransitionId {
  const t = settings.transition
  if (index === 0 || !t.enabled) return 'cut'
  if (t.mode === 'fixo' || t.selected.length === 0) return t.fixed
  return t.selected[(index - 1) % t.selected.length]
}
