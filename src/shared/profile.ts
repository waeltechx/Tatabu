/** The user's own details, printed on every document. */
export interface Profile {
  fullName: string
  headline: string
  phone: string
  email: string
  address: string
  links: string[]
  /** PNG data URL drawn on the signature pad; empty when none. */
  signature: string
}

export const EMPTY_PROFILE: Profile = {
  fullName: '',
  headline: '',
  phone: '',
  email: '',
  address: '',
  links: [],
  signature: ''
}

export type PaperSize = 'A4' | 'Letter'
