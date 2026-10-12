// CapCut (International) draft builder.
// Output layout (one folder per project, dropped inside com.lveditor.draft):
//   <Project>/draft_content.json   (Windows reads this)
//   <Project>/draft_info.json      (macOS reads this — same content)
//   <Project>/draft_meta_info.json (import manifest — media must be listed or CapCut asks to relink)
//   <Project>/media/001_clip.mp4 ...
// JSON shape validated against pyCapCut output (CapCut 6.x+ format, not encrypted).
import contentTemplate from './draft_content_template.json'
import metaTemplate from './draft_meta_template.json'
import { sceneProps, packRows, type TimedScene } from '@/lib/timeline'
import type { AdjustClip, Asset, AudioClip, OverlayClip } from '@/types/project'
import { CAPCUT_ADJUST_RESOURCE, CAPCUT_ADJUST_TYPES, LOOK_BY_ID, adjustValues, matchesLook, type AdjustKey } from '@/lib/sync/adjust'
import {
  ANIMATION_BY_ID,
  TRANSITION_BY_ID,
  normalizeAnimation,
  normalizeTransition,
  poseWithParams,
  sampleTimes,
  type AnimationParams,
  type SyncSettings,
} from '@/lib/sync/presets'

export type CapCutSystem = 'windows' | 'mac'

export interface MediaInfo {
  width: number
  height: number
  duration: number // seconds
}

/** One subproject = one CapCut timeline ("Linha do tempo 01, 02…") */
export interface TimelineInput {
  name: string
  timeline: TimedScene[]
  narration: { asset: Asset; start: number; duration: number }[]
  /** image/video layers above the main track */
  overlays?: { clip: OverlayClip; asset: Asset }[]
  /** music / SFX */
  audioClips?: { clip: AudioClip; asset: Asset }[]
  /** adjustment layers (CapCut "Ajuste") */
  adjustments?: AdjustClip[]
}

export interface DraftInput {
  projectName: string
  system: CapCutSystem
  username?: string
  /** real CapCut projects folder reported by the local connector (overrides system/username) */
  draftRoot?: string
  timelines: TimelineInput[]
  settings: SyncSettings
  canvas: { width: number; height: number }
  mediaInfo: Map<string, MediaInfo>
  /** asset id -> file name inside <Project>/media */
  fileNames: Map<string, string>
}

interface Shared {
  system: CapCutSystem
  settings: SyncSettings
  canvas: { width: number; height: number }
  mediaInfo: Map<string, MediaInfo>
  fileNames: Map<string, string>
  mediaRoot: string
  folderName: string
  /** meta manifest entries (one per media file, shared by every timeline) */
  metaEntries: any[]
  metaPaths: Set<string>
}

export interface DraftOutput {
  folderName: string
  files: Record<string, string> // relative path (may contain "/") -> text
  mediaRoot: string
  totalUs: number
  draftId: string
  draftFolder: string
  draftRoot: string
  createdUs: number
  /** number of CapCut timelines (subprojects) */
  timelines: number
}

const US = 1_000_000
const toUs = (s: number) => Math.round(s * US)
const hex = () => crypto.randomUUID().replace(/-/g, '')
const upperId = () => crypto.randomUUID().toUpperCase()

/** Folder-safe name (CapCut shows it as the project title) */
export function safeProjectName(name: string) {
  const cleaned = name.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')
  return cleaned || 'SyncExpress_Projeto'
}

export function capcutDraftRoot(system: CapCutSystem, username?: string) {
  const user = username?.trim() || (system === 'mac' ? 'SEU_USUARIO' : 'SEU_USUARIO')
  return system === 'mac'
    ? `/Users/${user}/Movies/CapCut/User Data/Projects/com.lveditor.draft`
    : `C:/Users/${user}/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft`
}

const SEGMENT_COMMON = {
  enable_adjust: true,
  enable_color_correct_adjust: false,
  enable_color_curves: true,
  enable_color_match_adjust: false,
  enable_color_wheels: true,
  enable_lut: true,
  enable_smart_color_adjust: false,
  last_nonzero_volume: 1.0,
  reverse: false,
  track_attribute: 0,
  track_render_index: 0,
  visible: true,
}

function speedMaterial(speed: number) {
  return { curve_speed: null, id: hex(), mode: 0, speed, type: 'speed' }
}

function keyframe(timeOffsetUs: number, value: number) {
  return {
    curveType: 'Line',
    graphID: '',
    left_control: { x: 0.0, y: 0.0 },
    right_control: { x: 0.0, y: 0.0 },
    id: hex(),
    time_offset: timeOffsetUs,
    values: [Math.round(value * 10000) / 10000],
  }
}

