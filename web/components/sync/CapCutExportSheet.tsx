'use client'

import { useEffect, useMemo, useState } from 'react'
import { Apple, Monitor, FolderDown, FileArchive, Copy, FileSpreadsheet, Loader2, Check, TriangleAlert } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModeSwitch } from './EffectTiles'
import { capcutDraftRoot, safeProjectName, type CapCutSystem } from '@/lib/capcut/draft'
import {
  downloadDraftZip,
  downloadTimingCsv,
  saveDraftToFolder,
  supportsDirectSave,
  type PackageOptions,
  type CanvasFormat,
} from '@/lib/capcut/package'
import { formatTime, totalDuration, type TimedScene } from '@/lib/timeline'
import type { Asset, AudioClip, OverlayClip } from '@/types/project'
import { normalizeAnimation, normalizeTransition, type SyncSettings } from '@/lib/sync/presets'
import { CapCutPreviewCard, OpenInCapCut } from './CapCutPreview'

interface CapCutExportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectTitle: string
  timeline: TimedScene[]
  narration: { asset: Asset; start: number; duration: number }[]
  settings: SyncSettings
  defaultFormat?: string
  overlays?: OverlayClip[]
  audioClips?: AudioClip[]
  assets?: Asset[]
}

const PREFS_KEY = 'syncexpress.capcut'

