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

Aplikacja jest w całości lokalna. Nie ma serwera, konta ani synchronizacji,
i **nie wykonuje żadnych połączeń sieciowych z własnej inicjatywy** — jedyne
wyjście na zewnątrz to otwarcie listy wydań w przeglądarce, gdy użytkownik
kliknie znacznik wersji.

---

## 2. Stack i dlaczego taki

| Wybór | Powód |
|---|---|
| **Electron 44** | Działa na gołym Node bez łańcucha kompilacji. Tauri byłby lżejszy, ale wymaga Rusta i Visual Studio Build Tools (kilka GB instalacji z GUI), a i tak nic z tego nie przenosi się na Androida — tam text expansion to własne IME, osobna implementacja. |
| **React 19 + TypeScript** | Trzy okna o zupełnie różnym charakterze; stan i tak trzeba czymś trzymać. |
| **electron-vite 5** | Buduje trzy targety (main, preload, renderer) jedną konfiguracją, ma HMR w dev. |
| **uiohook-napi 1.5.5** | Jedyna sensowna paczka dająca **jednocześnie** globalny hook (`WH_KEYBOARD_LL`) i wstrzykiwanie klawiszy (`SendInput`). Gotowe binarki N-API — bez kompilacji. |
| **koffi** | FFI do Win32 (`user32.dll`). Potrzebne wylacznie do zarzadzania pierwszym planem okien - patrz 4.6. Binarka pobierana tylko dla biezacej platformy. |
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
│   ├── log.ts              Log diagnostyczny do pliku
│   ├── keyboard/
│   │   ├── keymap.ts       Kod klawisza (scancode) → znak
│   │   ├── buffer.ts       Bufor wpisanego tekstu + indeks triggerów
│   │   ├── focus.ts        Win32: przejmowanie i oddawanie pierwszego planu
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
├── placeholders.test.mjs   Testy parsera (npm test)
└── e2e.cjs                 Test end-to-end: pisze do Notatnika i czyta wynik
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

`inject.ts:replaceTrigger()`. **Kolejność nie jest przypadkowa** — wynika
z dwóch błędów, które realnie wystąpiły (patrz 4.7):

1. Zapamiętanie dotychczasowej zawartości schowka.
2. Ustawienie schowka na treść snippetu **z potwierdzeniem odczytem**, do
   pięciu prób. Jeśli się nie uda — przerywamy, nie kasując triggera.
3. `eraseBackwards(n)` — n × Backspace, z mikroprzerwą co 16 klawiszy.
4. `Ctrl+V`, potem odczekanie `afterPaste` (150 ms).
5. `moveCaretLeft(cursorBack)` — obsługa `{{kursor}}`.
6. Odczekanie `beforeRestore` (450 ms) i dopiero wtedy oddanie schowka —
   wyłącznie jeśli nadal zawiera naszą treść.

**Dlaczego schowek, a nie wpisywanie znak po znaku:** wklejenie jest jednym
zdarzeniem, nie gubi znaków w aplikacjach z własną obsługą wejścia (Teams,
Electron, terminale) i nie zależy od układu klawiatury. Wpisywanie 500-znakowego
szablonu literka po literce trwa sekundy i widać, jak „się pisze”.

Na czas wstrzykiwania podniesiona jest flaga `injecting` — bez niej własne
syntetyczne klawisze wróciłyby do bufora i pętla by się zapętliła.

### 4.5 Pola do wypełnienia

Jeśli treść zawiera `{{pole:...}}`, `{{obszar:...}}` lub `{{wybor:...}}`, przed
podmianą otwiera się okno formularza. Sekwencja:

1. `rememberForeground()` zapamiętuje okno, w którym użytkownik pisał.
2. Okno formularza się pokazuje i **wymusza** sobie pierwszy plan (4.6).
3. Użytkownik wypełnia, Enter zatwierdza / Escape anuluje.
4. Okno się **chowa** (nie zamyka).
5. `restoreForeground()` jawnie przywraca zapamiętane okno.
6. Czekamy `REFOCUS_DELAY` (220 ms), dopiero potem kasujemy trigger i wklejamy.

