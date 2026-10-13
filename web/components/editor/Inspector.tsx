'use client'

// Right-hand properties panel (CapCut-style): edits the clip selected on the timeline.
// Every change shows up in the preview immediately and is exported to CapCut.
import { useMemo } from 'react'
import {
  Clapperboard,
  Image as ImageIcon,
  Music,
  Trash2,
  Crosshair,
  Maximize,
  MousePointerClick,
  Pencil,
  Sparkles,
  Ban,
  Scissors,
  SlidersVertical,
  Mic,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PropSlider, NumberField, AnimationParamsControls } from './PropControls'
import { usePatchScene } from '@/lib/hooks/useScenes'
import type { Tracks } from '@/lib/hooks/useTracks'
import { useSelection } from '@/lib/stores/selection'
import { buildTimeline, sceneProps, clipRate, formatClock } from '@/lib/timeline'
import {
  ANIMATIONS,
  TRANSITIONS,
  normalizeAnimation,
  normalizeTransition,
  type AnimationId,
  type TransitionId,
} from '@/lib/sync/presets'
import { CLIP_VOLUME_UNDER_NARRATION } from '@/components/preview/VideoPreview'
import type { Asset, NarrationSegment, Scene } from '@/types/project'
import { cn } from '@/lib/utils'
import { ADJUST_FIELDS, LOOKS, LOOK_BY_ID, ZERO_ADJUST, adjustStyle, matchesLook } from '@/lib/sync/adjust'

