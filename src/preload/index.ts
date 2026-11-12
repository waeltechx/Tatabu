import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type TatabuApi } from '@shared/ipc'

const allowed = new Set<string>(IPC_CHANNELS)

const api: TatabuApi = {
  invoke(channel, ...args) {
    if (!allowed.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel as IpcChannel, ...args)
  }
}

contextBridge.exposeInMainWorld('tatabu', api)
