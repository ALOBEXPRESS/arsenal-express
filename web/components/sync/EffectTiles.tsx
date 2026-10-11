'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnimationParams, AnimationPreset, TransitionPreset } from '@/lib/sync/presets'
import { animationPose, poseToTransform, transitionStyle } from '@/lib/sync/visual'

/** rAF loop returning seconds elapsed (mod period) while `active` */
function useLoopTime(active: boolean, period: number) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!active) {
      setT(0)
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setT(period * 0.6)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      setT(((now - start) / 1000) % period)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, period])
  return t
}

function Frame({ src, className, style }: { src?: string; className?: string; style?: React.CSSProperties }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn('absolute inset-0 h-full w-full object-cover', className)} style={style} />
  ) : (
    <div
      className={cn('absolute inset-0', className)}
      style={{ background: 'linear-gradient(135deg, hsl(var(--track-video)), hsl(var(--surface-3)))', ...style }}
    />
  )
}

interface TileShellProps {
  selected: boolean
  onToggle: () => void
  label: string
  hint: string
  children: React.ReactNode
  onHover: (v: boolean) => void
  role?: 'checkbox' | 'radio'
}

function TileShell({ selected, onToggle, label, hint, children, onHover, role = 'checkbox' }: TileShellProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onToggle}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border text-left transition-colors duration-200',
        selected ? 'border-primary bg-primary/[0.07]' : 'border-border bg-surface-2 hover:border-foreground/25'
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-black">{children}</div>
      <div className="flex items-start justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <p className={cn('truncate text-[13px] font-semibold', selected && 'text-primary')}>{label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
            role === 'radio' && 'rounded-full',
            selected ? 'border-primary bg-primary-fill text-primary-foreground' : 'border-foreground/30'
          )}
          aria-hidden
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </div>
    </button>
  )
}

export function AnimationTile({
  preset,
  selected,
  onToggle,
  thumb,
  role,
  params,
}: {
  preset: AnimationPreset
  selected: boolean
  onToggle: () => void
  thumb?: string
  role?: 'checkbox' | 'radio'
  params?: Partial<AnimationParams>
}) {
  const [hover, setHover] = useState(false)
  const period = 3
  const t = useLoopTime(hover || selected, period)
  const pose = animationPose(preset.id, t, period, params)
  return (
    <TileShell selected={selected} onToggle={onToggle} label={preset.label} hint={preset.hint} onHover={setHover} role={role}>
      <Frame src={thumb} style={{ transform: poseToTransform(pose) }} />
      <span className="absolute bottom-1 right-1.5 font-mono text-[9px] text-white/70">{pose.scale.toFixed(2)}x</span>
    </TileShell>
  )
}

export function TransitionTile({
  preset,
  selected,
  onToggle,
  thumbs,
  role,
}: {
  preset: TransitionPreset
  selected: boolean
  onToggle: () => void
  thumbs: [string | undefined, string | undefined]
  role?: 'checkbox' | 'radio'
}) {
  const [hover, setHover] = useState(false)
  const period = 2.4
  const t = useLoopTime(hover || selected, period)
  // hold A, transition 0.8s, hold B
  const p = Math.max(0, Math.min(1, (t - 0.8) / 0.8))
  const fx = transitionStyle(preset.id, p)
  const flashColor = preset.id === 'flash_branco' ? '#fff' : '#000'
  return (
    <TileShell selected={selected} onToggle={onToggle} label={preset.label} hint={preset.hint} onHover={setHover} role={role}>
      <Frame src={thumbs[0]} style={{ transform: `scale(${fx.outScale})` }} />
      <Frame src={thumbs[1] || thumbs[0]} style={{ opacity: fx.incoming, transform: `scale(${fx.inScale})` }} className={!thumbs[1] ? 'hue-rotate-90' : undefined} />
      {fx.flash > 0 && <div className="absolute inset-0" style={{ background: flashColor, opacity: fx.flash }} />}
    </TileShell>
  )
}

/**
 * Flow picker: how many DIFFERENT effects each group of 3 scenes uses.
 * Each option draws its pattern (same color = same effect) so the rule is visible.
 */
export function FlowPicker({
  value,
  onChange,
  label,
  noun,
  nounPlural,
  selectedCount,
}: {
  value: 1 | 2 | 3
  onChange: (v: 1 | 2 | 3) => void
  label: string
  /** "animação" / "transição" */
  noun: string
  /** "animações" / "transições" */
  nounPlural: string
  selectedCount: number
}) {
  // effect index of each of the 3 scenes in a group, per flow
  const pattern: Record<1 | 2 | 3, number[]> = { 1: [0, 0, 0], 2: [0, 0, 1], 3: [0, 1, 2] }
  const tone = ['bg-brand-pink', 'bg-brand-cyan', 'bg-express']
  const options: { v: 1 | 2 | 3; desc: string }[] = [
    { v: 1, desc: `1 ${noun} a cada 3 cenas` },
    { v: 2, desc: `2 ${nounPlural} diferentes a cada 3` },
    { v: 3, desc: `3 ${nounPlural} diferentes a cada 3` },
  ]
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-foreground/90">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5">
        {options.map((o) => {
          const on = value === o.v
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${o.v}:3 — ${o.desc}`}
              onClick={() => onChange(o.v)}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200',
                on ? 'border-primary bg-primary/[0.08]' : 'border-border bg-surface-0 hover:border-foreground/25'
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn('font-mono text-[13px] font-semibold tabular-nums', on ? 'text-primary' : 'text-foreground')}>{o.v}:3</span>
                <span className="flex gap-[3px]" aria-hidden>
                  {pattern[o.v].map((k, i) => (
                    <span key={i} className={cn('h-3.5 w-2.5 rounded-[3px]', tone[k], !on && 'opacity-60')} />
                  ))}
                </span>
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">{o.desc}</span>
            </button>
          )
        })}
      </div>
      {value > 1 && selectedCount > 0 && selectedCount < value && (
        <p className="text-[11px] text-muted-foreground">
          Só {selectedCount} marcada{selectedCount > 1 ? 's' : ''}: marque {value} pra os {value} do grupo ficarem diferentes.
        </p>
      )}
    </div>
  )
}

/** Two-option segmented control (Variado / Uma só) */
export function ModeSwitch<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-border bg-surface-0 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors duration-200',
            value === o.value ? 'bg-primary-fill text-primary-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
