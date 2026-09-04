/**
 * Integracja z systemem: zasobnik, autostart, globalny skrot.
 *
 * Aplikacja jest z zalozenia rezydentna - okno jest tylko widokiem na baze,
 * a wlasciwa praca dzieje sie w tle. Zasobnik jest wiec jedynym stalym
 * punktem wejscia i musi pokazywac, czy rozwijanie jest wlaczone.
 */

import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.js'
import { getSettings, updateSettings } from './store/index.js'
import { broadcast, showManager, togglePalette } from './windows.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null

/** Ikona zasobnika - w produkcji z zasobow, w dev ze zrodel projektu. */
function trayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(dirname, '../../resources/icon.png')
  ]
  for (const file of candidates) {
    const image = nativeImage.createFromPath(file)
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

export function createTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip('Snippety')
  tray.on('click', () => showManager())
  refreshTrayMenu()
}

/** Odswieza menu - stan "wlaczone" musi zgadzac sie z ustawieniami. */
export function refreshTrayMenu(): void {
  if (!tray) return
  const settings = getSettings()

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Otworz Snippety', click: () => showManager() },
      {
        label: 'Szybki wybor',
        accelerator: settings.paletteHotkey,
        click: () => togglePalette()
      },
      { type: 'separator' },
      {
        label: 'Rozwijanie wlaczone',
        type: 'checkbox',
        checked: settings.enabled,
        click: (item) => {
          const next = updateSettings({ enabled: item.checked })
          broadcast('settings:changed', next)
          refreshTrayMenu()
        }
      },
      { type: 'separator' },
      { label: 'Zakoncz', click: () => app.quit() }
    ])
  )

  tray.setToolTip(settings.enabled ? 'Snippety - rozwijanie wlaczone' : 'Snippety - wstrzymane')
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/* ------------------------------------------------------------------ */
/* Globalny skrot                                                      */
/* ------------------------------------------------------------------ */

let currentHotkey: string | null = null

/**
 * Rejestruje skrot palety. Zwraca `false`, gdy kombinacje przejal juz
 * inny program - UI ma wtedy o tym powiedziec zamiast udawac, ze dziala.
 */
export function applyPaletteHotkey(accelerator: string): boolean {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    currentHotkey = null
  }
  if (!accelerator) return true
  try {
    const ok = globalShortcut.register(accelerator, () => togglePalette())
    if (ok) currentHotkey = accelerator
    return ok
  } catch (err) {
    log('system', `nie udalo sie zarejestrowac skrotu ${accelerator}`, err)
    return false
  }
}

export function releaseHotkeys(): void {
  globalShortcut.unregisterAll()
  currentHotkey = null
}

/* ------------------------------------------------------------------ */
/* Autostart                                                           */
/* ------------------------------------------------------------------ */

export function applyAutostart(enabled: boolean): void {
  // W trybie deweloperskim nie dotykamy autostartu - wpis wskazywalby na electron.exe.
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // Start z systemem ma byc cichy - okno pokaze sie dopiero na zadanie.
    args: ['--hidden']
  })
}

export function launchedHidden(): boolean {
  return process.argv.includes('--hidden')
}
