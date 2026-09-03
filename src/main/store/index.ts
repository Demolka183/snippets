/**
 * Repozytorium snippetow i ustawien.
 *
 * Jedyne miejsce, ktore dotyka dysku. Reszta procesu glownego wola stad
 * funkcje - podmiana formatu zapisu ma byc podmiana tego modulu.
 * Stores powstaja dopiero po `app.whenReady()`, bo wczesniej `app.getPath`
 * nie zna sciezki profilu.
 */

import { randomUUID } from 'node:crypto'
import type { Database, Folder, ImportSummary, Settings, Snippet, SnippetInput } from '../../shared/types.js'
import { JsonStore } from './jsonStore.js'

const DB_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  expandMode: 'immediate',
  terminators: [' ', '\t', '\n'],
  keepTerminator: true,
  matchCase: false,
  requireWordBoundary: true,
  restoreClipboard: true,
  paletteHotkey: 'Control+Shift+Space',
  autostart: false,
  startMinimized: false,
  theme: 'dark'
}

/** Przyklady pokazywane przy pierwszym uruchomieniu - od razu widac skladnie. */
function seedSnippets(): Snippet[] {
  const now = new Date().toISOString()
  const base = { folderId: null, enabled: true, createdAt: now, updatedAt: now, usageCount: 0, lastUsedAt: null }
  return [
    {
      id: randomUUID(),
      trigger: '/przywitanie',
      name: 'Przywitanie w mailu',
      content: 'Dzien dobry,\n\n{{kursor}}\n\nPozdrawiam serdecznie',
      ...base
    },
    {
      id: randomUUID(),
      trigger: '/oferta',
      name: 'Oferta z polami do wypelnienia',
      content:
        'Dzien dobry {{pole:Imie}},\n\n' +
        'w nawiazaniu do rozmowy przesylam oferte dla {{pole:Firma}}.\n' +
        'Oferta wazna do {{data:+14}}.\n' +
        'Status: {{wybor:Status=Nowa|W negocjacji|Zaakceptowana}}\n\n' +
        '{{obszar:Uwagi}}\n\nPozdrawiam',
      ...base
    },
    {
      id: randomUUID(),
      trigger: '/data',
      name: 'Dzisiejsza data',
      content: '{{data}}',
      ...base
    }
  ]
}

let dbStore: JsonStore<Database>
let settingsStore: JsonStore<Settings>

export function initStores(): void {
  dbStore = new JsonStore<Database>(
    'snippets.json',
    { version: DB_VERSION, snippets: seedSnippets(), folders: [] },
    (raw) => normalizeDatabase(raw)
  )
  settingsStore = new JsonStore<Settings>('settings.json', { ...DEFAULT_SETTINGS }, (raw) => ({
    ...DEFAULT_SETTINGS,
    ...(raw as Partial<Settings>)
  }))
}

/** Uzupelnia braki po recznej edycji pliku lub po starszej wersji formatu. */
function normalizeDatabase(raw: unknown): Database {
  const input = (raw ?? {}) as Partial<Database>
  const now = new Date().toISOString()
  const snippets = Array.isArray(input.snippets) ? input.snippets : []
  return {
    version: DB_VERSION,
    folders: Array.isArray(input.folders) ? input.folders : [],
    snippets: snippets
      .filter((s) => s && typeof s.trigger === 'string' && typeof s.content === 'string')
      .map((s) => ({
        id: s.id ?? randomUUID(),
        trigger: s.trigger,
        name: s.name ?? s.trigger,
        content: s.content,
        folderId: s.folderId ?? null,
        enabled: s.enabled !== false,
        createdAt: s.createdAt ?? now,
        updatedAt: s.updatedAt ?? now,
        usageCount: typeof s.usageCount === 'number' ? s.usageCount : 0,
        lastUsedAt: s.lastUsedAt ?? null
      }))
  }
}

export function flushStores(): void {
  dbStore?.flush()
  settingsStore?.flush()
}

export function storePaths(): { snippets: string; settings: string } {
  return { snippets: dbStore.filePath, settings: settingsStore.filePath }
}

/* ------------------------------------------------------------------ */
/* Snippety                                                            */
/* ------------------------------------------------------------------ */

export function listSnippets(): Snippet[] {
  return dbStore.value.snippets
}

export function getSnippet(id: string): Snippet | undefined {
  return dbStore.value.snippets.find((s) => s.id === id)
}

/**
 * Sprawdza, czy trigger nadaje sie do uzycia.
 * @param exceptId pomijany przy edycji istniejacego snippetu
 */
