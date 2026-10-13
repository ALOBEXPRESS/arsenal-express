'use client'

import { useEffect, useMemo, useState } from 'react'
import { Apple, Monitor, FolderDown, FileArchive, Copy, FileSpreadsheet, Loader2, Check, TriangleAlert, Rocket } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModeSwitch } from './EffectTiles'
import { capcutDraftRoot, safeProjectName, type CapCutSystem } from '@/lib/capcut/draft'
import {
  downloadDraftZip,
  downloadTimingCsv,
  installToCapCut,
  saveDraftToFolder,
  supportsDirectSave,
  type PackageOptions,
  type CanvasFormat,
} from '@/lib/capcut/package'
import { formatTime, totalDuration } from '@/lib/timeline'
import type { TimelineInput } from '@/lib/capcut/draft'
import type { Asset } from '@/types/project'
import { normalizeAnimation, normalizeTransition, type SyncSettings } from '@/lib/sync/presets'
import { CapCutPreviewCard, OpenInCapCut } from './CapCutPreview'
import { BridgePanel, useBridge } from './BridgePanel'
import { BridgeError } from '@/lib/capcut/bridge'
import { confirmDialog } from '@/components/ui/confirm'

interface CapCutExportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectTitle: string
  /** every subproject, already resolved (scenes timed, assets attached) */
  timelines: (TimelineInput & { id: string })[]
  activeSubId: string
  settings: SyncSettings
  extraAssets?: Asset[]
  defaultFormat?: string
}

const PREFS_KEY = 'syncexpress.capcut'

