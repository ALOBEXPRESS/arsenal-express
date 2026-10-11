// Adjustment layer ("Camada de ajuste") — looks/filters applied to everything below it
// (main track + overlays), like CapCut's Ajuste. Values use CapCut's own units so the
// export is a real CapCut adjustment layer:
//   brightness, contrast, saturation, temperature: -1..1 (0 = original)
//   fade, vignette: 0..1
// The browser preview approximates them with CSS filters + tint/vignette overlays.
import type { AdjustClip } from '@/types/project'

export type AdjustKey = 'brightness' | 'contrast' | 'saturation' | 'temperature' | 'fade' | 'vignette'

export interface AdjustValues {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  fade: number
  vignette: number
}

export const ADJUST_FIELDS: { key: AdjustKey; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brilho', min: -1, max: 1 },
  { key: 'contrast', label: 'Contraste', min: -1, max: 1 },
  { key: 'saturation', label: 'Saturação', min: -1, max: 1 },
  { key: 'temperature', label: 'Temperatura', min: -1, max: 1 },
  { key: 'fade', label: 'Desbotar', min: 0, max: 1 },
  { key: 'vignette', label: 'Vinheta', min: 0, max: 1 },
]

export const ZERO_ADJUST: AdjustValues = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, fade: 0, vignette: 0 }

/** CapCut catalog filter (resource already used in this machine's CapCut drafts) */
export interface CapCutFilter {
  resourceId: string
  name: string
}

export interface Look {
  id: string
  label: string
  hint: string
  values: AdjustValues
  /** optional real CapCut filter exported on a filter track (preview uses `values`) */
  capcutFilter?: CapCutFilter
}

export const LOOKS: Look[] = [
  { id: 'neon_vice', label: 'Neon Vice', hint: 'Cores vivas, contraste alto', values: { ...ZERO_ADJUST, contrast: 0.25, saturation: 0.45, temperature: -0.15, vignette: 0.25 } },
  { id: 'noir', label: 'Noir', hint: 'Preto e branco dramático', values: { ...ZERO_ADJUST, brightness: -0.05, contrast: 0.35, saturation: -1, vignette: 0.4 } },
  { id: 'vintage', label: 'Vintage', hint: 'Quente e desbotado', values: { ...ZERO_ADJUST, contrast: -0.1, saturation: -0.25, temperature: 0.3, fade: 0.35 } },
  { id: 'dramatico', label: 'Dramático', hint: 'Sombras fortes, vinheta', values: { ...ZERO_ADJUST, brightness: -0.1, contrast: 0.45, saturation: -0.15, vignette: 0.5 } },
  { id: 'quente', label: 'Pôr do sol', hint: 'Tons quentes', values: { ...ZERO_ADJUST, saturation: 0.1, temperature: 0.45 } },
  { id: 'frio', label: 'Noite fria', hint: 'Tons azulados', values: { ...ZERO_ADJUST, contrast: 0.1, temperature: -0.45 } },
  { id: 'desbotado', label: 'Desbotado', hint: 'Lavado, cinematográfico', values: { ...ZERO_ADJUST, contrast: -0.15, saturation: -0.35, fade: 0.5 } },
  {
    id: 'neon_chuva',
    label: 'Néon na chuva',
    hint: 'Filtro do CapCut',
    values: { ...ZERO_ADJUST, contrast: 0.15, saturation: 0.3, temperature: -0.3 },
    capcutFilter: { resourceId: '7668217917942598932', name: 'Néon na chuva' },
  },
]

export const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]))

export const adjustValues = (a: Partial<AdjustValues>): AdjustValues => ({
  brightness: clampNum(a.brightness, -1, 1),
  contrast: clampNum(a.contrast, -1, 1),
  saturation: clampNum(a.saturation, -1, 1),
  temperature: clampNum(a.temperature, -1, 1),
  fade: clampNum(a.fade, 0, 1),
  vignette: clampNum(a.vignette, 0, 1),
})

function clampNum(v: unknown, lo: number, hi: number) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0
}

/** True when the clip values still match its look (otherwise the UI shows "Personalizado") */
export function matchesLook(a: AdjustClip) {
  const look = a.look ? LOOK_BY_ID.get(a.look) : undefined
  if (!look) return false
  const v = adjustValues(a)
  return (Object.keys(ZERO_ADJUST) as AdjustKey[]).every((k) => Math.abs(v[k] - look.values[k]) < 1e-3)
}

/** Adjustment clips active at time t */
export const adjustmentsAt = (list: AdjustClip[], t: number) => list.filter((a) => t >= a.start && t < a.start + a.duration)

/** CSS approximation of one or more stacked adjustments */
export function adjustStyle(list: AdjustClip[]) {
  const filters: string[] = []
  let warm = 0
  let vignette = 0
  for (const a of list) {
    const v = adjustValues(a)
    const fadeContrast = 1 - 0.35 * v.fade
    const fadeLift = 1 + 0.1 * v.fade
    if (v.brightness || v.fade) filters.push(`brightness(${((1 + 0.35 * v.brightness) * fadeLift).toFixed(3)})`)
    if (v.contrast || v.fade) filters.push(`contrast(${((1 + 0.6 * v.contrast) * fadeContrast).toFixed(3)})`)
    if (v.saturation) filters.push(`saturate(${Math.max(0, 1 + v.saturation).toFixed(3)})`)
    warm += v.temperature
    vignette = Math.max(vignette, v.vignette)
  }
  warm = Math.max(-1, Math.min(1, warm))
  return {
    filter: filters.length ? filters.join(' ') : undefined,
    /** tint layer (mix-blend overlay) */
    tint: warm ? { color: warm > 0 ? '255,138,40' : '40,140,255', opacity: Math.abs(warm) * 0.32 } : null,
    vignette,
  }
}

/** CapCut adjustment effect types (built-in resource) for each of our fields */
export const CAPCUT_ADJUST_RESOURCE = '7501974767453474064'
export const CAPCUT_ADJUST_TYPES: Record<AdjustKey, { type: string; version: string }> = {
  brightness: { type: 'brightness', version: 'v2' },
  contrast: { type: 'contrast', version: 'v3' },
  saturation: { type: 'saturation', version: 'v1' },
  temperature: { type: 'temperature', version: 'v3' },
  fade: { type: 'fade', version: '' },
  vignette: { type: 'vignetting', version: 'v1' },
}
