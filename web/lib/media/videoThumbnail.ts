/** Decode an actual frame, with a retry at the start if seeking fails. */
export async function generateVideoThumbnail(file: Blob): Promise<string | undefined> {
  return await capture(file, false) || await capture(file, true)
}

function capture(file: Blob, firstFrame: boolean): Promise<string | undefined> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    let finished = false
    let target = 0
    let positioned = false
    const timer = setTimeout(() => finish(), 12000)
    const finish = (thumbnail?: string) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(thumbnail)
    }
    const draw = () => {
      if (finished || !positioned || video.seeking || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(320 / video.videoWidth, 320 / video.videoHeight)
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return finish()
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.7))
      } catch { finish() }
    }
    video.onloadedmetadata = () => {
      target = firstFrame || !Number.isFinite(video.duration) ? 0 : Math.min(1, video.duration * 0.1)
      positioned = true
      if (Math.abs(video.currentTime - target) > 0.001) video.currentTime = target
      else draw()
    }
    video.onloadeddata = () => { if (Math.abs(video.currentTime - target) < 0.05) draw() }
    video.onseeked = draw
    video.onerror = () => finish()
    video.src = url
    video.load()
  })
}
