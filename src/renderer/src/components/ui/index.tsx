/** Small building blocks in the app's flat, hard-edged style. */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'paper'

const buttonVariants: Record<ButtonVariant, string> = {
  default: 'border-strong bg-surface text-ink hover:bg-field',
  primary: 'border-strong bg-yellow text-on-accent shadow-hard',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
  // Light button that stays light on coloured cards in both themes.
  paper: 'border-paper-ink bg-[#fffdf9] text-paper-ink hover:bg-white'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'sm' }
>(function Button({ variant = 'default', size = 'md', className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-card border-ui font-semibold whitespace-nowrap',
        'transition-[transform,background-color] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        size === 'md' ? 'h-8 px-3 text-[12.5px]' : 'h-7 px-2.5 text-[12px] [&_svg]:size-3.5',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  )
})

export const inputClass =
  'h-8 w-full min-w-0 rounded-card border-ui border-soft bg-field px-2.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-strong'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />
})

export function FieldLabel({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mt-3 mb-1.5 block text-[12px] font-semibold', className)}>
      {children}
    </label>
  )
}

export function Card({
  number,
  label,
  title,
  description,
  tone = 'surface',
  className,
  children
}: {
  number: string
  label: string
  title: string
  description?: string
  tone?: 'surface' | 'violet'
  className?: string
  children: ReactNode
}) {
  const violet = tone === 'violet'
  return (
    <section
      className={cn(
        'rounded-card border-ui border-strong px-3.5 py-3',
        violet ? 'bg-purple text-paper-ink' : 'bg-surface',
        className
      )}
    >
      {/* The section label rides on the title line, small, instead of a line of its own. */}
      <div className="mb-0.5 flex items-baseline justify-between gap-3">
        <h2 className="font-head text-[15px] leading-snug font-bold">{title}</h2>
        <span className={cn('label-mono shrink-0', violet && '!text-[#4a4560]')} aria-hidden>
          {number} / {label}
        </span>
      </div>
      {description && (
        <p className={cn('mb-2.5 text-[12px] leading-[1.45]', violet ? 'text-[#4a4560]' : 'text-muted')}>{description}</p>
      )}
      {children}
    </section>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-card border-ui px-2.5 text-[12.5px] whitespace-nowrap [&_svg]:size-3.5',
              on ? 'border-strong bg-yellow font-semibold text-on-accent' : 'border-soft bg-field font-medium text-ink'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-[14px] border-ui border-strong',
        checked ? 'bg-yellow' : 'bg-field'
      )}
    >
      <span
        className={cn(
          'absolute top-[2.5px] size-3 rounded-full transition-[inset]',
          checked ? 'end-[3px] bg-[#202329]' : 'start-[3px] bg-muted'
        )}
      />
    </button>
  )
}

const chipTones = { green: 'bg-green', purple: 'bg-purple', yellow: 'bg-yellow', blue: 'bg-blue', pink: 'bg-pink' }

export function Chip({ tone, icon, children }: { tone: keyof typeof chipTones; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-[5px] border-ui border-paper-ink px-2 text-[11px] font-medium whitespace-nowrap text-paper-ink [&_svg]:size-3',
        chipTones[tone]
      )}
    >
      {icon}
      {children}
    </span>
  )
}
