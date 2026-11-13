import { useEffect, useRef, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

const W = 520
const H = 150

/** A canvas signature pad: dark ink on a transparent PNG, so it sits cleanly on any letter. */
export function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const loaded = useRef(false)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || loaded.current) return
    if (!value) return
    loaded.current = true
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, W, H)
    img.src = value
  }, [value])

  function pos(e: PointerEvent): { x: number; y: number } {
    const r = canvas.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }
  }
  function start(e: PointerEvent): void {
    drawing.current = true
    loaded.current = true
    last.current = pos(e)
    canvas.current?.setPointerCapture(e.pointerId)
  }
  function move(e: PointerEvent): void {
    if (!drawing.current) return
    const ctx = canvas.current!.getContext('2d')!
    const p = pos(e)
    ctx.strokeStyle = '#1d2433'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  function end(): void {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvas.current!.toDataURL('image/png'))
  }
  function clear(): void {
    canvas.current!.getContext('2d')!.clearRect(0, 0, W, H)
    onChange('')
  }

  return (
    <div>
      <div className="relative rounded-card border-ui border-soft bg-[#fffdf9]">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label={t('profile.signaturePad')}
          className="block w-full touch-none"
          style={{ aspectRatio: `${W} / ${H}`, cursor: 'crosshair' }}
        />
        <span className="pointer-events-none absolute inset-x-5 bottom-5 h-px bg-[#d9d7d0]" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="label-mono">{t('profile.drawHint')}</span>
        <button type="button" onClick={clear} className="cursor-pointer text-[12.5px] font-medium text-ink hover:underline">
          {t('profile.clear')}
        </button>
      </div>
    </div>
  )
}