/** Animation preset -> CapCut common_keyframes (uniform scale + optional X position) */
function animationKeyframes(animationId: string, durationS: number, params?: Partial<AnimationParams>) {
  const preset = ANIMATION_BY_ID.get(normalizeAnimation(animationId) as never)
  if (!preset) return []
  const times = sampleTimes(preset, durationS, params)
  const poses = times.map((t) => ({ t, ...poseWithParams(preset, t, durationS, params) }))
  const out = [
    {
      id: hex(),
      keyframe_list: poses.map((p) => keyframe(Math.min(toUs(p.t), toUs(durationS)), p.scale)),
      material_id: '',
      property_type: 'KFTypeScaleX',
    },
  ]
  if (poses.some((p) => p.x !== 0)) {
    out.push({
      id: hex(),
      keyframe_list: poses.map((p) => keyframe(Math.min(toUs(p.t), toUs(durationS)), p.x)),
      material_id: '',
      property_type: 'KFTypePositionX',
    })
  }
  return out
}

/** Overlay entrance/exit animations -> CapCut common_keyframes */
function overlayAnimationKeyframes(
  animationIn: string | undefined,
  animationOut: string | undefined,
  durationS: number,
  animDur: number,
  baseScale: number,
  baseX: number,
  baseY: number
) {
  const keyframes: any[] = []
  const inDur = Math.min(animDur, durationS / 2)
  const outDur = Math.min(animDur, durationS / 2)
  const outStart = durationS - outDur

  // Helper to create keyframes for a property
  const createKeyframes = (propertyType: string, values: Array<{ time: number; value: number }>) => {
    if (values.length === 0) return
    keyframes.push({
      id: hex(),
      keyframe_list: values.map((v) => keyframe(toUs(v.time), v.value)),
      material_id: '',
      property_type: propertyType,
    })
  }

  // Opacity keyframes
  const opacityFrames: Array<{ time: number; value: number }> = []
  
  // Scale keyframes (uniform)
  const scaleFrames: Array<{ time: number; value: number }> = []
  
  // Position keyframes
  const posXFrames: Array<{ time: number; value: number }> = []
  const posYFrames: Array<{ time: number; value: number }> = []

  // Entrance animation
  if (animationIn && animationIn !== 'none') {
    switch (animationIn) {
      case 'fade':
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur, value: 1 })
        break
      case 'zoom-in':
        scaleFrames.push({ time: 0, value: 0 }, { time: inDur, value: baseScale })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.3, value: 1 })
        break
      case 'zoom-out':
        scaleFrames.push({ time: 0, value: baseScale * 2 }, { time: inDur, value: baseScale })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.3, value: 1 })
        break
      case 'slide-up':
        posYFrames.push({ time: 0, value: baseY - 2 }, { time: inDur, value: baseY })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.2, value: 1 })
        break
      case 'slide-down':
        posYFrames.push({ time: 0, value: baseY + 2 }, { time: inDur, value: baseY })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.2, value: 1 })
        break
      case 'slide-left':
        posXFrames.push({ time: 0, value: baseX - 2 }, { time: inDur, value: baseX })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.2, value: 1 })
        break
      case 'slide-right':
        posXFrames.push({ time: 0, value: baseX + 2 }, { time: inDur, value: baseX })
        opacityFrames.push({ time: 0, value: 0 }, { time: inDur * 0.2, value: 1 })
        break
    }
  }

  // Exit animation
  if (animationOut && animationOut !== 'none') {
    switch (animationOut) {
      case 'fade':
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart, value: 1 }, { time: durationS, value: 0 })
        break
      case 'zoom-in':
        if (scaleFrames.length === 0) scaleFrames.push({ time: 0, value: baseScale })
        scaleFrames.push({ time: outStart, value: baseScale }, { time: durationS, value: 0 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.7, value: 1 }, { time: durationS, value: 0 })
        break
      case 'zoom-out':
        if (scaleFrames.length === 0) scaleFrames.push({ time: 0, value: baseScale })
        scaleFrames.push({ time: outStart, value: baseScale }, { time: durationS, value: baseScale * 2 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.7, value: 1 }, { time: durationS, value: 0 })
        break
      case 'slide-up':
        if (posYFrames.length === 0) posYFrames.push({ time: 0, value: baseY })
        posYFrames.push({ time: outStart, value: baseY }, { time: durationS, value: baseY + 2 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.8, value: 1 }, { time: durationS, value: 0 })
        break
      case 'slide-down':
        if (posYFrames.length === 0) posYFrames.push({ time: 0, value: baseY })
        posYFrames.push({ time: outStart, value: baseY }, { time: durationS, value: baseY - 2 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.8, value: 1 }, { time: durationS, value: 0 })
        break
      case 'slide-left':
        if (posXFrames.length === 0) posXFrames.push({ time: 0, value: baseX })
        posXFrames.push({ time: outStart, value: baseX }, { time: durationS, value: baseX + 2 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.8, value: 1 }, { time: durationS, value: 0 })
        break
      case 'slide-right':
        if (posXFrames.length === 0) posXFrames.push({ time: 0, value: baseX })
        posXFrames.push({ time: outStart, value: baseX }, { time: durationS, value: baseX - 2 })
        if (opacityFrames.length === 0) opacityFrames.push({ time: 0, value: 1 })
        opacityFrames.push({ time: outStart + outDur * 0.8, value: 1 }, { time: durationS, value: 0 })
        break
    }
  }

  // Create keyframe objects
  if (opacityFrames.length > 0) createKeyframes('KFTypeOpacity', opacityFrames)
  if (scaleFrames.length > 0) {
    createKeyframes('KFTypeScaleX', scaleFrames)
    createKeyframes('KFTypeScaleY', scaleFrames) // Uniform scale
  }
  if (posXFrames.length > 0) createKeyframes('KFTypePositionX', posXFrames)
  if (posYFrames.length > 0) createKeyframes('KFTypePositionY', posYFrames)

  return keyframes
}

