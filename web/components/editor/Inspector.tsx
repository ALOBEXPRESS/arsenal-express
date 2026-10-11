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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PropSlider, NumberField, AnimationParamsControls } from './PropControls'
import { usePatchScene } from '@/lib/hooks/useScenes'
import type { useTracks } from '@/lib/hooks/useTracks'
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

interface InspectorProps {
  projectId: string
  scenes: Scene[]
  assets: Asset[]
  narrationTrack: NarrationSegment[]
  tracks: ReturnType<typeof useTracks>
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
  const { selection, select } = useSelection()
  const patchScene = usePatchScene(projectId)
  const timeline = useMemo(() => buildTimeline(scenes, assets), [scenes, assets])
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])

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

  // ---- Overlay (image / video layer) ---------------------------------------------
  if (selection.kind === 'overlay') {
    const o = tracks.overlays.find((x) => x.id === selection.id)
    if (!o) return null
    const a = assetById.get(o.asset_id)
    const set = (patch: Partial<typeof o>) => tracks.updateOverlay(o.id, patch)
    const maxDur = o.kind === 'video' && a?.duration ? a.duration / (o.speed || 1) : undefined
    return (
      <div className="flex h-full flex-col">
        <Header
          icon={o.kind === 'video' ? <Clapperboard className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          eyebrow={`Sobrepor · ${formatClock(o.start)} → ${formatClock(o.start + o.duration)}`}
          title={a?.filename || 'Mídia removida'}
          onDelete={() => {
            tracks.removeOverlay(o.id)
            select(null)
          }}
        />
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
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
