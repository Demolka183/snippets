/**
 * Silnik rozwijania - spina nasluch klawiatury, dopasowanie triggera,
 * renderowanie tresci i wstrzykniecie tekstu do aktywnego okna.
 *
 * Caly stan bufora zyje tutaj i nigdzie indziej. Zasada jest jedna:
 * przy jakiejkolwiek watpliwosci co do pozycji karetki bufor sie zeruje.
 * Falszywe rozwiniecie kasuje uzytkownikowi tekst - falszywy brak
 * rozwiniecia kosztuje go jedno ponowne wpisanie triggera.
 */

import { clipboard } from 'electron'
import { uIOhook } from 'uiohook-napi'
import type { ExpansionEvent, FormRequest, Settings, Snippet } from '../../shared/types.js'
import { TriggerIndex, TypingBuffer } from '../keyboard/buffer.js'
import { classifyKey, isLockKey, type KeymapState } from '../keyboard/keymap.js'
import { replaceTrigger } from '../keyboard/inject.js'
import { describeForeground, restoreForeground } from '../keyboard/focus.js'
import { log } from '../log.js'
import { getSettings, listSnippets, recordUsage } from '../store/index.js'
import { collectFields, render } from './placeholders.js'

/**
 * Znak wstawiany za polskie litery z AltGr. Nie da sie ich odczytac ze
 * scancode'u, ale sam fakt wpisania znaku trzeba zapamietac - inaczej bufor
 * rozjedzie sie z polem tekstowym.
 */
const UNKNOWN_CHAR = '\uFFFD'

/**
 * Ile czekac po schowaniu wlasnego okna, zanim Windows odda focus aplikacji
 * docelowej. Ponizej ~150 ms tekst potrafi trafic w prozne miejsce.
 */
const REFOCUS_DELAY = 220

export interface EngineDeps {
  /** Pyta uzytkownika o wartosci pol. `null` = anulowano. */
  requestFields(request: FormRequest): Promise<Record<string, string> | null>
  /** Czy focus jest w oknie naszej aplikacji - wtedy nie rozwijamy. */
  isOwnWindowFocused(): boolean
  /** Powiadomienie dla UI (licznik uzyc, log). */
  onExpanded(event: ExpansionEvent): void
}

const buffer = new TypingBuffer()
const index = new TriggerIndex()
const lockState: KeymapState = { capsLock: false, numLock: true }

let deps: EngineDeps | null = null
let running = false
/** Podniesione na czas wstrzykiwania - inaczej wlasne klawisze wracaja do bufora. */
let injecting = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------ */
/* Cykl zycia                                                          */
/* ------------------------------------------------------------------ */

export function startEngine(dependencies: EngineDeps): void {
  if (running) return
  deps = dependencies
  refreshIndex()
  uIOhook.on('keydown', onKeyDown)
  // Klikniecie mysza przenosi karetke w nieznane miejsce.
  uIOhook.on('mousedown', () => buffer.reset())
  uIOhook.start()
  running = true
}

export function stopEngine(): void {
  if (!running) return
  uIOhook.removeAllListeners()
  try {
    uIOhook.stop()
  } catch (err) {
    log('hook', 'blad przy zatrzymywaniu', err)
  }
  running = false
}

export function isRunning(): boolean {
  return running
}

/** Przebudowuje indeks - wolane po kazdej zmianie snippetow lub ustawien. */
export function refreshIndex(): void {
  const settings = getSettings()
  index.rebuild(listSnippets(), settings.matchCase)
  buffer.setLongestTrigger(index.longestTrigger)
}

/* ------------------------------------------------------------------ */
/* Nasluch                                                             */
/* ------------------------------------------------------------------ */

function onKeyDown(event: {
  keycode: number
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}): void {
  const lock = isLockKey(event.keycode)
  if (lock === 'caps') lockState.capsLock = !lockState.capsLock
  if (lock === 'num') lockState.numLock = !lockState.numLock

  if (injecting) return

  const settings = getSettings()
  if (!settings.enabled) return

  // Wlasne okna obslugujemy normalnym UI, nie rozwijaniem w tle.
  if (deps?.isOwnWindowFocused()) {
    buffer.reset()
    return
  }

  const action = classifyKey(event, lockState)
  switch (action.kind) {
    case 'ignore':
      return
    case 'reset':
      buffer.reset()
      return
    case 'backspace':
      buffer.backspace()
      return
    case 'diacritic':
      buffer.push(UNKNOWN_CHAR)
      return
    case 'char':
      buffer.push(action.char)
      tryExpand(action.char, settings)
      return
  }
}