export function CapCutExportSheet({
  open,
  onOpenChange,
  projectTitle,
  timeline,
  narration,
  settings,
  defaultFormat,
  overlays = [],
  audioClips = [],
  assets = [],
}: CapCutExportSheetProps) {
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const overlayItems = useMemo(
    () => overlays.flatMap((clip) => (assetById.get(clip.asset_id) ? [{ clip, asset: assetById.get(clip.asset_id)! }] : [])),
    [overlays, assetById]
  )
  const audioItems = useMemo(
    () => audioClips.flatMap((clip) => (assetById.get(clip.asset_id) ? [{ clip, asset: assetById.get(clip.asset_id)! }] : [])),
    [audioClips, assetById]
  )
  const [system, setSystem] = useState<CapCutSystem>('windows')
  const [format, setFormat] = useState<CanvasFormat>('auto')
  const [username, setUsername] = useState('')
  const [name, setName] = useState(projectTitle)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [canDirect, setCanDirect] = useState(false)

  useEffect(() => {
    setCanDirect(supportsDirectSave())
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
      if (saved.system) setSystem(saved.system)
      else if (/Mac/i.test(navigator.platform)) setSystem('mac')
      if (saved.username) setUsername(saved.username)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (open) {
      setName(safeProjectName(projectTitle))
      setResult(null)
      setError(null)
      setProgress(null)
      if (defaultFormat && ['auto', '9:16', '16:9', '1:1'].includes(defaultFormat)) setFormat(defaultFormat as CanvasFormat)
    }
  }, [open, projectTitle, defaultFormat])

  const cover = timeline.find((t) => t.videoAsset || t.imageAsset)
  const coverAsset = cover?.videoAsset || cover?.imageAsset
  const coverThumb = (coverAsset?.metadata?.thumbnail as string | undefined) || undefined
  const coverW = Number(coverAsset?.metadata?.width) || 0
  const coverH = Number(coverAsset?.metadata?.height) || 0
  const isVertical = format === '9:16' || (format === 'auto' && (coverW ? coverH > coverW : true))
  const transitionCount = timeline.filter((t, i) => i > 0 && normalizeTransition(t.scene.transition_in) !== 'cut').length
  const animationCount = timeline.filter((t) => normalizeAnimation(t.scene.animation_type) !== 'none').length

  const root = useMemo(() => capcutDraftRoot(system, username), [system, username])
  const pretty = system === 'windows' ? root.replace(/\//g, '\\') : root
  const total = totalDuration(timeline)
  const clipCount = new Set(timeline.map((t) => (t.videoAsset || t.imageAsset)?.id).filter(Boolean)).size

  const options = (): PackageOptions => ({
    projectName: name,
    system,
    username,
    timeline,
    narration,
    settings,
    outputFormat: format,
    overlays: overlayItems,
    audioClips: audioItems,
    onProgress: (done, totalFiles, label) => setProgress({ done, total: totalFiles, label }),
  })

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ system, username }))
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const out = await fn()
      if (out !== null) setResult(okMsg)
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      console.error('[CapCut export]', e)
      setError(e instanceof Error ? e.message : 'Falha ao gerar o projeto')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || timeline.length === 0 || !name.trim()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[500px]">
        <div className="border-b border-border px-6 pb-4 pt-6">
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> Exportar
          </p>
          <SheetTitle className="mt-2">Projeto CapCut pronto pra abrir</SheetTitle>
          <SheetDescription className="mt-1">
            Cada cena no seu tempo, animações e transições aplicadas, narração sincronizada. Sem cortar clipe por clipe.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <CapCutPreviewCard
            name={safeProjectName(name)}
            thumb={coverThumb}
            duration={total}
            vertical={isVertical}
            scenes={timeline.length}
            transitions={transitionCount}
            animations={animationCount}
          />

          <div className="space-y-2">
            <Label>Sistema</Label>
            <ModeSwitch
              label="Sistema operacional"
              value={system}
              onChange={setSystem}
              options={[
                { value: 'windows', label: 'Windows', icon: <Monitor className="h-4 w-4" /> },
                { value: 'mac', label: 'Mac', icon: <Apple className="h-4 w-4" /> },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Formato do vídeo</Label>
            <ModeSwitch
              label="Formato do vídeo"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: '9:16', label: '9:16' },
                { value: '16:9', label: '16:9' },
                { value: '1:1', label: '1:1' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">Auto segue os clipes (verticais → 9:16 Shorts/Reels).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cc-user">
                Usuário do PC <span className="text-muted-foreground">(recomendado)</span>
              </Label>
              <Input
                id="cc-user"
                placeholder="ex: jonat"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[\\/]/g, ''))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-name">Nome do projeto</Label>
              <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-0 p-3">
            <p className="eyebrow mb-1.5">Pasta de projetos do CapCut</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/85">{pretty}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copiar caminho"
                onClick={async () => {
                  await navigator.clipboard.writeText(pretty)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <Check className="text-primary" /> : <Copy />}
              </Button>
            </div>
            {!username.trim() && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-primary">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                Sem o usuário, o CapCut vai pedir “Vincular mídia” uma vez — aponte pra pasta <code>media</code> do projeto.
              </p>
            )}
          </div>

          {progress && busy && (
            <div role="status" className="space-y-1.5">
              <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                <span className="truncate">{progress.label}</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-gradient-to-r from-brand-pink to-brand-orange transition-[width] duration-300"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {result && <OpenInCapCut name={safeProjectName(name)} message={result} system={system} />}
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" role="alert">
              {error}
            </p>
          )}

          <ol className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-4 text-[13px] text-muted-foreground">
            <p className="eyebrow mb-1">Como usar</p>
            <li>
              <span className="font-mono text-primary">1</span> Feche o CapCut (ele sobrescreve a pasta se estiver aberto).
            </li>
            <li>
              <span className="font-mono text-primary">2</span> <b className="text-foreground">Salvar direto</b>: escolha a pasta{' '}
              <code>com.lveditor.draft</code> (caminho acima). Ou <b className="text-foreground">.zip</b>: botão direito →{' '}
              <i>Extrair tudo…</i> → cole o caminho acima como destino.
            </li>
            <li>
              <span className="font-mono text-primary">3</span> Abra o CapCut: o projeto <b className="text-foreground">{safeProjectName(name)}</b>{' '}
              aparece na lista.
            </li>
          </ol>
        </div>

        <div className="space-y-2 border-t border-border bg-surface-0/60 px-6 py-4">
          {canDirect && (
            <Button
              className="h-11 w-full text-[15px] font-semibold"
              disabled={disabled}
              onClick={() => run(() => saveDraftToFolder(options()), 'Projeto salvo na pasta do CapCut. Abra o CapCut.')}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FolderDown />} Salvar direto na pasta do CapCut
            </Button>
          )}
          <Button
            variant={canDirect ? 'outline' : 'default'}
            className="h-10 w-full"
            disabled={disabled}
            onClick={() =>
              run(() => downloadDraftZip(options()), 'Zip baixado. Extraia dentro de com.lveditor.draft e abra o CapCut.')
            }
          >
            {busy && !canDirect ? <Loader2 className="animate-spin" /> : <FileArchive />} Baixar como .zip (funciona sempre)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={timeline.length === 0}
            onClick={() => downloadTimingCsv(timeline, narration, safeProjectName(name))}
          >
            <FileSpreadsheet /> Só o guia de tempos (.csv)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