export function checkTrigger(trigger: string, exceptId?: string): { ok: boolean; reason?: string } {
  const value = trigger.trim()
  if (!value) return { ok: false, reason: 'Trigger nie moze byc pusty.' }
  if (/\s/.test(value)) return { ok: false, reason: 'Trigger nie moze zawierac spacji ani tabulatorow.' }
  const clash = dbStore.value.snippets.find(
    (s) => s.id !== exceptId && s.trigger.toLowerCase() === value.toLowerCase()
  )
  if (clash) return { ok: false, reason: `Trigger jest juz uzyty w snippecie "${clash.name}".` }
  return { ok: true }
}

export function createSnippet(input: SnippetInput): Snippet {
  const now = new Date().toISOString()
  const snippet: Snippet = {
    ...input,
    trigger: input.trigger.trim(),
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    lastUsedAt: null
  }
  dbStore.update((db) => {
    db.snippets.push(snippet)
  })
  return snippet
}

export function updateSnippet(id: string, patch: Partial<SnippetInput>): Snippet | null {
  let result: Snippet | null = null
  dbStore.update((db) => {
    const target = db.snippets.find((s) => s.id === id)
    if (!target) return
    Object.assign(target, patch)
    if (patch.trigger !== undefined) target.trigger = patch.trigger.trim()
    target.updatedAt = new Date().toISOString()
    result = target
  })
  return result
}

export function deleteSnippet(id: string): boolean {
  let removed = false
  dbStore.update((db) => {
    const i = db.snippets.findIndex((s) => s.id === id)
    if (i === -1) return
    db.snippets.splice(i, 1)
    removed = true
  })
  return removed
}

/** Licznik uzyc - zasila sortowanie "najczesciej uzywane" w oknie wyboru. */
export function recordUsage(id: string): void {
  dbStore.update((db) => {
    const target = db.snippets.find((s) => s.id === id)
    if (!target) return
    target.usageCount += 1
    target.lastUsedAt = new Date().toISOString()
  })
}

/* ------------------------------------------------------------------ */
/* Foldery                                                             */
/* ------------------------------------------------------------------ */

export function listFolders(): Folder[] {
  return dbStore.value.folders
}

export function createFolder(name: string): Folder {
  const folder: Folder = { id: randomUUID(), name: name.trim(), order: dbStore.value.folders.length }
  dbStore.update((db) => {
    db.folders.push(folder)
  })
  return folder
}

export function renameFolder(id: string, name: string): void {
  dbStore.update((db) => {
    const f = db.folders.find((x) => x.id === id)
    if (f) f.name = name.trim()
  })
}

/** Kasuje folder; snippety z niego wracaja do puli bez folderu. */
export function deleteFolder(id: string): void {
  dbStore.update((db) => {
    db.folders = db.folders.filter((f) => f.id !== id)
    for (const s of db.snippets) if (s.folderId === id) s.folderId = null
  })
}

/* ------------------------------------------------------------------ */
/* Ustawienia                                                          */
/* ------------------------------------------------------------------ */

export function getSettings(): Settings {
  return settingsStore.value
}

export function updateSettings(patch: Partial<Settings>): Settings {
  settingsStore.update((s) => {
    Object.assign(s, patch)
  })
  return settingsStore.value
}

/* ------------------------------------------------------------------ */
/* Eksport i import                                                    */
/* ------------------------------------------------------------------ */

export function exportAll(): string {
  return JSON.stringify(
    { ...dbStore.value, version: DB_VERSION, exportedAt: new Date().toISOString() },
    null,
    2
  )
}

/**
 * Wciaga snippety z pliku.
 * @param replaceExisting przy kolizji triggera: true nadpisuje, false pomija
 */
export function importAll(json: string, replaceExisting: boolean): ImportSummary {
  const incoming = normalizeDatabase(JSON.parse(json))
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0 }

  dbStore.update((db) => {
    for (const snippet of incoming.snippets) {
      const existing = db.snippets.find((s) => s.trigger.toLowerCase() === snippet.trigger.toLowerCase())
      if (!existing) {
        db.snippets.push({ ...snippet, id: randomUUID() })
        summary.added++
      } else if (replaceExisting) {
        Object.assign(existing, {
          name: snippet.name,
          content: snippet.content,
          enabled: snippet.enabled,
          updatedAt: new Date().toISOString()
        })
        summary.updated++
      } else {
        summary.skipped++
      }
    }
    // Foldery dokladamy tylko te, ktorych nazwy jeszcze nie ma.
    for (const folder of incoming.folders) {
      if (!db.folders.some((f) => f.name === folder.name)) db.folders.push({ ...folder, id: randomUUID() })
    }
  })

  return summary
}
