/**
 * Okno pytajace o wartosci pol.
 *
 * Pokazuje sie miedzy wpisaniem triggera a wklejeniem tekstu, wiec musi byc
 * szybkie do obslugi: pierwsze pole dostaje focus od razu, Enter zatwierdza,
 * Escape anuluje cale rozwiniecie i zostawia trigger nietkniety.
 */

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { FormRequest } from '../../shared/types.js'
import './styles/app.css'
import './styles/form.css'

function FillForm(): React.JSX.Element {
  const [request, setRequest] = useState<FormRequest | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    return window.api.on.formRequest((incoming) => {
      setRequest(incoming)
      // Wartosci domyslne ze skladni {{pole:Nazwa=domyslna}}.
      const initial: Record<string, string> = {}
      for (const field of incoming.fields) initial[field.key] = field.defaultValue
      setValues(initial)
      requestAnimationFrame(() => firstFieldRef.current?.focus())
    })
  }, [])

  const submit = (): void => window.api.form.submit(values)
  const cancel = (): void => window.api.form.cancel()

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    // W polu wieloliniowym Enter dodaje nowa linie; zatwierdza dopiero Ctrl+Enter.
    const inTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA'
    if (e.key === 'Enter' && (!inTextarea || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  if (!request) return <div className="empty">Wczytywanie…</div>

  return (
    <div className="fill" onKeyDown={onKeyDown}>
      <header className="fill-header">
        <span className="fill-title">{request.snippetName}</span>
        <span className="fill-sub">Uzupełnij pola i zatwierdź</span>
      </header>

      <div className="fill-body">
        {request.fields.map((field, i) => {
          const shared = {
            value: values[field.key] ?? '',
            onChange: (e: { target: { value: string } }) =>
              setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
          }

          return (
            <div className="field" key={field.key}>
              <label htmlFor={`f-${field.key}`}>{field.label}</label>
              {field.kind === 'choice' ? (
                <select
                  id={`f-${field.key}`}
                  ref={i === 0 ? (firstFieldRef as React.Ref<HTMLSelectElement>) : undefined}
                  {...shared}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'multiline' ? (
                <textarea
                  id={`f-${field.key}`}
                  ref={i === 0 ? (firstFieldRef as React.Ref<HTMLTextAreaElement>) : undefined}
                  rows={3}
                  {...shared}
                />
              ) : (
                <input
                  id={`f-${field.key}`}
                  ref={i === 0 ? (firstFieldRef as React.Ref<HTMLInputElement>) : undefined}
                  type="text"
                  {...shared}
                />
              )}
            </div>
          )
        })}
      </div>

      <footer className="fill-footer">
        <span className="fill-hint">
          <kbd>Enter</kbd> wstaw · <kbd>Esc</kbd> anuluj
        </span>
        <span className="fill-actions">
          <button className="btn btn-ghost btn-sm" onClick={cancel}>
            Anuluj
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit}>
            Wstaw
          </button>
        </span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FillForm />
  </StrictMode>
)
