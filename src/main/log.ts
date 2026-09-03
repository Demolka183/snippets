/**
 * Log diagnostyczny do pliku.
 *
 * Aplikacja pracuje w tle, bez widocznej konsoli, a jej najtrudniejsze bledy
 * (tekst wklejony w zle okno, zgubiony focus, rozjechany bufor) zdarzaja sie
 * w trakcie normalnego pisania - nie da sie ich odtworzyc pod debuggerem.
 * Plik logu jest jedynym sposobem, zeby dowiedziec sie, co naprawde zaszlo.
 *
 * Log jest wlaczony domyslnie i przycinany do `MAX_BYTES`; nie zawiera tresci
 * snippetow ani wpisywanego tekstu - tylko przebieg zdarzen.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Powyzej tego rozmiaru log jest obcinany do polowy przy starcie. */
const MAX_BYTES = 512 * 1024

let file: string | null = null
let enabled = true

export function initLog(): void {
  try {
    file = path.join(app.getPath('userData'), 'log.txt')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const stat = fs.existsSync(file) ? fs.statSync(file) : null
    if (stat && stat.size > MAX_BYTES) {
      const kept = fs.readFileSync(file, 'utf8').slice(-MAX_BYTES / 2)
      fs.writeFileSync(file, kept, 'utf8')
    }
    log('start', `--- Snippety ${app.getVersion()} (${process.platform}) ---`)
  } catch {
    enabled = false
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** Dopisuje linie do logu. Nigdy nie rzuca - blad logowania nie moze psuc dzialania. */
export function log(scope: string, message: string, error?: unknown): void {
  if (!enabled || !file) return
  try {
    const suffix = error ? ` | ${error instanceof Error ? error.message : String(error)}` : ''
    fs.appendFileSync(file, `${stamp()} [${scope}] ${message}${suffix}\n`, 'utf8')
  } catch {
    enabled = false
  }
}

export function logPath(): string | null {
  return file
}
