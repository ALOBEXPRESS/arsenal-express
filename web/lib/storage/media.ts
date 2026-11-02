import { createClient } from '@/lib/supabase/client'
import type { Asset } from '@/types/project'

/** Resolve a fresh authorized URL; signed URLs must not be persisted as file identities. */
export async function mediaUrl(asset: Pick<Asset, 'id' | 'storage_path' | 'metadata'>): Promise<string> {
  if (asset.metadata?.storage_provider === 'r2') {
    const response = await fetch(`/api/media/${encodeURIComponent(asset.id)}/url`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.url) throw new Error(data.error || 'Falha ao acessar mídia')
    return data.url
  }
  const { data, error } = await createClient().storage.from('media').createSignedUrl(asset.storage_path, 900)
  if (error || !data) throw error || new Error('Falha ao acessar mídia')
  return data.signedUrl
}

export async function downloadMedia(asset: Pick<Asset, 'id' | 'storage_path' | 'metadata'>): Promise<Blob> {
  const response = await fetch(await mediaUrl(asset))
  if (!response.ok) throw new Error('Não foi possível baixar a mídia')
  return response.blob()
}

export async function deleteMedia(id: string): Promise<void> {
  const response = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Falha ao excluir mídia') }
}
