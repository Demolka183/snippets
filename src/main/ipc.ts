/**
 * Most miedzy procesem glownym a oknami.
 *
 * Renderer nie ma dostepu do Node - wszystko, co dotyka dysku, klawiatury
 * i ustawien systemowych, przechodzi przez kanaly zdefiniowane tutaj.
 * Kazda zmiana bazy konczy sie `refreshIndex()` i rozgloszeniem zdarzenia,
 * zeby wszystkie okna widzialy ten sam stan.
 */

import { app, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import type { Settings, SnippetInput } from '../shared/types.js'
import { insertSnippetById, refreshIndex } from './expansion/engine.js'
import { collectFields, render } from './expansion/placeholders.js'
import * as store from './store/index.js'
import { applyAutostart, applyPaletteHotkey, refreshTrayMenu } from './system.js'
import { broadcast, hidePalette, resolveForm, showManager } from './windows.js'

/** Lista wydan - jedyny zewnetrzny adres, jaki aplikacja kiedykolwiek otwiera. */
const RELEASES_URL = 'https://github.com/Demolka183/snippets/releases'

/** Zmiana bazy: przebuduj indeks triggerow i powiadom okna. */
function afterChange(): void {
  refreshIndex()
  broadcast('snippets:changed')
}

export function registerIpc(): void {
  /* --- snippety --- */

  ipcMain.handle('snippets:list', () => store.listSnippets())

  ipcMain.handle('snippets:create', (_e, input: SnippetInput) => {
    const created = store.createSnippet(input)
    afterChange()
    return created
  })

  ipcMain.handle('snippets:update', (_e, id: string, patch: Partial<SnippetInput>) => {
    const updated = store.updateSnippet(id, patch)
    afterChange()
    return updated
  })

  ipcMain.handle('snippets:delete', (_e, id: string) => {
    const removed = store.deleteSnippet(id)
    afterChange()
    return removed
  })

  ipcMain.handle('snippets:checkTrigger', (_e, trigger: string, exceptId?: string) =>
    store.checkTrigger(trigger, exceptId)
  )

  /** Podglad tresci z podstawionymi zmiennymi - bez pytania o pola. */
  ipcMain.handle('snippets:preview', (_e, content: string) => {
    const { text } = render(content, { clipboard: '(zawartosc schowka)' })
    return { text, fields: collectFields(content) }
  })

  /* --- foldery --- */

  ipcMain.handle('folders:list', () => store.listFolders())
  ipcMain.handle('folders:create', (_e, name: string) => {
    const folder = store.createFolder(name)
    afterChange()
    return folder
  })
  ipcMain.handle('folders:rename', (_e, id: string, name: string) => {
    store.renameFolder(id, name)
    afterChange()
  })
  ipcMain.handle('folders:delete', (_e, id: string) => {
    store.deleteFolder(id)
    afterChange()
  })

  /* --- ustawienia --- */

  ipcMain.handle('settings:get', () => store.getSettings())

  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const next = store.updateSettings(patch)
    if (patch.paletteHotkey !== undefined) applyPaletteHotkey(next.paletteHotkey)
    if (patch.autostart !== undefined) applyAutostart(next.autostart)
    refreshTrayMenu()
    refreshIndex()
    broadcast('settings:changed', next)
    return next
  })

  /* --- paleta i formularz --- */

  ipcMain.handle('palette:insert', async (_e, id: string) => {
    hidePalette()
    return insertSnippetById(id)
  })
  ipcMain.on('palette:hide', () => hidePalette())

  ipcMain.on('form:submit', (_e, values: Record<string, string>) => resolveForm(values))
  ipcMain.on('form:cancel', () => resolveForm(null))

  /* --- aplikacja --- */

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    paths: store.storePaths()
  }))

  ipcMain.handle('app:openDataFolder', () => shell.showItemInFolder(store.storePaths().snippets))

  // Adres jest stala po stronie procesu glownego. Renderer nie moze podac
  // dowolnego URL-a - kanal otwiera wylacznie to jedno miejsce.
  ipcMain.handle('app:openReleases', () => shell.openExternal(RELEASES_URL))

  ipcMain.handle('app:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog({
      title: 'Eksport snippetow',
      defaultPath: `snippety-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false as const }
    await fs.writeFile(result.filePath, store.exportAll(), 'utf8')
    return { ok: true as const, path: result.filePath }
  })

  ipcMain.handle('app:import', async (_e, replaceExisting: boolean) => {
    const result = await dialog.showOpenDialog({
      title: 'Import snippetow',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false as const }
    try {
      const raw = await fs.readFile(result.filePaths[0], 'utf8')
      const summary = store.importAll(raw, replaceExisting)
      afterChange()
      return { ok: true as const, summary }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('app:showManager', () => showManager())
}
