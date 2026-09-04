/**
 * Okno glowne - zarzadzanie baza snippetow.
 *
 * Stan bazy zyje w procesie glownym; tutaj trzymamy tylko jego kopie do
 * wyswietlenia i odswiezamy ja po kazdym zdarzeniu `snippetsChanged`.
 * Dzieki temu zmiana zrobiona z palety albo z zasobnika od razu widac w liscie.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Folder, Settings, Snippet } from '../../shared/types.js'
import { SnippetEditor } from './components/SnippetEditor.js'
import { SnippetList } from './components/SnippetList.js'
import { SettingsView } from './components/SettingsView.js'
import { Switch } from './components/Switch.js'

type View = 'snippets' | 'settings'

/** Pusty szkic nowego snippetu - `id: null` odroznia go od zapisanego. */
export interface Draft {
  id: string | null
  name: string
  trigger: string
  content: string
  folderId: string | null
  enabled: boolean
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  trigger: '/',
  content: '',
  folderId: null,
  enabled: true
}

function toDraft(snippet: Snippet): Draft {
  return {
    id: snippet.id,
    name: snippet.name,
    trigger: snippet.trigger,
    content: snippet.content,
    folderId: snippet.folderId,
    enabled: snippet.enabled
  }
}

export function App(): React.JSX.Element {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('snippets')
  const [query, setQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [version, setVersion] = useState('')

  const reload = useCallback(async () => {
    const [list, folderList] = await Promise.all([window.api.snippets.list(), window.api.folders.list()])
    setSnippets(list)
    setFolders(folderList)
  }, [])

  useEffect(() => {
    void reload()
    void window.api.settings.get().then(setSettings)
    void window.api.app.info().then((info) => setVersion(info.version))
    const offSnippets = window.api.on.snippetsChanged(() => void reload())
    const offSettings = window.api.on.settingsChanged(setSettings)
    return () => {
      offSnippets()
      offSettings()
    }
  }, [reload])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return snippets
      .filter((s) => (folderFilter === null ? true : s.folderId === folderFilter))
      .filter((s) => {
        if (!needle) return true
        return (
          s.name.toLowerCase().includes(needle) ||
          s.trigger.toLowerCase().includes(needle) ||
          s.content.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => a.trigger.localeCompare(b.trigger, 'pl'))
  }, [snippets, query, folderFilter])

  /* --- akcje --- */

  const selectSnippet = (snippet: Snippet): void => setDraft(toDraft(snippet))

  const startNew = (): void => setDraft({ ...EMPTY_DRAFT, folderId: folderFilter })

  const saveDraft = async (value: Draft): Promise<void> => {
    const payload = {
      name: value.name.trim() || value.trigger,
      trigger: value.trigger,
      content: value.content,
      folderId: value.folderId,
      enabled: value.enabled
    }
    if (value.id) {
      await window.api.snippets.update(value.id, payload)
      setDraft({ ...value, ...payload })
    } else {
      const created = await window.api.snippets.create(payload)
      setDraft(toDraft(created))
    }
  }

  const removeDraft = async (id: string): Promise<void> => {
    await window.api.snippets.remove(id)
    setDraft(null)
  }

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    setSettings(await window.api.settings.update({ enabled }))
  }

  if (!settings) return <div className="empty">Wczytywanie…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">/</span>
          <span className="brand-name">Snippety</span>
          {version ? (
            <button
              className="version-badge"
              title={`Wersja ${version} — kliknij, żeby sprawdzić, czy jest nowsza`}
              onClick={() => void window.api.app.openReleases()}
            >
              {version}
            </button>
          ) : null}
        </div>

        <div className="topbar-actions">
          <Switch
            checked={settings.enabled}
            onChange={(v) => void toggleEnabled(v)}
            label={settings.enabled ? 'Rozwijanie włączone' : 'Rozwijanie wstrzymane'}
          />
          <button
            className={view === 'settings' ? 'btn btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setView(view === 'settings' ? 'snippets' : 'settings')}
          >
            {view === 'settings' ? 'Wróć do snippetów' : 'Ustawienia'}
          </button>
        </div>
      </header>

      {view === 'settings' ? (
        <SettingsView
          settings={settings}
          folders={folders}
          onChange={setSettings}
          onFoldersChanged={() => void reload()}
        />
      ) : (
        <main className="workspace">
          <SnippetList
            snippets={filtered}
            folders={folders}
            total={snippets.length}
            query={query}
            folderFilter={folderFilter}
            selectedId={draft?.id ?? null}
            onQueryChange={setQuery}
            onFolderFilterChange={setFolderFilter}
            onSelect={selectSnippet}
            onNew={startNew}
          />
          <SnippetEditor
            key={draft?.id ?? 'new'}
            draft={draft}
            folders={folders}
            onSave={saveDraft}
            onDelete={removeDraft}
            onCancel={() => setDraft(null)}
            onFoldersChanged={() => void reload()}
          />
        </main>
      )}
    </div>
  )
}
