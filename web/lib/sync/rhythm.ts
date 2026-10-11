// "Ritmo variável": scene cuts land on real speech pauses, so each scene lasts as long
// as the phrase being spoken (long phrases stay longer, short ones pass quickly).
// Same thresholds as the CLI (config.yaml -> audio.silencio).

export const SILENCE_DB = -35
export const SILENCE_MIN = 0.3 // seconds
const WINDOW = 0.02 // 20ms RMS windows
const MIN_SCENE = 1.5
const MIN_SLOWDOWN = 0.8

export interface Pause {
  start: number
  end: number
}

/** Detects pauses in decoded audio (mono-mixed RMS below threshold for >= minDur) */
export function detectPauses(buffer: AudioBuffer, thresholdDb = SILENCE_DB, minDur = SILENCE_MIN): Pause[] {
  const { sampleRate, numberOfChannels, length } = buffer
  const channels = Array.from({ length: numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const win = Math.max(1, Math.floor(sampleRate * WINDOW))
  const threshold = Math.pow(10, thresholdDb / 20)
  const pauses: Pause[] = []
  let silentStart = -1

  for (let i = 0; i < length; i += win) {
    let sum = 0
    const end = Math.min(length, i + win)
    for (let j = i; j < end; j++) {
      let s = 0
      for (const ch of channels) s += ch[j]
      s /= numberOfChannels
      sum += s * s
    }
    const rms = Math.sqrt(sum / (end - i))
    const t = i / sampleRate
    if (rms < threshold) {
      if (silentStart < 0) silentStart = t
    } else if (silentStart >= 0) {
      if (t - silentStart >= minDur) pauses.push({ start: silentStart, end: t })
      silentStart = -1
    }
  }
  const total = length / sampleRate
  if (silentStart >= 0 && total - silentStart >= minDur) pauses.push({ start: silentStart, end: total })
  return pauses
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
}

interface Candidate {
  t: number
  /** extra cost for using this cut (0 = real pause, >0 = forced grid point) */
  penalty: number
}

/**
 * Picks N-1 cut points for N clips over a narration of `total` seconds.
 * Dynamic programming over candidate cuts (pause midpoints + a fallback grid) minimizing:
 *  - scenes longer than what the clip can cover (needs frame hold) — heavy
 *  - scenes shorter than MIN_SCENE — forbidden
 *  - cuts not on a pause — penalized
 *  - a light pull toward the average so one scene doesn't swallow a whole paragraph
 * Returns scene durations (sum === total).
 */
export function planVariableRhythm(clipDurations: number[], total: number, pauses: Pause[]): number[] {
  const n = clipDurations.length
  if (n === 0) return []
  if (n === 1) return [total]

  const avg = total / n
  const candidates: Candidate[] = [{ t: 0, penalty: 0 }]
  for (const p of pauses) {
    const mid = (p.start + p.end) / 2
    if (mid > MIN_SCENE * 0.5 && mid < total - MIN_SCENE * 0.5) candidates.push({ t: mid, penalty: 0 })
  }
  // Fallback grid guarantees a solution even with almost no pauses
  for (let t = 0.5; t < total; t += 0.5) candidates.push({ t, penalty: 6 })
  candidates.push({ t: total, penalty: 0 })
  candidates.sort((a, b) => a.t - b.t)

  const m = candidates.length
  const last = m - 1
  const INF = Number.POSITIVE_INFINITY
  // cost[k][j]: best cost using k scenes ending exactly at candidate j
  let prevCost = new Float64Array(m).fill(INF)
  prevCost[0] = 0
  const back: Int32Array[] = []

  const sceneCost = (k: number, d: number) => {
    if (d < MIN_SCENE) return INF
    // Infinity = still image: it can fill any length
    const capacity = (clipDurations[k] || avg) / MIN_SLOWDOWN
    const over = Number.isFinite(capacity) ? Math.max(0, d - capacity) : 0
    const dev = (d - avg) / avg
    return over * over * 8 + dev * dev * 1.5
  }

  for (let k = 0; k < n; k++) {
    const cur = new Float64Array(m).fill(INF)
    const from = new Int32Array(m).fill(-1)
    // limit scene length to keep it O(n*m*w)
    const cap = (clipDurations[k] || avg) / MIN_SLOWDOWN
    const maxLen = Number.isFinite(cap) ? Math.max(avg * 3, cap + 2) : avg * 3
    for (let j = 1; j < m; j++) {
      if (k === n - 1 && j !== last) continue
      const tj = candidates[j].t
      for (let i = j - 1; i >= 0; i--) {
        const d = tj - candidates[i].t
        if (d > maxLen) break
        if (prevCost[i] === INF) continue
        const c = prevCost[i] + sceneCost(k, d) + (j === last ? 0 : candidates[j].penalty)
        if (c < cur[j]) {
          cur[j] = c
          from[j] = i
        }
      }
    }
    back.push(from)
    prevCost = cur
  }

  if (prevCost[last] === INF) return clipDurations.map(() => total / n)

  const cuts: number[] = []
  let j = last
  for (let k = n - 1; k >= 0; k--) {
    cuts.push(candidates[j].t)
    j = back[k][j]
  }
  cuts.push(0)
  cuts.reverse()
  return cuts.slice(1).map((t, i) => Math.round((t - cuts[i]) * 1000) / 1000)
}