Anulowanie zostawia trigger w polu nietknięty.

### 4.5b Schowek — dwie pułapki, obie zaliczone

**Zapis do schowka potrafi nie dojść do skutku.** Schowek Windows bywa przez
ułamek sekundy trzymany przez inny proces — menedżery schowka, historia
`Win+V`, narzędzia firmowe. Wcześniej kod ustawiał schowek i od razu wysyłał
`Ctrl+V` bez sprawdzenia; przy nieudanym zapisie wklejała się **poprzednia
zawartość schowka**, czyli cudzy tekst w środek maila. Teraz zapis jest
potwierdzany odczytem i ponawiany, a gdy się nie uda — rozwinięcie jest
przerywane, zanim cokolwiek zostanie skasowane.

**Przywrócenie schowka wyprzedzało wklejenie.** Aplikacja docelowa przetwarza
`Ctrl+V` asynchronicznie. Oddanie schowka po 120 ms wystarczało na jednej
maszynie, a na drugiej już nie — tam program zdążył wkleić dopiero po
przywróceniu i wstawiał **starą zawartość schowka zamiast snippetu**. Objaw
mylący, bo wyglądał jakby snippety w ogóle nie działały.

Stąd `beforeRestore` = 450 ms i oddawanie schowka jako ostatnia czynność, po
ustawieniu kursora. **To jest ta stała do podniesienia**, gdyby objaw wrócił
na jeszcze wolniejszej maszynie. Diagnostyka bez zmiany kodu: wyłącz
w Ustawieniach „Przywracaj schowek”. Jeśli problem znika, to ten wyścig.

### 4.6 Pierwszy plan okien — dlaczego to nie jest trywialne

Windows przyznaje prawo do zmiany okna pierwszoplanowego tylko procesowi, który
**dostał ostatnie zdarzenie wejścia**. Nasz proces czyta klawiaturę biernie
z hooka i nigdy takim procesem nie jest. Wynikały z tego dwa osobne błędy,
oba naprawione w `keyboard/focus.ts`:

**a) Okno formularza nie dostawało focusu klawiatury.** `win.show()` +
`win.focus()` pokazywało okno, ale wpisywany tekst leciał do aplikacji pod
spodem. Formularz dało się wypełnić tylko klikając w pole myszą.
Naprawa: `forceFocusOwnWindow()`.

**b) Po schowaniu okna pierwszy plan zostawał na schowanym oknie.**
Zmierzone: `GetForegroundWindow()` po `win.hide()` nadal zwracał nasze — już
niewidoczne — okno. Backspace'y i Ctrl+V szły więc donikąd i **nic się nie
wklejało**. Naprawa: `restoreForeground()`.

Obie funkcje działają tak samo: próbują `SetForegroundWindow`, a gdy system
odmówi, przypinają wejście naszego wątku do wątku okna aktualnie
pierwszoplanowego przez `AttachThreadInput` i próbują ponownie. To
udokumentowane obejście blokady.

**To jedyne miejsce w projekcie wołające Win32.** Poza Windows wszystkie
funkcje są cichymi no-opami.

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

Zapis jest **atomowy**: plik tymczasowy → weryfikacja rozmiaru → kopia
poprzedniej wersji do `.bak` → `rename`. Aplikacja działa w tle i bywa ubijana
razem z sesją Windows; zwykły zapis w miejscu zostawiłby ucięty plik. Odczyt
przy uszkodzonym pliku głównym sięga po `.bak`, a dopiero potem po wartości
domyślne.

Zapisy są zbierane przez 400 ms (`SAVE_DEBOUNCE`) i wykonywane raz.
`flushStores()` przy zamykaniu aplikacji wymusza natychmiastowy zapis.
**Ubicie procesu siłowo** (Menedżer zadań, `taskkill /F`) pomija `before-quit`,
więc traci zmiany z ostatnich ~400 ms.

### 6.1 Awaria zapisu musi zostawić ślad

Błąd zapisu bazy to po prostu utracone snippety użytkownika. Dlatego:

