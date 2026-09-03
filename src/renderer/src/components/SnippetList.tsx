import type { Folder, Snippet } from '../../../shared/types.js'
import { withCount } from '../plural.js'

interface SnippetListProps {
  snippets: Snippet[]
  folders: Folder[]
  total: number
  query: string
  folderFilter: string | null
  selectedId: string | null
  onQueryChange: (value: string) => void
  onFolderFilterChange: (value: string | null) => void
  onSelect: (snippet: Snippet) => void
  onNew: () => void
}

/** Pierwsza linia tresci jako podglad - reszta i tak sie nie zmiesci. */
function preview(content: string): string {
  const line = content.split('\n').find((l) => l.trim().length > 0) ?? ''
  return line.length > 90 ? line.slice(0, 90) + '…' : line
}

export function SnippetList({
  snippets,
  folders,
  total,
  query,
  folderFilter,
  selectedId,
  onQueryChange,
  onFolderFilterChange,
  onSelect,
  onNew
}: SnippetListProps): React.JSX.Element {
  return (
    <section className="list-pane">
      <div className="list-header">
        <input
          type="search"
          placeholder="Szukaj po nazwie, triggerze lub treści…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button className="btn btn-primary" onClick={onNew}>
          + Nowy
        </button>
      </div>

      {folders.length > 0 ? (
        <div className="folder-filter">
          <button
            className={folderFilter === null ? 'chip chip-active' : 'chip'}
            onClick={() => onFolderFilterChange(null)}
          >
            Wszystkie
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={folderFilter === folder.id ? 'chip chip-active' : 'chip'}
              onClick={() => onFolderFilterChange(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="list-scroll">
        {snippets.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {total === 0 ? 'Nie masz jeszcze snippetów' : 'Nic nie pasuje do wyszukiwania'}
            </div>
            <div>
              {total === 0
                ? 'Kliknij „Nowy”, żeby dodać pierwszy szablon.'
                : 'Zmień frazę albo wyczyść filtr folderu.'}
            </div>
          </div>
        ) : (
          snippets.map((snippet) => (
            <button
              key={snippet.id}
              className={snippet.id === selectedId ? 'list-item list-item-active' : 'list-item'}
              onClick={() => onSelect(snippet)}
            >
              <div className="list-item-top">
                <span className="trigger-chip">{snippet.trigger}</span>
                {!snippet.enabled ? <span className="badge">wyłączony</span> : null}
                {snippet.usageCount > 0 ? (
                  <span className="list-item-count">{snippet.usageCount}×</span>
                ) : null}
              </div>
              <div className="list-item-name">{snippet.name}</div>
              <div className="list-item-preview">{preview(snippet.content)}</div>
            </button>
          ))
        )}
      </div>

      <div className="list-footer">
        {snippets.length === total
          ? withCount(total, 'snippet', 'snippety', 'snippetów')
          : `${snippets.length} z ${total}`}
      </div>
    </section>
  )
}
