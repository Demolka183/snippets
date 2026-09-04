/**
 * Wstrzykiwanie klawiszy do aktywnego okna.
 *
 * Tekst trafia do pola przez schowek i Ctrl+V, a nie przez wpisywanie znak po
 * znaku. Powody: wklejenie jest jednym zdarzeniem (szybkie i atomowe), nie gubi
 * znakow w aplikacjach z wlasna obsluga wejscia (Teams, Electron, terminale)
 * i nie zalezy od ukladu klawiatury - polskie znaki w tresci dzialaja zawsze.
 *
 * Kosztem jest chwilowe nadpisanie schowka. Kolejnosc operacji nie jest
 * przypadkowa i wynika z dwoch bledow, ktore realnie wystapily:
 *
 *  1. Schowek ustawiamy i POTWIERDZAMY zanim skasujemy trigger. Zapis potrafi
 *     nie dojsc do skutku, gdy schowek trzyma inny proces (menedzery schowka,
 *     historia Win+V). Wczesniej Ctrl+V wklejal wtedy poprzednia zawartosc
 *     schowka - czyli cudzy tekst w srodek maila. Teraz w takiej sytuacji
 *     nie robimy nic, a trigger zostaje nietkniety.
 *  2. Schowek przywracamy dopiero na samym koncu, po dodatkowym buforze czasu.
 *     Aplikacja docelowa przetwarza Ctrl+V asynchronicznie; oddanie schowka
 *     zanim to zrobi konczy sie wklejeniem starej zawartosci zamiast naszego
 *     tekstu. Wczesniejsze 120 ms wystarczalo na jednej maszynie, a na drugiej
 *     juz nie.
 */

import { clipboard } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { log } from '../log.js'

/** Opoznienia dobrane empirycznie - ponizej tych wartosci aplikacje gubia zdarzenia. */
const DELAY = {
  /** Po serii backspace'ow, zanim wkleimy. */
  afterErase: 25,
  /** Miedzy ustawieniem schowka a Ctrl+V. */
  beforePaste: 25,
  /** Po Ctrl+V, zanim ruszymy kursor. */
  afterPaste: 150,
  /**
   * Dodatkowy bufor przed oddaniem schowka. To jest ta wartosc do podniesienia,
   * jesli gdzies wklejala sie stara zawartosc schowka zamiast snippetu.
   */
  beforeRestore: 450,
  /** Co ile klawiszy wstawic mikroprzerwe w dlugiej serii. */
  burstEvery: 16,
  burstPause: 8,
  /** Miedzy proba zapisu schowka a ponowieniem. */
  clipboardRetry: 20
}

/** Ile razy sprobowac ustawic schowek, zanim uznamy to za nieudane. */
const CLIPBOARD_ATTEMPTS = 5

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
 * Ustawia schowek i sprawdza, czy faktycznie przyjal wartosc.
 * Ponawia, bo inny proces potrafi trzymac schowek przez ulamek sekundy.
 */
async function setClipboardConfirmed(text: string): Promise<boolean> {
  for (let attempt = 1; attempt <= CLIPBOARD_ATTEMPTS; attempt++) {
    await clipboard.writeText(text)
    if ((await clipboard.readText()) === text) return true
    await sleep(DELAY.clipboardRetry)
  }
  return false
}

/**
 * Pelna sekwencja podmiany: ustaw schowek, skasuj trigger, wklej, ustaw kursor,
 * oddaj schowek. Wolajacy musi wczesniej wyciszyc wlasny nasluch klawiatury.
 *
 * @returns czy podmiana doszla do skutku
 */
export async function replaceTrigger(opts: {
  eraseCount: number
  text: string
  cursorBack: number
  restoreClipboard: boolean
}): Promise<boolean> {
  const previous = opts.restoreClipboard ? await clipboard.readText() : null

  // Najpierw schowek. Gdyby zapis sie nie udal, uzytkownik zostaje
  // z nietknietym triggerem zamiast z wklejona cudza zawartoscia.
  if (!(await setClipboardConfirmed(opts.text))) {
    log('inject', 'nie udalo sie ustawic schowka - podmiana przerwana, trigger zostaje')
    return false
  }

  await eraseBackwards(opts.eraseCount)
  if (opts.eraseCount > 0) await sleep(DELAY.afterErase)

  await sleep(DELAY.beforePaste)
  uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])
  await sleep(DELAY.afterPaste)

  await moveCaretLeft(opts.cursorBack)

  if (previous !== null) {
    await sleep(DELAY.beforeRestore)
    // Tylko jesli nikt w miedzyczasie nie skopiowal czegos sam - inaczej
    // zabralibysmy uzytkownikowi swiezo skopiowana tresc.
    if ((await clipboard.readText()) === opts.text) await clipboard.writeText(previous)
  }

  return true
}