- niepowodzenie idzie do `log.txt` przez `log()`, nigdy do `console.error`
  (patrz pułapka 10.2 — na Windows to znika bez śladu),
- rozmiar zapisanego pliku tymczasowego jest **porównywany z oczekiwanym**;
  niepełny zapis nie podmienia działającego pliku,
- niedokończony `.tmp` jest kasowany, żeby nie zmylił następnego zapisu,
- przy starcie, gdy `.bak` okazuje się **nowszy** od pliku głównego, do logu
  trafia ostrzeżenie. To znaczy, że poprzedni zapis się nie dokończył albo ktoś
  podmienił plik pod działającą aplikacją. Aplikacja **nie naprawia tego sama** —
  dane użytkownika to nie miejsce na zgadywanie.

---

## 7. IPC

Renderer nie ma dostępu do Node. Dodanie nowej operacji wymaga **trzech** zmian:

1. `src/main/ipc.ts` — `ipcMain.handle('kanal', ...)`
2. `src/preload/index.ts` — metoda wołająca `ipcRenderer.invoke`
3. `src/shared/types.ts` — wpis w interfejsie `SnippetyApi`

Preload jest typowany jako `const api: SnippetyApi`, więc pominięcie punktu 3
wywali się na typechecku, a nie po cichu w produkcji.

### 7.1 Jedyny kanał wychodzący na zewnątrz

`app:openReleases` otwiera stronę wydań w domyślnej przeglądarce. Adres jest
**stałą w `ipc.ts`** — renderer nie przekazuje URL-a, więc nie da się przez ten
kanał otworzyć czegokolwiek innego. To świadoma decyzja: kanał przyjmujący
dowolny adres byłby furtką do otwierania dowolnych stron z poziomu UI.