interface InspectorProps {
  projectId: string
  scenes: Scene[]
  assets: Asset[]
  narrationTrack: NarrationSegment[]
  tracks: Tracks
  onEditScene: (scene: Scene) => void
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const times = (v: number) => `${v.toFixed(2)}×`

function Header({ icon, eyebrow, title, onDelete }: { icon: React.ReactNode; eyebrow: string; title: string; onDelete?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-primary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate !text-[9px] !tracking-[0.12em]" title={eyebrow}>
          {eyebrow}
        </p>
        <h2 className="truncate font-display text-[14px] font-bold leading-tight" title={title}>
          {title}
        </h2>
      </div>
      {onDelete && (
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={onDelete} aria-label="Excluir da timeline">
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  )
}

function Chip({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      title={title}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-colors duration-150',
        selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-2 text-muted-foreground hover:border-foreground/25 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function Inspector({ projectId, scenes, assets, narrationTrack, tracks, onEditScene }: InspectorProps) {
  const { selection: rawSelection, select } = useSelection()
  const patchScene = usePatchScene(projectId)
  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])

  // selection from another subproject (or deleted) → show the empty state
  const selection = (() => {
    const sel = rawSelection
    if (!sel) return null
    const ok =
      sel.kind === 'scene'
        ? timeline.some((t) => t.scene.id === sel.id)
        : sel.kind === 'overlay'
          ? tracks.overlays.some((o) => o.id === sel.id)
          : sel.kind === 'audio'
            ? tracks.audioClips.some((c) => c.id === sel.id)
            : sel.kind === 'adjust'
              ? tracks.adjustments.some((c) => c.id === sel.id)
              : !!narrationTrack[Number(sel.id)]
    return ok ? sel : null
  })()

  // ---- Nothing selected --------------------------------------------------------
  if (!selection) {
    return (
      <div className="flex h-full flex-col">
        <Header icon={<MousePointerClick className="h-4 w-4" />} eyebrow="Propriedades" title="Nada selecionado" />
          <div className="space-y-4 p-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <p>Clique num clipe da timeline pra editar velocidade, animação, escala, posição, opacidade e volume.</p>
            <ul className="space-y-2">
              <li>
                <b className="text-foreground">Arraste da biblioteca</b> → faixa Mídia insere cena, Sobrepor cria camada, Áudio adiciona música/SFX.
              </li>
              <li>
                <b className="text-foreground">Ajuste</b> (+ no topo da timeline) põe um filtro sobre os vídeos.
              </li>
              <li>
                <b className="text-foreground">Arraste a agulha</b> ou a régua pra navegar.
              </li>
              <li>
                <b className="text-foreground">Arraste uma cena</b> pra reordenar · duplo clique abre o editor.
              </li>
              <li>
                <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10px]">Espaço</kbd> play/pause ·{' '}
                <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10px]">Del</kbd> exclui o selecionado
              </li>
            </ul>
          </div>
      </div>
    )
  }

  // ---- Scene (main track) --------------------------------------------------------
  if (selection.kind === 'scene') {
    const item = timeline.find((t) => t.scene.id === selection.id)
    if (!item) return null
    const scene = item.scene
    const props = sceneProps(scene)
    const media = item.videoAsset || item.imageAsset
    const isVideo = !!item.videoAsset
    const animation = normalizeAnimation(scene.animation_type)
    const transition = normalizeTransition(scene.transition_in)
    const autoRate = clipRate(item.videoAsset?.duration, item.duration)
    const setMeta = (patch: Record<string, unknown>) => patchScene(scene.id, { metadata: { ...(scene.metadata || {}), ...patch } })
    const consumed = item.duration * item.rate
    const clipLen = item.videoAsset?.duration || 0
    const defaultVolume = narrationTrack.length ? CLIP_VOLUME_UNDER_NARRATION : 1

    return (
      <div className="flex h-full flex-col">
          <Header
            icon={isVideo ? <Clapperboard className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            eyebrow={`Cena ${String(item.index + 1).padStart(2, '0')} · ${formatClock(item.start)} → ${formatClock(item.start + item.duration)}`}
            title={media?.filename || scene.narration_text}
          />
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {isVideo && (
            <Group title="Vídeo">
              <PropSlider
                label="Velocidade"
                value={item.rate}
                min={0.25}
                max={4}
                step={0.05}
                format={(v) => `${times(v)}${item.manualSpeed ? '' : ' (auto)'}`}
                onChange={(v) => setMeta({ speed: Math.round(v * 100) / 100 })}
                onReset={item.manualSpeed ? () => setMeta({ speed: null }) : undefined}
                hint={
                  clipLen && consumed > clipLen + 0.05
                    ? `Usa ${consumed.toFixed(1)}s de um clipe de ${clipLen.toFixed(1)}s — o último frame é segurado.`
                    : item.manualSpeed
                      ? `Cena mantém ${item.duration.toFixed(1)}s (sincronia com a narração).`
                      : `Automático: ${times(autoRate)} — desacelera clipes um pouco curtos.`
                }
              />
              <PropSlider
                label="Volume do clipe"
                value={props.volume ?? defaultVolume}
                min={0}
                max={1}
                step={0.01}
                format={pct}
                onChange={(v) => setMeta({ volume: Math.round(v * 100) / 100 })}
                onReset={props.volume !== undefined ? () => setMeta({ volume: null }) : undefined}
                hint={props.volume === undefined && narrationTrack.length ? 'Padrão: baixo (−18 dB) por baixo da narração.' : undefined}
              />
            </Group>
          )}

          <Group title="Animação">
            <div role="radiogroup" aria-label="Animação do clipe" className="grid grid-cols-2 gap-1.5">
              <Chip selected={animation === 'none'} onClick={() => patchScene(scene.id, { animation_type: 'none' })}>
                <Ban className="h-3 w-3" aria-hidden /> Nenhuma
              </Chip>
              {ANIMATIONS.map((a) => (
                <Chip
                  key={a.id}
                  selected={animation === a.id}
                  title={a.hint}
                  onClick={() => patchScene(scene.id, { animation_type: a.id as AnimationId })}
                >
                  <Sparkles className="h-3 w-3" aria-hidden /> {a.label}
                </Chip>
              ))}
            </div>
            <AnimationParamsControls value={props.anim} disabled={animation === 'none'} onChange={(anim) => setMeta({ anim })} />
          </Group>

          {item.index > 0 && (
            <Group title="Transição de entrada">
              <div role="radiogroup" aria-label="Transição de entrada" className="grid grid-cols-2 gap-1.5">
                <Chip selected={transition === 'cut'} onClick={() => patchScene(scene.id, { transition_in: 'cut' })}>
                  <Scissors className="h-3 w-3" aria-hidden /> Corte seco
                </Chip>
                {TRANSITIONS.map((t) => (
                  <Chip
                    key={t.id}
                    selected={transition === t.id}
                    title={t.hint}
                    onClick={() => patchScene(scene.id, { transition_in: t.id as TransitionId })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </Group>
          )}

          <Button variant="outline" className="w-full" onClick={() => onEditScene(scene)}>
            <Pencil /> Editor completo da cena
          </Button>
        </div>
      </div>
    )
  }

  // ---- Overlay (image / video / text layer) ---------------------------------------------
  if (selection.kind === 'overlay') {
    // Check if it's in text overlays or image overlays
    const o = tracks.overlays.find((x) => x.id === selection.id) || tracks.imageOverlays.find((x) => x.id === selection.id)
    if (!o) return null
    const a = assetById.get(o.asset_id)
    const isImageOverlay = tracks.imageOverlays.some((x) => x.id === selection.id)
    const set = (patch: Partial<typeof o>) => 
      isImageOverlay ? tracks.updateImageOverlay(o.id, patch) : tracks.updateOverlay(o.id, patch)
    const remove = () => {
      if (isImageOverlay) tracks.removeImageOverlay(o.id)
      else tracks.removeOverlay(o.id)
      select(null)
    }
    const maxDur = o.kind === 'video' && a?.duration ? a.duration / (o.speed || 1) : undefined
    return (
      <div className="flex h-full flex-col">
        <Header
          icon={o.kind === 'text' ? <ImageIcon className="h-4 w-4" /> : o.kind === 'video' ? <Clapperboard className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          eyebrow={`${isImageOverlay ? 'Overlay' : 'Sobrepor'} · ${formatClock(o.start)} → ${formatClock(o.start + o.duration)}`}
          title={o.kind === 'text' ? 'Barra de texto' : (a?.filename || 'Mídia removida')}
          onDelete={remove}
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {o.kind === 'text' ? (
            <>
              <Group title="Conteúdo">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-foreground/85">Texto</label>
                  <textarea
                    value={o.text_content || ''}
                    onChange={(e) => set({ text_content: e.target.value })}
                    className="w-full rounded-md border border-border bg-surface-0 px-2 py-1.5 text-[12px] text-foreground focus:border-primary focus:outline-none resize-none"
                    rows={3}
                    placeholder="Digite o texto aqui..."
                  />
                </div>
              </Group>

              <Group title="Estilo de texto">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground/85">Fonte</label>
                    <select
                      value={o.text_style?.font_family || 'Arial'}
                      onChange={(e) => set({ text_style: { ...o.text_style, font_family: e.target.value } })}
                      className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>

                  <PropSlider 
                    label="Tamanho" 
                    value={o.text_style?.font_size || 16} 
                    min={10} 
                    max={48} 
                    step={1} 
                    format={(v) => `${v}px`}
                    onChange={(v) => set({ text_style: { ...o.text_style, font_size: v } })}
                  />

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground/85">Peso</label>
                    <select
                      value={o.text_style?.font_weight || 'bold'}
                      onChange={(e) => set({ text_style: { ...o.text_style, font_weight: e.target.value as any } })}
                      className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Negrito</option>
                      <option value="bolder">Extra Negrito</option>
                      <option value="lighter">Leve</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground/85">Alinhamento</label>
                    <select
                      value={o.text_style?.alignment || 'center'}
                      onChange={(e) => set({ text_style: { ...o.text_style, alignment: e.target.value as any } })}
                      className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="left">Esquerda</option>
                      <option value="center">Centro</option>
                      <option value="right">Direita</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-foreground/85">Cor do texto</label>
                      <input
                        type="color"
                        value={o.text_style?.color || '#FFFFFF'}
                        onChange={(e) => set({ text_style: { ...o.text_style, color: e.target.value } })}
                        className="h-8 w-full rounded-md border border-border bg-surface-0 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-foreground/85">Cor de fundo</label>
                      <input
                        type="color"
                        value={o.text_style?.background_color || '#000000'}
                        onChange={(e) => set({ text_style: { ...o.text_style, background_color: e.target.value } })}
                        className="h-8 w-full rounded-md border border-border bg-surface-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <PropSlider 
                    label="Espaçamento interno" 
                    value={o.text_style?.padding || 20} 
                    min={8} 
                    max={60} 
                    step={2} 
                    format={(v) => `${v}px`}
                    onChange={(v) => set({ text_style: { ...o.text_style, padding: v } })}
                  />
                </div>
              </Group>

              <Group title="Aparência">
                <PropSlider label="Opacidade" value={o.opacity} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ opacity: v })} onReset={o.opacity !== 1 ? () => set({ opacity: 1 }) : undefined} />
              </Group>
            </>
          ) : (
            <>
              <Group title="Transformar">
                <PropSlider label="Escala" value={o.scale} min={0.05} max={3} step={0.01} format={pct} onChange={(v) => set({ scale: v })} onReset={o.scale !== 1 ? () => set({ scale: 1 }) : undefined} />
                <PropSlider label="Posição X" value={o.x} min={-1.5} max={1.5} step={0.005} format={(v) => (v * 50).toFixed(1) + '%'} onChange={(v) => set({ x: v })} onReset={o.x ? () => set({ x: 0 }) : undefined} />
                <PropSlider label="Posição Y" value={o.y} min={-1.5} max={1.5} step={0.005} format={(v) => (v * 50).toFixed(1) + '%'} onChange={(v) => set({ y: v })} onReset={o.y ? () => set({ y: 0 }) : undefined} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => set({ x: 0, y: 0 })}>
                    <Crosshair /> Centralizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => set({ x: 0, y: 0, scale: 1 })}>
                    <Maximize /> Encaixar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Dica: arraste a camada direto no monitor pra posicionar.</p>
              </Group>

              <Group title="Aparência">
                <PropSlider label="Opacidade" value={o.opacity} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ opacity: v })} onReset={o.opacity !== 1 ? () => set({ opacity: 1 }) : undefined} />
              </Group>

              {o.kind === 'video' && (
                <Group title="Vídeo">
                  <div className="space-y-2">
                    <label className="text-[11px] font-medium text-foreground/85">Asset Favorito</label>
                    <select
                      value={o.asset_id}
                      onChange={(e) => set({ asset_id: e.target.value })}
                      className="w-full rounded-md border border-border bg-surface-0 px-2 py-1.5 text-[12px] text-foreground focus:border-primary focus:outline-none"
                    >
                      {assets.filter(a => a.type === 'video' && a.is_favorite).map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.filename}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Escolha outro vídeo favorito para esta overlay
                    </p>
                  </div>
                  <PropSlider 
                    label="Volume" 
                    value={o.volume} 
                    min={0} 
                    max={2} 
                    step={0.05} 
                    format={pct} 
                    onChange={(v) => set({ volume: v })} 
                    onReset={o.volume !== 0 ? () => set({ volume: 0 }) : undefined}
                    hint={o.volume === 0 ? "Silenciado (padrão para overlays)" : o.volume > 1 ? "Amplificado" : "Normal"}
                  />
                  <PropSlider 
                    label="Velocidade" 
                    value={o.speed} 
                    min={0.25} 
                    max={4} 
                    step={0.05} 
                    format={times} 
                    onChange={(v) => set({ speed: v })} 
                    onReset={o.speed !== 1 ? () => set({ speed: 1 }) : undefined}
                    hint={maxDur ? `Duração máxima: ${maxDur.toFixed(1)}s` : undefined}
                  />
                </Group>
              )}
            </>
          )}

          <Group title="Animações">
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground/85">Entrada</label>
                <select
                  value={o.animation_in || 'none'}
                  onChange={(e) => set({ animation_in: e.target.value as any })}
                  className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="none">Nenhuma</option>
                  <option value="fade">Fade In</option>
                  <option value="slide-up">Deslizar para Cima</option>
                  <option value="slide-down">Deslizar para Baixo</option>
                  <option value="slide-left">Deslizar para Esquerda</option>
                  <option value="slide-right">Deslizar para Direita</option>
                  <option value="zoom-in">Zoom In</option>
                  <option value="zoom-out">Zoom Out</option>
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground/85">Saída</label>
                <select
                  value={o.animation_out || 'none'}
                  onChange={(e) => set({ animation_out: e.target.value as any })}
                  className="w-full rounded-md border border-border bg-surface-0 px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="none">Nenhuma</option>
                  <option value="fade">Fade Out</option>
                  <option value="slide-up">Deslizar para Cima</option>
                  <option value="slide-down">Deslizar para Baixo</option>
                  <option value="slide-left">Deslizar para Esquerda</option>
                  <option value="slide-right">Deslizar para Direita</option>
                  <option value="zoom-in">Zoom In</option>
                  <option value="zoom-out">Zoom Out</option>
                </select>
              </div>

              <PropSlider 
                label="Duração" 
                value={o.animation_duration || 0.3} 
                min={0.1} 
                max={2} 
                step={0.05} 
                format={(v) => `${v.toFixed(2)}s`}
                onChange={(v) => set({ animation_duration: v })} 
                onReset={o.animation_duration && o.animation_duration !== 0.3 ? () => set({ animation_duration: 0.3 }) : undefined}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Animações funcionam no CapCut ao exportar o projeto
            </p>
          </Group>

          {o.kind === 'video' && (
            <Group title="Vídeo">
              <PropSlider
                label="Velocidade"
                value={o.speed}
                min={0.25}
                max={4}
                step={0.05}
                format={times}
                onChange={(v) => {
                  const speed = Math.round(v * 100) / 100
                  const max = a?.duration ? a.duration / speed : undefined
                  set({ speed, ...(max && o.duration > max ? { duration: Math.round(max * 1000) / 1000 } : {}) })
                }}
                onReset={o.speed !== 1 ? () => set({ speed: 1 }) : undefined}
              />
              <PropSlider label="Volume" value={o.volume} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ volume: v })} />
            </Group>
          )}

          <Group title="Tempo">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Início" value={o.start} onChange={(v) => set({ start: v })} />
              <NumberField label="Duração" value={o.duration} min={0.2} onChange={(v) => set({ duration: maxDur ? Math.min(v, maxDur) : v })} />
            </div>
          </Group>
        </div>
      </div>
    )
  }

  // ---- Adjustment layer (filter) -----------------------------------------------------
  if (selection.kind === 'adjust') {
    const a = tracks.adjustments.find((x) => x.id === selection.id)
    if (!a) return null
    const set = (patch: Partial<typeof a>) => tracks.updateAdjust(a.id, patch)
    const look = a.look ? LOOK_BY_ID.get(a.look) : undefined
    const isLook = matchesLook(a)
    const frame =
      (timeline.find((t) => a.start >= t.start && a.start < t.start + t.duration) || timeline[0])?.videoAsset?.metadata?.thumbnail as
        | string
        | undefined
    return (
      <div className="flex h-full flex-col">
        <Header
          icon={<SlidersVertical className="h-4 w-4" />}
          eyebrow={`Ajuste · ${formatClock(a.start)} → ${formatClock(a.start + a.duration)}`}
          title={isLook && look ? look.label : 'Ajuste personalizado'}
          onDelete={() => {
            tracks.removeAdjust(a.id)
            select(null)
          }}
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <Group title="Filtro">
            <div role="radiogroup" aria-label="Filtro da camada de ajuste" className="grid grid-cols-3 gap-1.5">
              {LOOKS.map((l) => {
                const selected = a.look === l.id && isLook
                const css = adjustStyle([{ ...a, ...l.values, look: l.id }])
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={l.hint}
                    onClick={() => set({ look: l.id, ...l.values })}
                    className={cn(
                      'group cursor-pointer overflow-hidden rounded-md border text-left transition-colors duration-150',
                      selected ? 'border-primary' : 'border-border hover:border-foreground/30'
                    )}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-surface-3">
                      {frame ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={frame} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: css.filter }} />
                      ) : (
                        <span className="absolute inset-0 bg-gradient-to-br from-brand-pink/60 via-violet-600/50 to-brand-cyan/60" style={{ filter: css.filter }} />
                      )}
                      {css.tint && (
                        <span className="absolute inset-0 mix-blend-overlay" style={{ background: `rgb(${css.tint.color})`, opacity: css.tint.opacity }} />
                      )}
                      {css.vignette > 0 && (
                        <span
                          className="absolute inset-0"
                          style={{ background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${0.85 * css.vignette}) 100%)` }}
                        />
                      )}
                      {l.capcutFilter && (
                        <span className="absolute right-1 top-1 rounded bg-black/70 px-1 font-mono text-[8px] uppercase tracking-wider text-brand-cyan">
                          CapCut
                        </span>
                      )}
                    </span>
                    <span className={cn('block truncate px-1.5 py-1 text-[10.5px] font-medium', selected ? 'text-primary' : 'text-muted-foreground')}>
                      {l.label}
                    </span>
                  </button>
                )
              })}
            </div>
            {look?.capcutFilter && isLook && (
              <>
                <PropSlider
                  label="Força do filtro (CapCut)"
                  value={a.filter_intensity ?? 1}
                  min={0}
                  max={1}
                  step={0.01}
                  format={pct}
                  onChange={(v) => set({ filter_intensity: v })}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Filtro original do CapCut — no preview aparece uma aproximação; no CapCut sai o filtro de verdade.
                </p>
              </>
            )}
          </Group>

          <Group title="Ajustes">
            {ADJUST_FIELDS.map((f) => (
              <PropSlider
                key={f.key}
                label={f.label}
                value={a[f.key]}
                min={f.min}
                max={f.max}
                step={0.01}
                format={(v) => `${v > 0 && f.min < 0 ? '+' : ''}${Math.round(v * 100)}`}
                onChange={(v) => set({ [f.key]: Math.round(v * 100) / 100 } as Partial<typeof a>)}
                onReset={a[f.key] !== 0 ? () => set({ [f.key]: 0 } as Partial<typeof a>) : undefined}
              />
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => set({ ...ZERO_ADJUST, look: null })}>
              <RotateCcw /> Zerar ajustes
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Vale pra tudo que está abaixo (vídeo e sobreposições). No CapCut vira uma camada “Ajuste” com os mesmos valores.
            </p>
          </Group>

          <Group title="Tempo">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Início" value={a.start} onChange={(v) => set({ start: v })} />
              <NumberField label="Duração" value={a.duration} min={0.2} onChange={(v) => set({ duration: v })} />
            </div>
          </Group>
        </div>
      </div>
    )
  }

  // ---- Narration file -----------------------------------------------------------------
  if (selection.kind === 'narration') {
    const i = Number(selection.id)
    const seg = narrationTrack[i]
    if (!seg) return null
    const a = assetById.get(seg.asset_id)
    const covered = timeline.filter((t) => t.start < seg.start + seg.duration && t.start + t.duration > seg.start).length
    return (
      <div className="flex h-full flex-col">
          <Header
            icon={<Mic className="h-4 w-4" />}
            eyebrow={`Narração ${i + 1} · ${formatClock(seg.start)} → ${formatClock(seg.start + seg.duration)}`}
            title={a?.filename || 'Áudio removido'}
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <p>
              {covered > 0
                ? `${covered} cena(s) por cima deste trecho.`
                : 'Nenhuma cena neste trecho ainda — arraste clipes da biblioteca pra faixa Mídia.'}
            </p>
            <p>A narração toca contínua: os arquivos ficam colados um depois do outro.</p>
            <Button
              variant="outline"
              className="w-full hover:border-destructive/60 hover:text-destructive"
              onClick={() => {
                tracks.removeNarration(i)
                select(null)
              }}
            >
              <Trash2 /> Tirar da narração
            </Button>
          </div>
      </div>
    )
  }

  // ---- Extra audio ------------------------------------------------------------------
  const c = tracks.audioClips.find((x) => x.id === selection.id)
  if (!c) return null
  const a = assetById.get(c.asset_id)
  const set = (patch: Partial<typeof c>) => tracks.updateAudio(c.id, patch)
  const maxDur = a?.duration ? a.duration / (c.speed || 1) : undefined
  return (
    <div className="flex h-full flex-col">
        <Header
          icon={<Music className="h-4 w-4" />}
          eyebrow={`Áudio · ${formatClock(c.start)} → ${formatClock(c.start + c.duration)}`}
          title={a?.filename || 'Áudio removido'}
          onDelete={() => {
            tracks.removeAudio(c.id)
            select(null)
          }}
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <Group title="Áudio">
            <PropSlider
              label="Volume"
              value={c.volume}
              min={0}
              max={2}
              step={0.01}
              format={pct}
              onChange={(v) => set({ volume: v })}
              onReset={c.volume !== 1 ? () => set({ volume: 1 }) : undefined}
              hint={c.volume > 1 ? 'Acima de 100% vale no CapCut; o preview toca no máximo a 100%.' : undefined}
            />
            <PropSlider
              label="Velocidade"
              value={c.speed}
              min={0.25}
              max={4}
              step={0.05}
              format={times}
              onChange={(v) => {
                const speed = Math.round(v * 100) / 100
                const max = a?.duration ? a.duration / speed : undefined
                set({ speed, ...(max && c.duration > max ? { duration: Math.round(max * 1000) / 1000 } : {}) })
              }}
              onReset={c.speed !== 1 ? () => set({ speed: 1 }) : undefined}
            />
          </Group>
          <Group title="Tempo">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Início" value={c.start} onChange={(v) => set({ start: v })} />
              <NumberField label="Duração" value={c.duration} min={0.2} onChange={(v) => set({ duration: maxDur ? Math.min(v, maxDur) : v })} />
            </div>
          </Group>
        </div>
      </div>
    )
  }
