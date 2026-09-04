/**
 * Wspolny model danych dla procesu glownego i renderera.
 * Ten plik nie moze importowac niczego z electron ani z node - jest ladowany
 * po obu stronach mostka IPC.
 */

/** Pojedynczy snippet. `trigger` jest unikalny w calej bazie. */
export interface Snippet {
  id: string
  /** Ciag wpisywany przez uzytkownika, np. "/przywitanie". Zawsze bez spacji. */
  trigger: string
  /** Etykieta widoczna w liscie i w wyszukiwarce. */
  name: string
  /** Tresc z placeholderami - patrz DOCS.md, sekcja "Placeholdery". */
  content: string
  folderId: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  usageCount: number
  lastUsedAt: string | null
}

export interface Folder {
  id: string
  name: string
  order: number
}

/** Kiedy rozwiniecie ma sie odpalic. */
export type ExpandMode = 'immediate' | 'terminator'

export interface Settings {
  /** Globalny wylacznik - hook zostaje, ale nie rozwija. */
  enabled: boolean
  /**
   * `immediate` - zamiana w chwili wpisania ostatniego znaku triggera.
   * `terminator` - zamiana dopiero po znaku konczacym (spacja, enter, tab...).
   */
  expandMode: ExpandMode
  /** Znaki traktowane jako konczace w trybie `terminator`. */
  terminators: string[]
  /** Czy zostawic znak konczacy po rozwinieciu (tryb `terminator`). */
  keepTerminator: boolean
  /** Czy wielkosc liter w triggerze ma znaczenie. */
  matchCase: boolean
  /** Trigger odpala sie tylko na granicy slowa (poprzedni znak nie jest litera/cyfra). */
  requireWordBoundary: boolean
  /** Czy przywracac poprzednia zawartosc schowka po wklejeniu. */
  restoreClipboard: boolean
  /** Skrot otwierajacy okno szybkiego wyboru. Format akceleratora Electrona. */
  paletteHotkey: string
  /** Start z systemem. */
  autostart: boolean
  /** Start zwiniety do zasobnika. */
  startMinimized: boolean
  theme: 'dark' | 'light' | 'system'
}

/** Calosc bazy zapisywana na dysk jako jeden plik JSON. */
export interface Database {
  version: number
  snippets: Snippet[]
  folders: Folder[]
}

/* ------------------------------------------------------------------ */
/* Placeholdery                                                        */
/* ------------------------------------------------------------------ */

/** Typ pola, o ktore aplikacja pyta uzytkownika przed wklejeniem. */
export type FieldKind = 'text' | 'multiline' | 'choice'

export interface FieldSpec {
  /** Klucz laczacy wystapienia tego samego pola w tresci. */
  key: string
  label: string
  kind: FieldKind
  defaultValue: string
  /** Tylko dla `choice`. */
  options: string[]
}

/** Zadanie wyslane do okna formularza. */
export interface FormRequest {
  snippetName: string
  fields: FieldSpec[]
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

export type SnippetInput = Omit<
  Snippet,
  'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsedAt'
>

/** Wynik walidacji triggera - uzywany przez formularz edycji. */
export interface TriggerCheck {
  ok: boolean
  reason?: string
}

/** Podsumowanie importu pliku z snippetami. */
export interface ImportSummary {
  added: number
  updated: number
  skipped: number
}

export interface ExpansionEvent {
  snippetId: string
  trigger: string
  at: string
}

/* ------------------------------------------------------------------ */
/* Kontrakt mostka preload -> renderer                                 */
/* ------------------------------------------------------------------ */

/** Funkcja odpinajaca nasluch, zwracana przez subskrypcje. */
export type Unsubscribe = () => void

/**
 * Cala powierzchnia, przez ktora UI moze cokolwiek zrobic.
 * Preload implementuje ten interfejs, renderer go konsumuje jako `window.api`.
 */
export interface SnippetyApi {
  snippets: {
    list(): Promise<Snippet[]>
    create(input: SnippetInput): Promise<Snippet>
    update(id: string, patch: Partial<SnippetInput>): Promise<Snippet | null>
    remove(id: string): Promise<boolean>
    checkTrigger(trigger: string, exceptId?: string): Promise<TriggerCheck>
    preview(content: string): Promise<{ text: string; fields: FieldSpec[] }>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string): Promise<Folder>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  palette: {
    insert(id: string): Promise<boolean>
    hide(): void
  }
  form: {
    submit(values: Record<string, string>): void
    cancel(): void
  }
  app: {
    info(): Promise<{ version: string; paths: { snippets: string; settings: string } }>
    exportToFile(): Promise<{ ok: boolean; path?: string }>
    importFromFile(replaceExisting: boolean): Promise<{ ok: boolean; summary?: ImportSummary; error?: string }>
    openDataFolder(): Promise<void>
    /** Otwiera liste wydan w przegladarce - do sprawdzenia, czy jest nowsza wersja. */
    openReleases(): Promise<void>
    showManager(): Promise<void>
  }
  on: {
    snippetsChanged(fn: () => void): Unsubscribe
    settingsChanged(fn: (settings: Settings) => void): Unsubscribe
    paletteOpened(fn: () => void): Unsubscribe
    formRequest(fn: (request: FormRequest) => void): Unsubscribe
  }
}
