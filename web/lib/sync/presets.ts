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
const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p)
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
    hint: 'Pulo de câmera na entrada',
    pose: (s, dur) => {
      // punch-in from 1.0 that overshoots and settles (damped spring) in 1.4s, then a slow
      // drift so the shot never freezes. The old version started zoomed and only shrank,
      // hidden under the entrance transition.
      const B = Math.min(1.4, dur)
      if (s < B) {
        const p = s / B
        return { scale: 1.08 - 0.08 * Math.exp(-3.2 * p) * Math.cos(3 * Math.PI * p) + 0.04 * Math.sin(Math.PI * p) * Math.exp(-2 * p), x: 0 }
      }
      const rest = 1.08 - 0.08 * Math.exp(-3.2) * Math.cos(3 * Math.PI)
      return { scale: rest + 0.04 * clamp01((s - B) / Math.max(0.001, dur - B)), x: 0 }
    },
    samples: (dur) => {
      const B = Math.min(1.4, dur)
      return [...evenly(B, 14), ...(dur > B ? [dur] : [])]
    },
  },
  {
    id: 'zoom_out',
    label: 'Afastar',
    hint: 'Começa perto e abre o quadro',
    // ease-out: the pull-back is visible from the first frames (ease-in-out spent the first
    // 1.5s almost still, so it looked like nothing happened)
    pose: (s, dur) => ({ scale: 1.25 - 0.25 * easeOutQuad(clamp01(s / dur)), x: 0 }),
    samples: (dur) => evenly(dur, 8),
  },
  {
    id: 'pan',
    label: 'Panorâmica',
    hint: 'Desliza de lado com leve zoom',
    // scale - 1 >= |x| keeps the frame edges outside the canvas; mostly linear so it moves
    // the whole time (pure ease-in-out barely moved at the start and end)
    pose: (s, dur) => {
      const p = clamp01(s / dur)
      return { scale: 1.2, x: -0.12 + 0.24 * (0.7 * p + 0.3 * easeInOut(p)) }
    },
    samples: (dur) => evenly(dur, 8),
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

/**
 * Effect flow = how many DIFFERENT effects each group of 3 scenes uses (1:3, 2:3, 3:3).
 * Every scene gets an effect; the group just varies it:
 *   1:3 → A A A | B B B     2:3 → A A B | C C D     3:3 → A B C | D E F
 * (A, B, C… walk through the selected list, wrapping around)
 */
export type FlowCount = 1 | 2 | 3
export const FLOW_GROUP = 3

export type NarrationSplit = 'per_audio' | 'continuous'

export interface SyncSettings {
  /** Each scene lasts as long as its narration phrase (cuts snap to speech pauses) */
  variable_rhythm: boolean
  /** How clips are ordered when the timeline is assembled */
  order: { by: SceneOrderBy; reverse: boolean }
  /** Several narration files: one subproject per file, or one continuous timeline */
  narration: {
    split: NarrationSplit
    /** average scene length used to decide how many clips each subproject gets (seconds) */
    pace: number
  }
  /** Playback speed for assembled scenes and narration (0.5x to 2x) */
  speed: {
    /** Apply speed to video scenes */
    enabled: boolean
    /** Speed multiplier: 0.5 = slow motion (50%), 1 = normal, 2 = fast (200%) */
    value: number
  }
  /** Media type selection for scene assembly */
  media: {
    /** Use images in scene assembly */
    with_images: boolean
    /** Use videos in scene assembly */
    with_videos: boolean
    /** If both are enabled and images exist, place them as overlays every N scenes */
    images_as_overlay_every: number
    /** Favorite image asset ID to use as overlay (instead of cycling through all images) */
    favorite_image_id: string | null
  }
  /** Sound effects options */
  sfx: {
    /** Enable adding favorite SFX to scenes with images */
    enabled: boolean
    /** Selected favorite SFX effect ID to use */
    selected_effect_id: string | null
  }
  /** Video overlay bars with text */
  overlay_bars: {
    /** Enable black bars overlay */
    enabled: boolean
    /** Position: 'top' | 'bottom' | 'both' */
    position: 'top' | 'bottom' | 'both'
    /** Manual height override (0 = auto 8%) */
    height_override: number
    /** Favorite video asset ID for overlays */
    favorite_video_id: string | null
    /** Favorite image asset ID for overlays */
    favorite_image_id: string | null
    /** Favorite asset ID for overlays (GIF, sticker, etc) */
    favorite_asset_id: string | null
  }
  animation: {
    enabled: boolean
    mode: PickMode
    selected: AnimationPreset['id'][]
    fixed: AnimationPreset['id']
    /** 1:3 / 2:3 / 3:3 */
    flow: FlowCount
    /** default properties written to every scene on assemble */
    params: AnimationParams
  }
  transition: {
    enabled: boolean
    mode: PickMode
    selected: TransitionPreset['id'][]
    fixed: TransitionPreset['id']
    flow: FlowCount
    /** seconds */
    duration: number
  }
}

export const DEFAULT_SCENE_PACE = 6.6 // config.yaml -> cenas.duracao_padrao

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  variable_rhythm: true,
  order: { by: 'modified', reverse: false },
  narration: { split: 'per_audio', pace: DEFAULT_SCENE_PACE },
  speed: { enabled: false, value: 1.0 },
  media: {
    with_images: true,
    with_videos: true,
    images_as_overlay_every: 3,
    favorite_image_id: null,
  },
  sfx: {
    enabled: false,
    selected_effect_id: null,
  },
  overlay_bars: {
    enabled: false,
    position: 'both',
    height_override: 0,
    favorite_video_id: null,
    favorite_image_id: null,
    favorite_asset_id: null,
  },
  animation: {
    enabled: false,
    mode: 'variado',
    selected: ['zoom_suave', 'pan'],
    fixed: 'zoom_suave',
    flow: 3,
    params: DEFAULT_ANIMATION_PARAMS,
  },
  // variado: Fusão + Esmaecer alternando (3:3)
  transition: { enabled: false, mode: 'variado', selected: ['fusao', 'flash_preto'], fixed: 'fusao', flow: 3, duration: 0.5 },
}

