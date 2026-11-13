/** Speech to text with Groq Whisper (the "voice" role). */
import { AiError, aiRequest, type FetchFn } from './http'
import { PROVIDERS, VOICE_MODEL } from './providers'

/** Groq's upload limit for transcription. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a'
}

/** "audio/webm;codecs=opus" → "audio/webm" (unknown types are sent as webm, what Chromium records). */
export function audioType(mimeType: string): { type: string; ext: string } {
  const type = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  const ext = EXTENSIONS[type]
  return ext ? { type, ext } : { type: 'audio/webm', ext: 'webm' }
}

/** Returns the spoken text. `language` is an ISO-639-1 hint; leave it out to let Whisper detect it. */
export async function transcribe(
  fetchFn: FetchFn,
  key: string,
  audio: Uint8Array,
  mimeType: string,
  language?: string
): Promise<string> {
  if (audio.byteLength === 0) throw new AiError('AUDIO_EMPTY')
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new AiError('AUDIO_TOO_LARGE')

  const { type, ext } = audioType(mimeType)
  const form = new FormData()
  form.append('file', new Blob([audio as Uint8Array<ArrayBuffer>], { type }), `recording.${ext}`)
  form.append('model', VOICE_MODEL)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (language && /^[a-z]{2}$/.test(language)) form.append('language', language)

  const reply = await aiRequest(fetchFn, { baseUrl: PROVIDERS.groq.baseUrl, key }, 'audio/transcriptions', {
    form,
    timeoutMs: 120_000
  })
  const text = reply && typeof reply === 'object' ? (reply as { text?: unknown }).text : null
  return typeof text === 'string' ? text.trim() : ''
}