function tryExpand(lastChar: string, settings: Settings): void {
  const opts = { matchCase: settings.matchCase, requireWordBoundary: settings.requireWordBoundary }

  if (settings.expandMode === 'immediate') {
    const hit = index.match(buffer.text, opts)
    if (hit) void runExpansion(hit.snippet, hit.triggerLength, '', settings)
    return
  }

  // Tryb `terminator`: trigger liczy sie dopiero, gdy zamknie go spacja/tab/enter.
  if (!settings.terminators.includes(lastChar)) return
  const withoutTerminator = buffer.text.slice(0, -1)
  const hit = index.match(withoutTerminator, opts)
  if (hit) void runExpansion(hit.snippet, hit.triggerLength + 1, lastChar, settings)
}

/* ------------------------------------------------------------------ */
/* Rozwijanie                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param eraseCount ile znakow skasowac z pola (trigger, ewentualnie ze znakiem konczacym)
 * @param terminator znak konczacy do doklejenia, gdy `keepTerminator`
 */
async function runExpansion(
  snippet: Snippet,
  eraseCount: number,
  terminator: string,
  settings: Settings
): Promise<void> {
  if (injecting) return
  injecting = true
  buffer.reset()

  try {
    const fields = collectFields(snippet.content)
    let values: Record<string, string> | undefined

    log('expand', `trigger ${snippet.trigger}, pol: ${fields.length}, do skasowania: ${eraseCount}`)

    if (fields.length > 0) {
      // Okno formularza zabiera focus aplikacji docelowej.
      const answered = await deps?.requestFields({ snippetName: snippet.name, fields })
      if (!answered) {
        log('expand', 'formularz anulowany - trigger zostaje')
        return
      }
      values = answered
      // Windows sam nie odda focusu wlasciwej aplikacji, jesli nasze okno
      // glowne jest otwarte - musimy o to poprosic wprost.
      restoreForeground()
      await sleep(REFOCUS_DELAY)
    }

    log('expand', `wklejam do okna: ${describeForeground()}`)

    const rendered = render(snippet.content, { clipboard: await clipboard.readText(), values })
    const suffix = settings.keepTerminator ? terminator : ''

    await replaceTrigger({
      eraseCount,
      text: rendered.text + suffix,
      // Doklejony znak konczacy przesuwa kursor o jedna pozycje dalej.
      cursorBack: rendered.cursorBack > 0 ? rendered.cursorBack + suffix.length : 0,
      restoreClipboard: settings.restoreClipboard
    })

    recordUsage(snippet.id)
    deps?.onExpanded({ snippetId: snippet.id, trigger: snippet.trigger, at: new Date().toISOString() })
    log('expand', 'gotowe')
  } catch (err) {
    log('expand', 'rozwiniecie nie powiodlo sie', err)
  } finally {
    injecting = false
    buffer.reset()
  }
}

/**
 * Wstawia snippet wybrany recznie w oknie szybkiego wyboru.
 * Nic nie kasuje - w polu nie ma triggera do usuniecia.
 */
export async function insertSnippetById(id: string): Promise<boolean> {
  const snippet = listSnippets().find((s) => s.id === id)
  if (!snippet) return false
  if (injecting) return false

  injecting = true
  try {
    const settings = getSettings()
    const fields = collectFields(snippet.content)
    let values: Record<string, string> | undefined

    if (fields.length > 0) {
      const answered = await deps?.requestFields({ snippetName: snippet.name, fields })
      if (!answered) return false
      values = answered
    }

    // Paleta zawsze zabiera focus, wiec zawsze go oddajemy.
    restoreForeground()
    await sleep(REFOCUS_DELAY)
    log('paleta', `wstawiam ${snippet.trigger} do okna: ${describeForeground()}`)

    const rendered = render(snippet.content, { clipboard: await clipboard.readText(), values })
    await replaceTrigger({
      eraseCount: 0,
      text: rendered.text,
      cursorBack: rendered.cursorBack,
      restoreClipboard: settings.restoreClipboard
    })

    recordUsage(snippet.id)
    deps?.onExpanded({ snippetId: snippet.id, trigger: snippet.trigger, at: new Date().toISOString() })
    return true
  } catch (err) {
    log('paleta', 'wstawienie nie powiodlo sie', err)
    return false
  } finally {
    injecting = false
    buffer.reset()
  }
}
