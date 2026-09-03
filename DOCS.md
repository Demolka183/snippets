# Snippety — referencja techniczna

Pełny opis działania aplikacji. Reguły zachowania dla agenta są w `CLAUDE.md`,
otwarte zadania w `TODO.md`.

---

## 1. Czym to jest

Rezydentna aplikacja na Windows. Nasłuchuje globalnie klawiatury i w chwili, gdy
użytkownik wpisze zarejestrowany **trigger** (np. `/przywitanie`), kasuje go
i wkleja w to miejsce wcześniej przygotowany tekst. Działa w każdym polu
tekstowym w systemie — w przeglądarce, Outlooku, Teams, Wordzie, terminalu.

Drugi sposób wywołania to **okno szybkiego wyboru** pod globalnym skrótem
(domyślnie `Ctrl+Shift+Space`) — lista snippetów z wyszukiwarką, na wypadek gdy
trigger wyleciał z głowy.

Aplikacja jest w całości lokalna. Nie ma serwera, konta ani synchronizacji.

---

## 2. Stack i dlaczego taki

| Wybór | Powód |
|---|---|
| **Electron 44** | Działa na gołym Node bez łańcucha kompilacji. Tauri byłby lżejszy, ale wymaga Rusta i Visual Studio Build Tools (kilka GB instalacji z GUI), a i tak nic z tego nie przenosi się na Androida — tam text expansion to własne IME, osobna implementacja. |
| **React 19 + TypeScript** | Trzy okna o zupełnie różnym charakterze; stan i tak trzeba czymś trzymać. |
| **electron-vite 5** | Buduje trzy targety (main, preload, renderer) jedną konfiguracją, ma HMR w dev. |
| **uiohook-napi 1.5.5** | Jedyna sensowna paczka dająca **jednocześnie** globalny hook (`WH_KEYBOARD_LL`) i wstrzykiwanie klawiszy (`SendInput`). Gotowe binarki N-API — bez kompilacji. |
| **Pliki JSON** | Baza ma rozmiar kilkudziesięciu kB. SQLite wymagałby kompilacji natywnej i niczego by nie dał. JSON jest czytelny, wersjonowalny i gotowy do przeniesienia na Androida. |

### Przypięte wersje — nie ruszać osobno

`electron-vite@5` akceptuje Vite `^5 || ^6 || ^7`, więc **Vite jest przypięty do 7.x**.
`@vitejs/plugin-react` od wersji 5.2 wymaga Vite 8, więc jest przypięty do **dokładnie `5.1.4`**.
Te trzy paczki podnosi się razem albo wcale.

---

## 3. Struktura plików

```
src/
├── shared/
│   └── types.ts            Model danych + kontrakt SnippetyApi. Bez importów z electron/node.
├── main/                   Proces główny (Node)
│   ├── index.ts            Punkt wejścia, kolejność startu, single instance lock
│   ├── windows.ts          Trzy okna: manager, palette, form
│   ├── ipc.ts              Wszystkie kanały IPC
│   ├── system.ts           Zasobnik, autostart, globalny skrót
│   ├── keyboard/
│   │   ├── keymap.ts       Kod klawisza (scancode) → znak
│   │   ├── buffer.ts       Bufor wpisanego tekstu + indeks triggerów
│   │   └── inject.ts       Backspace, wklejanie przez schowek, ruch karetki
│   ├── expansion/
│   │   ├── placeholders.ts Parser i renderer {{...}}
│   │   └── engine.ts       Spina wszystko; jedyny właściciel stanu bufora
│   └── store/
│       ├── jsonStore.ts    Atomowy zapis/odczyt JSON
│       └── index.ts        Repozytorium snippetów, folderów i ustawień
├── preload/
│   └── index.ts            contextBridge → window.api
└── renderer/               Trzy strony, wspólny CSS
    ├── index.html          Manager
    ├── palette.html        Szybki wybór
    ├── form.html           Uzupełnianie pól
    └── src/
        ├── App.tsx         Powłoka managera
        ├── palette.tsx     Okno szybkiego wyboru
        ├── form.tsx        Okno pól
        ├── plural.ts       Odmiana liczebników
        ├── components/     SnippetList, SnippetEditor, SettingsView, Switch
        └── styles/         app.css (wspólne) + manager/palette/form
scripts/
└── make-icons.mjs          Generator icon.png i icon.ico
tests/
└── placeholders.test.mjs   Testy parsera (npm test)
```

