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

      <section className="relative mx-auto max-w-6xl px-6 pb-12">
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
          <Link
            href="/tiktok"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/50 bg-brand-cyan/10 px-3 py-1 text-xs font-medium text-brand-cyan transition-all hover:border-brand-cyan hover:bg-brand-cyan/20"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            TikTok Scheduler
          </Link>
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

      {/* Arsenal Express Hub - Ecossistema de Ferramentas */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-8">
          <p className="eyebrow flex items-center gap-2">
            <span className="tally" aria-hidden /> Ecossistema
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
            Ferramentas Arsenal Express
          </h2>
          <p className="mt-2 text-muted-foreground">
            Expanda seu workflow com integrações poderosas.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* SyncExpress - Ferramenta atual */}
          <Link
            href="/dashboard"
            className="group panel overflow-hidden transition-all hover:border-express/50 hover:shadow-[0_0_24px_-12px_hsl(var(--express)/0.5)]"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-express/20">
                    <Clapperboard className="h-6 w-6 text-express" aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold">SyncExpress</h3>
                    <span className="inline-flex items-center gap-1.5 text-xs text-express">
                      <span className="tally !h-1 !w-1" /> Ativo
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Sincronize clipes com narração e gere timelines prontas pro CapCut. 
                Ritmo variável, cortes nas pausas da fala.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-express">
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                <span>Abrir SyncExpress</span>
              </div>
            </div>
          </Link>

          {/* TikTok Scheduler - Nova ferramenta */}
          <Link
            href="/tiktok"
            className="group panel overflow-hidden transition-all hover:border-brand-cyan/50 hover:shadow-[0_0_24px_-12px_hsl(var(--brand-cyan)/0.5)]"
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-cyan/20">
                    <svg 
                      className="h-7 w-7 text-brand-cyan" 
                      viewBox="0 0 24 24" 
                      fill="currentColor" 
                      aria-hidden
                    >
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold">TikTok Scheduler</h3>
                    <span className="inline-flex items-center gap-1.5 text-xs text-brand-cyan">
                      <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-brand-cyan" /> Novo
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Agende e publique vídeos no TikTok direto da plataforma. 
                Analytics, multi-contas e automação via PostZen API.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-brand-cyan">
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                <span>Abrir Scheduler</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Coming Soon */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: '📝', title: 'Script → Prompts', desc: 'Gere prompts de vídeo IA do seu roteiro' },
            { icon: '💬', title: 'Auto Legendas', desc: 'Legendas automáticas sincronizadas' },
            { icon: '🖼️', title: 'Thumb Generator', desc: 'Thumbnails com IA otimizadas' },
          ].map((tool) => (
            <div key={tool.title} className="panel p-4 opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>{tool.icon}</span>
                <Lock className="ml-auto h-3 w-3 text-muted-foreground" aria-hidden />
              </div>
              <h4 className="mt-3 font-semibold">{tool.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{tool.desc}</p>
              <span className="mt-2 inline-block text-xs text-muted-foreground">Em breve</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
