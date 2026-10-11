// Client for the local SyncExpress → CapCut connector (public/syncexpress-bridge.mjs).
// The page cannot write into %LOCALAPPDATA% or launch CapCut by itself; the connector can.
export const BRIDGE_URL = 'http://127.0.0.1:47831'
export const BRIDGE_TOKEN_KEY = 'syncexpress.bridge.token'

export interface BridgeInfo {
  version: string
  authorized: boolean
  platform?: string
  draftRoot?: string
  draftRootExists?: boolean
  capcutExists?: boolean
  capcutRunning?: boolean
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public code?: 'capcut_running' | 'codigo_invalido' | 'offline'
  ) {
    super(message)
  }
}

// Chrome's Local Network Access: tells the browser this public page may reach 127.0.0.1
const LOCAL_FETCH = { targetAddressSpace: 'loopback' } as unknown as RequestInit

/** null = connector not running */
export async function pingBridge(token?: string): Promise<BridgeInfo | null> {
  try {
    const r = await fetch(`${BRIDGE_URL}/ping`, {
      ...LOCAL_FETCH,
      headers: token ? { 'X-Bridge-Token': token } : {},
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    })
    if (!r.ok) return null
    const j = await r.json()
    return j?.app === 'syncexpress-bridge' ? (j as BridgeInfo) : null
  } catch {
    return null
  }
}

export interface InstallPayload {
  folderName: string
  files: Record<string, string>
  media: { name: string; url: string }[]
  registryEntry: Record<string, unknown>
  launch: boolean
  closeCapCut: boolean
}

export async function installViaBridge(
  token: string,
  payload: InstallPayload,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ folder: string; registered: boolean; launched: boolean; warnings: string[] }> {
  let res: Response
  try {
    res = await fetch(`${BRIDGE_URL}/install`, {
      ...LOCAL_FETCH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new BridgeError('Conector não encontrado. Abra o iniciar-conector-syncexpress.bat e tente de novo.', 'offline')
  }

  if (res.status === 401) throw new BridgeError('Código do conector inválido.', 'codigo_invalido')
  if (res.status === 409) throw new BridgeError('O CapCut está aberto.', 'capcut_running')
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null)
    throw new BridgeError(j?.error || `Conector respondeu ${res.status}`)
  }

  // NDJSON: progress lines, then {type:'done'} or {type:'error'}
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const warnings: string[] = []
  let result: { folder: string; registered: boolean; launched: boolean } | null = null
  const handle = (line: string) => {
    if (!line.trim()) return
    const m = JSON.parse(line)
    if (m.type === 'progress') onProgress?.(m.done, m.total, m.label)
    else if (m.type === 'warn') warnings.push(m.message)
    else if (m.type === 'error') throw new BridgeError(m.message)
    else if (m.type === 'done') result = { folder: m.folder, registered: m.registered, launched: m.launched }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
    }
  }
  handle(buffer)
  if (!result) throw new BridgeError('O conector fechou antes de terminar.')
  return { ...(result as { folder: string; registered: boolean; launched: boolean }), warnings }
}
