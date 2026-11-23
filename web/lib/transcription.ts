import type { TranscriptSegment } from './captions'
export interface Transcript {
  segments: TranscriptSegment[]
  words: { start: number; end: number; word: string }[]
}
// Share concurrent requests between speech adjustment and the caption button.
const pending = new Map<string, Promise<Transcript>>()
export function transcribeAsset(assetId: string): Promise<Transcript> {
  const existing = pending.get(assetId)
  if (existing) return existing
  const request = fetch('/api/captions/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId }),
  }).then(async response => {
    const data = await response.json()
    if (!response.ok) throw Error(data.error || 'Falha ao analisar as falas.')
    return data as Transcript
  }).finally(() => pending.delete(assetId))
  pending.set(assetId, request)
  return request
}
