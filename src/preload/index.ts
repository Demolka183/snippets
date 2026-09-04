/**
 * Most do renderera.
 *
 * Renderer nie dostaje `ipcRenderer` ani niczego z Node - tylko funkcje
 * wypisane ponizej. Kazdy nowy kanal trzeba tu dodac swiadomie; to jest
 * cala powierzchnia, przez ktora UI moze cokolwiek zrobic systemowi.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  FieldSpec,
  Folder,
  FormRequest,
  ImportSummary,
  Settings,
  Snippet,
  SnippetInput,
  SnippetyApi,
  TriggerCheck
} from '../shared/types.js'

/** Rejestruje nasluch i zwraca funkcje odpinajaca - React sprzata w useEffect. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener as (...args: unknown[]) => void)
  return () => ipcRenderer.removeListener(channel, listener as (...args: unknown[]) => void)
}

const api: SnippetyApi = {
  snippets: {
    list: (): Promise<Snippet[]> => ipcRenderer.invoke('snippets:list'),
    create: (input: SnippetInput): Promise<Snippet> => ipcRenderer.invoke('snippets:create', input),
    update: (id: string, patch: Partial<SnippetInput>): Promise<Snippet | null> =>
      ipcRenderer.invoke('snippets:update', id, patch),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('snippets:delete', id),
    checkTrigger: (trigger: string, exceptId?: string): Promise<TriggerCheck> =>
      ipcRenderer.invoke('snippets:checkTrigger', trigger, exceptId),
    preview: (content: string): Promise<{ text: string; fields: FieldSpec[] }> =>
      ipcRenderer.invoke('snippets:preview', content)
  },

  folders: {
    list: (): Promise<Folder[]> => ipcRenderer.invoke('folders:list'),
    create: (name: string): Promise<Folder> => ipcRenderer.invoke('folders:create', name),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('folders:rename', id, name),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('folders:delete', id)
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch)
  },

  palette: {
    insert: (id: string): Promise<boolean> => ipcRenderer.invoke('palette:insert', id),
    hide: (): void => ipcRenderer.send('palette:hide')
  },

  form: {
    submit: (values: Record<string, string>): void => ipcRenderer.send('form:submit', values),
    cancel: (): void => ipcRenderer.send('form:cancel')
  },

  app: {
    info: (): Promise<{ version: string; paths: { snippets: string; settings: string } }> =>
      ipcRenderer.invoke('app:info'),
    exportToFile: (): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('app:export'),
    importFromFile: (replaceExisting: boolean): Promise<{
      ok: boolean
      summary?: ImportSummary
      error?: string
    }> => ipcRenderer.invoke('app:import', replaceExisting),
    openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:openDataFolder'),
    openReleases: (): Promise<void> => ipcRenderer.invoke('app:openReleases'),
    showManager: (): Promise<void> => ipcRenderer.invoke('app:showManager')
  },

  on: {
    snippetsChanged: (fn: () => void) => subscribe<void>('snippets:changed', fn),
    settingsChanged: (fn: (s: Settings) => void) => subscribe<Settings>('settings:changed', fn),
    paletteOpened: (fn: () => void) => subscribe<void>('palette:opened', fn),
    formRequest: (fn: (req: FormRequest) => void) => subscribe<FormRequest>('form:request', fn)
  }
}

contextBridge.exposeInMainWorld('api', api)
