/** Cover letters: state kept per application and language, layouts, and text clean-up. */
import type { FactItem, FactWarning } from './verify'

export const LTR_LAYOUTS = ['classic', 'din5008', 'modern', 'block'] as const
export const RTL_LAYOUTS = ['ar-formal', 'ar-classic', 'ar-modern'] as const
export type LetterLayout = (typeof LTR_LAYOUTS)[number] | (typeof RTL_LAYOUTS)[number]

export function isLetterLayout(v: unknown): v is LetterLayout {
  return (LTR_LAYOUTS as readonly string[]).includes(v as string) || (RTL_LAYOUTS as readonly string[]).includes(v as string)
}

/** The sensible layout for a language: DIN 5008 for German, رسمي عربي for right-to-left, Classic otherwise. */
export function defaultLayout(code: string, dir: 'ltr' | 'rtl'): LetterLayout {
  if (dir === 'rtl') return 'ar-formal'
  return code === 'de' ? 'din5008' : 'classic'
}

/** A remembered layout only counts if it belongs to the language's direction. */
export function layoutFor(code: string, dir: 'ltr' | 'rtl', remembered?: string | null): LetterLayout {
  const family: readonly string[] = dir === 'rtl' ? RTL_LAYOUTS : LTR_LAYOUTS
  return remembered && family.includes(remembered) ? (remembered as LetterLayout) : defaultLayout(code, dir)
}

/** Labels the AI supplies for languages the app has no table for. */
export interface LetterLabels {
  subject?: string
  enclosures?: string
  date?: string
}

export interface LetterState {
  /** Document language id (from Settings → document languages). */
  language: string
  layout: LetterLayout
  subject: string
  /** Subject options from "Prepare". */
  subjects: string[]
  /** Clarifying questions from "Prepare", and the user's answers (facts the letter may use). */
  questions: string[]
  answers: string[]
  /** "Why this company?" in the user's own words. */
  motivation: string
  recipient: string
  body: string
  /** Labels of the attachments listed under the letter. */
  enclosures: string[]
  signature: boolean
  /** AI-written sentences with the sources they cite (only these are checked). */
  items: FactItem[]
  warnings: FactWarning[]
  labels: LetterLabels
  /** ISO date printed on the letter. */
  date: string
  /** Set once the AI has written this letter. */
  generatedAt: string
}

export const EMPTY_LETTER: LetterState = {
  language: 'en',
  layout: 'classic',
  subject: '',
  subjects: [],
  questions: [],
  answers: [],
  motivation: '',
  recipient: '',
  body: '',
  enclosures: [],
  signature: true,
  items: [],
  warnings: [],
  labels: {},
  date: '',
  generatedAt: ''
}

/** Things the letter screen offers as enclosures: the application's files and the library. */
export interface EnclosureOption {
  label: string
  from: 'application' | 'library'
}

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length
}

/**
 * Removes the usual AI tells (port of the reference `sanitize_cover_letter`):
 * dashes used as pauses, curly quotes, ellipsis characters, invisible characters
 * and markdown. Arabic letters keep their own punctuation.
 */
export function sanitizeLetter(text: string, code = 'en'): string {
  if (!text) return ''
  const arabicScript = code === 'ar' || code === 'fa' || code === 'ur'
  let s = String(text)
  s = s.replace(/[‐‑‒−]/g, '-')
  s = s.replace(/,?\s*[–—]\s*,?/g, arabicScript ? '، ' : ', ')
  if (!arabicScript) {
    s = s.replace(/[‘’‚‛′]/g, "'")
    s = s.replace(/[“”„‟«»″]/g, '"')
  }
  s = s.replace(/…/g, '...')
  s = s.replace(/[   ]/g, ' ')
  s = s.replace(/[​‌‍﻿]/g, '')
  if (!arabicScript) s = s.replace(/[‎‏]/g, '')
  s = s.replace(/[*#`•‣⁃◦·▪▫▸]/g, '')
  s = s.replace(/[ \t]+([,.:;?!،؛؟])/g, '$1')
  s = s.replace(/([,،])\s*[,،]+/g, '$1 ')
  s = s.replace(/[,،]\s*\./g, '.')
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
