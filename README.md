# Snippety

Lokalna aplikacja na Windows do powtarzalnych tekstów. Wpisujesz `/przywitanie`
w dowolnym polu — w mailu, na czacie, w formularzu — a aplikacja zamienia to na
przygotowany wcześniej szablon.

Wszystko dzieje się na Twoim komputerze. Bez konta, bez serwera, bez internetu.

## Co potrafi

- **Zamiana w locie** — trigger wpisany w dowolnej aplikacji zamienia się na tekst.
- **Pola do wypełnienia** — szablon może pytać o imię, firmę czy status, zanim
  się wklei. Pola tekstowe, wieloliniowe i listy wyboru.
- **Zmienne** — dzisiejsza data, data za X dni, godzina, zawartość schowka.
- **Znacznik kursora** — kursor ląduje tam, gdzie chcesz zacząć pisać.
- **Okno szybkiego wyboru** — `Ctrl+Shift+Space` otwiera listę z wyszukiwarką,
  gdy trigger wyleciał z głowy.
- **Foldery, eksport i import** — baza to jeden czytelny plik JSON.

## Instalacja

Gotowe pliki nie leżą w repozytorium (katalog `release/` jest ignorowany).
Zbuduj je poleceniem `npm run dist` — powstaną dwa: instalator
`Snippety Setup X.Y.Z.exe` oraz wersja portable, czyli jeden plik `.exe`
działający bez instalacji.

Windows pokaże ostrzeżenie SmartScreen, bo aplikacja nie jest podpisana
certyfikatem — „Więcej informacji” → „Uruchom mimo to”.

## Jak używać

1. Aplikacja siedzi w zasobniku obok zegara. Kliknięcie w ikonę otwiera okno.
2. **Nowy** → wpisz nazwę, trigger (np. `/podpis`) i treść → **Utwórz snippet**.
3. Od tej chwili wpisanie `/podpis` w dowolnym polu wstawi Twój tekst.

### Składnia szablonów

```
Dzień dobry {{pole:Imię}},

w sprawie {{pole:Firma=ACME}} — termin do {{data:+14}}.
Status: {{wybor:Status=Nowy|W toku|Zamknięty}}

{{kursor}}

Pozdrawiam
```

| Zapis | Co robi |
|---|---|
| `{{data}}` | dzisiejsza data |
| `{{data:+7}}` | data za 7 dni |
| `{{data:RRRR-MM-DD}}` | data w wybranym formacie |
| `{{godzina}}` | aktualna godzina |
| `{{schowek}}` | zawartość schowka |
| `{{kursor}}` | tu stanie kursor po wklejeniu |
| `{{pole:Nazwa}}` | zapyta o wartość przed wklejeniem |
| `{{obszar:Nazwa}}` | to samo, ale dłuższy tekst |
| `{{wybor:Nazwa=A\|B\|C}}` | lista wyboru |

Ta sama etykieta użyta kilka razy to jedno pole — wpisujesz raz, wstawia się
wszędzie. Przycisków ze skrótami do wstawiania nie trzeba znać na pamięć, są
pod polem treści w edytorze.

**Trigger musi być bez polskich znaków** (`/oferta`, nie `/zażółć`). Treść
snippetu — dowolna.

## Rozwój

```bash
npm install     # przy pierwszym uruchomieniu patrz DOCS.md 10.1
npm run dev     # tryb deweloperski
npm test        # testy parsera
npm run dist    # instalator do release/
```

Architektura, składnia i znane pułapki: **`DOCS.md`**.
Zadania i dług: **`TODO.md`**.

## Stack

Electron 44 · React 19 · TypeScript · electron-vite · uiohook-napi
