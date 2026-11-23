/** ElevenLabs exports begin with this provider name (case insensitive). */
export function isNarrationFilename(filename: string): boolean {
 return /^elevenlabs(?:[_\s.\-]|$)/i.test(filename.trim())
}
