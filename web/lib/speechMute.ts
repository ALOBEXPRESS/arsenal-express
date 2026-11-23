/** Source word timestamps → trimmed, speed-adjusted scene time. Keep pauses intact. */
export function speechMuteRanges(words: {start:number;end:number}[], trim: number, rate: number, duration: number) {
  const ranges: {start:number;end:number}[] = []
  for (const word of [...words].sort((a,b) => a.start-b.start)) {
    const start = Math.max(0, (word.start-trim)/rate - 0.025)
    const end = Math.min(duration, (word.end-trim)/rate + 0.025)
    if (end <= start) continue
    const last = ranges[ranges.length-1]
    if (last && start <= last.end) last.end = Math.max(last.end,end)
    else ranges.push({start,end})
  }
  return ranges
}
