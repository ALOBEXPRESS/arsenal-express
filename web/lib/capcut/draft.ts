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
import type { Asset, AudioClip, OverlayClip } from '@/types/project'
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

export interface DraftInput {
  projectName: string
  system: CapCutSystem
  username?: string
  timeline: TimedScene[]
  narration: { asset: Asset; start: number; duration: number }[]
  settings: SyncSettings
  canvas: { width: number; height: number }
  mediaInfo: Map<string, MediaInfo>
  /** asset id -> file name inside <Project>/media */
  fileNames: Map<string, string>
  /** clip audio level under narration (0..1) */
  clipVolume: number
  /** image/video layers above the main track */
  overlays?: { clip: OverlayClip; asset: Asset }[]
  /** music / SFX */
  audioClips?: { clip: AudioClip; asset: Asset }[]
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

export function buildDraft(input: DraftInput): DraftOutput {
  const folderName = safeProjectName(input.projectName)
  const draftRoot = capcutDraftRoot(input.system, input.username)
  const draftFolder = `${draftRoot}/${folderName}`
  const mediaRoot = `${draftFolder}/media`

  const content = structuredClone(contentTemplate) as Record<string, any>
  const mat = content.materials as Record<string, any[]>

  // ---- Materials (one per distinct asset) ---------------------------------
  const materialIdByAsset = new Map<string, string>()
  const metaEntries: any[] = []

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
    metaEntries.push(metaEntry(asset, `${mediaRoot}/${fileName}`, isPhoto ? 'photo' : 'video', info))
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
    metaEntries.push(metaEntry(asset, `${mediaRoot}/${fileName}`, 'music'))
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
    const clipS = input.mediaInfo.get(media.id)?.duration || media.duration || durS
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
      source_timerange: { start: 0, duration: sourceUs },
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
  const overlayTracks = packRows(input.overlays || [], (o) => o.clip).map((row, r) => {
    const layer = r + 1
    const segments = row.map(({ clip, asset }) => {
      const isPhoto = asset.type === 'image'
      const durUs = toUs(clip.duration)
      const clipS = input.mediaInfo.get(asset.id)?.duration || asset.duration || clip.duration
      const speed = isPhoto ? 1 : clip.speed || 1
      const speedMat = speedMaterial(speed)
      mat.speeds.push(speedMat)
      return {
        ...SEGMENT_COMMON,
        track_render_index: layer,
        id: hex(),
        material_id: registerVideo(asset),
        target_timerange: { start: toUs(clip.start), duration: durUs },
        common_keyframes: [],
        keyframe_refs: [],
        source_timerange: { start: 0, duration: isPhoto ? durUs : Math.min(Math.round(durUs * speed), toUs(clipS)) },
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
      return {
        ...SEGMENT_COMMON,
        id: hex(),
        material_id: registerAudio(asset),
        target_timerange: { start: toUs(clip.start), duration: durUs },
        common_keyframes: [],
        keyframe_refs: [],
        source_timerange: { start: 0, duration: Math.min(Math.round(durUs * speed), toUs(asset.duration || clip.duration * speed)) },
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

  content.tracks = [
    { attribute: 0, flag: 0, id: hex(), is_default_name: false, name: 'video', type: 'video', segments: videoSegments },
    ...overlayTracks,
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

  // ---- Meta manifest --------------------------------------------------------
  const meta = structuredClone(metaTemplate) as Record<string, any>
  meta.draft_id = upperId()
  meta.draft_name = folderName
  meta.draft_fold_path = draftFolder
  meta.draft_root_path = draftRoot
  meta.tm_duration = totalUs
  meta.tm_draft_create = now * 1000
  meta.tm_draft_modified = now * 1000
  const group0 = (meta.draft_materials as { type: number; value: any[] }[]).find((g) => g.type === 0)
  if (group0) group0.value = metaEntries

  // ---- CapCut 9.x multi-timeline layout --------------------------------------
  // Mirrors a draft created by CapCut 9.x itself: the root draft_content.json, template-2.tmp
  // and Timelines/<mainId>/draft_content.json are identical copies; project.json points at it.
  const timelineId = content.id as string
  const nowUs = now * 1000
  const project = {
    config: { color_space: -1, hdr_vivid: false, mixed_track_mode_on: false, render_index_track_mode_on: false, use_float_render: false },
    create_time: nowUs,
    id: upperId(),
    main_timeline_id: timelineId,
    timelines: [
      { create_time: nowUs, id: timelineId, is_marked_delete: false, name: 'Linha do tempo 01', update_time: nowUs },
    ],
    update_time: nowUs,
    version: 0,
  }
  const layout = {
    dockItems: [{ dockIndex: 0, ratio: 1, timelineIds: [timelineId], timelineNames: ['Linha do tempo 01'] }],
    layoutOrientation: 1,
  }
  const sec = Math.floor(now / 1000)
  const settings = `[General]\r\ndraft_create_time=${sec}\r\ndraft_last_edit_time=${sec}\r\nreal_edit_seconds=0\r\nreal_edit_keys=0\r\n`

  const json = JSON.stringify(content)
  const tl = `Timelines/${timelineId}`
  return {
    folderName,
    mediaRoot,
    totalUs,
    draftId: meta.draft_id,
    draftFolder,
    draftRoot,
    createdUs: nowUs,
    files: {
      'draft_content.json': json,
      'draft_info.json': json, // macOS name
      'template-2.tmp': json,
      'draft_meta_info.json': JSON.stringify(meta),
      'draft_settings': settings,
      'timeline_layout.json': JSON.stringify(layout),
      'Timelines/project.json': JSON.stringify(project),
      [`${tl}/draft_content.json`]: json,
      [`${tl}/draft_info.json`]: json,
      [`${tl}/template-2.tmp`]: json,
    },
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

/** Timing guide CSV (works with any editor) */
export function buildTimingCsv(timeline: TimedScene[], fileNames: Map<string, string>) {
  const fmt = (s: number) => s.toFixed(3)
  const rows = [['cena', 'arquivo', 'inicio_s', 'fim_s', 'duracao_s', 'animacao', 'transicao_entrada']]
  timeline.forEach((t) => {
    const media = t.videoAsset || t.imageAsset
    rows.push([
      String(t.index + 1),
      media ? fileNames.get(media.id) || media.filename : '',
      fmt(t.start),
      fmt(t.start + t.duration),
      fmt(t.duration),
      normalizeAnimation(t.scene.animation_type),
      normalizeTransition(t.scene.transition_in),
    ])
  })
  return rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}
