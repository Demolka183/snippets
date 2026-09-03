/**
 * Bufor ostatnio wpisanych znakow i dopasowywanie triggerow.
 *
 * Bufor jest przyblizeniem tego, co widnieje w polu tekstowym pod karetka.
 * Nie ma dostepu do samego pola, wiec kazde zdarzenie, ktore moglo przesunac
 * karetke (Enter, strzalki, klikniecie myszy, zmiana okna) zeruje bufor -
 * lepiej nie rozwinac niz rozwinac w zlym miejscu.
 */

import type { Snippet } from '../../shared/types.js'

/** Zapas ponad najdluzszy trigger; trzyma kontekst do sprawdzania granicy slowa. */
const HEADROOM = 8

export class TypingBuffer {
  private chars: string[] = []
  private capacity = 64

  /** Ustawia pojemnosc na podstawie najdluzszego triggera w bazie. */
  setLongestTrigger(length: number): void {
    this.capacity = Math.max(16, length + HEADROOM)
    this.trim()
  }

  push(char: string): void {
    this.chars.push(char)
    this.trim()
  }

  backspace(): void {
    this.chars.pop()
  }

  reset(): void {
    this.chars.length = 0
  }

  /** Usuwa z konca `n` znakow - po rozwinieciu trigger znika te z pola tekstowego. */
  dropLast(n: number): void {
    this.chars.length = Math.max(0, this.chars.length - n)
  }

  get text(): string {
    return this.chars.join('')
  }

  get length(): number {
    return this.chars.length
  }

  private trim(): void {
    const excess = this.chars.length - this.capacity
    if (excess > 0) this.chars.splice(0, excess)
  }
}

/* ------------------------------------------------------------------ */
/* Dopasowanie                                                         */
/* ------------------------------------------------------------------ */

export interface MatchOptions {
  matchCase: boolean
  requireWordBoundary: boolean
}

export interface MatchResult {
  snippet: Snippet
  /** Ile znakow trzeba skasowac z pola tekstowego. */
  triggerLength: number
}

/**
 * Indeks triggerow. Trzymany osobno od bazy, bo dopasowanie odpala sie przy
 * kazdym nacisnieciu klawisza i musi byc tanie.
 */
export class TriggerIndex {
  /** Posortowane malejaco po dlugosci - pierwszy trafiony jest najdluzszy. */
  private entries: Array<{ snippet: Snippet; needle: string; length: number }> = []
  private longest = 0

  rebuild(snippets: Snippet[], matchCase: boolean): void {
    this.entries = snippets
      .filter((s) => s.enabled && s.trigger.length > 0)
      .map((s) => ({
        snippet: s,
        needle: matchCase ? s.trigger : s.trigger.toLowerCase(),
        length: s.trigger.length
      }))
      .sort((a, b) => b.length - a.length)
    this.longest = this.entries.length > 0 ? this.entries[0].length : 0
  }

  get longestTrigger(): number {
    return this.longest
  }

  get size(): number {
    return this.entries.length
  }

  /**
   * Szuka triggera na koncu bufora. Zwraca najdluzsze dopasowanie, zeby
   * "/dzien" nie wygrywalo z "/dziendobry".
   */
  match(buffer: string, opts: MatchOptions): MatchResult | null {
    if (this.entries.length === 0) return null
    const haystack = opts.matchCase ? buffer : buffer.toLowerCase()

    for (const entry of this.entries) {
      if (!haystack.endsWith(entry.needle)) continue
      if (opts.requireWordBoundary) {
        const before = haystack[haystack.length - entry.length - 1]
        if (before !== undefined && isWordChar(before) && isWordChar(entry.needle[0])) continue
      }
      return { snippet: entry.snippet, triggerLength: entry.length }
    }
    return null
  }
}

/**
 * Litera lub cyfra w dowolnym alfabecie. Granica slowa ma znaczenie tylko dla
 * triggerow zaczynajacych sie od litery - "/cos" i tak zaczyna sie od symbolu.
 */
function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch)
}