---

## 4. Przepływ rozwijania

To najważniejsza część aplikacji. Cała logika żyje w `expansion/engine.ts`.

### 4.1 Nasłuch

`uIOhook` zgłasza każde naciśnięcie klawisza w systemie. Zdarzenie zawiera
`keycode` (scancode PC set 1 — kod **fizycznego** klawisza, nie znaku) oraz
stany modyfikatorów.

`keymap.ts:classifyKey()` zamienia to na jedną z pięciu decyzji:

| Decyzja | Kiedy | Efekt na buforze |
|---|---|---|
| `char` | zwykły klawisz znakowy | dopisz znak |
| `backspace` | Backspace | usuń ostatni znak |
| `diacritic` | AltGr + litera (polskie znaki) | dopisz `�` |
| `reset` | Enter, Tab, strzałki, Home/End, Delete, dowolny skrót z Ctrl/Alt | wyczyść bufor |
| `ignore` | sam modyfikator, klawisz funkcyjny | nic |

Kliknięcie myszą też czyści bufor (`mousedown`).

### 4.2 Dlaczego `diacritic`, a nie zwykły znak

Ze scancode'u nie da się odtworzyć, że AltGr+A dało `ą` — zależy to od układu
klawiatury, którego hook nie zna. Ale **fakt** wpisania jednego znaku trzeba
zapamiętać, inaczej bufor rozjedzie się z zawartością pola i podmiana skasuje
złą liczbę znaków. Dlatego w bufor idzie `�` — zajmuje jedną pozycję
i nigdy nie dopasuje się do triggera ASCII.

**Konsekwencja: trigger nie może zawierać polskich znaków.** Treść snippetu może
— idzie przez schowek, gdzie układ klawiatury nie ma znaczenia.

### 4.3 Dopasowanie

`buffer.ts:TriggerIndex` trzyma triggery posortowane **malejąco po długości**,
więc `/dziendobry` wygrywa z `/dzien`. Przy `requireWordBoundary` trigger
zaczynający się od litery nie odpali w środku wyrazu.

Dwa tryby (ustawienie `expandMode`):

- **`immediate`** — sprawdzamy bufor po każdym znaku, podmiana w chwili dopisania
  ostatniego znaku triggera. Kasujemy `triggerLength` znaków.
- **`terminator`** — sprawdzamy dopiero, gdy wpisany znak jest na liście
  `terminators` (domyślnie spacja, tab, enter). Kasujemy `triggerLength + 1`,
  a przy `keepTerminator` doklejamy znak kończący na końcu wstawianego tekstu.

### 4.4 Podmiana

`inject.ts:replaceTrigger()`:

1. `eraseBackwards(n)` — n × Backspace, z mikroprzerwą co 16 klawiszy.
2. Zapamiętanie schowka → `clipboard.writeText(tekst)` → `Ctrl+V` → przywrócenie
   schowka po 120 ms (tylko jeśli nikt go w międzyczasie nie podmienił).
3. `moveCaretLeft(cursorBack)` — obsługa `{{kursor}}`.

**Dlaczego schowek, a nie wpisywanie znak po znaku:** wklejenie jest jednym
zdarzeniem, nie gubi znaków w aplikacjach z własną obsługą wejścia (Teams,
Electron, terminale) i nie zależy od układu klawiatury. Wpisywanie 500-znakowego
szablonu literka po literce trwa sekundy i widać, jak „się pisze”.

Na czas wstrzykiwania podniesiona jest flaga `injecting` — bez niej własne
syntetyczne klawisze wróciłyby do bufora i pętla by się zapętliła.

### 4.5 Pola do wypełnienia

Jeśli treść zawiera `{{pole:...}}`, `{{obszar:...}}` lub `{{wybor:...}}`, przed
podmianą otwiera się okno formularza. Sekwencja:

1. Okno formularza dostaje focus (zabierając go aplikacji docelowej).
2. Użytkownik wypełnia, Enter zatwierdza / Escape anuluje.
3. Okno się **chowa** (nie zamyka) — Windows oddaje focus poprzedniej aplikacji.
4. Czekamy `REFOCUS_DELAY` (220 ms), dopiero potem kasujemy trigger i wklejamy.

