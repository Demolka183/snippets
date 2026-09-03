/**
 * Tworzenie i cykl zycia okien.
 *
 * Aplikacja ma trzy okna o roznym charakterze:
 *  - `manager` - zwykle okno do zarzadzania baza, chowa sie do zasobnika,
 *  - `palette` - szybki wybor snippetu, znika po utracie focusu,
 *  - `form`    - pytanie o wartosci pol, blokuje rozwiniecie do odpowiedzi.
 *
 * Paleta i formularz zabieraja focus aplikacji, w ktorej uzytkownik pisze.
 * Dlatego zawsze sa chowane (`hide`), a nie niszczone - ponowne pokazanie jest
 * natychmiastowe, a Windows szybciej oddaje focus poprzedniemu oknu.
 */

import { BrowserWindow, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FormRequest } from '../shared/types.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.join(dirname, '../preload/index.mjs')

/** W dev renderer chodzi z serwera Vite, w produkcji z plikow na dysku. */
function pageUrl(page: string): { url?: string; file?: string } {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) return { url: `${devServer}/${page}` }
  return { file: path.join(dirname, '../renderer', page) }
}

function loadPage(win: BrowserWindow, page: string): void {
  const target = pageUrl(page)
  if (target.url) void win.loadURL(target.url)
  else void win.loadFile(target.file!)
}

const baseWebPreferences = {
  preload: preloadPath,
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false
} as const

let managerWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let formWindow: BrowserWindow | null = null

/** Podnoszone przy zamykaniu aplikacji, zeby `close` nie chowal okna do zasobnika. */
let quitting = false

export function setQuitting(value: boolean): void {
  quitting = value
}

/* ------------------------------------------------------------------ */
/* Okno glowne                                                         */
/* ------------------------------------------------------------------ */

export function showManager(): void {
  if (managerWindow) {
    if (managerWindow.isMinimized()) managerWindow.restore()
    managerWindow.show()
    managerWindow.focus()
    return
  }

  managerWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14161a',
    title: 'Snippety',
    webPreferences: baseWebPreferences
  })

  managerWindow.on('ready-to-show', () => managerWindow?.show())

  // Zamkniecie okna nie konczy aplikacji - rozwijanie ma dzialac dalej w tle.
  managerWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    managerWindow?.hide()
  })

  managerWindow.on('closed', () => {
    managerWindow = null
  })

  // Linki zewnetrzne otwieramy w przegladarce, nie w oknie aplikacji.
  managerWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadPage(managerWindow, 'index.html')
}

export function getManager(): BrowserWindow | null {
  return managerWindow
}

/* ------------------------------------------------------------------ */
/* Paleta szybkiego wyboru                                             */
/* ------------------------------------------------------------------ */

const PALETTE_SIZE = { width: 660, height: 440 }

function ensurePalette(): BrowserWindow {
  if (paletteWindow) return paletteWindow

  paletteWindow = new BrowserWindow({
    ...PALETTE_SIZE,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: baseWebPreferences
  })

  // Klikniecie poza paleta = rezygnacja.
  paletteWindow.on('blur', () => hidePalette())
  paletteWindow.on('closed', () => {
    paletteWindow = null
  })

  loadPage(paletteWindow, 'palette.html')
  return paletteWindow
}

export function togglePalette(): void {
  const win = ensurePalette()
  if (win.isVisible()) {
    hidePalette()
    return
  }
  // Paleta pokazuje sie na ekranie, na ktorym jest kursor - nie zawsze na glownym.
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea
  win.setBounds({
    x: Math.round(x + (width - PALETTE_SIZE.width) / 2),
    y: Math.round(y + height * 0.22),
    ...PALETTE_SIZE
  })
  win.webContents.send('palette:opened')
  win.show()
  win.focus()
}

export function hidePalette(): void {
  if (paletteWindow?.isVisible()) paletteWindow.hide()
}

/* ------------------------------------------------------------------ */
/* Formularz pol                                                       */
/* ------------------------------------------------------------------ */

/** Wysokosc dobierana do liczby pol - okno ma nie miec pustego marginesu. */
function formHeight(request: FormRequest): number {
  const perField = request.fields.reduce((sum, f) => sum + (f.kind === 'multiline' ? 116 : 68), 0)
  return Math.min(640, 132 + perField)
}

let pendingForm: ((values: Record<string, string> | null) => void) | null = null

/**
 * Pokazuje formularz i czeka na odpowiedz.
 * Zwraca `null`, gdy uzytkownik anulowal lub zamknal okno.
 */
export function requestFields(request: FormRequest): Promise<Record<string, string> | null> {
  // Nowe zadanie uniewaznia poprzednie, gdyby jakies wisialo.
  pendingForm?.(null)
  pendingForm = null

  if (!formWindow) {
    formWindow = new BrowserWindow({
      width: 520,
      height: 320,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: baseWebPreferences
    })
    formWindow.on('closed', () => {
      formWindow = null
      pendingForm?.(null)
      pendingForm = null
    })
    loadPage(formWindow, 'form.html')
  }

  const win = formWindow
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const height = formHeight(request)
  const { x, y, width, height: areaHeight } = display.workArea
  win.setBounds({
    x: Math.round(x + (width - 520) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
    width: 520,
    height
  })

  return new Promise((resolve) => {
    pendingForm = resolve
    const send = (): void => win.webContents.send('form:request', request)
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
    win.show()
    win.focus()
  })
}

/** Wolane z IPC po zatwierdzeniu lub anulowaniu formularza. */
export function resolveForm(values: Record<string, string> | null): void {
  formWindow?.hide()
  const resolve = pendingForm
  pendingForm = null
  resolve?.(values)
}

/* ------------------------------------------------------------------ */
/* Wspolne                                                             */
/* ------------------------------------------------------------------ */

/** Czy focus jest w ktoryms z naszych okien - silnik wtedy nie rozwija. */
export function isOwnWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some((w) => w.isFocused())
}

/** Rozsyla zdarzenie do wszystkich zyjacych okien. */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function destroyAllWindows(): void {
  quitting = true
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  managerWindow = null
  paletteWindow = null
  formWindow = null
}
