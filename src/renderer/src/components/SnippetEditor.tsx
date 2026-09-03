import { useEffect, useRef, useState } from 'react'
import type { FieldSpec, Folder } from '../../../shared/types.js'
import type { Draft } from '../App.js'
import { withCount } from '../plural.js'
import { Switch } from './Switch.js'

interface SnippetEditorProps {
  draft: Draft | null
  folders: Folder[]
  onSave: (draft: Draft) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCancel: () => void
  onFoldersChanged: () => void
}

/** Skroty wstawiane do tresci jednym klikiem. */
const SHORTCUTS: Array<{ label: string; insert: string; hint: string }> = [
  { label: 'Kursor', insert: '{{kursor}}', hint: 'Gdzie ma stanąć kursor po wklejeniu' },
  { label: 'Data', insert: '{{data}}', hint: 'Dzisiejsza data, np. 03.09.2026' },
  { label: 'Data +7', insert: '{{data:+7}}', hint: 'Data za 7 dni' },
  { label: 'Godzina', insert: '{{godzina}}', hint: 'Aktualna godzina' },
  { label: 'Schowek', insert: '{{schowek}}', hint: 'Zawartość schowka' },
  { label: 'Pole', insert: '{{pole:Nazwa}}', hint: 'Zapyta o wartość przed wklejeniem' },
  { label: 'Pole wieloliniowe', insert: '{{obszar:Uwagi}}', hint: 'Dłuższy tekst do wpisania' },
  { label: 'Lista wyboru', insert: '{{wybor:Status=Nowy|W toku}}', hint: 'Wybór z gotowych opcji' }
]

const FIELD_KIND_LABEL: Record<FieldSpec['kind'], string> = {
  text: 'tekst',
  multiline: 'tekst wieloliniowy',
  choice: 'lista wyboru'
}

export function SnippetEditor({
  draft,
  folders,
  onSave,
  onDelete,
  onCancel,
  onFoldersChanged
}: SnippetEditorProps): React.JSX.Element {
  const [value, setValue] = useState<Draft | null>(draft)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldSpec[]>([])
  const [previewText, setPreviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(draft)
    setTriggerError(null)
    setConfirmDelete(false)
  }, [draft])

  // Walidacja triggera po stronie procesu glownego - tam jest cala baza.
  useEffect(() => {
    if (!value) return
    const handle = setTimeout(async () => {
      const check = await window.api.snippets.checkTrigger(value.trigger, value.id ?? undefined)
      setTriggerError(check.ok ? null : (check.reason ?? 'Nieprawidłowy trigger.'))
    }, 250)
    return () => clearTimeout(handle)
  }, [value?.trigger, value?.id])

  // Podglad tresci z podstawionymi zmiennymi i lista wykrytych pol.
  useEffect(() => {
    if (!value) return
    const handle = setTimeout(async () => {
      const result = await window.api.snippets.preview(value.content)
      setPreviewText(result.text)
      setFields(result.fields)
    }, 200)
    return () => clearTimeout(handle)
  }, [value?.content])

  if (!value) {
    return (
      <section className="editor-pane">
        <div className="empty">
          <div className="empty-title">Nic nie jest otwarte</div>
          <div>Wybierz snippet z listy albo kliknij „Nowy”, żeby utworzyć kolejny.</div>
        </div>
      </section>
    )
  }

  const patch = (changes: Partial<Draft>): void => setValue({ ...value, ...changes })

  /** Wstawia tekst w miejscu kursora i zostawia go tuz za wstawka. */
  const insertAtCursor = (text: string): void => {
    const area = contentRef.current
    if (!area) return
    const start = area.selectionStart
    const end = area.selectionEnd
    const next = value.content.slice(0, start) + text + value.content.slice(end)
    patch({ content: next })
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const addFolder = async (): Promise<void> => {
    const name = window.prompt('Nazwa nowego folderu:')?.trim()
    if (!name) return
    const folder = await window.api.folders.create(name)
    onFoldersChanged()
    patch({ folderId: folder.id })
  }

  const canSave = !triggerError && value.trigger.trim().length > 0 && value.content.length > 0

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(value)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="editor-pane">
      <div className="editor-scroll">
        <div className="editor-row">
          <div className="field editor-name">
            <label htmlFor="snippet-name">Nazwa</label>
            <input
              id="snippet-name"
              type="text"
              value={value.name}
              placeholder="np. Przywitanie w mailu"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>

          <div className="field editor-trigger">
            <label htmlFor="snippet-trigger">Trigger</label>
            <input
              id="snippet-trigger"
              type="text"
              value={value.trigger}
              spellCheck={false}
              placeholder="/przywitanie"
              onChange={(e) => patch({ trigger: e.target.value })}
            />
            {triggerError ? (
              <span className="field-error">{triggerError}</span>
            ) : (
              <span className="field-hint">To wpisujesz, żeby wstawić tekst.</span>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="snippet-content">Treść</label>
          <textarea
            id="snippet-content"
            ref={contentRef}
            rows={12}
            value={value.content}
            spellCheck={false}
            placeholder="Tekst, który ma się wstawić…"
            onChange={(e) => patch({ content: e.target.value })}
          />
        </div>

        <div className="shortcut-bar">
          {SHORTCUTS.map((item) => (
            <button
              key={item.insert}
              className="chip"
              title={item.hint}
              onClick={() => insertAtCursor(item.insert)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {fields.length > 0 ? (
          <div className="detected">
            <div className="detected-title">
              Przed wklejeniem aplikacja zapyta o {withCount(fields.length, 'pole', 'pola', 'pól')}:
            </div>
            <ul className="detected-list">
              {fields.map((field) => (
                <li key={field.key}>
                  <strong>{field.label}</strong>
                  <span className="badge">{FIELD_KIND_LABEL[field.kind]}</span>
                  {field.kind === 'choice' ? (
                    <span className="detected-meta">{field.options.join(' · ')}</span>
                  ) : field.defaultValue ? (
                    <span className="detected-meta">domyślnie: {field.defaultValue}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {previewText && previewText !== value.content ? (
          <div className="field">
            <label>Podgląd po podstawieniu zmiennych</label>
            <pre className="preview selectable">{previewText}</pre>
          </div>
        ) : null}

        <div className="editor-row">
          <div className="field editor-folder">
            <label htmlFor="snippet-folder">Folder</label>
            <div className="folder-row">
              <select
                id="snippet-folder"
                value={value.folderId ?? ''}
                onChange={(e) => patch({ folderId: e.target.value || null })}
              >
                <option value="">Bez folderu</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm" onClick={() => void addFolder()}>
                Nowy folder
              </button>
            </div>
          </div>

          <div className="field editor-enabled">
            <label>Stan</label>
            <Switch
              checked={value.enabled}
              onChange={(v) => patch({ enabled: v })}
              label={value.enabled ? 'Aktywny' : 'Wyłączony'}
            />
          </div>
        </div>
      </div>

      <footer className="editor-footer">
        {value.id ? (
          confirmDelete ? (
            <span className="confirm-row">
              <span className="confirm-text">Na pewno usunąć?</span>
              <button className="btn btn-danger btn-sm" onClick={() => void onDelete(value.id!)}>
                Tak, usuń
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Anuluj
              </button>
            </span>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
              Usuń
            </button>
          )
        ) : (
          <span />
        )}

        <div className="editor-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Zamknij
          </button>
          <button className="btn btn-primary" disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? 'Zapisywanie…' : value.id ? 'Zapisz zmiany' : 'Utwórz snippet'}
          </button>
        </div>
      </footer>
    </section>
  )
}
