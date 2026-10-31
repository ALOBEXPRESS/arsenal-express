/** Layout a generated image bar without changing the image's aspect ratio. */
export function barLayout(options: {
  canvasWidth: number; canvasHeight: number; mediaWidth: number; mediaHeight: number
  position: 'top' | 'bottom'; storedHeight: number; storedY: number; auto: boolean
}) {
  const { canvasWidth: cw, canvasHeight: ch, mediaWidth: mw, mediaHeight: mh } = options
  if (!(cw > 0 && ch > 0 && mw > 0 && mh > 0)) return null
  // Leave at least half the canvas visible when both automatic bars are enabled.
  const height = options.auto ? Math.min(0.25, (cw * mh / mw) / ch) : Math.min(1, Math.max(0.001, options.storedHeight))
  const baseScale = Math.min(cw / mw, ch / mh)
  const targetScale = Math.min(cw / mw, ch * height / mh)
  const sign = options.position === 'top' ? 1 : -1
  const offset = options.storedY - sign * (1 - options.storedHeight)
  return { height, scale: targetScale / baseScale, y: sign * (1 - height) + offset }
}
