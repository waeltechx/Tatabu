import { describe, expect, it } from 'vitest'
import { cn } from '../src/renderer/src/lib/cn'

describe('cn', () => {
  it('lets a later size win over an earlier one', () => {
    expect(cn('h-8 px-2.5', 'h-7')).toBe('px-2.5 h-7')
  })

  it("keeps the app's own utilities next to colours and weights", () => {
    expect(cn('border-ui border-soft', 'border-strong')).toBe('border-ui border-strong')
    expect(cn('font-head font-bold')).toBe('font-head font-bold')
    expect(cn('shadow-hard', 'text-ink')).toBe('shadow-hard text-ink')
  })
})
