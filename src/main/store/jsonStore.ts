/**
 * Trwaly stan aplikacji w plikach JSON.
 *
 * Zapis jest atomowy (plik tymczasowy + rename), bo aplikacja dziala w tle i
 * bywa ubijana razem z sesja Windows. Zwykly zapis w miejscu zostawilby
 * uciety plik i baze snippetow do odtworzenia z kopii.
 *
 * Format celowo jest czytelnym JSON-em, nie baza binarna: mozna go
 * podejrzec, wrzucic do gita i przeniesc na inne urzadzenie.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Ile milisekund czekac na kolejne zmiany, zanim faktycznie zapiszemy. */
const SAVE_DEBOUNCE = 400

export class JsonStore<T> {
  private readonly file: string
  private readonly backup: string
  private data: T
  private saveTimer: NodeJS.Timeout | null = null

  constructor(fileName: string, private readonly fallback: T, private readonly migrate?: (raw: unknown) => T) {
    this.file = path.join(app.getPath('userData'), fileName)
    this.backup = this.file + '.bak'

    const existed = fs.existsSync(this.file)
    this.data = this.load()
    // Pierwsze uruchomienie: zapisujemy wartosci domyslne od razu, zeby plik
    // istnial zanim uzytkownik cokolwiek zmieni - inaczej "pokaz folder
    // z danymi" prowadzi w pustke, a przykladowe snippety znikaja po restarcie.
    if (!existed) this.flush()
  }

  get value(): T {
    return this.data
  }

  /** Podmienia calosc i planuje zapis. */
  set(next: T): void {
    this.data = next
    this.scheduleSave()
  }

  /** Modyfikuje w miejscu i planuje zapis. */
  update(fn: (draft: T) => void): void {
    fn(this.data)
    this.scheduleSave()
  }

  private load(): T {
    for (const candidate of [this.file, this.backup]) {
      try {
        if (!fs.existsSync(candidate)) continue
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        return this.migrate ? this.migrate(raw) : (raw as T)
      } catch (err) {
        // Uszkodzony plik nie moze zablokowac startu - probujemy kopii, potem domyslnych.
        console.error(`[store] nie udalo sie wczytac ${candidate}:`, err)
      }
    }
    return this.fallback
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE)
  }

  /** Wymusza natychmiastowy zapis - wolane przed zamknieciem aplikacji. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const tmp = this.file + '.tmp'
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      // Poprzednia wersja ida na kopie zapasowa, dopiero potem podmiana.
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup)
      fs.renameSync(tmp, this.file)
    } catch (err) {
      console.error(`[store] nie udalo sie zapisac ${this.file}:`, err)
    }
  }

  get filePath(): string {
    return this.file
  }
}