/** draft_content.json of one timeline */
function buildTimelineContent(tl: TimelineInput, shared: Shared) {
  const input = {
    ...shared,
    ...tl,
    // clip audio level under narration (-18 dB, CLI config)
    clipVolume: tl.narration.length ? 0.125 : 1.0,
  }
  const { mediaRoot, folderName } = shared
  const content = structuredClone(contentTemplate) as Record<string, any>
  const mat = content.materials as Record<string, any[]>

  // ---- Materials (one per distinct asset) ---------------------------------
  const materialIdByAsset = new Map<string, string>()
  const pushMeta = (entry: any) => {
    if (shared.metaPaths.has(entry.file_Path)) return
    shared.metaPaths.add(entry.file_Path)
    shared.metaEntries.push(entry)
  }

  const registerVideo = (asset: Asset) => {
    if (materialIdByAsset.has(asset.id)) return materialIdByAsset.get(asset.id)!
    const info = input.mediaInfo.get(asset.id)
    const isPhoto = asset.type === 'image'
    const fileName = input.fileNames.get(asset.id)!
    const id = hex()
    materialIdByAsset.set(asset.id, id)
    mat.videos.push({
      audio_fade: null,
      category_id: '',
      category_name: 'local',
      check_flag: 63487,
      crop: {
        upper_left_x: 0.0, upper_left_y: 0.0, upper_right_x: 1.0, upper_right_y: 0.0,
        lower_left_x: 0.0, lower_left_y: 1.0, lower_right_x: 1.0, lower_right_y: 1.0,
      },
      crop_ratio: 'free',
      crop_scale: 1.0,
      duration: isPhoto ? 10_800_000_000 : toUs(info?.duration || asset.duration || 0),
      height: info?.height || 0,
      id,
      local_material_id: '',
      material_id: id,
      material_name: fileName,
      media_path: '',
      path: `${mediaRoot}/${fileName}`,
      type: isPhoto ? 'photo' : 'video',
      width: info?.width || 0,
    })
    pushMeta(metaEntry(asset, `${mediaRoot}/${fileName}`, isPhoto ? 'photo' : 'video', info))
    return id
  }

  const registerAudio = (asset: Asset) => {
    if (materialIdByAsset.has(asset.id)) return materialIdByAsset.get(asset.id)!
    const fileName = input.fileNames.get(asset.id)!
    const id = hex()
    materialIdByAsset.set(asset.id, id)
    mat.audios.push({
      app_id: 0,
      category_id: '',
      category_name: 'local',
      check_flag: 3,
      copyright_limit_type: 'none',
      duration: toUs(asset.duration || 0),
      effect_id: '',
      formula_id: '',
      id,
      local_material_id: id,
      music_id: id,
      name: fileName,
      path: `${mediaRoot}/${fileName}`,
      source_platform: 0,
      type: 'extract_music',
      wave_points: [],
    })
    pushMeta(metaEntry(asset, `${mediaRoot}/${fileName}`, 'music'))
    return id
  }

  // ---- Video track ----------------------------------------------------------
  const videoSegments: any[] = []
  const starts = input.timeline.map((t) => toUs(t.start))
  const mainS = input.timeline.length
    ? input.timeline[input.timeline.length - 1].start + input.timeline[input.timeline.length - 1].duration
    : 0
  const mainUs = toUs(mainS)
  const totalS = Math.max(
    mainS,
    ...(input.overlays || []).map((o) => o.clip.start + o.clip.duration),
    ...(input.audioClips || []).map((a) => a.clip.start + a.clip.duration),
    ...(input.adjustments || []).map((a) => a.start + a.duration),
    // narration keeps playing even where there are no scenes yet
    ...input.narration.map((n) => n.start + n.duration),
    0
  )
  const totalUs = toUs(totalS)

  input.timeline.forEach((item, i) => {
    const media = item.videoAsset || item.imageAsset
    if (!media) return
    const startUs = starts[i]
    const durUs = (i + 1 < starts.length ? starts[i + 1] : mainUs) - startUs
    const durS = durUs / US
    const isPhoto = !item.videoAsset
    const props = sceneProps(item.scene)

    // Speed: user speed (inspector) or 1x. If the clip runs out before the scene ends, slow it
    // down further so CapCut has no gap (the preview holds the last frame instead).
    const trimS = isPhoto ? 0 : item.trim
    const clipS = Math.max(0.05, (input.mediaInfo.get(media.id)?.duration || media.duration || durS) - trimS)
    let speed = item.manualSpeed ? item.rate : 1
    if (!isPhoto && clipS < durS * speed) speed = Math.max(0.1, Math.floor((clipS / durS) * 1000) / 1000)
    const sourceUs = isPhoto ? durUs : Math.min(Math.round(durUs * speed), toUs(clipS))

    const speedMat = speedMaterial(speed)
    mat.speeds.push(speedMat)
    const refs = [speedMat.id]

    // Transition between this scene and the next lives on THIS segment
    const next = input.timeline[i + 1]
    const nextTransition = next ? normalizeTransition(next.scene.transition_in) : 'cut'
    if (next && nextTransition !== 'cut') {
      const preset = TRANSITION_BY_ID.get(nextTransition as never)
      if (preset) {
        const maxDur = Math.min(durS, next.duration) / 2
        const tId = hex()
        mat.transitions.push({
          category_id: '',
          category_name: '',
          duration: toUs(Math.min(input.settings.transition.duration, maxDur)),
          effect_id: preset.capcut.resourceId,
          id: tId,
          is_overlap: true,
          name: preset.capcut.name,
          platform: 'all',
          resource_id: preset.capcut.resourceId,
          type: 'transition',
        })
        refs.push(tId)
      }
    }

    videoSegments.push({
      ...SEGMENT_COMMON,
      id: hex(),
      material_id: registerVideo(media),
      target_timerange: { start: startUs, duration: durUs },
      common_keyframes: animationKeyframes(item.scene.animation_type || 'none', durS, props.anim),
      keyframe_refs: [],
      source_timerange: { start: toUs(trimS), duration: sourceUs },
      speed,
      volume: isPhoto ? 1.0 : props.volume ?? input.clipVolume,
      extra_material_refs: refs,
      is_tone_modify: false,
      clip: {
        alpha: 1.0,
        flip: { horizontal: false, vertical: false },
        rotation: 0.0,
        scale: { x: 1.0, y: 1.0 },
        transform: { x: 0.0, y: 0.0 },
      },
      uniform_scale: { on: true, value: 1.0 },
      hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
      render_index: 0,
    })
  })

  // ---- Narration track ------------------------------------------------------
  const audioSegments = input.narration.map((n) => {
    const speedMat = speedMaterial(1.0)
    mat.speeds.push(speedMat)
    const startUs = toUs(n.start)
    const durUs = Math.min(toUs(n.duration), Math.max(0, totalUs - startUs))
    return {
      ...SEGMENT_COMMON,
      id: hex(),
      material_id: registerAudio(n.asset),
      target_timerange: { start: startUs, duration: durUs },
      common_keyframes: [],
      keyframe_refs: [],
      source_timerange: { start: 0, duration: durUs },
      speed: 1.0,
      volume: 1.0,
      extra_material_refs: [speedMat.id],
      is_tone_modify: false,
      clip: null,
      hdr_settings: null,
      render_index: 0,
    }
  })

  // ---- Overlay tracks (Sobreposição): one CapCut video track per non-overlapping row --------
  const overlayTrackCount = packRows(input.overlays || [], (o) => o.clip).length
  const overlayTracks = packRows(input.overlays || [], (o) => o.clip).map((row, r) => {
    const layer = r + 1
    const segments = row.map(({ clip, asset }) => {
      const isPhoto = asset.type === 'image'
      const durUs = toUs(clip.duration)
      const inPoint = isPhoto ? 0 : clip.in_point || 0
      const clipS = Math.max(0.05, (input.mediaInfo.get(asset.id)?.duration || asset.duration || clip.duration) - inPoint)
      const speed = isPhoto ? 1 : clip.speed || 1
      const speedMat = speedMaterial(speed)
      mat.speeds.push(speedMat)
      
      // Generate entrance/exit animation keyframes
      const animKeyframes = overlayAnimationKeyframes(
        clip.animation_in,
        clip.animation_out,
        clip.duration,
        clip.animation_duration || 0.3,
        clip.scale,
        clip.x,
        clip.y
      )
      
      return {
        ...SEGMENT_COMMON,
        track_render_index: layer,
        id: hex(),
        material_id: registerVideo(asset),
        target_timerange: { start: toUs(clip.start), duration: durUs },
        common_keyframes: animKeyframes,
        keyframe_refs: [],
        source_timerange: { start: toUs(inPoint), duration: isPhoto ? durUs : Math.min(Math.round(durUs * speed), toUs(clipS)) },
        speed,
        volume: isPhoto ? 1.0 : clip.volume ?? 0,
        extra_material_refs: [speedMat.id],
        is_tone_modify: false,
        clip: {
          alpha: Math.round(clip.opacity * 1000) / 1000,
          flip: { horizontal: false, vertical: false },
          rotation: 0.0,
          scale: { x: clip.scale, y: clip.scale },
          // CapCut units: fraction of half canvas, y up — same as OverlayClip
          transform: { x: clip.x, y: clip.y },
        },
        uniform_scale: { on: true, value: clip.scale },
        hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
        render_index: layer,
      }
    })
    return { attribute: 0, flag: 0, id: hex(), is_default_name: false, name: `sobreposicao_${layer}`, type: 'video', segments }
  })

  // ---- Extra audio tracks (music / SFX) ------------------------------------------------
  const extraAudioTracks = packRows(input.audioClips || [], (a) => a.clip).map((row, r) => {
    const segments = row.map(({ clip, asset }) => {
      const speed = clip.speed || 1
      const speedMat = speedMaterial(speed)
      mat.speeds.push(speedMat)
      const durUs = toUs(clip.duration)
      const inPoint = clip.in_point || 0
      return {
        ...SEGMENT_COMMON,
        id: hex(),
        material_id: registerAudio(asset),
        target_timerange: { start: toUs(clip.start), duration: durUs },
        common_keyframes: [],
        keyframe_refs: [],
        source_timerange: { start: toUs(inPoint), duration: Math.min(Math.round(durUs * speed), toUs(Math.max(0.05, (asset.duration || clip.duration * speed) - inPoint))) },
        speed,
        volume: clip.volume ?? 1,
        extra_material_refs: [speedMat.id],
        is_tone_modify: false,
        clip: null,
        hdr_settings: null,
        render_index: 0,
      }
    })
    return { attribute: 0, flag: 0, id: hex(), is_default_name: false, name: `audio_${r + 1}`, type: 'audio', segments }
  })

  // ---- Adjustment layers (CapCut "Ajuste") + catalog filters ---------------------------
  // Same structure CapCut 9.x writes: an 'adjust' track whose segment points to a placeholder
  // material {type:'adjust'} and lists one effect material per adjusted value (built-in
  // resource), and a 'filter' track for catalog filters. Both apply to the tracks below.
  const allAdjust = input.adjustments || []
  // a catalog-filter look exports ONLY the real CapCut filter (its adjust values are just the
  // browser approximation); once the user tweaks values it becomes a normal adjustment
  const isCatalogFilter = (a: AdjustClip) => matchesLook(a) && !!a.look && !!LOOK_BY_ID.get(a.look)?.capcutFilter
  const adjustList = allAdjust.filter((a) => !isCatalogFilter(a))
  let adjustIndex = 0
  const adjustTracks = packRows(adjustList, (a) => a).map((row, r) => ({
    attribute: 0,
    flag: 0,
    id: upperId(),
    is_default_name: true,
    name: '',
    type: 'adjust',
    segments: row.map((a) => {
      adjustIndex++
      const placeholder = { id: upperId(), name: `Ajuste${adjustIndex}`, type: 'adjust', material_resource_id: '' }
      mat.placeholders.push(placeholder)
      const v = adjustValues(a)
      const refs = (Object.keys(CAPCUT_ADJUST_TYPES) as AdjustKey[])
        .filter((k) => Math.abs(v[k]) > 1e-4)
        .map((k) => {
          const effect = adjustEffect(CAPCUT_ADJUST_TYPES[k].type, CAPCUT_ADJUST_TYPES[k].version, v[k])
          mat.effects.push(effect)
          return effect.id
        })
      return effectSegment(placeholder.id, refs, a.start, a.duration, { render_index: 0, track_render_index: overlayTrackCount + 2 + r, adjust: true })
    }),
  }))
  const filterRows = packRows(allAdjust.filter(isCatalogFilter), (a) => a)
  const filterTracks = filterRows.map((row, r) => ({
    attribute: 0,
    flag: 0,
    id: upperId(),
    is_default_name: true,
    name: '',
    type: 'filter',
    segments: row.map((a) => {
      const f = LOOK_BY_ID.get(a.look!)!.capcutFilter!
      const material = filterEffect(f.resourceId, f.name, a.filter_intensity ?? 1)
      mat.effects.push(material)
      return effectSegment(material.id, [], a.start, a.duration, { render_index: 11000 + r, track_render_index: overlayTrackCount + 1 + r })
    }),
  }))
  if (adjustIndex) content.config.adjust_max_index = adjustIndex + 1

  content.tracks = [
    { attribute: 0, flag: 0, id: hex(), is_default_name: false, name: 'video', type: 'video', segments: videoSegments },
    ...overlayTracks,
    ...filterTracks,
    ...adjustTracks,
    ...(audioSegments.length
      ? [{ attribute: 0, flag: 0, id: hex(), is_default_name: false, name: 'narracao', type: 'audio', segments: audioSegments }]
      : []),
    ...extraAudioTracks,
  ]
  content.id = upperId()
  content.name = folderName
  content.duration = totalUs
  content.fps = 30
  content.canvas_config = { width: input.canvas.width, height: input.canvas.height, ratio: 'original' }
  const platform = { app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: input.system === 'mac' ? 'mac' : 'windows' }
  content.platform = platform
  content.last_modified_platform = platform
  const now = Date.now()
  content.create_time = Math.floor(now / 1000)
  content.update_time = Math.floor(now / 1000)
  return { content, totalUs }
}

