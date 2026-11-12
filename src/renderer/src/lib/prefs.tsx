import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemePref, UiLanguage, UiPrefs } from '@shared/ipc'
import i18n from '@/i18n'

interface PrefsContextValue {
  prefs: UiPrefs
  resolvedTheme: 'light' | 'dark'
  setLanguage: (language: UiLanguage) => void
  setTheme: (theme: ThemePref) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

const darkQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

function applyToDocument(prefs: UiPrefs, theme: 'light' | 'dark'): void {
  const root = document.documentElement
  root.lang = prefs.language
  root.dir = prefs.language === 'ar' ? 'rtl' : 'ltr'
  root.dataset['theme'] = theme
  void i18n.changeLanguage(prefs.language)
  // Animate colour changes only after the first paint, so startup never fades.
  if (!root.dataset['ready']) requestAnimationFrame(() => (root.dataset['ready'] = ''))
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>({ language: 'en', theme: 'system' })
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void window.tatabu.invoke('prefs:get').then((p) => {
      setPrefs(p)
      setReady(true)
    })
    const mq = darkQuery()
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme

  useEffect(() => applyToDocument(prefs, resolvedTheme), [prefs, resolvedTheme])

  const update = useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }))
    void window.tatabu.invoke('prefs:set', patch).then(setPrefs)
  }, [])

  const value = useMemo<PrefsContextValue>(
    () => ({
      prefs,
      resolvedTheme,
      setLanguage: (language) => update({ language }),
      setTheme: (theme) => update({ theme })
    }),
    [prefs, resolvedTheme, update]
  )

  if (!ready) return null
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider')
  return ctx
}
