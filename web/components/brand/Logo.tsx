import { cn } from '@/lib/utils'

/**
 * SyncExpress mark: pink clip bars (top) snapping onto cyan narration bars (bottom),
 * on the brand black — the two TikTok colors literally "in sync".
 * `animated` plays the "sync snap" once — the brand's signature motion.
 */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const bars = [0.45, 0.85, 0.6, 1, 0.7]
  return (
    <svg viewBox="0 0 40 40" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="hsl(var(--brand-ink))" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="none" stroke="hsl(var(--brand-pink) / 0.35)" />
      {bars.map((h, i) => {
        const x = 7 + i * 5.6
        const height = 6 + h * 9
        return (
          <g key={i}>
            <rect
              x={x}
              y={19 - height}
              width="3.2"
              height={height}
              rx="1.6"
              fill="hsl(var(--brand-pink))"
              className={animated ? 'animate-sync-snap' : undefined}
              style={
                animated
                  ? ({ ['--from' as string]: `${(i % 2 ? -1 : 1) * 5}px`, animationDelay: `${i * 70}ms` } as React.CSSProperties)
                  : undefined
              }
            />
            <rect x={x} y={21} width="3.2" height={height * 0.7} rx="1.6" fill="hsl(var(--brand-cyan))" />
          </g>
        )
      })}
    </svg>
  )
}

export function Logo({ className, animated, subtitle = true }: { className?: string; animated?: boolean; subtitle?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark animated={animated} />
      <span className="leading-none">
        <span className="font-display text-lg font-extrabold tracking-tight">
          <span className="tiktok-split-sm">Sync</span>
          <span className="text-express">Express</span>
        </span>
        {subtitle && <span className="eyebrow mt-1 block !text-[9px]">by Arsenal Express</span>}
      </span>
    </span>
  )
}