export function CapCutExportSheet({
  open,
  onOpenChange,
  projectTitle,
  timelines: allTimelines,
  activeSubId,
  settings,
  extraAssets,
  defaultFormat,
}: CapCutExportSheetProps) {
  const [scope, setScope] = useState<'all' | 'current'>('all')
  const multi = allTimelines.length > 1
  const chosen = useMemo(
    () => (!multi || scope === 'all' ? allTimelines : allTimelines.filter((t) => t.id === activeSubId)),
    [multi, scope, allTimelines, activeSubId]
  )
  const timeline = useMemo(() => chosen.flatMap((t) => t.timeline), [chosen])
  const [system, setSystem] = useState<CapCutSystem>('windows')
  const [format, setFormat] = useState<CanvasFormat>('auto')
  const [username, setUsername] = useState('')
  const [name, setName] = useState(projectTitle)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [launchedByBridge, setLaunchedByBridge] = useState(false)
  const [canDirect, setCanDirect] = useState(false)
  const bridge = useBridge(open)

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
      setLaunchedByBridge(false)
      if (defaultFormat && ['auto', '9:16', '16:9', '1:1'].includes(defaultFormat)) setFormat(defaultFormat as CanvasFormat)
    }
  }, [open, projectTitle, defaultFormat])

  const cover = timeline.find((t) => t.videoAsset || t.imageAsset)
  const coverAsset = cover?.videoAsset || cover?.imageAsset
  const coverThumb = (coverAsset?.metadata?.thumbnail as string | undefined) || undefined
  const coverW = Number(coverAsset?.metadata?.width) || 0
  const coverH = Number(coverAsset?.metadata?.height) || 0
  const isVertical = format === '9:16' || (format === 'auto' && (coverW ? coverH > coverW : true))
  const transitionCount = timeline.filter((t) => t.index > 0 && normalizeTransition(t.scene.transition_in) !== 'cut').length
  const animationCount = timeline.filter((t) => normalizeAnimation(t.scene.animation_type) !== 'none').length

  const root = useMemo(() => capcutDraftRoot(system, username), [system, username])
  const pretty = system === 'windows' ? root.replace(/\//g, '\\') : root
  const shownRoot =
    bridge.ready && bridge.info?.draftRoot ? bridge.info.draftRoot.replace(/\//g, bridge.info.platform === 'win32' ? '\\' : '/') : pretty
  const total = Math.max(
    ...chosen.map((t) => Math.max(totalDuration(t.timeline), ...t.narration.map((n) => n.start + n.duration), 0)),
    0
  )
  const adjustCount = chosen.reduce((n, t) => n + (t.adjustments?.length || 0), 0)
  const clipCount = new Set(timeline.map((t) => (t.videoAsset || t.imageAsset)?.id).filter(Boolean)).size

  const options = (): PackageOptions => ({
    projectName: name,
    system: bridge.ready && bridge.info?.platform ? (bridge.info.platform === 'darwin' ? 'mac' : 'windows') : system,
    username,
    draftRoot: bridge.ready ? bridge.info?.draftRoot : undefined,
    timelines: chosen,
    settings,
    outputFormat: format,
    extraAssets,
    onProgress: (done, totalFiles, label) => setProgress({ done, total: totalFiles, label }),
  })

  /** Saves into CapCut's folder through the connector and opens CapCut */
  const saveViaBridge = async () => {
    const base = { ...options(), token: bridge.token, launch: true }
    try {
      return await installToCapCut({ ...base, closeCapCut: false })
    } catch (e) {
      if (e instanceof BridgeError && e.code === 'capcut_running') {
        const ok = await confirmDialog({
          title: 'Fechar o CapCut?',
          description:
            'Com o CapCut aberto ele sobrescreve a lista de projetos e o seu não aparece. Vou fechar o CapCut, salvar o projeto e abrir de novo. Salve o que estiver editando antes.',
          confirmLabel: 'Fechar e salvar',
        })
        if (!ok) return null
        return await installToCapCut({ ...base, closeCapCut: true })
      }
      throw e
    }
  }

  const run = async (fn: () => Promise<unknown>, okMsg: string | ((out: unknown) => string)) => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ system, username }))
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const out = await fn()
      if (out !== null) setResult(typeof okMsg === 'function' ? okMsg(out) : okMsg)
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      console.error('[CapCut export]', e)
      setError(e instanceof Error ? e.message : 'Falha ao gerar o projeto')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || chosen.every((t) => t.timeline.length === 0 && t.narration.length === 0) || !name.trim()

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
          {adjustCount > 0 && (
            <p className="-mt-2 text-[11px] text-muted-foreground">
              + {adjustCount} camada(s) de ajuste (vira “Ajuste” no CapCut, aplicada aos vídeos abaixo).
            </p>
          )}

          {multi && (
            <div className="space-y-2">
              <Label>O que exportar</Label>
              <ModeSwitch
                label="Subprojetos a exportar"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: `Todos (${allTimelines.length} linhas do tempo)` },
                  { value: 'current', label: 'Só o subprojeto atual' },
                ]}
              />
              <p className="text-[11px] text-muted-foreground">
                {scope === 'all'
                  ? `Um projeto no CapCut com ${allTimelines.map((t) => t.name).join(', ')} como abas de linha do tempo.`
                  : `Exporta só ${allTimelines.find((t) => t.id === activeSubId)?.name}.`}
              </p>
            </div>
          )}

          <BridgePanel bridge={bridge} />

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
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/85">{shownRoot}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copiar caminho"
                onClick={async () => {
                  await navigator.clipboard.writeText(shownRoot)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <Check className="text-primary" /> : <Copy />}
              </Button>
            </div>
            {!bridge.ready && !username.trim() && (
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
          {result && <OpenInCapCut name={safeProjectName(name)} message={result} system={system} launched={launchedByBridge} />}
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" role="alert">
              {error}
            </p>
          )}

          <ol className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-4 text-[13px] text-muted-foreground">
            <p className="eyebrow mb-1">Como usar</p>
            {bridge.ready ? (
              <>
                <li>
                  <span className="font-mono text-primary">1</span> Clique em <b className="text-foreground">Salvar no CapCut e abrir</b>. Se o
                  CapCut estiver aberto eu peço pra fechar.
                </li>
                <li>
                  <span className="font-mono text-primary">2</span> O CapCut abre e o projeto{' '}
                  <b className="text-foreground">{safeProjectName(name)}</b> já está em Projetos.
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="font-mono text-primary">1</span> Feche o CapCut (ele sobrescreve a pasta se estiver aberto).
                </li>
                <li>
                  <span className="font-mono text-primary">2</span> <b className="text-foreground">.zip</b>: botão direito → <i>Extrair tudo…</i> →
                  cole o caminho acima como destino. (Ou ligue o conector acima pra salvar direto.)
                </li>
                <li>
                  <span className="font-mono text-primary">3</span> Abra o CapCut: o projeto <b className="text-foreground">{safeProjectName(name)}</b>{' '}
                  aparece na lista.
                </li>
              </>
            )}
          </ol>
        </div>

        <div className="space-y-2 border-t border-border bg-surface-0/60 px-6 py-4">
          {bridge.ready && (
            <Button
              className="h-11 w-full text-[15px] font-semibold"
              disabled={disabled}
              onClick={() =>
                run(saveViaBridge, (out) => {
                  const r = out as { launched?: boolean; registered?: boolean; folder?: string; warnings?: string[] }
                  setLaunchedByBridge(!!r.launched)
                  return [
                    r.launched ? 'Projeto salvo e CapCut aberto.' : 'Projeto salvo na pasta do CapCut. Abra o CapCut.',
                    !r.registered ? 'Não consegui registrar na lista — se não aparecer, reinicie o CapCut.' : '',
                    ...(r.warnings || []),
                  ]
                    .filter(Boolean)
                    .join(' ')
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <Rocket />} Salvar no CapCut e abrir
            </Button>
          )}
          {!bridge.ready && canDirect && system === 'mac' && (
            <Button
              className="h-11 w-full text-[15px] font-semibold"
              disabled={disabled}
              onClick={() => run(() => saveDraftToFolder(options()), 'Projeto salvo na pasta do CapCut. Abra o CapCut.')}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FolderDown />} Escolher a pasta do CapCut
            </Button>
          )}
          <Button
            variant={bridge.ready || (canDirect && system === 'mac') ? 'outline' : 'default'}
            className="h-10 w-full"
            disabled={disabled}
            onClick={() =>
              run(() => downloadDraftZip(options()), 'Zip baixado. Extraia dentro de com.lveditor.draft e abra o CapCut.')
            }
          >
            {busy && !bridge.ready ? <Loader2 className="animate-spin" /> : <FileArchive />} Baixar como .zip (funciona sempre)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={timeline.length === 0}
            onClick={() => downloadTimingCsv(chosen, safeProjectName(name))}
          >
            <FileSpreadsheet /> Só o guia de tempos (.csv)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
