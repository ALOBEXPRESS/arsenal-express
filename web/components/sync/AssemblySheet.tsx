'use client'

import { useEffect, useState } from 'react'
import { AudioWaveform, Shuffle, Pin, Sparkles, Blend, Loader2, Wand2, CircleCheck, ArrowDownUp, Split, Film, Volume2, RectangleHorizontal } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { AnimationTile, TransitionTile, ModeSwitch, FlowPicker } from './EffectTiles'
import { AnimationParamsControls } from '@/components/editor/PropControls'
import {
  ANIMATIONS,
  TRANSITIONS,
  withDefaults,
  type SyncSettings,
  type SceneOrderBy,
  type PickMode,
} from '@/lib/sync/presets'
import { cn } from '@/lib/utils'
import { useFavoriteSFX } from '@/hooks/useFavoriteSFX'
import { useSFXManifest } from '@/hooks/useSFXManifest'

const ORDER_HINT: Record<SceneOrderBy, string> = {
  modified: 'Data de modificação do arquivo (a mesma da coluna “Data de modificação” do Explorer).',
  upload: 'Ordem em que os arquivos foram enviados — segue a ordem em que apareciam no Explorer ao selecionar.',
  name: 'Ordem alfabética do nome do arquivo (números em ordem natural: 2 antes de 10).',
}

interface AssemblySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings?: Partial<SyncSettings>
  thumbs: [string | undefined, string | undefined]
  hasScenes: boolean
  /** narration files uploaded to the project */
  audioCount?: number
  busy: boolean
  status?: string
  onSave: (s: SyncSettings) => Promise<void>
  onApplyEffects: (s: SyncSettings) => Promise<void>
  onAssemble: (s: SyncSettings) => Promise<void>
  onAssembleScenes?: (s: SyncSettings) => Promise<void>
}

