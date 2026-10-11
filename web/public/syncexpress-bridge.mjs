#!/usr/bin/env node
// SyncExpress → CapCut connector (zero dependencies, Node 18+)
//
// Why it exists: browsers cannot write inside %LOCALAPPDATA% (Chrome blocks that folder) nor
// launch programs. This tiny local server (127.0.0.1 only) receives the CapCut project from the
// SyncExpress page, writes it into the CapCut projects folder, registers it in CapCut's project
// list and opens CapCut.
//
// Safety:
//  - listens on 127.0.0.1 only and checks the Host header (no DNS rebinding)
//  - every request needs the pairing code printed below (stored in ~/.syncexpress-bridge.json)
//  - writes ONLY inside the CapCut draft folder (paths are validated, no "..")
//  - media is downloaded only from https://*.supabase.co URLs
//
// Run:  node syncexpress-bridge.mjs     (or double-click iniciar-conector-syncexpress.bat)

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const VERSION = '1.0.0'
const PORT = Number(process.env.SYNCEXPRESS_PORT) || 47831
const HOME = os.homedir()
const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('Precisa do Node.js 18 ou mais novo. Baixe em https://nodejs.org')
  process.exit(1)
}

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local')
const DRAFT_ROOT =
  process.env.CAPCUT_DRAFT_ROOT ||
  (IS_WIN
    ? path.join(LOCALAPPDATA, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft')
    : path.join(HOME, 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'))
const CAPCUT_EXE = IS_WIN ? path.join(LOCALAPPDATA, 'CapCut', 'Apps', 'CapCut.exe') : '/Applications/CapCut.app'

// ---- pairing code ------------------------------------------------------------------------
const CONFIG = path.join(HOME, '.syncexpress-bridge.json')
function loadToken() {
  try {
    const t = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).token
    if (typeof t === 'string' && t.length >= 12) return t
  } catch {
    /* first run */
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(12)
  const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  const t = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
  fs.writeFileSync(CONFIG, JSON.stringify({ token: t }), { mode: 0o600 })
  return t
}
const TOKEN = loadToken()
const tokenOk = (given) => {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given.trim().toUpperCase())
  const b = Buffer.from(TOKEN)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---- helpers -----------------------------------------------------------------------------
const fwd = (p) => p.replace(/\\/g, '/')
const exists = (p) => fs.existsSync(p)
const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve({ err, stdout: String(stdout || '') })))

async function capcutRunning() {
  if (IS_WIN) {
    const { stdout } = await run('tasklist', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH'])
    return /CapCut\.exe/i.test(stdout)
  }
  const { err } = await run('pgrep', ['-x', 'CapCut'])
  return !err
}

async function closeCapCut() {
  if (IS_WIN) await run('taskkill', ['/IM', 'CapCut.exe'])
  else await run('osascript', ['-e', 'quit app "CapCut"'])
  for (let i = 0; i < 16; i++) {
    if (!(await capcutRunning())) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  if (IS_WIN) await run('taskkill', ['/F', '/T', '/IM', 'CapCut.exe'])
  await new Promise((r) => setTimeout(r, 800))
  return !(await capcutRunning())
}

function launchCapCut() {
  if (process.env.SYNCEXPRESS_NO_LAUNCH) return false // tests / dry runs
  try {
    if (IS_WIN) {
      if (!exists(CAPCUT_EXE)) return false
      spawn(CAPCUT_EXE, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    } else if (IS_MAC) {
      spawn('open', ['-a', 'CapCut'], { detached: true, stdio: 'ignore' }).unref()
    } else return false
    return true
  } catch {
    return false
  }
}

const safeName = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'SyncExpress'
const safeMedia = (s) => String(s).replace(/[^A-Za-z0-9._\- ]/g, '_').replace(/^\.+/, '_').slice(0, 160) || 'media'

/** absolute path of `rel` inside `base`, or throws */
function inside(base, rel) {
  const target = path.resolve(base, rel)
  const root = path.resolve(base) + path.sep
  if (!(target + path.sep).startsWith(root) || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`Caminho inválido: ${rel}`)
  }
  return target
}

function allowedUrl(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && /(^|\.)supabase\.co$/i.test(url.hostname)
  } catch {
    return false
  }
}

// ---- HTTP ---------------------------------------------------------------------------------
const hostOk = (h) => h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`

function cors(req, res) {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-bridge-token')
  // Chrome "Private/Local Network Access": the public page may talk to this local server
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Access-Control-Max-Age', '600')
}

const json = (req, res, status, body) => {
  cors(req, res)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req, limit = 300 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new Error('Pedido grande demais')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

let failDelay = 0
async function authorize(req, res) {
  if (tokenOk(req.headers['x-bridge-token'])) {
    failDelay = 0
    return true
  }
  failDelay = Math.min(failDelay + 400, 3000)
  await new Promise((r) => setTimeout(r, failDelay))
  json(req, res, 401, { ok: false, error: 'codigo_invalido' })
  return false
}

async function install(req, res) {
  let body
  try {
    body = JSON.parse((await readBody(req)).toString('utf8'))
  } catch (e) {
    return json(req, res, 400, { ok: false, error: String(e.message || e) })
  }
  const { folderName, files, media = [], registryEntry, launch = true, closeCapCut: closeIt = false } = body || {}
  if (!folderName || typeof files !== 'object' || !files) return json(req, res, 400, { ok: false, error: 'Pedido incompleto' })

  if (await capcutRunning()) {
    if (!closeIt) return json(req, res, 409, { ok: false, error: 'capcut_running' })
    if (!(await closeCapCut())) return json(req, res, 500, { ok: false, error: 'Não consegui fechar o CapCut. Feche manualmente e tente de novo.' })
  }

  cors(req, res)
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
  const send = (o) => res.write(JSON.stringify(o) + '\n')

  try {
    var folder = path.join(DRAFT_ROOT, safeName(folderName))
    var existedBefore = exists(folder)
    await fsp.mkdir(folder, { recursive: true })
    const total = Object.keys(files).length + media.length
    let done = 0

    for (const [rel, text] of Object.entries(files)) {
      const target = inside(folder, rel)
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.writeFile(target, text, 'utf8')
      send({ type: 'progress', done: ++done, total, label: `Escrevendo ${rel}` })
    }

    const mediaDir = path.join(folder, 'media')
    await fsp.mkdir(mediaDir, { recursive: true })
    const queue = [...media]
    const worker = async () => {
      while (queue.length) {
        const m = queue.shift()
        if (!allowedUrl(m.url)) throw new Error(`URL de mídia não permitida: ${m.name}`)
        const name = safeMedia(m.name)
        const target = path.join(mediaDir, name)
        send({ type: 'progress', done, total, label: `Baixando ${name}` })
        let r
        try {
          r = await fetch(m.url)
        } catch (e) {
          throw new Error(`Falha ao baixar ${name}: ${e.cause?.code || e.message}. Confira a internet e tente de novo.`)
        }
        if (!r.ok || !r.body) throw new Error(`Falha ao baixar ${name} (HTTP ${r.status}). O link pode ter expirado — recarregue a página.`)
        await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(target))
        send({ type: 'progress', done: ++done, total, label: `Baixado ${name}` })
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, media.length) }, worker))

    // CapCut's project list
    let registered = false
    if (registryEntry && typeof registryEntry === 'object') {
      const registry = path.join(DRAFT_ROOT, 'root_meta_info.json')
      try {
        let data = { all_draft_store: [] }
        if (exists(registry)) {
          const raw = (await fsp.readFile(registry, 'utf8')).replace(/^\uFEFF/, '')
          await fsp.writeFile(registry + '.syncexpress.bak', raw, 'utf8')
          data = JSON.parse(raw)
        }
        const same = (e) => e.draft_name === registryEntry.draft_name || fwd(String(e.draft_fold_path || '')) === fwd(String(registryEntry.draft_fold_path || ''))
        data.all_draft_store = [registryEntry, ...(data.all_draft_store || []).filter((e) => !same(e))]
        await fsp.writeFile(registry, JSON.stringify(data), 'utf8')
        registered = true
      } catch (e) {
        send({ type: 'warn', message: `Não consegui atualizar a lista de projetos do CapCut: ${e.message}` })
      }
    }

    const launched = launch ? launchCapCut() : false
    send({ type: 'done', folder: fwd(folder), registered, launched })
  } catch (e) {
    // don't leave a half-written project behind (only if this run created the folder)
    try {
      if (typeof folder === 'string' && !existedBefore) await fsp.rm(folder, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    send({ type: 'error', message: String(e.message || e) })
  }
  res.end()
}

const server = http.createServer(async (req, res) => {
  try {
    if (!hostOk(req.headers.host || '')) return json(req, res, 403, { ok: false, error: 'host' })
    if (req.method === 'OPTIONS') {
      cors(req, res)
      res.writeHead(204)
      return res.end()
    }
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/ping') {
      const given = req.headers['x-bridge-token']
      const authorized = tokenOk(given)
      if (given && !authorized) {
        // wrong code: slow down guessing
        failDelay = Math.min(failDelay + 400, 3000)
        await new Promise((r) => setTimeout(r, failDelay))
      }
      const info = { ok: true, app: 'syncexpress-bridge', version: VERSION, authorized }
      if (info.authorized) {
        Object.assign(info, {
          platform: process.platform,
          draftRoot: fwd(DRAFT_ROOT),
          draftRootExists: exists(DRAFT_ROOT),
          capcutExists: exists(CAPCUT_EXE),
          capcutRunning: await capcutRunning(),
        })
      }
      return json(req, res, 200, info)
    }
    if (req.method === 'POST' && url.pathname === '/install') {
      if (!(await authorize(req, res))) return
      return await install(req, res)
    }
    return json(req, res, 404, { ok: false, error: 'not_found' })
  } catch (e) {
    try {
      json(req, res, 500, { ok: false, error: String(e.message || e) })
    } catch {
      /* response already started */
    }
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso — o conector provavelmente já está aberto em outra janela.`)
  else console.error(e)
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => {
  const line = '─'.repeat(58)
  console.log(`\n${line}\n  Conector SyncExpress → CapCut  v${VERSION}\n${line}`)
  console.log(`  Pasta do CapCut : ${DRAFT_ROOT}${exists(DRAFT_ROOT) ? '' : '   (ainda não existe — abra o CapCut uma vez)'}`)
  console.log(`  Escutando em    : http://127.0.0.1:${PORT}  (só neste computador)`)
  console.log(`\n  CÓDIGO DE PAREAMENTO:  ${TOKEN}`)
  console.log('  Cole esse código no SyncExpress (Exportar CapCut) na primeira vez.')
  console.log('\n  Deixe esta janela aberta enquanto exporta. Ctrl+C para fechar.\n')
})
