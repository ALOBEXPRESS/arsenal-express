'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUploadAsset } from '@/lib/hooks/useAssets'
import type { Tracks } from '@/lib/hooks/useTracks'
import { narrationVoices } from '@/lib/narrationVoices'
import type { TimedScene } from '@/lib/timeline'
import type { NarrationSegment } from '@/types/project'

type Props = { projectId: string; sequenceId: string; tracks: Tracks; timeline: TimedScene[] }

export function NarrationButton({ projectId, sequenceId, tracks, timeline }: Props) {
  const upload = useUploadAsset()
  const [open, setOpen] = useState(false)
  const [voice, setVoice] = useState<string>(narrationVoices[0])
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const job = useRef<AbortController | null>(null)
  const cache = useRef(new Map<string, { assetId: string; duration: number }>())
  const signature = JSON.stringify([timeline.map(t => [t.scene.id, t.start, t.duration, t.trim, t.rate]), tracks.narrationTrack])
  const latest = useRef(signature)
  latest.current = signature
  useEffect(() => () => job.current?.abort(), [])

  function show() {
    setTexts(previous => Object.fromEntries(timeline.map(t => {
      const script = t.scene.narration_text?.trim() || ''
      const captions = tracks.overlays.filter(o => o.auto_caption && o.start >= t.start && o.start < t.start + t.duration)
        .sort((a, b) => a.start - b.start).map(o => o.text_content).join(' ')
      return [t.scene.id, previous[t.scene.id] ?? (captions || (/^cena\s*\d+$/i.test(script) ? '' : script))]
    })))
    setError('')
    setOpen(true)
  }

  async function generate() {
    if (job.current) return
    const controller = new AbortController()
    job.current = controller
    const { signal } = controller
    const clips: NarrationSegment[] = []
    const ensureCurrent = () => {
      signal.throwIfAborted()
      if (latest.current !== signature) throw Error('A timeline mudou. Confira os trechos e tente novamente.')
    }
    setError('')
    try {
      for (const [index, scene] of timeline.entries()) {
        const text = texts[scene.scene.id]?.trim()
        if (!text) continue
        ensureCurrent()
        setProgress(`Gerando cena ${index + 1} de ${timeline.length}…`)
        const key = JSON.stringify([scene.scene.id, voice, text])
        let source = cache.current.get(key)
        if (!source) {
          const response = await fetch('/api/narration/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice, text }), signal })
          if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || 'Falha ao gerar a narração.')
          const file = new File([await response.blob()], `Narração - Cena ${index + 1} - ${voice}.wav`, { type: 'audio/wav' })
          ensureCurrent()
          const asset = await upload.mutateAsync({ project_id: projectId, sequenceId, narration: true, type: 'audio', file, signal })
          const duration = asset.duration_seconds ?? asset.duration
          if (!duration || !Number.isFinite(duration)) throw Error('Não foi possível medir o áudio da cena.')
          source = { duration, assetId: asset.id }
          cache.current.set(key, source)
        }
        const speed = Math.max(1, source.duration / scene.duration)
        if (speed > 2) throw Error(`O texto da cena ${index + 1} ficou longo para o corte. Encurte a fala e tente novamente.`)
        clips.push({ asset_id: source.assetId, start: scene.start, duration: Math.min(source.duration, scene.duration), speed, volume: 1 })
      }
      ensureCurrent()
      if (!clips.length) return
      await tracks.saveGeneratedNarration(clips)
      if (!signal.aborted) {
        toast.success('Narração adicionada à sequência.')
        setOpen(false)
      }
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao gerar narração.')
    } finally {
      job.current = null
      if (!signal.aborted) setProgress('')
    }
  }

  return <>
    <Button size="sm" variant="outline" disabled={!timeline.length} onClick={show}>Gerar narração</Button>
    <Dialog open={open} onOpenChange={value => { if (!job.current) setOpen(value) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gerar narração</DialogTitle><DialogDescription>Escreva a fala de cada cena. Deixe o campo vazio para manter a cena sem narração.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-sm">Voz do Gemini
          <select className="rounded-md border bg-background p-2" value={voice} disabled={!!progress} onChange={e => setVoice(e.target.value)}>
            {narrationVoices.map(v => <option key={v}>{v}</option>)}
          </select>
        </label>
        {timeline.map((scene, i) => <label key={scene.scene.id} className="grid gap-1 text-sm">
          Cena {i + 1} · {scene.duration.toFixed(1)} s
          <textarea className="rounded-md border bg-background p-2" rows={2} maxLength={600} disabled={!!progress} value={texts[scene.scene.id] || ''} onChange={e => setTexts({ ...texts, [scene.scene.id]: e.target.value })}/>
        </label>)}
        {tracks.narrationTrack.length > 0 && <p className="text-sm text-muted-foreground">A nova narração substituirá a faixa de narração desta sequência.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error} <a className="underline" href="/settings/api-keys" target="_blank" rel="noreferrer">Chaves de API</a></p>}
        <DialogFooter><Button disabled={!!progress || !timeline.some(t => texts[t.scene.id]?.trim())} onClick={generate}>
          {progress || (tracks.narrationTrack.length ? 'Gerar e substituir narração' : 'Gerar e adicionar à timeline')}
        </Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
