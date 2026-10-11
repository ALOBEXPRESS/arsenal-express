// Packs a CapCut draft + its media: .zip download or direct write into com.lveditor.draft
// (File System Access API, Chrome/Edge).
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/ui/confirm'
import { installViaBridge } from './bridge'
import type { Asset } from '@/types/project'
import { buildDraft, buildTimingCsv, rootMetaEntry, type DraftInput, type MediaInfo, type CapCutSystem, type TimelineInput } from './draft'
import type { SyncSettings } from '@/lib/sync/presets'

const supabase = createClient()

export interface PackageOptions {
  projectName: string
  system: CapCutSystem
  username?: string
  /** real CapCut projects folder (from the local connector) */
  draftRoot?: string
  /** one entry per subproject → CapCut "Linha do tempo 01, 02…" of the same project */
  timelines: TimelineInput[]
  settings: SyncSettings
  outputFormat?: CanvasFormat | string
  onProgress?: (done: number, total: number, label: string) => void
}

const pad = (n: number) => String(n).padStart(3, '0')
const ext = (name: string) => (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase()
const slug = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 48)

/** Stable media file names: 001_clip.mp4 ... in timeline order, narracao_1.wav, sobrepor_/audio_ ... */
export function mediaFileNames(timelines: Pick<TimelineInput, 'timeline' | 'narration' | 'overlays' | 'audioClips'>[]) {
  const names = new Map<string, string>()
  let i = 1
  let k = 1
  let o = 1
  let s = 1
  for (const tl of timelines) {
    for (const t of tl.timeline) {
      const a = t.videoAsset || t.imageAsset
      if (a && !names.has(a.id)) names.set(a.id, `${pad(i++)}_${slug(a.filename)}${ext(a.filename)}`)
    }
  }
  for (const tl of timelines) {
    tl.narration.forEach((n) => {
      if (!names.has(n.asset.id)) names.set(n.asset.id, `narracao_${k++}${ext(n.asset.filename) || '.wav'}`)
    })
    tl.overlays?.forEach(({ asset }) => {
      if (!names.has(asset.id)) names.set(asset.id, `sobrepor_${pad(o++)}_${slug(asset.filename)}${ext(asset.filename)}`)
    })
    tl.audioClips?.forEach(({ asset }) => {
      if (!names.has(asset.id)) names.set(asset.id, `audio_${pad(s++)}_${slug(asset.filename)}${ext(asset.filename)}`)
    })
  }
  return names
}

function probe(asset: Asset): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const fallback = { width: 0, height: 0, duration: asset.duration || 0 }
    if (!asset.url) return resolve(fallback)
    if (asset.type === 'image') {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: 0 })
      img.onerror = () => resolve(fallback)
      img.src = asset.url
      return
    }
    const el = document.createElement(asset.type === 'audio' ? 'audio' : 'video')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement
      resolve({
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
        duration: Number.isFinite(el.duration) ? el.duration : asset.duration || 0,
      })
      el.removeAttribute('src')
    }
    el.onerror = () => resolve(fallback)
    el.src = asset.url
  })
}

export type CanvasFormat = 'auto' | '9:16' | '16:9' | '1:1'