/** CapCut built-in adjustment effect (same fields CapCut 9.x writes) */
function adjustEffect(type: string, version: string, value: number) {
  return {
    ...EFFECT_COMMON,
    id: upperId(),
    effect_id: CAPCUT_ADJUST_RESOURCE,
    resource_id: CAPCUT_ADJUST_RESOURCE,
    third_resource_id: '',
    name: '',
    type,
    version,
    value: Math.round(value * 10000) / 10000,
    category_id: '',
    category_name: '',
  }
}

/** CapCut catalog filter (downloaded by CapCut from its resource id when missing) */
function filterEffect(resourceId: string, name: string, intensity: number) {
  return {
    ...EFFECT_COMMON,
    id: upperId(),
    effect_id: resourceId,
    resource_id: resourceId,
    third_resource_id: '0',
    name,
    type: 'filter',
    version: '',
    value: Math.round(Math.max(0, Math.min(1, intensity)) * 1000) / 1000,
    category_id: '123456',
    category_name: 'Filtros',
  }
}

const EFFECT_COMMON = {
  report_name: '',
  sub_type: 'none',
  path: '',
  visible: true,
  item_effect_type: 0,
  category_key: '',
  sub_category_id: '',
  sub_category_name: '',
  platform: 'all',
  apply_target_type: 0,
  source_platform: 1,
  adjust_params: [],
  time_range: null,
  formula_id: '',
  enable_skin_tone_correction: false,
  algorithm_artifact_path: '',
  intensity_key: '',
  face_adjust_params: [],
  exclusion_group: [],
  panel_id: '',
  bloom_params: null,
  request_id: '',
  color_match_info: { target_feature_path: '', source_feature_path: '', target_image_path: '' },
  multi_language_current: '',
  lumi_hub_path: '',
  covering_relation_change: 0,
  beauty_face_auto_preset_id: '',
  beauty_body_auto_preset_id: '',
  beauty_face_auto_retouch_info: { face_id: [], beauty_face_auto_retouch_id: '' },
  smart_color_mode: 0,
  is_from_intelligent_quality: false,
}