const normFlow = (v: unknown): FlowCount => (v === 1 || v === 2 || v === 3 ? v : 3)

export function withDefaults(s?: Partial<SyncSettings> | null): SyncSettings {
  const animation = { ...DEFAULT_SYNC_SETTINGS.animation, ...(s?.animation || {}) }
  const transition = { ...DEFAULT_SYNC_SETTINGS.transition, ...(s?.transition || {}) }
  const narration = { ...DEFAULT_SYNC_SETTINGS.narration, ...(s?.narration || {}) }
  const speed = { ...DEFAULT_SYNC_SETTINGS.speed, ...(s?.speed || {}) }
  const media = { ...DEFAULT_SYNC_SETTINGS.media, ...(s?.media || {}) }
  const sfx = { ...DEFAULT_SYNC_SETTINGS.sfx, ...(s?.sfx || {}) }
  const overlay_bars = { ...DEFAULT_SYNC_SETTINGS.overlay_bars, ...(s?.overlay_bars || {}) }
  return {
    variable_rhythm: s?.variable_rhythm ?? DEFAULT_SYNC_SETTINGS.variable_rhythm,
    order: { ...DEFAULT_SYNC_SETTINGS.order, ...(s?.order || {}) },
    narration: {
      split: narration.split === 'continuous' ? 'continuous' : 'per_audio',
      pace: Math.min(20, Math.max(2, Number(narration.pace) || DEFAULT_SCENE_PACE)),
    },
    speed: {
      enabled: speed.enabled ?? DEFAULT_SYNC_SETTINGS.speed.enabled,
      value: Math.min(2, Math.max(0.5, Number(speed.value) || 1.0)),
    },
    media: {
      with_images: media.with_images ?? DEFAULT_SYNC_SETTINGS.media.with_images,
      with_videos: media.with_videos ?? DEFAULT_SYNC_SETTINGS.media.with_videos,
      images_as_overlay_every: Math.max(1, Math.min(10, media.images_as_overlay_every || DEFAULT_SYNC_SETTINGS.media.images_as_overlay_every)),
      favorite_image_id: media.favorite_image_id ?? DEFAULT_SYNC_SETTINGS.media.favorite_image_id,
    },
    sfx: {
      enabled: sfx.enabled ?? DEFAULT_SYNC_SETTINGS.sfx.enabled,
      selected_effect_id: sfx.selected_effect_id ?? DEFAULT_SYNC_SETTINGS.sfx.selected_effect_id,
    },
    overlay_bars: {
      enabled: overlay_bars.enabled ?? DEFAULT_SYNC_SETTINGS.overlay_bars.enabled,
      position: ['top', 'bottom', 'both'].includes(overlay_bars.position as string) ? (overlay_bars.position as 'top' | 'bottom' | 'both') : DEFAULT_SYNC_SETTINGS.overlay_bars.position,
      height_override: Math.max(0, Math.min(200, Number(overlay_bars.height_override) || 0)),
      favorite_video_id: overlay_bars.favorite_video_id ?? DEFAULT_SYNC_SETTINGS.overlay_bars.favorite_video_id,
      favorite_image_id: overlay_bars.favorite_image_id ?? DEFAULT_SYNC_SETTINGS.overlay_bars.favorite_image_id,
      favorite_asset_id: overlay_bars.favorite_asset_id ?? DEFAULT_SYNC_SETTINGS.overlay_bars.favorite_asset_id,
    },
    animation: { ...animation, flow: normFlow(animation.flow), params: normalizeParams(animation.params) },
    transition: { ...transition, flow: normFlow(transition.flow) },
  }
}

/**
 * Index into the selected list for item `i` (0-based) under a flow.
 * Group g = floor(i/3) takes `flow` consecutive list entries; the 3 positions of the group are
 * spread over them (flow 2 → A A B, flow 3 → A B C).
 */
export function flowIndex(i: number, flow: FlowCount, listLength: number): number {
  if (listLength <= 0) return -1
  const group = Math.floor(i / FLOW_GROUP)
  const k = Math.floor(((i % FLOW_GROUP) * flow) / FLOW_GROUP)
  return (group * flow + k) % listLength
}

/** Animation for scene i ("variado" walks the list following the flow; "fixo" = always the same) */
export function pickAnimation(settings: SyncSettings, index: number): AnimationId {
  const a = settings.animation
  if (!a.enabled) return 'none'
  if (a.mode === 'fixo' || a.selected.length === 0) return a.fixed
  return a.selected[flowIndex(index, a.flow, a.selected.length)]
}

/** Transition into scene i (cut number i-1 follows the same flow) */
export function pickTransition(settings: SyncSettings, index: number): TransitionId {
  const t = settings.transition
  if (index === 0 || !t.enabled) return 'cut'
  if (t.mode === 'fixo' || t.selected.length === 0) return t.fixed
  return t.selected[flowIndex(index - 1, t.flow, t.selected.length)]
}