/** 'auto' follows the clips: majority vertical → 9:16, otherwise 16:9 */
export function canvasFor(format: CanvasFormat | string | undefined, infos: MediaInfo[]) {
  if (format === '9:16') return { width: 1080, height: 1920 }
  if (format === '1:1') return { width: 1080, height: 1080 }
  if (format === '16:9') return { width: 1920, height: 1080 }
  const sized = infos.filter((i) => i.width && i.height)
  const vertical = sized.filter((i) => i.height > i.width).length
  return sized.length && vertical * 2 >= sized.length ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

export async function prepareDraft(opts: PackageOptions) {
  const allAssets = new Map<string, Asset>()
  for (const tl of opts.timelines) {
    tl.timeline.forEach((t) => {
      const a = t.videoAsset || t.imageAsset
      if (a) allAssets.set(a.id, a)
    })
    tl.narration.forEach((n) => allAssets.set(n.asset.id, n.asset))
    tl.overlays?.forEach((o) => allAssets.set(o.asset.id, o.asset))
    tl.audioClips?.forEach((c) => allAssets.set(c.asset.id, c.asset))
  }

  const mediaInfo = new Map<string, MediaInfo>()
  await Promise.all([...allAssets.values()].map(async (a) => mediaInfo.set(a.id, await probe(a))))

  const fileNames = mediaFileNames(opts.timelines)
  const videoInfos = opts.timelines
    .flatMap((tl) => tl.timeline.map((t) => (t.videoAsset ? mediaInfo.get(t.videoAsset.id) : undefined)))
    .filter(Boolean) as MediaInfo[]

  const input: DraftInput = {
    projectName: opts.projectName,
    system: opts.system,
    username: opts.username,
    draftRoot: opts.draftRoot,
    timelines: opts.timelines,
    settings: opts.settings,
    canvas: canvasFor(opts.outputFormat, videoInfos),
    mediaInfo,
    fileNames,
  }
  const draft = buildDraft(input)
  return { draft, fileNames, assets: [...allAssets.values()] }
}

async function downloadAll(
  assets: Asset[],
  fileNames: Map<string, string>,
  onFile: (name: string, blob: Blob) => Promise<void>,
  onProgress?: PackageOptions['onProgress']
) {
  // 4 parallel downloads; writes stay sequential (zip/file handles aren't concurrent-safe)
  const CONCURRENCY = 4
  let done = 0
  let next = 0
  let writing = Promise.resolve()
  const worker = async () => {
    while (next < assets.length) {
      const a = assets[next++]
      const name = fileNames.get(a.id)!
      onProgress?.(done, assets.length, `Baixando ${name}`)
      const { data, error } = await supabase.storage.from('media').download(a.storage_path)
      if (error || !data) throw error || new Error(`Falha ao baixar ${a.filename}`)
      writing = writing.then(() => onFile(name, data))
      await writing
      done++
      onProgress?.(done, assets.length, `Baixado ${name}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker))
  onProgress?.(done, assets.length, 'Pronto')
}

/** Builds a .zip with <Project>/(draft files + media/) and triggers the download */
export async function downloadDraftZip(opts: PackageOptions) {
  const { draft, fileNames, assets } = await prepareDraft(opts)
  // Draft files at the zip ROOT: Windows "Extrair tudo" already creates a folder named after
  // the zip (<Projeto>/), so an inner folder would end up as <Projeto>/<Projeto>/ and CapCut
  // would not find the project.
  const zip = new JSZip()

  Object.entries(draft.files).forEach(([p, text]) => zip.file(p, text))
  zip.file('guia_de_tempos.csv', buildTimingCsv(opts.timelines, fileNames))
  const media = zip.folder('media')!
  await downloadAll(assets, fileNames, async (name, blob) => void media.file(name, blob), opts.onProgress)
  opts.onProgress?.(assets.length, assets.length, 'Compactando...')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  triggerDownload(blob, `${draft.folderName}.zip`)
  return draft
}

type DirHandle = {
  getDirectoryHandle: (name: string, o?: { create?: boolean }) => Promise<DirHandle>
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (d: Blob | string) => Promise<void>; close: () => Promise<void> }>
  }>
  name: string
}

export function supportsDirectSave() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Writes the draft straight into the user's com.lveditor.draft folder (Chrome/Edge) */
export async function saveDraftToFolder(opts: PackageOptions) {
  const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> }).showDirectoryPicker
  const rootDir = await picker({ id: 'capcut-drafts', mode: 'readwrite' })
  if (rootDir.name !== 'com.lveditor.draft') {
    const ok = await confirmDialog({
      title: 'Pasta diferente da do CapCut',
      description: `A pasta escolhida é “${rootDir.name}”, não “com.lveditor.draft”. O CapCut só encontra projetos dentro de com.lveditor.draft. Salvar mesmo assim?`,
      confirmLabel: 'Salvar mesmo assim',
    })
    if (!ok) return null
  }
  const { draft, fileNames, assets } = await prepareDraft(opts)
  const dir = await rootDir.getDirectoryHandle(draft.folderName, { create: true })
  const write = async (d: DirHandle, name: string, data: Blob | string) => {
    const fh = await d.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(data)
    await w.close()
  }
  const writePath = async (base: DirHandle, path: string, data: Blob | string) => {
    const parts = path.split('/')
    let d = base
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true })
    await write(d, parts[parts.length - 1], data)
  }
  for (const [p, text] of Object.entries(draft.files)) await writePath(dir, p, text)
  await write(dir, 'guia_de_tempos.csv', buildTimingCsv(opts.timelines, fileNames))
  const mediaDir = await dir.getDirectoryHandle('media', { create: true })
  await downloadAll(assets, fileNames, (name, blob) => write(mediaDir, name, blob), opts.onProgress)

  // Register in CapCut's project list (root_meta_info.json) — backup first
  if (rootDir.name === 'com.lveditor.draft') {
    try {
      const fh = await (rootDir as unknown as { getFileHandle: (n: string) => Promise<{ getFile: () => Promise<File> }> }).getFileHandle(
        'root_meta_info.json'
      )
      const text = await (await fh.getFile()).text()
      await write(rootDir, 'root_meta_info.json.syncexpress.bak', text)
      const registry = JSON.parse(text) as { all_draft_store?: Record<string, unknown>[] }
      const list = (registry.all_draft_store || []).filter((e) => e.draft_fold_path !== draft.draftFolder)
      list.unshift(rootMetaEntry(draft, opts.system))
      registry.all_draft_store = list
      await write(rootDir, 'root_meta_info.json', JSON.stringify(registry))
    } catch (e) {
      // No registry yet (fresh CapCut) — CapCut scans the folder on start anyway
      console.warn('[CapCut] root_meta_info.json not updated:', e)
    }
  }
  return draft
}

export function downloadTimingCsv(timelines: TimelineInput[], name: string) {
  const csv = buildTimingCsv(timelines, mediaFileNames(timelines))
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}_tempos.csv`)
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Writes the project straight into CapCut's projects folder through the local connector,
 * registers it in CapCut's list and (optionally) opens CapCut.
 */
export async function installToCapCut(
  opts: PackageOptions & { token: string; launch: boolean; closeCapCut: boolean }
) {
  const { draft, fileNames, assets } = await prepareDraft(opts)
  const media = assets.map((a) => {
    if (!a.url) throw new Error(`"${a.filename}" sem link de download. Recarregue a página e tente de novo.`)
    return { name: fileNames.get(a.id)!, url: a.url }
  })
  const files = { ...draft.files, 'guia_de_tempos.csv': buildTimingCsv(opts.timelines, fileNames) }
  const out = await installViaBridge(
    opts.token,
    {
      folderName: draft.folderName,
      files,
      media,
      registryEntry: rootMetaEntry(draft, opts.system) as unknown as Record<string, unknown>,
      launch: opts.launch,
      closeCapCut: opts.closeCapCut,
    },
    opts.onProgress
  )
  return { draft, ...out }
}
