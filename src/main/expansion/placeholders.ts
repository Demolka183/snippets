/**
 * Parser i renderer placeholderow w tresci snippetu.
 *
 * Skladnia (pelny opis w DOCS.md):
 *   {{data}} {{data:+7}} {{data:RRRR-MM-DD}} {{data:+7:RRRR-MM-DD}}
 *   {{godzina}} {{godzina:GG:mm:ss}}
 *   {{schowek}}  {{kursor}}
 *   {{pole:Imie}} {{pole:Firma=ACME}} {{obszar:Uwagi}}
 *   {{wybor:Status=Nowy|W toku|Zamkniete}}
 *
 * Podwojne klamry sa celowe - pojedyncze wystepuja w normalnym tekscie
 * (JSON, kod, szablony) i falszywe trafienia bylyby uciazliwe.
 */

import type { FieldKind, FieldSpec } from '../../shared/types.js'

/** Znacznik pozycji kursora. Znak sterujacy, nie wystapi w tresci uzytkownika. */
const CURSOR_MARK = '\u0001'

const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g

const MONTHS_FULL = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'wrzesnia', 'pazdziernika', 'listopada', 'grudnia'
]
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru']
const DAYS_FULL = ['niedziela', 'poniedzialek', 'wtorek', 'sroda', 'czwartek', 'piatek', 'sobota']
const DAYS_SHORT = ['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'sb']

/** Nazwy typow po polsku i angielsku sprowadzone do jednej postaci. */
const KIND_ALIASES: Record<string, string> = {
  data: 'date', date: 'date',
  godzina: 'time', czas: 'time', time: 'time',
  schowek: 'clipboard', clipboard: 'clipboard',
  kursor: 'cursor', cursor: 'cursor',
  pole: 'field', field: 'field',
  obszar: 'area', area: 'area', textarea: 'area',
  wybor: 'choice', choice: 'choice', lista: 'choice'
}

/** Sprowadza nazwe do postaci bez diakrytykow, zeby {{wybor}} i {{wybor}} znaczyly to samo. */
export function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
}

/** Rozbija na pierwszym wystapieniu separatora; reszta zostaje nietknieta. */
function splitFirst(text: string, sep: string): [string, string | null] {
  const i = text.indexOf(sep)
  if (i === -1) return [text, null]
  return [text.slice(0, i), text.slice(i + sep.length)]
}

interface ParsedTag {
  kind: string
  arg: string | null
}

function parseTag(inner: string): ParsedTag | null {
  const [head, rest] = splitFirst(inner, ':')
  const kind = KIND_ALIASES[normalizeKey(head)]
  if (!kind) return null
  return { kind, arg: rest }
}

/* ------------------------------------------------------------------ */
/* Daty                                                                */
/* ------------------------------------------------------------------ */

const TOKEN_RE = /RRRR|YYYY|MMMM|MMM|dddd|ddd|MM|DD|GG|HH|mm|ss/g

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

export function formatDate(d: Date, format: string): string {
  return format.replace(TOKEN_RE, (token) => {
    switch (token) {
      case 'RRRR':
      case 'YYYY': return String(d.getFullYear())
      case 'MMMM': return MONTHS_FULL[d.getMonth()]
      case 'MMM': return MONTHS_SHORT[d.getMonth()]
      case 'dddd': return DAYS_FULL[d.getDay()]
      case 'ddd': return DAYS_SHORT[d.getDay()]
      case 'MM': return pad(d.getMonth() + 1)
      case 'DD': return pad(d.getDate())
      case 'GG':
      case 'HH': return pad(d.getHours())
      case 'mm': return pad(d.getMinutes())
      case 'ss': return pad(d.getSeconds())
      default: return token
    }
  })
}

/**
 * Rozdziela argument daty na przesuniecie w dniach i format.
 * "+7" -> [7, null] ; "RRRR-MM-DD" -> [0, "RRRR-MM-DD"] ; "+7:DD.MM" -> [7, "DD.MM"]
 */
function parseDateArg(arg: string | null): [number, string | null] {
  if (!arg) return [0, null]
  const m = /^([+-]\d+)(?::(.*))?$/.exec(arg.trim())
  if (m) return [parseInt(m[1], 10), m[2] ?? null]
  return [0, arg]
}

