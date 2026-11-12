import type { TatabuApi } from '../shared/ipc'

declare global {
  interface Window {
    tatabu: TatabuApi
  }
}

export {}
