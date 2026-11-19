/**
 * Joins class names and lets a later Tailwind class win over an earlier one of
 * the same kind, so `cn(inputClass, 'h-7')` really is 28px tall (plain `clsx`
 * keeps both heights and the stylesheet order decides).
 */
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      // The app's own utilities (styles.css), so they aren't read as colours or weights.
      'border-w': ['border-ui'],
      shadow: ['shadow-hard'],
      'font-family': ['font-head', 'font-body', 'font-mono', 'font-logo']
    }
  }
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
