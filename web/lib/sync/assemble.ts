// Pure planning helpers for Auto Assemble (no I/O, easy to reason about / test).

export const MIN_SLOWDOWN = 0.8

/**
 * How many clips each subproject gets.
 * need_i = narration_i / pace (rounded). Enough clips for everybody → proportional split;
 * not enough → earlier subprojects are filled first, later ones get what is left (maybe none,
 * their narration then stays on the timeline waiting for clips).
 */
export function allocateClips(clipCount: number, narrationDurations: number[], pace: number): number[] {
  const n = narrationDurations.length
  if (n === 0) return []
  if (n === 1) return [clipCount]
  const need = narrationDurations.map((d) => Math.max(1, Math.round(d / pace)))
  const sumNeed = need.reduce((a, b) => a + b, 0)
  if (clipCount < sumNeed) {
    let left = clipCount
    return need.map((k) => {
      const take = Math.min(k, left)
      left -= take
      return take
    })
  }
  // largest remainder
  const exact = need.map((k) => (clipCount * k) / sumNeed)
  const counts = exact.map(Math.floor)
  let rest = clipCount - counts.reduce((a, b) => a + b, 0)
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f)
  for (const { i } of order) {
    if (rest <= 0) break
    counts[i]++
    rest--
  }
  return counts
}

/** Can these clips cover the narration (allowing the 0.8x slow-down)? */
export const canCover = (clipDurations: number[], narration: number) =>
  clipDurations.reduce((a, b) => a + b, 0) / MIN_SLOWDOWN >= narration - 0.05
