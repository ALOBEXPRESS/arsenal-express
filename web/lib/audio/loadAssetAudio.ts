import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { downloadMedia } from '@/lib/storage/media'
import type { Asset } from '@/types/project'

/** Resolve a fresh authorized URL before reading an asset's embedded audio. */
export async function loadAssetAudio(asset: Asset, context: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const blob = await downloadMedia(asset)
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    try {
      if (!await input.getPrimaryAudioTrack()) return null
      return await context.decodeAudioData(await blob.arrayBuffer())
    } finally {
      input.dispose()
    }
  } catch {
    throw new Error(`Não foi possível carregar o áudio de "${asset.filename}". Tente novamente; se persistir, confira esse arquivo.`)
  }
}