Sprawdzanie aktualizacji jest **ręczne z założenia**. Automatyczne odpytywanie
GitHuba przy starcie odebrałoby aplikacji własność bycia w pełni offline —
a to jest obietnica złożona użytkownikom w README i w opisie wydania.

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
npm install               # instalacja (patrz pułapka 10.1)
npm run dev               # tryb deweloperski z HMR
npm test                  # testy parsera placeholderów
npm run test:e2e          # test end-to-end na wersji ze źródeł
npm run test:e2e:packaged # test end-to-end na release/win-unpacked
npm run typecheck         # tsc bez emisji, oba projekty
npm run build             # typecheck + bundle do out/
npm run dist              # build + instalator NSIS i portable do release/
npm run dist:dir          # sam katalog release/win-unpacked, bez instalatora
node scripts/make-icons.mjs   # regeneracja ikon
```

### Test end-to-end

`npm run test:e2e` uruchamia aplikację, otwiera Notatnik, **wpisuje w niego
triggery prawdziwymi zdarzeniami klawiatury** i odczytuje wynik przez schowek.
Sprawdza całą ścieżkę: hook, bufor, dopasowanie, formularz pól, powrót focusu
i wklejenie.

> **Test przejmuje klawiaturę i ekran.** Wysyła między innymi `Ctrl+A`
> i `Delete`. Nie uruchamiaj go, gdy ktoś przy tym komputerze pracuje.
>
> Przy **otwartym pulpicie zdalnym jest to szczególnie groźne**: klient RDP
> przekazuje naciśnięcia klawiszy do zdalnej maszyny, więc test potrafi pisać
> i kasować po drugiej stronie połączenia. Zdarzyło się raz — stąd kontrola,
> która wykrywa uruchomionego klienta (`mstsc`, `AnyDesk`, `TeamViewer`,
> Citrix, VNC) i przerywa. Świadome obejście: flaga `--i-know-what-i-am-doing`.

Test używa **własnych triggerów `/qa*`** i osobnego katalogu danych, więc może
działać obok uruchomionej instancji użytkownika, nie ruszając jego bazy.

Wynik ląduje w `tests/e2e-wynik.txt` razem z logiem aplikacji.
Wariant `:packaged` sprawdza dodatkowo, czy binarki natywne poprawnie wyszły
poza archiwum `asar` — tego nie da się wykryć w trybie deweloperskim.

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

### 10.2 `console.log` z procesu głównego nie dociera do stdout

Na Windows Electron nie podpina stdout procesu głównego do rodzica — `console.log`
i `console.error` po prostu znikają. Dlatego diagnostyka idzie do pliku
`%APPDATA%/snippety/log.txt` przez `src/main/log.ts`. Przy debugowaniu czytaj
ten plik, nie konsolę.

### 10.3 Schowek w Electronie 44 jest asynchroniczny

`clipboard.readText()` zwraca `Promise<string>`, `clipboard.writeText()` zwraca
`Promise<void>`. Nie ma wariantu synchronicznego. Starsze przykłady z sieci
(i pamięć modeli) pokazują wersję synchroniczną — nie działa.

### 10.4 `window.prompt()` nie działa w Electronie

Electron **nie implementuje** `window.prompt()` — w binarce siedzi wprost
komunikat `prompt() is not supported.`. Wywołanie nie pokazuje żadnego okna
i nie zwraca wartości, więc przycisk, który na nim polega, **cicho nic nie
robi**. Tak było z „Nowy folder" i ze zmianą nazwy folderu do wersji 0.1.4.

`alert()` i `confirm()` działają, ale i tak nie używamy ich w tym projekcie —
blokują proces renderera i wyglądają obco. Każde pytanie do użytkownika
zadajemy **własnym polem w interfejsie**: pole tekstowe z przyciskami
„Dodaj”/„Anuluj”, obsługa Enter i Escape.

### 10.5 Triggery tylko ASCII

Patrz 4.2. Polskie znaki w triggerze nie zadziałają. W treści snippetu — tak.

### 10.6 CapsLock po starcie aplikacji

Stan CapsLocka jest śledzony od momentu startu aplikacji przez przechwytywanie
jego naciśnięć. Jeśli CapsLock był włączony **zanim** aplikacja wstała,
`keymap` zakłada, że jest wyłączony, i wielkość liter w buforze będzie odwrotna.
Dotyczy tylko triggerów z `matchCase: true` — domyślnie wielkość liter nie ma
znaczenia, więc problem się nie ujawnia.

### 10.7 Formularz pól a focus

Mechanizm opisany w 4.6. Jeśli mimo to tekst trafia w złe miejsce, podnieś
`REFOCUS_DELAY` w `engine.ts` (domyślnie 220 ms) — na wolniejszych maszynach
i w aplikacjach z własnym zarządzaniem focusem system potrzebuje więcej czasu.
Log w `%APPDATA%/snippety/log.txt` pokazuje wprost, do którego okna poszło
wklejenie.

### 10.8 Spacja w ścieżce projektu

Katalog nazywa się `Aplikacja snippety`. Część narzędzi CLI (node-gyp,
niektóre skrypty npm) źle znosi spacje w ścieżce. Jeśli coś się wywala
w nietypowy sposób, to jest pierwszy podejrzany.

---

## 11. Stan projektu

**Wersja 0.1.4.** Działa: rozwijanie triggerów w dwóch trybach, placeholdery
z datami i schowkiem, pola do wypełnienia (tekst / wieloliniowe / lista),
znacznik kursora, okno szybkiego wyboru, foldery, zasobnik, autostart,
eksport i import, znacznik wersji w pasku, instalator NSIS + wersja portable.

Zweryfikowane w tej wersji:

- parser placeholderów — 29 testów, `npm test`
- **rozwijanie end-to-end w Notatniku** — `npm run test:e2e`, cztery przypadki:
  prosty trigger, znacznik kursora, formularz pól z powrotem focusu oraz
  regresja schowka (wartość kontrolna musi wrócić, a w polu ma wylądować
  snippet, nie zawartość schowka)
- to samo na wersji spakowanej — `npm run test:e2e:packaged`
- start i zatrzymanie hooka klawiatury bez wycieku procesu
- wygląd wszystkich trzech okien
- build produkcyjny i typecheck bez błędów

**Nie zweryfikowane**: zachowanie w aplikacjach z własną obsługą wejścia
(Teams, Outlook, Word, przeglądarka) i okno szybkiego wyboru. Patrz `TODO.md`.
