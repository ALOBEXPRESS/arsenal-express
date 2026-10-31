import { NonRealTimeVAD } from '@ricky0123/vad-web'

/** A reusable local speech detector. No audio is sent to a service. */
export async function createSpeechDetector() {
  const vad = await NonRealTimeVAD.new({
    modelURL: '/vad/silero_vad_legacy.onnx',
    ortConfig: (ort) => { ort.env.wasm.wasmPaths = '/vad/'; ort.env.wasm.numThreads = 1 },
    positiveSpeechThreshold: 0.4,
    negativeSpeechThreshold: 0.25,
    minSpeechMs: 192,
    preSpeechPadMs: 0,
    redemptionMs: 400,
  })
  return async (buffer: AudioBuffer, duration: number, options: { start: boolean; end: boolean }) => {
    const samples = new Float32Array(buffer.length)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels
    }
    let first = Infinity
    let last = 0
    for await (const segment of vad.run(samples, buffer.sampleRate)) {
      first = Math.min(first, segment.start / 1000)
      last = Math.max(last, segment.end / 1000)
    }
    const total = Math.min(duration || buffer.duration, buffer.duration)
    if (!Number.isFinite(first) || last <= first) return null
    const start = options.start ? Math.max(0, first - 0.8) : 0
    const end = options.end ? Math.min(total, last + 1) : total
    return end > start ? { start, end } : null
  }
}
