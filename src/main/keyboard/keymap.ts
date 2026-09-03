/**
 * Tlumaczenie kodow klawiszy z uiohook na znaki.
 *
 * uiohook podaje `keycode` w postaci scancode'ow PC set 1 - to kod FIZYCZNEGO
 * klawisza, nie znaku. Klawisz obok lewego Shifta ma kod 44 niezaleznie od tego,
 * czy uklad rysuje na nim Z (US/PL) czy Y (niemiecki). Ponizsza tablica zaklada
 * uklad US, czyli tez "polski programisty" - jedyny realnie uzywany w PL.
 *
 * Polskie znaki diakrytyczne powstaja przez AltGr (na Windows = Ctrl+Alt) i nie
 * da sie ich odtworzyc z samego scancode'u. Sa obslugiwane jako `DIACRITIC`
 * - patrz `classifyKey`.
 */

import { UiohookKey } from 'uiohook-napi'

const K = UiohookKey

/** [znak bez Shifta, znak z Shiftem] */
const CHARS: Record<number, [string, string]> = {
  [K.Backquote]: ['`', '~'],
  [K[1]]: ['1', '!'],
  [K[2]]: ['2', '@'],
  [K[3]]: ['3', '#'],
  [K[4]]: ['4', '$'],
  [K[5]]: ['5', '%'],
  [K[6]]: ['6', '^'],
  [K[7]]: ['7', '&'],
  [K[8]]: ['8', '*'],
  [K[9]]: ['9', '('],
  [K[0]]: ['0', ')'],
  [K.Minus]: ['-', '_'],
  [K.Equal]: ['=', '+'],

  [K.Q]: ['q', 'Q'], [K.W]: ['w', 'W'], [K.E]: ['e', 'E'], [K.R]: ['r', 'R'],
  [K.T]: ['t', 'T'], [K.Y]: ['y', 'Y'], [K.U]: ['u', 'U'], [K.I]: ['i', 'I'],
  [K.O]: ['o', 'O'], [K.P]: ['p', 'P'],
  [K.BracketLeft]: ['[', '{'],
  [K.BracketRight]: [']', '}'],
  [K.Backslash]: ['\\', '|'],

  [K.A]: ['a', 'A'], [K.S]: ['s', 'S'], [K.D]: ['d', 'D'], [K.F]: ['f', 'F'],
  [K.G]: ['g', 'G'], [K.H]: ['h', 'H'], [K.J]: ['j', 'J'], [K.K]: ['k', 'K'],
  [K.L]: ['l', 'L'],
  [K.Semicolon]: [';', ':'],
  [K.Quote]: ["'", '"'],

  [K.Z]: ['z', 'Z'], [K.X]: ['x', 'X'], [K.C]: ['c', 'C'], [K.V]: ['v', 'V'],
  [K.B]: ['b', 'B'], [K.N]: ['n', 'N'], [K.M]: ['m', 'M'],
  [K.Comma]: [',', '<'],
  [K.Period]: ['.', '>'],
  [K.Slash]: ['/', '?'],

  [K.Space]: [' ', ' '],

  // Klawiatura numeryczna przy wlaczonym NumLocku.
  [K.Numpad0]: ['0', '0'], [K.Numpad1]: ['1', '1'], [K.Numpad2]: ['2', '2'],
  [K.Numpad3]: ['3', '3'], [K.Numpad4]: ['4', '4'], [K.Numpad5]: ['5', '5'],
  [K.Numpad6]: ['6', '6'], [K.Numpad7]: ['7', '7'], [K.Numpad8]: ['8', '8'],
  [K.Numpad9]: ['9', '9'],
  [K.NumpadMultiply]: ['*', '*'],
  [K.NumpadAdd]: ['+', '+'],
  [K.NumpadSubtract]: ['-', '-'],
  [K.NumpadDecimal]: ['.', '.'],
  [K.NumpadDivide]: ['/', '/']
}

