/**
 * Wstrzykiwanie klawiszy do aktywnego okna.
 *
 * Tekst trafia do pola przez schowek i Ctrl+V, a nie przez wpisywanie znak po
 * znaku. Powody: wklejenie jest jednym zdarzeniem (szybkie i atomowe), nie gubi
 * znakow w aplikacjach z wlasna obsluga wejscia (Teams, Electron, terminale)
 * i nie zalezy od ukladu klawiatury - polskie znaki w tresci dzialaja zawsze.
 *
 * Kosztem jest chwilowe nadpisanie schowka; przywracamy go po wklejeniu.
 */

import { clipboard } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

/** Opoznienia dobrane empirycznie - ponizej tych wartosci aplikacje gubia zdarzenia. */
const DELAY = {
  /** Po serii backspace'ow, zanim wkleimy. */
  afterErase: 25,
  /** Miedzy ustawieniem schowka a Ctrl+V. */
  beforePaste: 25,
  /** Po Ctrl+V, zanim ruszymy kursor lub przywrocimy schowek. */
  afterPaste: 120,
  /** Co ile klawiszy wstawic mikroprzerwe w dlugiej serii. */
  burstEvery: 16,
  burstPause: 8
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tapMany(key: number, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    uIOhook.keyTap(key)
    if (i > 0 && i % DELAY.burstEvery === 0) await sleep(DELAY.burstPause)
  }
}

/** Kasuje `count` znakow przed karetka. */
export async function eraseBackwards(count: number): Promise<void> {
  if (count <= 0) return
  await tapMany(UiohookKey.Backspace, count)
}

/** Cofa karetke o `count` pozycji - obsluga znacznika {{kursor}}. */
export async function moveCaretLeft(count: number): Promise<void> {
  if (count <= 0) return
  await tapMany(UiohookKey.ArrowLeft, count)
}

/**
 * Wkleja tekst przez schowek.
 * @param restore czy przywrocic poprzednia zawartosc schowka
 */
export async function pasteText(text: string, restore: boolean): Promise<void> {
  const previous = restore ? await clipboard.readText() : null

  await clipboard.writeText(text)
  await sleep(DELAY.beforePaste)
  uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])
  await sleep(DELAY.afterPaste)

  if (previous !== null) {
    // Przywracamy tylko jesli nikt w miedzyczasie nie podmienil schowka sam.
    if ((await clipboard.readText()) === text) await clipboard.writeText(previous)
  }
}

/**
 * Pelna sekwencja podmiany: skasuj trigger, wklej tresc, ustaw kursor.
 * Wolajacy musi wczesniej wyciszyc wlasny nasluch klawiatury.
 */
export async function replaceTrigger(opts: {
  eraseCount: number
  text: string
  cursorBack: number
  restoreClipboard: boolean
}): Promise<void> {
  await eraseBackwards(opts.eraseCount)
  if (opts.eraseCount > 0) await sleep(DELAY.afterErase)
  await pasteText(opts.text, opts.restoreClipboard)
  await moveCaretLeft(opts.cursorBack)
}
