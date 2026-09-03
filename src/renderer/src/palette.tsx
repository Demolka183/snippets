/**
 * Okno szybkiego wyboru.
 *
 * Otwiera je globalny skrot, gdy uzytkownik nie pamieta triggera. Obsluga jest
 * wylacznie klawiaturowa: pisanie filtruje, strzalki wybieraja, Enter wstawia,
 * Escape zamyka. Mysz dziala, ale nie jest do niczego potrzebna.
 */

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Snippet } from '../../shared/types.js'
import './styles/app.css'
import './styles/palette.css'

/** Najpierw najczesciej uzywane, potem alfabetycznie - bez wyszukiwania to sensowna kolejnosc. */
function byUsage(a: Snippet, b: Snippet): number {
  if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
  return a.trigger.localeCompare(b.trigger, 'pl')
}

function Palette(): React.JSX.Element {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [inserting, setInserting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = async (): Promise<void> => {
    setSnippets((await window.api.snippets.list()).filter((s) => s.enabled))
  }

  useEffect(() => {
    void load()
    const offSnippets = window.api.on.snippetsChanged(() => void load())
    // Kazde otwarcie zaczyna od czystego pola - inaczej wracalaby stara fraza.
    const offOpened = window.api.on.paletteOpened(() => {
      setQuery('')
      setActive(0)
      setInserting(false)
      void load()
      requestAnimationFrame(() => inputRef.current?.focus())
    })
    inputRef.current?.focus()
    return () => {
      offSnippets()
      offOpened()
    }
  }, [])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return [...snippets].sort(byUsage)
    return snippets
      .filter(
        (s) =>
          s.trigger.toLowerCase().includes(needle) ||
          s.name.toLowerCase().includes(needle) ||
          s.content.toLowerCase().includes(needle)
      )
      .sort(byUsage)
  }, [snippets, query])

  // Po zmianie filtru podswietlenie wraca na gore listy.
  useEffect(() => setActive(0), [query])

  // Podswietlony element ma byc widoczny przy nawigacji strzalkami.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const insert = async (snippet: Snippet): Promise<void> => {
    setInserting(true)
    await window.api.palette.insert(snippet.id)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      window.api.palette.hide()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = results[active]
      if (chosen) void insert(chosen)
    }
  }

  return (
    <div className="palette" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        className="palette-input"
        type="text"
        value={query}
        spellCheck={false}
        placeholder="Szukaj snippetu…"
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="palette-list" ref={listRef}>
        {results.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Brak wyników</div>
            <div>{snippets.length === 0 ? 'Nie masz aktywnych snippetów.' : 'Spróbuj innej frazy.'}</div>
          </div>
        ) : (
          results.map((snippet, i) => (
            <button
              key={snippet.id}
              data-active={i === active}
              className={i === active ? 'palette-item palette-item-active' : 'palette-item'}
              onMouseEnter={() => setActive(i)}
              onClick={() => void insert(snippet)}
            >
              <span className="trigger-chip">{snippet.trigger}</span>
              <span className="palette-item-name">{snippet.name}</span>
            </button>
          ))
        )}
      </div>

      <div className="palette-footer">
        {inserting ? (
          <span>Wstawianie…</span>
        ) : (
          <>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> wybór
            </span>
            <span>
              <kbd>Enter</kbd> wstaw
            </span>
            <span>
              <kbd>Esc</kbd> zamknij
            </span>
          </>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Palette />
  </StrictMode>
)
