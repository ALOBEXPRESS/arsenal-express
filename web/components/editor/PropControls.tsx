'use client'

// Small inspector controls shared by the scene editor, the assembly sheet and the inspector
import { useId } from 'react'
import { RotateCcw, ArrowLeftRight } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { normalizeParams, type AnimationParams } from '@/lib/sync/presets'
import { cn } from '@/lib/utils'

export function PropSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onReset,
  hint,
  className,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  /** shows a reset button when provided */
  onReset?: () => void
  hint?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <label htmlFor={id} className="text-muted-foreground">
          {label}
        </label>
        <span className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-foreground">{format(value)}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label={`Restaurar ${label}`}
              title="Restaurar padrão"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 0.1,
  suffix = 's',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
  suffix?: string
}) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface-0 px-2 focus-within:border-primary">
        <input
          id={id}
          type="number"
          min={min}
          step={step}
          value={Number(value.toFixed(2))}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(Math.max(min, v))
          }}
          className="h-8 w-full bg-transparent font-mono text-[13px] tabular-nums outline-none"
        />
        <span className="font-mono text-[11px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}

/** Velocidade / intensidade / inverter for clip animations */
export function AnimationParamsControls({
  value,
  onChange,
  disabled,
}: {
  value?: Partial<AnimationParams> | null
  onChange: (p: AnimationParams) => void
  disabled?: boolean
}) {
  const p = normalizeParams(value)
  const set = (patch: Partial<AnimationParams>) => onChange({ ...p, ...patch })
  return (
    <div className={cn('space-y-4 rounded-lg border border-border bg-surface-0 p-3', disabled && 'pointer-events-none opacity-50')} aria-disabled={disabled}>
      <PropSlider
        label="Velocidade do movimento"
        value={p.speed}
        min={0.25}
        max={4}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(v) => set({ speed: v })}
        onReset={p.speed !== 1 ? () => set({ speed: 1 }) : undefined}
        hint={p.speed > 1 ? 'Movimento termina antes do fim do clipe e segura.' : p.speed < 1 ? 'Movimento mais lento: só parte dele acontece no clipe.' : 'Movimento ocupa o clipe inteiro.'}
      />
      <PropSlider
        label="Intensidade"
        value={p.intensity}
        min={0}
        max={3}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => set({ intensity: v })}
        onReset={p.intensity !== 1 ? () => set({ intensity: 1 }) : undefined}
      />
      <label className="flex cursor-pointer items-start justify-between gap-3 text-[12px]">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> Inverter direção
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/80">Zoom in ↔ out, esquerda ↔ direita</span>
        </span>
        <Switch checked={p.reverse} onCheckedChange={(v) => set({ reverse: v })} aria-label="Inverter direção da animação" />
      </label>
    </div>
  )
}
