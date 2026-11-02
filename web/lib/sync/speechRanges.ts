/** Keep breathing room and merge nearby speech, cutting only substantial gaps. */
export function speechKeepRanges(intervals: { start: number; end: number }[], duration: number, options: { start: boolean; end: boolean }) {
  const ranges: { start: number; end: number }[] = []
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) continue
    const next = { start: Math.max(0, interval.start - 0.8), end: Math.min(duration, interval.end + 1) }
    if (next.end <= next.start) continue
    const previous = ranges[ranges.length - 1]
    // Do not introduce a jump cut just to remove a fraction of a second.
    if (previous && next.start - previous.end < 0.5) previous.end = Math.max(previous.end, next.end)
    else ranges.push(next)
  }
  if (ranges.length) {
    if (!options.start) ranges[0].start = 0
    if (!options.end) ranges[ranges.length - 1].end = duration
  }
  return ranges
}
