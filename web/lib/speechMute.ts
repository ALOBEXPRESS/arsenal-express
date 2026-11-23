/** Source word timestamps → trimmed, speed-adjusted scene time. Keep pauses intact. */
export function speechMuteRanges(words: {start:number;end:number}[], trim: number, rate: number, duration: number, detected?: {start:number;end:number}[]) {
  const ranges: {start:number;end:number}[] = []
  // Reject Whisper hallucinations where the acoustic detector finds no nearby speech.
  const confirmed = detected ? words.filter(w => detected.some(v => w.end > v.start - 0.2 && w.start < v.end + 0.2)) : words
  for (const word of [...confirmed, ...(detected || [])].sort((a,b) => a.start-b.start)) {
    const start = Math.max(0, (word.start-trim)/rate - 0.06)
    const end = Math.min(duration, (word.end-trim)/rate + 0.08)
    if (end <= start) continue
    const last = ranges[ranges.length-1]
    if (last && start <= last.end) last.end = Math.max(last.end,end)
    else ranges.push({start,end})
  }
  return ranges
}
