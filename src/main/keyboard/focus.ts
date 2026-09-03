/**
 * Zapamietywanie i przywracanie okna pierwszoplanowego (Win32).
 *
 * Problem, ktory ten modul rozwiazuje: okno formularza i paleta musza przejac
 * focus, zeby uzytkownik mogl w nich pisac. Po ich schowaniu Windows sam
 * decyduje, komu odda focus - i jesli nasze okno glowne jest otwarte, oddaje
 * go wlasnie jemu, a nie aplikacji, w ktorej uzytkownik pisal. Wklejany tekst
 * lecial wtedy w nasze wlasne okno zamiast do celu.
 *
 * Rozwiazanie: zapamietujemy uchwyt okna docelowego, zanim je zaslonimy,
 * i jawnie je przywracamy przez `SetForegroundWindow`.
 *
 * Druga polowa problemu jest lustrzana: samo `win.show()` + `win.focus()` NIE
 * przejmuje pierwszego planu, bo Windows blokuje to procesom dzialajacym
 * w tle - a nasz proces wlasnie taki jest, klawiature czyta biernie z hooka.
 * Okno formularza pojawialo sie wiec bez focusu i wpisywany tekst leciai do
 * aplikacji pod spodem. Stad `forceFocusOwnWindow`.
 *
 * Ten modul jest jedynym miejscem w projekcie, ktore wola Win32 bezposrednio.
 * Poza Windows wszystkie funkcje sa cichymi no-opami.
 */

import koffi from 'koffi'
import { log } from '../log.js'

const isWindows = process.platform === 'win32'

interface Win32 {
  GetForegroundWindow: () => unknown
  SetForegroundWindow: (hwnd: unknown) => boolean
  IsWindow: (hwnd: unknown) => boolean
  GetWindowThreadProcessId: (hwnd: unknown, pid: Uint32Array) => number
  AttachThreadInput: (from: number, to: number, attach: boolean) => boolean
  GetWindowTextW: (hwnd: unknown, out: Uint16Array, max: number) => number
  GetCurrentThreadId: () => number
}

/** Ladowane leniwie - blad ladowania nie moze wywrocic startu aplikacji. */
let win32: Win32 | null = null
let loadFailed = false

function api(): Win32 | null {
  if (win32 || loadFailed || !isWindows) return win32
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    win32 = {
      GetForegroundWindow: user32.func('void* GetForegroundWindow()'),
      SetForegroundWindow: user32.func('bool SetForegroundWindow(void* hWnd)'),
      IsWindow: user32.func('bool IsWindow(void* hWnd)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 GetWindowThreadProcessId(void* hWnd, _Out_ uint32* lpdwProcessId)'
      ),
      AttachThreadInput: user32.func('bool AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool fAttach)'),
      GetWindowTextW: user32.func('int GetWindowTextW(void* hWnd, _Out_ uint16* lpString, int nMaxCount)'),
      GetCurrentThreadId: kernel32.func('uint32 GetCurrentThreadId()')
    }
  } catch (err) {
    loadFailed = true
    log('focus', 'nie udalo sie zaladowac user32/kernel32', err)
  }
  return win32
}

/** Uchwyt okna, do ktorego mamy wrocic. */
let saved: unknown = null

/** Tytul okna - tylko do logow diagnostycznych. */
function windowTitle(hwnd: unknown): string {
  const w = api()
  if (!w || !hwnd) return '?'
  const buf = new Uint16Array(256)
  const n = w.GetWindowTextW(hwnd, buf, 256)
  return n > 0 ? Buffer.from(buf.buffer, 0, n * 2).toString('utf16le') : '(bez tytulu)'
}

/** Czy okno nalezy do naszego procesu. */
function isOwnProcess(hwnd: unknown): boolean {
  const w = api()
  if (!w || !hwnd) return false
  const pid = new Uint32Array(1)
  w.GetWindowThreadProcessId(hwnd, pid)
  return pid[0] === process.pid
}