/** Segment of an effect-like track (adjust / filter), copied from a CapCut 9.x draft */
function effectSegment(
  materialId: string,
  refs: string[],
  startS: number,
  durationS: number,
  o: { render_index: number; track_render_index: number; adjust?: boolean }
) {
  return {
    id: upperId(),
    source_timerange: null,
    target_timerange: { start: toUs(startS), duration: toUs(durationS) },
    render_timerange: { start: 0, duration: 0 },
    desc: '',
    state: 0,
    speed: 1.0,
    is_loop: false,
    is_tone_modify: false,
    reverse: false,
    intensifies_audio: false,
    cartoon: false,
    volume: 1.0,
    last_nonzero_volume: 1.0,
    clip: null,
    uniform_scale: null,
    material_id: materialId,
    extra_material_refs: refs,
    render_index: o.render_index,
    keyframe_refs: [],
    enable_lut: !!o.adjust,
    enable_adjust: !!o.adjust,
    enable_hsl: !!o.adjust,
    visible: true,
    group_id: '',
    enable_color_curves: true,
    enable_hsl_curves: true,
    track_render_index: o.track_render_index,
    hdr_settings: null,
    hdr_vivid_settings: null,
    enable_color_wheels: true,
    track_attribute: 0,
    is_placeholder: false,
    template_id: '',
    enable_smart_color_adjust: false,
    template_scene: 'default',
    common_keyframes: [],
    caption_info: null,
    responsive_layout: { enable: false, target_follow: '', size_layout: 0, horizontal_pos_layout: 0, vertical_pos_layout: 0 },
    enable_color_match_adjust: false,
    enable_color_correct_adjust: false,
    enable_adjust_mask: !!o.adjust,
    raw_segment_id: '',
    lyric_keyframes: null,
    enable_video_mask: true,
    digital_human_template_group_id: '',
    color_correct_alg_result: '',
    source: 'segmentsourcenormal',
    enable_mask_stroke: false,
    enable_mask_shadow: false,
    enable_color_adjust_pro: false,
    segment_color_tag: '',
  }
}

