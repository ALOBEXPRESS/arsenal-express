/**
 * Sound Effects Player using Web Audio API
 * Handles preview playback with volume control and stop functionality
 */

class SFXPlayer {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private audioBuffer: AudioBuffer | null = null
  private loadingUrl: string | null = null

  /**
   * Initialize AudioContext (lazy)
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return this.audioContext
  }

  /**
   * Load audio file from URL
   */
  async load(url: string): Promise<void> {
    // Skip if already loaded
    if (this.loadingUrl === url && this.audioBuffer) {
      return
    }

    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const context = this.getAudioContext()
      this.audioBuffer = await context.decodeAudioData(arrayBuffer)
      this.loadingUrl = url
    } catch (error) {
      console.error('Erro ao carregar áudio:', error)
      throw error
    }
  }

  /**
   * Play the loaded audio
   */
  play(volume: number = 1.0): void {
    if (!this.audioBuffer) {
      console.warn('Áudio não carregado')
      return
    }

    // Stop any currently playing sound
    this.stop()

    const context = this.getAudioContext()

    // Create source
    this.currentSource = context.createBufferSource()
    this.currentSource.buffer = this.audioBuffer

    // Create gain node for volume control
    this.gainNode = context.createGain()
    this.gainNode.gain.value = volume

    // Connect: source -> gain -> destination
    this.currentSource.connect(this.gainNode)
    this.gainNode.connect(context.destination)

    // Play
    this.currentSource.start(0)

    // Auto-cleanup when finished
    this.currentSource.onended = () => {
      this.cleanup()
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (error) {
        // Ignore errors if already stopped
      }
      this.cleanup()
    }
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.currentSource !== null
  }

  /**
   * Cleanup current playback nodes
   */
  private cleanup(): void {
    if (this.currentSource) {
      this.currentSource.disconnect()
      this.currentSource = null
    }
    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.audioBuffer = null
    this.loadingUrl = null
  }
}

// Singleton instance
let playerInstance: SFXPlayer | null = null

export function getSFXPlayer(): SFXPlayer {
  if (!playerInstance) {
    playerInstance = new SFXPlayer()
  }
  return playerInstance
}

export function disposeSFXPlayer(): void {
  if (playerInstance) {
    playerInstance.dispose()
    playerInstance = null
  }
}