/**
 * Zapamietuje aktualne okno pierwszoplanowe.
 * Wolane tuz przed pokazaniem palety albo formularza.
 *
 * Okna wlasnego procesu sa pomijane - gdyby uzytkownik wywolal palete
 * z naszego okna glownego, nie ma dokad wracac.
 */
export function rememberForeground(): void {
  const w = api()
  if (!w) return
  const hwnd = w.GetForegroundWindow()
  if (!hwnd || isOwnProcess(hwnd)) {
    saved = null
    log('focus', 'brak okna docelowego do zapamietania')
    return
  }
  saved = hwnd
  log('focus', `zapamietano okno: ${windowTitle(hwnd)}`)
}

/**
 * Przywraca zapamietane okno na pierwszy plan.
 * @returns czy udalo sie przywrocic (false takze gdy nic nie bylo zapamietane)
 */
export function restoreForeground(): boolean {
  const w = api()
  const target = saved
  saved = null
  if (!w || !target) return false

  if (!w.IsWindow(target)) {
    log('focus', 'zapamietane okno juz nie istnieje')
    return false
  }

  if (w.SetForegroundWindow(target)) {
    log('focus', `przywrocono okno: ${windowTitle(target)}`)
    return true
  }

  // Windows blokuje SetForegroundWindow procesom, ktore nie sa na pierwszym
  // planie. Udokumentowane obejscie: przypiac wejscie naszego watku do watku
  // okna, ktore *aktualnie* jest na pierwszym planie - dopiero wtedy system
  // traktuje nas jak uprawnionych do oddania focusu dalej.
  const ourThread = w.GetCurrentThreadId()
  const foregroundThread = w.GetWindowThreadProcessId(w.GetForegroundWindow(), new Uint32Array(1))
  if (!foregroundThread || ourThread === foregroundThread) return false

  w.AttachThreadInput(ourThread, foregroundThread, true)
  const ok = w.SetForegroundWindow(target)
  w.AttachThreadInput(ourThread, foregroundThread, false)

  log('focus', ok ? 'przywrocono okno (przez AttachThreadInput)' : 'NIE UDALO SIE przywrocic okna')
  return ok
}

/**
 * Wymusza pierwszy plan dla wlasnego okna.
 *
 * @param handle wynik `BrowserWindow.getNativeWindowHandle()`
 */
export function forceFocusOwnWindow(handle: Buffer): boolean {
  const w = api()
  if (!w) return false

  let hwnd: unknown
  try {
    hwnd = koffi.decode(handle, 'void*')
  } catch (err) {
    log('focus', 'nie udalo sie odczytac uchwytu wlasnego okna', err)
    return false
  }
  if (!hwnd) return false

  if (w.SetForegroundWindow(hwnd)) return true

  // Windows przyznaje prawo do zmiany pierwszego planu tylko procesowi, ktory
  // dostal ostatnie zdarzenie wejscia. My czytamy klawiature biernie, wiec
  // nigdy nim nie jestesmy - trzeba przypiac sie do watku aktywnego okna.
  const ourThread = w.GetCurrentThreadId()
  const fgThread = w.GetWindowThreadProcessId(w.GetForegroundWindow(), new Uint32Array(1))
  if (!fgThread || fgThread === ourThread) return false

  w.AttachThreadInput(ourThread, fgThread, true)
  const ok = w.SetForegroundWindow(hwnd)
  w.AttachThreadInput(ourThread, fgThread, false)

  log('focus', ok ? 'wymuszono focus wlasnego okna' : 'NIE UDALO SIE przejac focusu')
  return ok
}

/** Tytul aktualnego okna pierwszoplanowego - do logow. */
export function describeForeground(): string {
  const w = api()
  if (!w) return '(brak Win32)'
  const hwnd = w.GetForegroundWindow()
  const own = isOwnProcess(hwnd) ? ' [NASZE OKNO]' : ''
  return windowTitle(hwnd) + own
}