function renderDate(arg: string | null, now: Date, defaultFormat: string): string {
  const [offsetDays, format] = parseDateArg(arg)
  const d = new Date(now.getTime())
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays)
  return formatDate(d, format ?? defaultFormat)
}

/* ------------------------------------------------------------------ */
/* Pola do wypelnienia                                                 */
/* ------------------------------------------------------------------ */

interface ParsedField {
  label: string
  defaultValue: string
  options: string[]
}

/** "Firma=ACME" -> etykieta + wartosc domyslna. "Status=A|B|C" -> lista opcji. */
function parseFieldArg(arg: string | null, isChoice: boolean): ParsedField {
  const raw = (arg ?? '').trim()
  const [labelPart, valuePart] = splitFirst(raw, '=')
  const label = labelPart.trim()
  if (isChoice) {
    const options = (valuePart ?? '')
      .split('|')
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
    return { label, defaultValue: options[0] ?? '', options }
  }
  return { label, defaultValue: (valuePart ?? '').trim(), options: [] }
}

const FIELD_KINDS: Record<string, FieldKind> = { field: 'text', area: 'multiline', choice: 'choice' }

/**
 * Zbiera pola, o ktore trzeba zapytac uzytkownika.
 * Powtorzona etykieta schodzi sie do jednego pola - wpisujesz raz, wstawia sie wszedzie.
 */
export function collectFields(content: string): FieldSpec[] {
  const found = new Map<string, FieldSpec>()
  for (const match of content.matchAll(PLACEHOLDER_RE)) {
    const tag = parseTag(match[1])
    if (!tag) continue
    const fieldKind = FIELD_KINDS[tag.kind]
    if (!fieldKind) continue

    const parsed = parseFieldArg(tag.arg, tag.kind === 'choice')
    if (!parsed.label) continue

    const key = normalizeKey(parsed.label)
    const existing = found.get(key)
    if (!existing) {
      found.set(key, {
        key,
        label: parsed.label,
        kind: fieldKind,
        defaultValue: parsed.defaultValue,
        options: parsed.options
      })
      continue
    }
    // Ta sama etykieta w dwoch miejscach: uzupelniamy to, czego brakowalo.
    if (!existing.defaultValue && parsed.defaultValue) existing.defaultValue = parsed.defaultValue
    if (existing.options.length === 0 && parsed.options.length > 0) {
      existing.options = parsed.options
      existing.kind = 'choice'
    }
  }
  return [...found.values()]
}

/** Czy tresc wymaga pokazania formularza przed wklejeniem. */
export function needsForm(content: string): boolean {
  return collectFields(content).length > 0
}

/* ------------------------------------------------------------------ */
/* Renderowanie                                                        */
/* ------------------------------------------------------------------ */

export interface RenderContext {
  clipboard: string
  now?: Date
  /** Wartosci z formularza, kluczowane tak jak `FieldSpec.key`. */
  values?: Record<string, string>
}

export interface RenderResult {
  text: string
  /**
   * O ile znakow cofnac kursor po wklejeniu.
   * 0 = kursor zostaje na koncu (brak {{kursor}} w tresci).
   */
  cursorBack: number
}

export function render(content: string, ctx: RenderContext): RenderResult {
  const now = ctx.now ?? new Date()
  const values = ctx.values ?? {}
  let cursorUsed = false

  const withMarks = content.replace(PLACEHOLDER_RE, (whole, inner: string) => {
    const tag = parseTag(inner)
    if (!tag) return whole // nieznany placeholder zostaje doslownie

    switch (tag.kind) {
      case 'date': return renderDate(tag.arg, now, 'DD.MM.RRRR')
      case 'time': return renderDate(tag.arg, now, 'GG:mm')
      case 'clipboard': return ctx.clipboard
      case 'cursor':
        if (cursorUsed) return '' // liczy sie tylko pierwszy znacznik
        cursorUsed = true
        return CURSOR_MARK
      case 'field':
      case 'area':
      case 'choice': {
        const parsed = parseFieldArg(tag.arg, tag.kind === 'choice')
        const key = normalizeKey(parsed.label)
        return values[key] ?? parsed.defaultValue
      }
      default: return whole
    }
  })

  const markIndex = withMarks.indexOf(CURSOR_MARK)
  if (markIndex === -1) return { text: withMarks, cursorBack: 0 }

  const text = withMarks.replace(CURSOR_MARK, '')
  return { text, cursorBack: text.length - markIndex }
}
