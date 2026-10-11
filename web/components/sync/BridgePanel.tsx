'use client'

// Status + pairing of the local connector that saves straight into CapCut and opens it
import { useCallback, useEffect, useState } from 'react'
import { Download, Plug, PlugZap, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BRIDGE_TOKEN_KEY, pingBridge, type BridgeInfo } from '@/lib/capcut/bridge'
import { cn } from '@/lib/utils'

export function useBridge(active: boolean) {
  const [token, setToken] = useState('')
  const [info, setInfo] = useState<BridgeInfo | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setToken(localStorage.getItem(BRIDGE_TOKEN_KEY) || '')
  }, [])

  useEffect(() => {
    if (!active) return
    let stop = false
    const tick = async () => {
      const r = await pingBridge(token || undefined)
      if (stop) return
      setInfo(r)
      setChecked(true)
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [active, token])

  /** true when the code matches the connector */
  const pair = useCallback(async (code: string) => {
    const clean = code.trim().toUpperCase()
    const r = await pingBridge(clean)
    if (r?.authorized) {
      localStorage.setItem(BRIDGE_TOKEN_KEY, clean)
      setToken(clean)
      setInfo(r)
      return true
    }
    return false
  }, [])

  return { token, info, checked, ready: !!info?.authorized, pair }
}

export function BridgePanel({ bridge }: { bridge: ReturnType<typeof useBridge> }) {
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [wrong, setWrong] = useState(false)
  const { info, checked, ready } = bridge

  const tone = ready ? 'ok' : info ? 'warn' : 'off'
  return (
    <section
      aria-label="Conector com o CapCut"
      className={cn(
        'rounded-xl border p-3',
        tone === 'ok' ? 'border-track-audio/40 bg-track-audio/[0.07]' : 'border-border bg-surface-0'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            tone === 'ok' ? 'border-track-audio/40 bg-track-audio/15 text-track-audio' : 'border-border bg-surface-2 text-muted-foreground'
          )}
          aria-hidden
        >
          {!checked ? <Loader2 className="h-4 w-4 animate-spin" /> : ready ? <PlugZap className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-bold">
            {!checked ? 'Procurando o conector…' : ready ? 'Conector ligado' : info ? 'Conector achado — falta parear' : 'Salvar direto no CapCut'}
          </p>

          {checked && !info && (
            <div className="mt-1.5 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
              <p>
                O navegador não pode escrever na pasta do CapCut nem abrir o programa. Um conectorzinho local faz isso: salva o projeto na pasta
                certa e abre o CapCut. Uma vez só:
              </p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Baixe os dois arquivos abaixo <b className="text-foreground">na mesma pasta</b>.
                </li>
                <li>
                  Dois cliques em <code>iniciar-conector-syncexpress.bat</code> (precisa do{' '}
                  <a className="text-primary underline-offset-2 hover:underline" href="https://nodejs.org" target="_blank" rel="noreferrer">
                    Node.js
                  </a>
                  ).
                </li>
                <li>Deixe a janela aberta e volte aqui.</li>
              </ol>
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  ['/iniciar-conector-syncexpress.bat', 'iniciar-conector-syncexpress.bat'],
                  ['/syncexpress-bridge.mjs', 'syncexpress-bridge.mjs'],
                ].map(([href, file]) => (
                  <a
                    key={href}
                    href={href}
                    download={file}
                    className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="h-4 w-4" aria-hidden /> {file}
                  </a>
                ))}
              </div>
              <p className="text-[11px]">
                O Chrome pode perguntar se este site pode “acessar outros apps e serviços neste dispositivo” — permita. Enquanto isso, o{' '}
                <b className="text-foreground">.zip</b> abaixo funciona sempre.
              </p>
            </div>
          )}

          {checked && info && !ready && (
            <form
              className="mt-1.5 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!code.trim()) return
                setPairing(true)
                setWrong(false)
                const ok = await bridge.pair(code)
                setPairing(false)
                setWrong(!ok)
                if (ok) setCode('')
              }}
            >
              <p className="text-[12px] text-muted-foreground">
                Digite o <b className="text-foreground">código de pareamento</b> que aparece na janela do conector (formato XXXX-XXXX-XXXX).
              </p>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  aria-label="Código de pareamento do conector"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono tracking-wider"
                />
                <Button type="submit" disabled={pairing || !code.trim()}>
                  {pairing ? <Loader2 className="animate-spin" /> : null} Parear
                </Button>
              </div>
              {wrong && <p className="text-[12px] text-destructive">Código não confere. Confira a janela do conector.</p>}
            </form>
          )}

          {ready && info && (
            <div className="mt-1 space-y-1 text-[12px] text-muted-foreground">
              <p className="break-all font-mono text-[11px] text-foreground/80">{info.draftRoot?.replace(/\//g, info.platform === 'win32' ? '\\' : '/')}</p>
              {!info.draftRootExists && (
                <p className="flex items-start gap-1.5 text-primary">
                  <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> Essa pasta ainda não existe — abra o CapCut uma vez pra ele criar.
                </p>
              )}
              {info.capcutRunning && <p>CapCut está aberto agora — vou pedir pra fechar antes de salvar.</p>}
              {!info.capcutExists && info.platform === 'win32' && <p>Não achei o CapCut.exe; salvo o projeto e você abre o CapCut manualmente.</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