/**
 * Builds the CapCut project. Each subproject becomes a timeline of the SAME CapCut project
 * (CapCut 9.x layout, mirrored from a real two-timeline draft):
 *   draft_content.json (+ draft_info.json, template-2.tmp) = main timeline
 *   Timelines/<id>/draft_content.json                       = every timeline
 *   Timelines/project.json + timeline_layout.json           = timeline list / tabs
 */
export function buildDraft(input: DraftInput): DraftOutput {
  const folderName = safeProjectName(input.projectName)
  const draftRoot = (input.draftRoot || capcutDraftRoot(input.system, input.username)).replace(/\\/g, '/').replace(/\/+$/, '')
  const draftFolder = `${draftRoot}/${folderName}`
  const mediaRoot = `${draftFolder}/media`
  const shared: Shared = {
    system: input.system,
    settings: input.settings,
    canvas: input.canvas,
    mediaInfo: input.mediaInfo,
    fileNames: input.fileNames,
    mediaRoot,
    folderName,
    metaEntries: [],
    metaPaths: new Set(),
  }
  const built = input.timelines.map((tl) => ({ tl, ...buildTimelineContent(tl, shared) }))
  const main = built[0]
  const now = Date.now()
  const nowUs = now * 1000

  // ---- Meta manifest --------------------------------------------------------
  const meta = structuredClone(metaTemplate) as Record<string, any>
  meta.draft_id = upperId()
  meta.draft_name = folderName
  meta.draft_fold_path = draftFolder
  meta.draft_root_path = draftRoot
  meta.tm_duration = main.totalUs
  meta.tm_draft_create = nowUs
  meta.tm_draft_modified = nowUs
  const group0 = (meta.draft_materials as { type: number; value: any[] }[]).find((g) => g.type === 0)
  if (group0) group0.value = shared.metaEntries

  const names = built.map((b, i) => b.tl.name?.trim() || `Linha do tempo ${String(i + 1).padStart(2, '0')}`)
  const project = {
    config: { color_space: -1, hdr_vivid: false, mixed_track_mode_on: false, render_index_track_mode_on: false, use_float_render: false },
    create_time: nowUs,
    id: upperId(),
    main_timeline_id: main.content.id,
    timelines: built.map((b, i) => ({
      create_time: nowUs + i,
      id: b.content.id,
      is_marked_delete: false,
      name: names[i],
      update_time: nowUs + i,
    })),
    update_time: nowUs,
    version: 0,
  }
  const layout = {
    dockItems: [{ dockIndex: 0, ratio: 1, timelineIds: built.map((b) => b.content.id), timelineNames: names }],
    layoutOrientation: 1,
  }
  const sec = Math.floor(now / 1000)
  const settings = `[General]\r\ndraft_create_time=${sec}\r\ndraft_last_edit_time=${sec}\r\nreal_edit_seconds=0\r\nreal_edit_keys=0\r\n`

  const mainJson = JSON.stringify(main.content)
  const files: Record<string, string> = {
    'draft_content.json': mainJson,
    'draft_info.json': mainJson, // macOS name
    'template-2.tmp': mainJson,
    'draft_meta_info.json': JSON.stringify(meta),
    'draft_settings': settings,
    'timeline_layout.json': JSON.stringify(layout),
    'Timelines/project.json': JSON.stringify(project),
  }
  for (const b of built) {
    const json = b === main ? mainJson : JSON.stringify(b.content)
    const dir = `Timelines/${b.content.id}`
    files[`${dir}/draft_content.json`] = json
    files[`${dir}/draft_info.json`] = json
    files[`${dir}/template-2.tmp`] = json
  }

  return {
    folderName,
    mediaRoot,
    totalUs: main.totalUs,
    draftId: meta.draft_id,
    draftFolder,
    draftRoot,
    createdUs: nowUs,
    timelines: built.length,
    files,
  }
}

