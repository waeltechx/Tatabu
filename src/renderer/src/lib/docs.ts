/** Queries for the profile and generated documents. */
import { useQuery } from '@tanstack/react-query'
import { invoke } from './api'

export const docKeys = {
  profile: ['profile'] as const,
  refs: (id: string) => ['refs', id] as const,
  master: ['cv-master'] as const,
  letter: (id: string, lang: string) => ['letter', id, lang] as const,
  cv: (id: string, lang: string) => ['cv', id, lang] as const,
  templates: ['cv-templates'] as const
}

export function useProfile() {
  return useQuery({ queryKey: docKeys.profile, queryFn: () => invoke('profile:get') })
}

/** A short plain name for a file kind, e.g. "PDF". */
export function kindLabel(filename: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]
  return ext ? ext.toUpperCase() : ''
}