function Section({
  icon,
  title,
  badge,
  description,
  checked,
  onCheckedChange,
  children,
  id,
}: {
  icon: React.ReactNode
  title: string
  badge?: string
  description: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  children?: React.ReactNode
  id: string
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'rounded-xl border p-4 transition-colors duration-200',
        checked ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-surface-2/60'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            checked ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-3 text-muted-foreground'
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${id}-title`} className="font-display text-[15px] font-bold">
              {title}
            </h3>
            {badge && (
              <span className="rounded border border-express/50 bg-express/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-widest text-express">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={`${id}-title`} />
      </div>
      {checked && children && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  )
}

function FavoriteSFXSelector({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const { favorites } = useFavoriteSFX()
  const { data: manifest } = useSFXManifest()
  
  const favoritesSet = new Set(favorites)
  const favoriteEffects = manifest?.effects.filter((e) => favoritesSet.has(e.id)) || []
  
  if (favoriteEffects.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-0 px-3 py-2.5 text-[12px] text-muted-foreground">
        Nenhum SFX favorito. Marque efeitos como favoritos (❤️) na biblioteca de SFX.
      </div>
    )
  }
  
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-medium text-foreground/85">Efeito selecionado</label>
      <select
        value={selected || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full rounded-md border border-border bg-surface-0 px-2 py-1.5 text-[12px] text-foreground focus:border-primary focus:outline-none"
      >
        <option value="">Selecione um efeito...</option>
        {favoriteEffects.map((effect) => (
          <option key={effect.id} value={effect.id}>
            {effect.name}
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-[11px] text-muted-foreground">
          Este efeito será adicionado na trilha SFX em cada imagem overlay.
        </p>
      )}
    </div>
  )
}

export function AssemblySheet({
  open,
  onOpenChange,
  settings: initial,
  thumbs,
  hasScenes,
  audioCount = 0,
  busy,
  status,
  onSave,
  onApplyEffects,
  onAssemble,
  onAssembleScenes,
}: AssemblySheetProps) {
  const [s, setS] = useState<SyncSettings>(() => withDefaults(initial))
  useEffect(() => {
    if (open) setS(withDefaults(initial))
  }, [open, initial])

  const anim = s.animation
  const tr = s.transition
  const setAnim = (patch: Partial<SyncSettings['animation']>) => setS((p) => ({ ...p, animation: { ...p.animation, ...patch } }))
  const setTr = (patch: Partial<SyncSettings['transition']>) => setS((p) => ({ ...p, transition: { ...p.transition, ...patch } }))

  const toggleIn = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const modeOptions: { value: PickMode; label: string; icon: React.ReactNode }[] = [
    { value: 'variado', label: 'Variado (alterna)', icon: <Shuffle className="h-4 w-4" /> },
    { value: 'fixo', label: 'Uma só (fixo)', icon: <Pin className="h-4 w-4" /> },
  ]

  const invalid =
    (anim.enabled && anim.mode === 'variado' && anim.selected.length === 0) ||
    (tr.enabled && tr.mode === 'variado' && tr.selected.length === 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]">
        <div className="border-b border-border px-6 pb-4 pt-6">
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> Montagem automática
          </p>
          <SheetTitle className="mt-2">Ritmo, movimento e cortes</SheetTitle>
          <SheetDescription className="mt-1">
            Tudo que você liga aqui aparece no preview e sai igual no projeto do CapCut.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <section aria-labelledby="order-title" className="rounded-xl border border-border bg-surface-2/60 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground" aria-hidden>
                <ArrowDownUp className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="order-title" className="font-display text-[15px] font-bold">
                  Ordem das cenas
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Vale pros dois modos (com ou sem ritmo variável). Depois dá pra arrastar cenas na timeline.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <ModeSwitch
                label="Ordenar clipes por"
                value={s.order.by}
                onChange={(by) => setS((p) => ({ ...p, order: { ...p.order, by } }))}
                options={[
                  { value: 'modified', label: 'Modificação' },
                  { value: 'upload', label: 'Envio' },
                  { value: 'name', label: 'Nome' },
                ]}
              />
              <p className="text-[12px] text-muted-foreground">{ORDER_HINT[s.order.by]}</p>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                <span>Inverter ordem {s.order.reverse ? '(mais novo primeiro)' : '(mais antigo primeiro)'}</span>
                <Switch
                  checked={s.order.reverse}
                  onCheckedChange={(reverse) => setS((p) => ({ ...p, order: { ...p.order, reverse } }))}
                  aria-label="Inverter ordem das cenas"
                />
              </label>
            </div>
          </section>

          <section aria-labelledby="split-title" className="rounded-xl border border-border bg-surface-2/60 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground" aria-hidden>
                <Split className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="split-title" className="font-display text-[15px] font-bold">
                  Várias narrações{audioCount > 1 ? ` (${audioCount} áudios)` : ''}
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Cada áudio pode virar um subprojeto (no CapCut: Linha do tempo 01, 02…). Áudio sem clipes suficientes fica na timeline esperando você arrastar os vídeos.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <ModeSwitch
                label="Como juntar várias narrações"
                value={s.narration.split}
                onChange={(split) => setS((p) => ({ ...p, narration: { ...p.narration, split } }))}
                options={[
                  { value: 'per_audio', label: 'Um subprojeto por áudio' },
                  { value: 'continuous', label: 'Tudo numa timeline' },
                ]}
              />
              {s.narration.split === 'per_audio' && (
                <div className="rounded-lg border border-border bg-surface-0 px-3 py-3">
                  <div className="mb-2.5 flex items-center justify-between text-[12px]">
                    <label htmlFor="pace" className="text-muted-foreground">
                      Duração média de cena (divide os clipes entre os áudios)
                    </label>
                    <span className="font-mono tabular-nums text-primary">{s.narration.pace.toFixed(1)}s</span>
                  </div>
                  <Slider
                    id="pace"
                    min={3}
                    max={15}
                    step={0.1}
                    value={[s.narration.pace]}
                    onValueChange={([v]) => setS((p) => ({ ...p, narration: { ...p.narration, pace: v } }))}
                    aria-label="Duração média de cena em segundos"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    Ex.: áudio de 2:31 a {s.narration.pace.toFixed(1)}s ≈ {Math.round(151 / s.narration.pace)} clipes. O primeiro subprojeto é preenchido primeiro.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="media-title" className="rounded-xl border border-border bg-surface-2/60 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground" aria-hidden>
                <Film className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="media-title" className="font-display text-[15px] font-bold">
                  Tipo de mídia
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Escolha se quer usar imagens, vídeos, ou ambos na montagem das cenas.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                <span>Juntar cenas com imagens</span>
                <Switch
                  checked={s.media.with_images}
                  onCheckedChange={(with_images) => setS((p) => ({ ...p, media: { ...p.media, with_images } }))}
                  aria-label="Usar imagens na montagem"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                <span>Juntar cenas com vídeos</span>
                <Switch
                  checked={s.media.with_videos}
                  onCheckedChange={(with_videos) => setS((p) => ({ ...p, media: { ...p.media, with_videos } }))}
                  aria-label="Usar vídeos na montagem"
                />
              </label>
              {s.media.with_images && s.media.with_videos && (
                <div className="rounded-lg border border-border bg-surface-0 px-3 py-3 space-y-3">
                  <div className="mb-2.5 flex items-center justify-between text-[12px]">
                    <label htmlFor="images-overlay-every" className="text-muted-foreground">
                      Imagens como sobreposição a cada N cenas
                    </label>
                    <span className="font-mono tabular-nums text-primary">{s.media.images_as_overlay_every}</span>
                  </div>
                  <Slider
                    id="images-overlay-every"
                    min={1}
                    max={10}
                    step={1}
                    value={[s.media.images_as_overlay_every]}
                    onValueChange={([v]) => setS((p) => ({ ...p, media: { ...p.media, images_as_overlay_every: v } }))}
                    aria-label="Frequência de imagens como overlay"
                  />
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    Quando ambos estão ativos, imagens aparecem como sobreposição a cada {s.media.images_as_overlay_every} cenas de vídeo.
                  </p>
                  
                  <div className="space-y-2 pt-2 border-t border-border">
                    <label className="text-[11px] font-medium text-foreground/85">Imagem favorita (opcional)</label>
                    <select
                      value={s.media.favorite_image_id || ''}
                      onChange={(e) => setS((p) => ({ ...p, media: { ...p.media, favorite_image_id: e.target.value || null } }))}
                      className="w-full rounded-md border border-border bg-surface-0 px-2 py-1.5 text-[12px] text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="">Todas as imagens (rodízio)</option>
                      {/* TODO: populate with available images */}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Deixe vazio para alternar entre todas as imagens, ou selecione uma favorita para usar sempre.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <Section
            id="sfx"
            icon={<Volume2 className="h-4 w-4" />}
            title="Efeitos sonoros"
            description="Adiciona SFX favoritos nas cenas com imagens (como sobreposição). O efeito é cortado exatamente onde a imagem aparece."
            checked={s.sfx.enabled}
            onCheckedChange={(v) => setS((p) => ({ ...p, sfx: { ...p.sfx, enabled: v } }))}
          >
            <FavoriteSFXSelector
              selected={s.sfx.selected_effect_id}
              onSelect={(id) => setS((p) => ({ ...p, sfx: { ...p.sfx, selected_effect_id: id } }))}
            />
          </Section>

          <Section
            id="overlay-bars"
            icon={<RectangleHorizontal className="h-4 w-4" />}
            title="Barras de texto (Overlay)"
            description="Adiciona barras pretas com texto no topo e/ou rodapé em todas as cenas. Ideal para frases de impacto."
            checked={s.overlay_bars.enabled}
            onCheckedChange={(v) => setS((p) => ({ ...p, overlay_bars: { ...p.overlay_bars, enabled: v } }))}
          >
            <ModeSwitch
              label="Posição das barras"
              value={s.overlay_bars.position}
              onChange={(position) => setS((p) => ({ ...p, overlay_bars: { ...p.overlay_bars, position } }))}
              options={[
                { value: 'top', label: 'Topo' },
                { value: 'bottom', label: 'Rodapé' },
                { value: 'both', label: 'Ambos' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              As barras aparecerão em todas as cenas como overlay. Você pode editar o texto de cada barra no inspector de propriedades.
            </p>
          </Section>

          <Section
            id="rhythm"
            icon={<AudioWaveform className="h-4 w-4" />}
            title="Ritmo variável"
            badge="anti-padrão"
            description="Cada cena dura o tempo da frase dela — cortes caem nas pausas da narração. Quebra o padrão mecânico “8-8-8s” sem perder a sincronia."
            checked={s.variable_rhythm}
            onCheckedChange={(v) => setS((p) => ({ ...p, variable_rhythm: v }))}
          >
            <p className="flex items-start gap-2 rounded-lg border border-track-audio/40 bg-track-audio/10 px-3 py-2 text-[12px] text-foreground/85">
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-track-audio" aria-hidden />
              Detecção de pausas abaixo de −35 dB por ≥ 0,3 s. Clipe curto demais pra frase é desacelerado até 0,8×.
            </p>
          </Section>

          <Section
            id="anim"
            icon={<Sparkles className="h-4 w-4" />}
            title="Animação nos clipes"
            description="Movimento de câmera em cada cena (zoom, quique, panorâmica) — dá vida ao vídeo dark."
            checked={anim.enabled}
            onCheckedChange={(v) => setAnim({ enabled: v })}
          >
            <ModeSwitch label="Modo de animação" value={anim.mode} onChange={(v) => setAnim({ mode: v })} options={modeOptions} />
            <p className="text-[12px] text-muted-foreground">
              {anim.mode === 'variado'
                ? 'Marque as que entram no rodízio — o sistema alterna cena a cena.'
                : 'Escolha a animação usada em todas as cenas.'}
            </p>
            <div className="grid grid-cols-3 gap-2" role={anim.mode === 'fixo' ? 'radiogroup' : 'group'} aria-label="Animações">
              {ANIMATIONS.map((a) => (
                <AnimationTile
                  key={a.id}
                  preset={a}
                  thumb={thumbs[0]}
                  params={anim.params}
                  role={anim.mode === 'fixo' ? 'radio' : 'checkbox'}
                  selected={anim.mode === 'fixo' ? anim.fixed === a.id : anim.selected.includes(a.id)}
                  onToggle={() =>
                    anim.mode === 'fixo' ? setAnim({ fixed: a.id }) : setAnim({ selected: toggleIn(anim.selected, a.id) })
                  }
                />
              ))}
            </div>
            {anim.mode === 'variado' && (
              <FlowPicker
                label="Fluxo da animação"
                noun="animação"
                nounPlural="animações"
                selectedCount={anim.selected.length}
                value={anim.flow}
                onChange={(flow) => setAnim({ flow })}
              />
            )}
            <p className="pt-1 text-[12px] font-semibold text-foreground/90">Propriedades (todas as cenas)</p>
            <AnimationParamsControls value={anim.params} onChange={(params) => setAnim({ params })} />
            <p className="text-[11px] text-muted-foreground">Dá pra ajustar cena a cena depois, no painel de propriedades.</p>
          </Section>

          <Section
            id="trans"
            icon={<Blend className="h-4 w-4" />}
            title="Transição entre cenas"
            description="Efeito na passagem de uma cena pra outra (fusão, flash, esmaecer). Desligado = corte seco."
            checked={tr.enabled}
            onCheckedChange={(v) => setTr({ enabled: v })}
          >
            <ModeSwitch label="Modo de transição" value={tr.mode} onChange={(v) => setTr({ mode: v })} options={modeOptions} />
            <div className="grid grid-cols-3 gap-2" role={tr.mode === 'fixo' ? 'radiogroup' : 'group'} aria-label="Transições">
              {TRANSITIONS.map((t) => (
                <TransitionTile
                  key={t.id}
                  preset={t}
                  thumbs={thumbs}
                  role={tr.mode === 'fixo' ? 'radio' : 'checkbox'}
                  selected={tr.mode === 'fixo' ? tr.fixed === t.id : tr.selected.includes(t.id)}
                  onToggle={() => (tr.mode === 'fixo' ? setTr({ fixed: t.id }) : setTr({ selected: toggleIn(tr.selected, t.id) }))}
                />
              ))}
            </div>
            {tr.mode === 'variado' && (
              <FlowPicker
                label="Fluxo da transição"
                noun="transição"
                nounPlural="transições"
                selectedCount={tr.selected.length}
                value={tr.flow}
                onChange={(flow) => setTr({ flow })}
              />
            )}
            <div className="rounded-lg border border-border bg-surface-0 px-3 py-3">
              <div className="mb-2.5 flex items-center justify-between text-[12px]">
                <label htmlFor="tr-duration" className="text-muted-foreground">
                  Duração da transição
                </label>
                <span className="font-mono tabular-nums text-primary">{tr.duration.toFixed(2)}s</span>
              </div>
              <Slider
                id="tr-duration"
                min={0.2}
                max={1.2}
                step={0.05}
                value={[tr.duration]}
                onValueChange={([v]) => setTr({ duration: v })}
                aria-label="Duração da transição em segundos"
              />
            </div>
          </Section>
        </div>

        <div className="space-y-2 border-t border-border bg-surface-0/60 px-6 py-4">
          {invalid && <p className="text-[12px] text-destructive">Marque pelo menos uma opção no modo variado.</p>}
          {busy && status && (
            <p className="flex items-center gap-2 font-mono text-[12px] text-primary" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {onAssembleScenes && (
              <Button variant="outline" disabled={busy || invalid} onClick={() => onAssembleScenes(s)}>
                <Film /> Juntar cenas
              </Button>
            )}
            <Button 
              className={cn("h-11 text-[15px] font-semibold", !onAssembleScenes && "col-span-2")} 
              disabled={busy || invalid} 
              onClick={() => onAssemble(s)}
            >
              <Wand2 /> Juntar cenas com áudio
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy || invalid || !hasScenes} onClick={() => onApplyEffects(s)}>
              Só aplicar efeitos
            </Button>
            <Button variant="ghost" disabled={busy || invalid} onClick={() => onSave(s)}>
              Salvar preferências
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
