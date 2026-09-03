import { useEffect, useState } from 'react'
import type { Folder, Settings } from '../../../shared/types.js'
import { Switch } from './Switch.js'

interface SettingsViewProps {
  settings: Settings
  folders: Folder[]
  onChange: (settings: Settings) => void
  onFoldersChanged: () => void
}

/** Zamienia zdarzenie klawiatury na akcelerator w formacie Electrona. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Super')

  const key = e.key
  // Sam modyfikator to jeszcze nie skrot - czekamy na klawisz glowny.
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(key)) return null
  // Skrot bez modyfikatora przejalby zwykle pisanie.
  if (parts.length === 0) return null

  if (key === ' ') parts.push('Space')
  else if (key.length === 1) parts.push(key.toUpperCase())
  else parts.push(key)

  return parts.join('+')
}

export function SettingsView({
  settings,
  folders,
  onChange,
  onFoldersChanged
}: SettingsViewProps): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; paths: { snippets: string } } | null>(null)
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.api.app.info().then(setInfo)
  }, [])

  const patch = async (changes: Partial<Settings>): Promise<void> => {
    onChange(await window.api.settings.update(changes))
  }

  const exportFile = async (): Promise<void> => {
    const result = await window.api.app.exportToFile()
    setMessage(result.ok ? `Zapisano do ${result.path}` : null)
  }

  const importFile = async (replace: boolean): Promise<void> => {
    const result = await window.api.app.importFromFile(replace)
    if (!result.ok) {
      setMessage(result.error ? `Import nie powiódł się: ${result.error}` : null)
      return
    }
    const s = result.summary!
    setMessage(`Import: dodano ${s.added}, zaktualizowano ${s.updated}, pominięto ${s.skipped}.`)
    onFoldersChanged()
  }

  return (
    <div className="settings">
      <div className="settings-scroll">
        <section className="settings-group">
          <h2>Rozwijanie</h2>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Kiedy zamieniać trigger</div>
              <div className="setting-hint">
                „Natychmiast” podmienia tekst w chwili dopisania ostatniego znaku triggera.
                „Po znaku kończącym” czeka na spację, tab lub enter — bezpieczniejsze, gdy
                triggery są krótkie i mogą trafić w środek zwykłego słowa.
              </div>
            </div>
            <select
              value={settings.expandMode}
              onChange={(e) => void patch({ expandMode: e.target.value as Settings['expandMode'] })}
            >
              <option value="immediate">Natychmiast</option>
              <option value="terminator">Po znaku kończącym</option>
            </select>
          </div>

          {settings.expandMode === 'terminator' ? (
            <div className="setting">
              <div className="setting-text">
                <div className="setting-label">Zostaw znak kończący</div>
                <div className="setting-hint">
                  Spacja, którą zamknąłeś trigger, zostanie dopisana za wstawionym tekstem.
                </div>
              </div>
              <Switch checked={settings.keepTerminator} onChange={(v) => void patch({ keepTerminator: v })} />
            </div>
          ) : null}

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Rozróżniaj wielkość liter</div>
              <div className="setting-hint">
                Przy wyłączonym ustawieniu <code>/Oferta</code> zadziała tak samo jak <code>/oferta</code>.
              </div>
            </div>
            <Switch checked={settings.matchCase} onChange={(v) => void patch({ matchCase: v })} />
          </div>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Tylko na granicy słowa</div>
              <div className="setting-hint">
                Trigger zaczynający się od litery nie odpali w środku wyrazu. Nie dotyczy triggerów
                zaczynających się od znaku typu <code>/</code>.
              </div>
            </div>
            <Switch
              checked={settings.requireWordBoundary}
              onChange={(v) => void patch({ requireWordBoundary: v })}
            />
          </div>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Przywracaj schowek</div>
              <div className="setting-hint">
                Wstawianie idzie przez schowek. Przy włączonej opcji poprzednia zawartość wraca
                po wklejeniu.
              </div>
            </div>
            <Switch
              checked={settings.restoreClipboard}
              onChange={(v) => void patch({ restoreClipboard: v })}
            />
          </div>
        </section>

        <section className="settings-group">
          <h2>Skrót i uruchamianie</h2>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Skrót okna szybkiego wyboru</div>
              <div className="setting-hint">
                Otwiera listę snippetów z wyszukiwarką, gdy nie pamiętasz triggera.
              </div>
            </div>
            <button
              className={recording ? 'btn btn-primary hotkey' : 'btn hotkey'}
              onClick={() => setRecording(true)}
              onBlur={() => setRecording(false)}
              onKeyDown={(e) => {
                if (!recording) return
                e.preventDefault()
                if (e.key === 'Escape') {
                  setRecording(false)
                  return
                }
                const accelerator = toAccelerator(e)
                if (!accelerator) return
                void patch({ paletteHotkey: accelerator })
                setRecording(false)
              }}
            >
              {recording ? 'Naciśnij kombinację…' : settings.paletteHotkey || 'Brak'}
            </button>
          </div>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Uruchamiaj z systemem</div>
              <div className="setting-hint">Działa dopiero w wersji zainstalowanej, nie w trybie deweloperskim.</div>
            </div>
            <Switch checked={settings.autostart} onChange={(v) => void patch({ autostart: v })} />
          </div>

          <div className="setting">
            <div className="setting-text">
              <div className="setting-label">Startuj zwinięty do zasobnika</div>
              <div className="setting-hint">Okno nie pokaże się przy starcie; ikona czeka przy zegarze.</div>
            </div>
            <Switch checked={settings.startMinimized} onChange={(v) => void patch({ startMinimized: v })} />
          </div>
        </section>

        <section className="settings-group">
          <h2>Foldery</h2>
          {folders.length === 0 ? (
            <div className="setting-hint">
              Nie masz jeszcze folderów. Utworzysz je w edytorze snippetu, przy polu „Folder”.
            </div>
          ) : (
            <ul className="folder-list">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <span>{folder.name}</span>
                  <span className="folder-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        const name = window.prompt('Nowa nazwa folderu:', folder.name)?.trim()
                        if (!name) return
                        await window.api.folders.rename(folder.id, name)
                        onFoldersChanged()
                      }}
                    >
                      Zmień nazwę
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        await window.api.folders.remove(folder.id)
                        onFoldersChanged()
                      }}
                    >
                      Usuń
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="setting-hint">Usunięcie folderu nie kasuje snippetów — wracają do puli bez folderu.</div>
        </section>

        <section className="settings-group">
          <h2>Kopia i przenoszenie</h2>
          <div className="button-row">
            <button className="btn" onClick={() => void exportFile()}>
              Eksportuj do pliku
            </button>
            <button className="btn" onClick={() => void importFile(false)}>
              Importuj (pomiń istniejące)
            </button>
            <button className="btn" onClick={() => void importFile(true)}>
              Importuj (nadpisz istniejące)
            </button>
            <button className="btn btn-ghost" onClick={() => void window.api.app.openDataFolder()}>
              Pokaż folder z danymi
            </button>
          </div>
          {message ? <div className="settings-message selectable">{message}</div> : null}
          {info ? (
            <div className="setting-hint selectable">
              Wersja {info.version} · baza: {info.paths.snippets}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
