import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { invoke, useAiErrorToast, useErrorToast } from '@/lib/api'

/** Recordings stop on their own after this long (well under Groq's 25 MB limit). */
const MAX_SECONDS = 5 * 60

type State = 'idle' | 'recording' | 'working'

function pickMimeType(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function micError(err: unknown): Error {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return new Error('MIC_DENIED')
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return new Error('MIC_UNAVAILABLE')
  }
  return err instanceof Error ? err : new Error(String(err))
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Press to record, press again to stop. The audio goes to Groq Whisper and
 * the text comes back through `onText`.
 */
export function MicButton({
  onText,
  disabled,
  className
}: {
  onText: (text: string) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const onMicError = useErrorToast()
  const onAiError = useAiErrorToast()
  const [state, setState] = useState<State>('idle')
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  function release(): void {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  // Stop the microphone if the button disappears mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') {
        recorder.current.ondataavailable = null
        recorder.current.onstop = null
        recorder.current.stop()
      }
      release()
    },
    []
  )

  async function send(audio: Uint8Array, mimeType: string): Promise<void> {
    setState('working')
    try {
      const text = await invoke('voice:transcribe', audio, mimeType)
      if (text) onTextRef.current(text)
      else toast.info(t('settings.ai.nothingHeard'))
    } catch (err) {
      onAiError(err, { retry: () => void send(audio, mimeType) })
    } finally {
      setState('idle')
    }
  }

  async function start(): Promise<void> {
    try {
      if (!(await invoke('voice:access'))) throw new Error('MIC_DENIED')
      const media = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err: unknown) => {
        throw micError(err)
      })
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      rec.onstop = () => {
        release()
        const type = rec.mimeType || mimeType || 'audio/webm'
        void new Blob(chunks, { type }).arrayBuffer().then((buf) => send(new Uint8Array(buf), type))
      }
      stream.current = media
      recorder.current = rec
      rec.start()
      setSeconds(0)
      setState('recording')
      const startedAt = Date.now()
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_SECONDS) stop()
      }, 250)
    } catch (err) {
      release()
      setState('idle')
      onMicError(err)
    }
  }

  function stop(): void {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  const label = state === 'recording' ? t('mic.stop') : state === 'working' ? t('mic.working') : t('mic.start')

  return (
    <button
      type="button"
      onClick={() => (state === 'recording' ? stop() : state === 'idle' ? void start() : undefined)}
      disabled={disabled || state === 'working'}
      aria-label={label}
      title={label}
      aria-pressed={state === 'recording'}
      className={clsx(
        'inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-card border-ui border-strong px-3 text-[12px] font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4',
        state === 'recording' ? 'bg-pink text-paper-ink' : 'bg-surface text-ink hover:bg-field',
        className
      )}
    >
      {state === 'working' ? (
        <LoaderCircle className="animate-spin" />
      ) : state === 'recording' ? (
        <>
          <Square className="fill-current" />
          <span className="font-mono tabular-nums" dir="ltr">
            {clock(seconds)}
          </span>
        </>
      ) : (
        <Mic />
      )}
    </button>
  )
}
