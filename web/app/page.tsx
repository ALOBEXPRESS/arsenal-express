import Link from 'next/link'
import { ArrowRight, AudioWaveform, Clapperboard, FolderDown, Lock } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'

// Variable-rhythm demo blocks (seconds) — deliberately uneven, like real narration
const DEMO = [4.2, 7.8, 3.1, 5.6, 9.4, 2.7, 6.3, 4.9]
const DEMO_TOTAL = DEMO.reduce((a, b) => a + b, 0)

const STEPS = [
  { icon: Clapperboard, title: 'Suba os clipes', text: 'Ordem pela data de modificação — nomes bagunçados não importam.' },
  { icon: AudioWaveform, title: 'Sincronize com a narração', text: 'Cortes caem nas pausas da fala. Ritmo variável, sem padrão 8-8-8.' },
  { icon: FolderDown, title: 'Abra no CapCut', text: 'Projeto pronto com animações e transições. Só copiar e abrir.' },
]

export default function Home() {
  return (
    <main className="grain relative min-h-screen overflow-hidden bg-surface-0">
      {/* ambient brand glows: pink (top-right) + cyan (left) — the TikTok duo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--brand-pink)) 0%, transparent 62%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-52 top-1/3 h-[480px] w-[480px] rounded-full opacity-[0.14] blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--brand-cyan)) 0%, transparent 62%)' }}
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo animated />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Entrar
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md bg-primary-fill px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-fill/90"
          >
            Abrir SyncExpress <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="animate-rise-in">
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> Sala de edição automática
          </p>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">
            Clipe solto
            <br />
            entra <span className="tiktok-split text-white">no tempo</span>
            <br />
            da sua voz.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            O SyncExpress monta a timeline sozinho: organiza os clipes, sincroniza com a narração e entrega o
            projeto pronto pra abrir no CapCut.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary-fill px-6 font-semibold text-primary-foreground glow-pink transition-colors hover:bg-primary-fill/90"
            >
              Abrir SyncExpress <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="font-mono text-xs text-muted-foreground">grátis · sem render · direto pro CapCut</span>
          </div>
        </div>

        {/* Signature visual: a live-looking timeline with uneven (variable rhythm) cuts */}
        <div className="animate-rise-in [animation-delay:150ms]" aria-hidden>
          <div className="panel overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="eyebrow">timeline · ritmo variável</span>
              <span className="font-mono text-xs tabular-nums text-brand-cyan">00:21:14</span>
            </div>
            <div className="relative space-y-2 p-4">
              <div className="ruler h-5 font-mono text-[9px] text-muted-foreground [--major:64px]" />
              <div className="flex h-14 gap-[3px]">
                {DEMO.map((d, i) => (
                  <div
                    key={i}
                    className={`relative overflow-hidden rounded-md border ${i === 3 ? "border-brand-pink bg-brand-pink/25" : "border-white/10 bg-track-video/80"}`}
                    style={{ width: `${(d / DEMO_TOTAL) * 100}%` }}
                  >
                    <span className="absolute left-1.5 top-1 font-mono text-[9px] text-white/80">
                      {String(i + 1).padStart(3, '0')}
                    </span>
                    <span className="absolute bottom-1 left-1.5 font-mono text-[9px] text-white/60">{d.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
              <div className="flex h-9 items-center justify-between overflow-hidden rounded-md bg-track-audio/85 px-2">
                {Array.from({ length: 90 }, (_, i) => (
                  <span
                    key={i}
                    className="w-[2px] shrink-0 rounded-full bg-brand-ink/60"
                    style={{ height: `${18 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 70}%` }}
                  />
                ))}
              </div>
              <div className="absolute bottom-3 top-9 w-0.5 bg-brand-cyan shadow-[0_0_10px_hsl(var(--brand-cyan))]" style={{ left: '46%' }}>
                <span className="absolute -left-[5px] -top-1 h-3 w-3 rotate-45 rounded-sm bg-brand-cyan" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="bg-surface-1 p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-express">0{i + 1}</span>
                <Icon className="h-5 w-5 text-foreground/80" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <span className="eyebrow">Arsenal Express · ferramentas</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-express/50 bg-express/10 px-3 py-1 text-xs font-medium text-express">
            <span className="tally !h-1.5 !w-1.5" /> SyncExpress
          </span>
          {['Roteiro → Prompts', 'Legendas', 'Thumbnails'].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              <Lock className="h-3 w-3" aria-hidden /> {t} · em breve
            </span>
          ))}
        </div>
      </section>
    </main>
  )
}