/** Klawisze numeryczne dzialaja jak znaki tylko przy wlaczonym NumLocku. */
const NUMPAD_DIGITS = new Set<number>([
  K.Numpad0, K.Numpad1, K.Numpad2, K.Numpad3, K.Numpad4,
  K.Numpad5, K.Numpad6, K.Numpad7, K.Numpad8, K.Numpad9, K.NumpadDecimal
])

/**
 * Klawisze, ktore przesuwaja karetke lub zmieniaja kontekst - po nich bufor
 * przestaje odpowiadac temu, co jest w polu tekstowym, wiec go czyscimy.
 */
const RESET_KEYS = new Set<number>([
  K.Enter, K.Tab, K.Escape, K.NumpadEnter,
  K.ArrowLeft, K.ArrowRight, K.ArrowUp, K.ArrowDown,
  K.Home, K.End, K.PageUp, K.PageDown, K.Delete, K.Insert
])

/** Klawisze modyfikatorow - same z siebie nic nie wpisuja i nie ruszaja bufora. */
const MODIFIER_KEYS = new Set<number>([
  K.Shift, K.ShiftRight, K.Ctrl, K.CtrlRight, K.Alt, K.AltRight,
  K.Meta, K.MetaRight, K.CapsLock, K.NumLock, K.ScrollLock
])

export type KeyKind =
  /** Zwykly znak dopisywany do bufora. */
  | { kind: 'char'; char: string }
  /** Backspace - usuwa ostatni znak z bufora. */
  | { kind: 'backspace' }
  /** Znak diakrytyczny z AltGr - znamy fakt wpisania, nie znamy znaku. */
  | { kind: 'diacritic' }
  /** Bufor traci synchronizacje z polem tekstowym. */
  | { kind: 'reset' }
  /** Nic nie robimy. */
  | { kind: 'ignore' }

export interface KeyEventLike {
  keycode: number
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

export interface KeymapState {
  /** Stan CapsLocka sledzony od startu aplikacji - patrz uwaga w DOCS.md. */
  capsLock: boolean
  numLock: boolean
}

/**
 * Decyduje, co zrobic z bufora po nacisnieciu klawisza.
 *
 * AltGr na Windows zglasza sie jako Ctrl+Alt. Rozroznienie jest wazne:
 * Ctrl+C to skrot (reset bufora), a AltGr+A to wpisanie litery "a z ogonkiem".
 */
export function classifyKey(e: KeyEventLike, state: KeymapState): KeyKind {
  if (MODIFIER_KEYS.has(e.keycode)) return { kind: 'ignore' }
  if (e.keycode === K.Backspace) return { kind: 'backspace' }
  if (RESET_KEYS.has(e.keycode)) return { kind: 'reset' }

  const isAltGr = e.ctrlKey && e.altKey
  if (isAltGr) {
    // AltGr + litera daje polski znak; AltGr na innych klawiszach zwykle nic nie daje.
    return CHARS[e.keycode] ? { kind: 'diacritic' } : { kind: 'ignore' }
  }

  // Ctrl+X / Alt+X / Win+X to skroty, nie tekst.
  if (e.ctrlKey || e.altKey || e.metaKey) return { kind: 'reset' }

  if (NUMPAD_DIGITS.has(e.keycode) && !state.numLock) return { kind: 'reset' }

  const pair = CHARS[e.keycode]
  if (!pair) return { kind: 'ignore' }

  let char = e.shiftKey ? pair[1] : pair[0]
  // CapsLock odwraca wielkosc tylko liter, nie cyfr ani symboli.
  if (state.capsLock && pair[0] !== pair[1] && /^[a-z]$/i.test(pair[0])) {
    char = e.shiftKey ? pair[0] : pair[1]
  }
  return { kind: 'char', char }
}

/** Czy klawisz przelacza CapsLock/NumLock - wolajacy aktualizuje wtedy stan. */
export function isLockKey(keycode: number): 'caps' | 'num' | null {
  if (keycode === K.CapsLock) return 'caps'
  if (keycode === K.NumLock) return 'num'
  return null
}
