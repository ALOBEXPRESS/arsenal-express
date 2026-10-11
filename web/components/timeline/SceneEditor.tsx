'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Scissors, Clapperboard, Image as ImageIcon, Mic, Loader2 } from 'lucide-react'
import { useCreateScene, useUpdateScene } from '@/lib/hooks/useScenes'
import { useAssets } from '@/lib/hooks/useAssets'
import type { Scene } from '@/types/project'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { AnimationTile, TransitionTile } from '@/components/sync/EffectTiles'
import {
  ANIMATIONS,
  TRANSITIONS,
  normalizeAnimation,
  normalizeTransition,
  type AnimationId,
  type TransitionId,
} from '@/lib/sync/presets'
import { animationPose, poseToTransform } from '@/lib/sync/visual'
import { clipRate, formatClock } from '@/lib/timeline'
import { cn } from '@/lib/utils'

interface SceneEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  scene?: Scene | null
  sceneCount: number
  /** global start of the scene on the timeline (seconds) */
  sceneStart?: number
  sceneIndex?: number
  /** thumbnail of the previous scene (for the transition preview) */
  previousThumb?: string
}

function NoneTile({ selected, onSelect, label, icon }: { selected: boolean; onSelect: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors duration-200',
        selected ? 'border-primary bg-primary/[0.07] text-primary' : 'border-border bg-surface-2 text-muted-foreground hover:border-foreground/25'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function SceneEditor({
  open,
  onOpenChange,
  projectId,
  scene,
  sceneCount,
  sceneStart = 0,
  sceneIndex,
  previousThumb,
}: SceneEditorProps) {
  const createScene = useCreateScene()
  const updateScene = useUpdateScene()
  const { data: assets } = useAssets(projectId)

  const videos = useMemo(() => assets?.filter((a) => a.type === 'video') || [], [assets])
  const images = useMemo(() => assets?.filter((a) => a.type === 'image') || [], [assets])
  const media = useMemo(() => [...videos, ...images], [videos, images])

  const [mediaId, setMediaId] = useState<string>('')
  const [duration, setDuration] = useState(5)
  const [transition, setTransition] = useState<TransitionId>('cut')
  const [animation, setAnimation] = useState<AnimationId>('none')
  const [previewT, setPreviewT] = useState(0)

  useEffect(() => {
    if (!open) return
    setMediaId(scene?.video_asset_id || scene?.image_asset_id || '')
    setDuration(scene?.audio_duration ?? 5)
    setTransition(normalizeTransition(scene?.transition_in))
    setAnimation(normalizeAnimation(scene?.animation_type))
  }, [open, scene])

  // Bring the scene's clip into view in the media strip when the inspector opens
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !mediaId) return
    const id = requestAnimationFrame(() => {
      const strip = stripRef.current
      const el = strip?.querySelector<HTMLElement>('[aria-checked="true"]')
      if (strip && el) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2
    })
    return () => cancelAnimationFrame(id)
  }, [open, mediaId])

  const selected = media.find((m) => m.id === mediaId)
  const thumb = selected?.metadata?.thumbnail as string | undefined
  const rate = selected?.type === 'video' ? clipRate(selected.duration, duration) : 1
  const holds = selected?.type === 'video' && !!selected.duration && selected.duration * rate < duration - 0.05
  const index = sceneIndex ?? sceneCount

  // Loop the big preview through the chosen animation
  useEffect(() => {
    if (!open || animation === 'none') {
      setPreviewT(0)
      return
    }
    let raf = 0
    const start = performance.now()
    const loop = Math.max(1.5, Math.min(duration, 6))
    const tick = (now: number) => {
      setPreviewT(((now - start) / 1000) % loop)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, animation, duration])

  const saving = createScene.isPending || updateScene.isPending

  const save = async () => {
    const isImage = selected?.type === 'image'
    const fields = {
      audio_duration: Math.round(duration * 1000) / 1000,
      video_asset_id: selected && !isImage ? selected.id : null,
      image_asset_id: selected && isImage ? selected.id : null,
      media_type: (isImage ? 'still_image' : 'video_clip') as Scene['media_type'],
      transition_in: index === 0 ? 'cut' : transition,
      animation_type: animation,
      metadata: {
        ...(scene?.metadata || {}),
        video_filename: selected?.filename,
        playback_rate: rate,
        clip_duration: selected?.duration,
      },
    }
    try {
      if (scene) {
        await updateScene.mutateAsync({ id: scene.id, updates: fields })
      } else {
        await createScene.mutateAsync({
          project_id: projectId,
          order_index: sceneCount,
          narration_text: `Cena ${sceneCount + 1}`,
          ...fields,
          video_asset_id: fields.video_asset_id ?? undefined,
          image_asset_id: fields.image_asset_id ?? undefined,
        })
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save scene:', error)
      alert('Não foi possível salvar a cena. Tente novamente.')
    }
  }

  const maxDuration = Math.max(30, Math.ceil(duration + 5))
  const pose = animationPose(animation, previewT, Math.max(1.5, Math.min(duration, 6)))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]">
        {/* Hero: live monitor of the scene */}
        <div className="relative aspect-video w-full overflow-hidden border-b border-border bg-black">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={selected?.filename || ''} className="absolute inset-0 h-full w-full object-contain" style={{ transform: poseToTransform(pose) }} />
          ) : (
            <div className="grain absolute inset-0 flex items-center justify-center text-muted-foreground">Escolha um clipe</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-6 pb-4 pt-10">
            <p className="eyebrow !text-primary">{scene ? 'Editar cena' : 'Nova cena'}</p>
            <SheetTitle className="mt-1 text-3xl">Cena {String(index + 1).padStart(2, '0')}</SheetTitle>
            <SheetDescription className="mt-0.5 truncate font-mono text-[11px]">
              {formatClock(sceneStart)} → {formatClock(sceneStart + duration)} · {selected?.filename || 'sem mídia'}
            </SheetDescription>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Duration */}
          <section aria-labelledby="dur-title" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 id="dur-title" className="font-display text-[15px] font-bold">Duração</h3>
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  min={0.5}
                  max={600}
                  step={0.1}
                  value={Number(duration.toFixed(2))}
                  onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value) || 0.5))}
                  aria-label="Duração em segundos"
                  className="w-20 rounded-md border border-border bg-surface-0 px-2 py-1 text-right font-mono text-lg tabular-nums text-primary focus-visible:border-primary focus-visible:outline-none"
                />
                <span className="font-mono text-sm text-muted-foreground">s</span>
              </div>
            </div>
            <Slider min={0.5} max={maxDuration} step={0.1} value={[duration]} onValueChange={([v]) => setDuration(v)} aria-label="Duração da cena" />
            {selected?.type === 'video' && (
              <p className={cn('text-[12px]', holds ? 'text-primary' : 'text-muted-foreground')}>
                Clipe tem {selected.duration?.toFixed(1)}s
                {rate < 1 && ` · desacelerado ${rate.toFixed(2)}×`}
                {holds && ' · último frame será segurado (no CapCut: câmera lenta)'}
                {!holds && rate === 1 && (selected.duration || 0) > duration && ' · o fim é cortado'}
              </p>
            )}
            {scene?.audio_asset_id && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Mic className="h-3.5 w-3.5" aria-hidden /> Narração começa em {formatClock(scene.audio_start || 0)} do áudio
              </p>
            )}
          </section>

          {/* Media */}
          <section aria-labelledby="media-title" className="space-y-3">
            <h3 id="media-title" className="font-display text-[15px] font-bold">Mídia</h3>
            <div ref={stripRef} role="radiogroup" aria-labelledby="media-title" className="relative -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
              {media.map((m) => {
                const t = m.metadata?.thumbnail as string | undefined
                const active = m.id === mediaId
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={m.filename}
                    onClick={() => setMediaId(m.id)}
                    className={cn(
                      'relative w-28 shrink-0 cursor-pointer snap-start overflow-hidden rounded-lg border-2 text-left transition-colors duration-200',
                      active ? 'border-primary' : 'border-transparent hover:border-foreground/25'
                    )}
                  >
                    <div className="relative aspect-video bg-surface-3">
                      {t && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 p-0.5">
                        {m.type === 'image' ? <ImageIcon className="h-3 w-3" /> : <Clapperboard className="h-3 w-3" />}
                      </span>
                    </div>
                    <p className="truncate bg-surface-2 px-1.5 py-1 text-[10px] text-muted-foreground">{m.filename}</p>
                  </button>
                )
              })}
              {media.length === 0 && <p className="text-sm text-muted-foreground">Nenhum clipe enviado ainda.</p>}
            </div>
          </section>

          {/* Animation */}
          <section aria-labelledby="anim-title" className="space-y-3">
            <h3 id="anim-title" className="font-display text-[15px] font-bold">Animação</h3>
            <div role="radiogroup" aria-labelledby="anim-title" className="grid grid-cols-3 gap-2">
              <NoneTile selected={animation === 'none'} onSelect={() => setAnimation('none')} label="Sem animação" icon={<Ban className="h-5 w-5" />} />
              {ANIMATIONS.map((a) => (
                <AnimationTile key={a.id} preset={a} thumb={thumb} role="radio" selected={animation === a.id} onToggle={() => setAnimation(a.id)} />
              ))}
            </div>
          </section>

          {/* Transition */}
          <section aria-labelledby="tr-title" className="space-y-3">
            <h3 id="tr-title" className="font-display text-[15px] font-bold">Transição de entrada</h3>
            {index === 0 ? (
              <p className="text-[13px] text-muted-foreground">A primeira cena abre com corte seco.</p>
            ) : (
              <div role="radiogroup" aria-labelledby="tr-title" className="grid grid-cols-3 gap-2">
                <NoneTile selected={transition === 'cut'} onSelect={() => setTransition('cut')} label="Corte seco" icon={<Scissors className="h-5 w-5" />} />
                {TRANSITIONS.map((t) => (
                  <TransitionTile
                    key={t.id}
                    preset={t}
                    thumbs={[previousThumb, thumb]}
                    role="radio"
                    selected={transition === t.id}
                    onToggle={() => setTransition(t.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex gap-2 border-t border-border bg-surface-0/60 px-6 py-4">
          <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-[2] font-semibold" onClick={save} disabled={saving || !selected}>
            {saving && <Loader2 className="animate-spin" />} {scene ? 'Salvar cena' : 'Adicionar cena'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
