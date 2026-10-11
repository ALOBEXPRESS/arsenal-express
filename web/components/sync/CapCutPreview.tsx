'use client'

import { useEffect, useRef } from 'react'
import { BadgeCheck, Blend, Sparkles, Clapperboard, FolderOpen, MousePointerClick, Power } from 'lucide-react'
import { formatTime } from '@/lib/timeline'
import type { CapCutSystem } from '@/lib/capcut/draft'

/**
 * How the project will look in the user's CapCut project list (home screen tile),
 * so they know exactly what to look for before exporting.
 */
export function CapCutPreviewCard({
  name,
  thumb,
  duration,
  vertical,
  scenes,
  transitions,
  animations,
}: {
  name: string
  thumb?: string
  duration: number
  vertical: boolean
  scenes: number
  transitions: number
  animations: number
}) {
  return (
    <section aria-label="Prévia no CapCut" className="overflow-hidden rounded-xl border border-border bg-[#141414]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">No seu CapCut · Projetos</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-track-audio/15 px-2 py-0.5 text-[10px] font-medium text-track-audio">
          <BadgeCheck className="h-3 w-3" aria-hidden /> Testado no CapCut 9.x
        </span>
      </div>

      <div className="flex gap-4 p-4">
        {/* CapCut-style project tile */}
        <div className="w-[132px] shrink-0">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#262626] ring-2 ring-primary ring-offset-2 ring-offset-[#141414]">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className={vertical ? 'absolute inset-y-0 left-1/2 h-full -translate-x-1/2 object-cover' : 'absolute inset-0 h-full w-full object-cover'}
                style={vertical ? { aspectRatio: '9 / 16' } : undefined}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/40">
                <Clapperboard className="h-6 w-6" aria-hidden />
              </div>
            )}
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px] tabular-nums text-white">
              {formatTime(duration)}
            </span>
          </div>
          <p className="mt-1.5 truncate text-[12px] font-medium text-white">{name}</p>
          <p className="text-[10px] text-white/45">agora · {vertical ? '9:16' : '16:9'}</p>
        </div>

        <ul className="min-w-0 flex-1 space-y-2 self-center text-[12px] text-white/80">
          <li className="flex items-center gap-2">
            <Clapperboard className="h-3.5 w-3.5 shrink-0 text-track-video" aria-hidden />
            <span>
              <b className="font-mono text-white">{scenes}</b> cenas no tempo da narração
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Blend className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              <b className="font-mono text-white">{transitions}</b> transições já aplicadas
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              <b className="font-mono text-white">{animations}</b> clipes com animação
            </span>
          </li>
          <li className="text-[11px] text-white/45">Tudo editável no CapCut — nada é renderizado.</li>
        </ul>
      </div>
    </section>
  )
}

/** Success panel shown after export: exactly what to do to see it in CapCut */
export function OpenInCapCut({
  name,
  message,
  system,
  launched = false,
}: {
  name: string
  message: string
  system: CapCutSystem
  /** the connector already opened CapCut */
  launched?: boolean
}) {
  // bring the panel into view ONCE when it appears (an inline ref callback re-ran on every
  // re-render and dragged the scroll down while the user typed or the connector was polled)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  const steps = [
    { icon: Power, text: launched ? 'O CapCut abre sozinho' : 'Abra (ou reinicie) o CapCut' },
    { icon: FolderOpen, text: <>Na tela inicial, em <b className="text-foreground">Projetos</b></> },
    {
      icon: MousePointerClick,
      text: (
        <>
          Clique em <b className="text-primary">{name}</b>
        </>
      ),
    },
  ]
  return (
    <div
      role="status"
      ref={panelRef}
      className="animate-rise-in overflow-hidden rounded-xl border border-track-audio/40 bg-track-audio/10"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-track-audio/25">
          <BadgeCheck className="h-5 w-5 text-track-audio" aria-hidden />
        </span>
        <div>
          <p className="font-display text-[15px] font-bold">{launched ? 'Pronto! Abrindo o CapCut' : 'Pronto! Vai abrir no seu CapCut'}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{message}</p>
        </div>
      </div>
      <ol className="grid grid-cols-3 gap-px border-t border-track-audio/25 bg-track-audio/25 mt-4">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex flex-col items-center gap-1.5 bg-surface-1 px-2 py-3 text-center text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-mono text-[10px] text-primary">
              {i + 1} <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ol>
      <p className="bg-surface-1 px-4 pb-3 text-[11px] text-muted-foreground">
        {system === 'windows' ? 'Windows' : 'Mac'}: o CapCut encontra o projeto sozinho ao abrir. Se pedir “Vincular mídia”, aponte para a
        pasta <code>media</code> do projeto.
      </p>
    </div>
  )
}