Anulowanie zostawia trigger w polu nietknięty.

---

## 5. Placeholdery

Podwójne klamry są celowe — pojedyncze występują w normalnym tekście (JSON, kod)
i fałszywe trafienia byłyby uciążliwe. Nieznany placeholder zostaje dosłownie.

Nazwy działają po polsku i po angielsku, bez znaczenia dla wielkości liter
i diakrytyków (`{{wybor}}` = `{{wybór}}` = `{{choice}}`).

### 5.1 Zmienne wbudowane

| Zapis | Wynik |
|---|---|
| `{{data}}` | `03.09.2026` |
| `{{data:+7}}` | data za 7 dni |
| `{{data:-1}}` | wczoraj |
| `{{data:RRRR-MM-DD}}` | `2026-09-03` |
| `{{data:+7:DD MMMM RRRR}}` | `10 września 2026` |
| `{{godzina}}` | `14:05` |
| `{{godzina:GG:mm:ss}}` | `14:05:09` |
| `{{schowek}}` | zawartość schowka w chwili rozwinięcia |
| `{{kursor}}` | znika z tekstu; kursor ląduje w tym miejscu |

Tokeny formatu: `RRRR`/`YYYY`, `MMMM` (nazwa miesiąca), `MMM` (skrót), `MM`,
`DD`, `dddd` (dzień tygodnia), `ddd`, `GG`/`HH`, `mm`, `ss`.

Drugi i kolejny `{{kursor}}` jest ignorowany.

### 5.2 Pola do wypełnienia

| Zapis | Efekt |
|---|---|
| `{{pole:Imię}}` | pole tekstowe |
| `{{pole:Firma=ACME}}` | pole tekstowe z wartością domyślną |
| `{{obszar:Uwagi}}` | pole wieloliniowe |
| `{{wybor:Status=Nowy\|W toku\|Zamknięte}}` | lista wyboru, domyślnie pierwsza opcja |

**Ta sama etykieta użyta kilka razy to jedno pole** — wpisujesz raz, wstawia się
we wszystkich miejscach. Klucz łączący jest znormalizowany, więc `{{pole:Imię}}`
i `{{pole:imie}}` to to samo pole.

---

## 6. Dane

Katalog: `%APPDATA%/snippety/`

| Plik | Zawartość |
|---|---|
| `snippets.json` | snippety i foldery |
| `settings.json` | ustawienia |
| `*.bak` | poprzednia wersja, tworzona przy każdym zapisie |

Zapis jest **atomowy**: plik tymczasowy → kopia poprzedniej wersji do `.bak` →
`rename`. Aplikacja działa w tle i bywa ubijana razem z sesją Windows; zwykły
zapis w miejscu zostawiłby ucięty plik. Odczyt przy uszkodzonym pliku głównym
sięga po `.bak`, a dopiero potem po wartości domyślne.

Zapisy są zbierane przez 400 ms (`SAVE_DEBOUNCE`) i wykonywane raz.
`flushStores()` przy zamykaniu aplikacji wymusza natychmiastowy zapis.

---

## 7. IPC

Renderer nie ma dostępu do Node. Dodanie nowej operacji wymaga **trzech** zmian:

1. `src/main/ipc.ts` — `ipcMain.handle('kanal', ...)`
2. `src/preload/index.ts` — metoda wołająca `ipcRenderer.invoke`
3. `src/shared/types.ts` — wpis w interfejsie `SnippetyApi`

Preload jest typowany jako `const api: SnippetyApi`, więc pominięcie punktu 3
wywali się na typechecku, a nie po cichu w produkcji.

Zdarzenia w drugą stronę (`snippets:changed`, `settings:changed`,
`palette:opened`, `form:request`) idą przez `broadcast()` z `windows.ts`
i subskrypcje w `api.on.*`, które zwracają funkcję odpinającą dla `useEffect`.

---

## 8. Okna

| Okno | Charakter |
|---|---|
| **manager** | Zwykłe, 1120×740. Zamknięcie **chowa** je do zasobnika, nie kończy aplikacji. |
| **palette** | Bezramkowe, przezroczyste, zawsze na wierzchu. Znika po utracie focusu. |
| **form** | Bezramkowe, przezroczyste, wysokość liczona z liczby pól. |

