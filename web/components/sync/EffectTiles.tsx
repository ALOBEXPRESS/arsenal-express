'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnimationPreset, TransitionPreset } from '@/lib/sync/presets'
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
}: {
  preset: AnimationPreset
  selected: boolean
  onToggle: () => void
  thumb?: string
  role?: 'checkbox' | 'radio'
}) {
  const [hover, setHover] = useState(false)
  const period = 3
  const t = useLoopTime(hover || selected, period)
  const pose = animationPose(preset.id, t, period)
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