/**
 * Entry for com.lveditor.draft/root_meta_info.json (CapCut's project list).
 * Only used when writing straight into the folder; a zip can't touch the registry.
 */
export function rootMetaEntry(d: DraftOutput, system: CapCutSystem) {
  const sep = system === 'windows' ? '\\' : '/'
  return {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    draft_cloud_last_action_download: false,
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: `${d.draftFolder}${sep}draft_cover.jpg`,
    draft_fold_path: d.draftFolder,
    draft_id: d.draftId,
    draft_is_ai_shorts: false,
    draft_is_cloud_temp_draft: false,
    draft_is_infinite_canvas_draft: false,
    draft_is_invisible: false,
    draft_is_pippit_draft: false,
    draft_is_web_article_video: false,
    draft_json_file: `${d.draftFolder}${sep}${system === 'mac' ? 'draft_info.json' : 'draft_content.json'}`,
    draft_name: d.folderName,
    draft_new_version: '',
    draft_root_path: system === 'windows' ? d.draftRoot.replace(/\//g, '\\') : d.draftRoot,
    draft_timeline_materials_size: 0,
    draft_type: '',
    draft_web_article_video_enter_from: '',
    pippit_avatar_url: '',
    pippit_extra_info: '',
    pippit_id: '',
    pippit_user_name: '',
    streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: d.createdUs,
    tm_draft_modified: d.createdUs,
    tm_draft_removed: 0,
    tm_duration: d.totalUs,
  }
}

function metaEntry(asset: Asset, path: string, metetype: 'video' | 'photo' | 'music', info?: MediaInfo) {
  return {
    ai_group_type: '',
    create_time: -1,
    duration: metetype === 'photo' ? 0 : toUs(info?.duration || asset.duration || 5),
    enter_from: 0,
    extra_info: path.split('/').pop(),
    file_Path: path,
    height: info?.height || 0,
    id: crypto.randomUUID(),
    import_time: -1,
    import_time_ms: -1,
    item_source: 1,
    material_color_tag: '',
    md5: '',
    metetype,
    roughcut_time_range: { duration: -1, start: -1 },
    sub_time_range: { duration: -1, start: -1 },
    type: 0,
    width: info?.width || 0,
  }
}

/** Timing guide CSV (works with any editor) — one block per subproject */
export function buildTimingCsv(timelines: { name: string; timeline: TimedScene[] }[], fileNames: Map<string, string>) {
  const fmt = (s: number) => s.toFixed(3)
  const rows = [['subprojeto', 'cena', 'arquivo', 'inicio_s', 'fim_s', 'duracao_s', 'animacao', 'transicao_entrada']]
  for (const { name, timeline } of timelines) {
    timeline.forEach((t) => {
      const media = t.videoAsset || t.imageAsset
      rows.push([
        name,
        String(t.index + 1),
        media ? fileNames.get(media.id) || media.filename : '',
        fmt(t.start),
        fmt(t.start + t.duration),
        fmt(t.duration),
        normalizeAnimation(t.scene.animation_type),
        normalizeTransition(t.scene.transition_in),
      ])
    })
  }
  return rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}