Paleta i formularz są **chowane, nie niszczone** — ponowne pokazanie jest
natychmiastowe, a Windows szybciej oddaje focus poprzedniemu oknu.

Oba mają `transparent: true`, bo zaokrąglone rogi i cień rysuje CSS. Bez tego
pod rogami widać byłoby prostokątne tło okna.

`isOwnWindowFocused()` blokuje rozwijanie, gdy piszemy we własnym oknie.

---

## 9. Budowanie

```bash
npm install          # instalacja (patrz pułapka 10.1)
npm run dev          # tryb deweloperski z HMR
npm test             # testy parsera placeholderów
npm run typecheck    # tsc bez emisji, oba projekty
npm run build        # typecheck + bundle do out/
npm run dist         # build + instalator NSIS i wersja portable do release/
node scripts/make-icons.mjs   # regeneracja ikon
```

`electron-builder.yml` ma `npmRebuild: false` — `uiohook-napi` dostarcza gotowe
binarki N-API i nie wymaga przebudowy pod ABI Electrona. Pliki `.node` są
wypakowane poza `asar` (`asarUnpack`), inaczej `dlopen` ich nie znajdzie.

---

## 10. Znane pułapki

### 10.1 Binarka Electrona nie pobiera się po nieudanej instalacji

Jeśli `npm install` przerwie się na błędzie (np. konflikt peer dependency),
przy kolejnym uruchomieniu npm uzna drzewo za aktualne i **pominie skrypty
instalacyjne zależności**. Efekt: `node_modules/electron/dist/` nie istnieje,
a `npm start` kończy się `Error: Electron uninstall`.

Naprawa: `node node_modules/electron/install.js`

### 10.2 Schowek w Electronie 44 jest asynchroniczny

`clipboard.readText()` zwraca `Promise<string>`, `clipboard.writeText()` zwraca
`Promise<void>`. Nie ma wariantu synchronicznego. Starsze przykłady z sieci
(i pamięć modeli) pokazują wersję synchroniczną — nie działa.

### 10.3 Triggery tylko ASCII

Patrz 4.2. Polskie znaki w triggerze nie zadziałają. W treści snippetu — tak.

### 10.4 CapsLock po starcie aplikacji

Stan CapsLocka jest śledzony od momentu startu aplikacji przez przechwytywanie
jego naciśnięć. Jeśli CapsLock był włączony **zanim** aplikacja wstała,
`keymap` zakłada, że jest wyłączony, i wielkość liter w buforze będzie odwrotna.
Dotyczy tylko triggerów z `matchCase: true` — domyślnie wielkość liter nie ma
znaczenia, więc problem się nie ujawnia.

### 10.5 Formularz pól a focus

Otwarcie okna formularza zabiera focus aplikacji docelowej. Po zamknięciu
czekamy 220 ms (`REFOCUS_DELAY` w `engine.ts`), zanim wkleimy tekst. Przy
wolniejszych maszynach albo aplikacjach z własnym zarządzaniem focusem ta
wartość może wymagać podniesienia.

### 10.6 Spacja w ścieżce projektu

Katalog nazywa się `Aplikacja snippety`. Część narzędzi CLI (node-gyp,
niektóre skrypty npm) źle znosi spacje w ścieżce. Jeśli coś się wywala
w nietypowy sposób, to jest pierwszy podejrzany.

---

## 11. Stan projektu

**Wersja 0.1.0.** Działa: rozwijanie triggerów w dwóch trybach, placeholdery
z datami i schowkiem, pola do wypełnienia (tekst / wieloliniowe / lista),
znacznik kursora, okno szybkiego wyboru, foldery, zasobnik, autostart,
eksport i import, instalator NSIS + wersja portable.

Zweryfikowane w tej wersji:

- parser placeholderów — 29 testów, `npm test`
- start i zatrzymanie hooka klawiatury bez wycieku procesu
- wygląd wszystkich trzech okien
- build produkcyjny i typecheck bez błędów

**Nie zweryfikowane na żywym systemie** (wymaga człowieka przy klawiaturze):
faktyczna podmiana tekstu w Wordzie/Teams/przeglądarce, dobór opóźnień
w `inject.ts`, powrót focusu po formularzu. Patrz `TODO.md`.
