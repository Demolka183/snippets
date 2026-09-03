/**
 * Punkt wejscia procesu glownego.
 *
 * Kolejnosc startu ma znaczenie: najpierw dane (bo silnik i UI ich potrzebuja),
 * potem IPC, potem integracja z systemem, a nasluch klawiatury na koncu -
 * zeby zadne zdarzenie nie trafilo do jeszcze nieskonfigurowanego silnika.
 */

import { app, BrowserWindow } from 'electron'
import { startEngine, stopEngine } from './expansion/engine.js'
import { registerIpc } from './ipc.js'
import { initLog, log } from './log.js'
import { getSettings, flushStores, initStores } from './store/index.js'
import {
  applyAutostart,
  applyPaletteHotkey,
  createTray,
  destroyTray,
  launchedHidden,
  releaseHotkeys
} from './system.js'
import {
  broadcast,
  isOwnWindowFocused,
  requestFields,
  setQuitting,
  showManager
} from './windows.js'

// Druga instancja przejelaby hook klawiatury i skrot - dopuszczamy tylko jedna.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showManager())
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  initLog()
  initStores()
  registerIpc()

  const settings = getSettings()
  createTray()
  applyPaletteHotkey(settings.paletteHotkey)
  applyAutostart(settings.autostart)

  startEngine({
    requestFields,
    isOwnWindowFocused,
    onExpanded: (event) => broadcast('expansion:done', event)
  })

  log('start', `hook wystartowal, skrot palety: ${settings.paletteHotkey}`)

  if (!settings.startMinimized && !launchedHidden()) showManager()

  // Na macOS klikniecie w doku otwiera okno na nowo; na Windows robi to zasobnik.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) showManager()
  })
}

// Aplikacja rezydentna: zamkniecie ostatniego okna nie konczy procesu.
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  setQuitting(true)
  stopEngine()
  releaseHotkeys()
  flushStores()
  destroyTray()
})

// Awaryjne sprzatanie - bez tego hook potrafi zostac po ubiciu procesu.
process.on('exit', () => stopEngine())
