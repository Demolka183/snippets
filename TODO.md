# Snippety — zadania i dług

Reguły pracy: `CLAUDE.md`. Referencja techniczna: `DOCS.md`.
Zrobione zadania **przenoś do „Zweryfikowane”, nie kasuj** — następny agent ma
wiedzieć, że to już sprawdzone.

---

## 1. Do zrobienia przy najbliższej okazji

### 1.1 Test w aplikacjach z własną obsługą wejścia

Notatnik jest pokryty automatem (`npm run test:e2e`). Zostają aplikacje, które
same zarządzają wejściem i focusem — tam mechanizm ze schowka i przywracaniem
pierwszego planu może zachować się inaczej:

- [ ] Outlook — pole treści maila.
- [ ] Teams — pole czatu.
- [ ] Word.
- [ ] Przeglądarka — zwykłe `<input>` i edytor typu Gmail.
- [ ] `Ctrl+Shift+Space` → okno szybkiego wyboru, wstawienie strzałkami i Enterem
      (paleta używa tej samej ścieżki focusu co formularz, ale nie jest objęta
      testem automatycznym).
- [ ] Sprawdzić, czy schowek wraca do poprzedniej zawartości po wklejeniu.

Diagnostyka: `%APPDATA%/snippety/log.txt` pokazuje wprost, do którego okna
poszło wklejenie. Jeśli tekst trafia w złe miejsce — podnieś `REFOCUS_DELAY`
w `src/main/expansion/engine.ts`. Jeśli gubią się znaki — stałe `DELAY`
w `src/main/keyboard/inject.ts`.

### 1.2 Test automatyczny obejmuje tylko Notatnik

`tests/e2e.cjs` czyta wynik przez Ctrl+A / Ctrl+C i schowek, więc działa
z dowolnym polem tekstowym — ale celuje w Notatnik po klasie okna `Notepad`.
Rozszerzenie na WordPad albo przeglądarkę to zmiana jednej funkcji
(`FindWindowW`). Warto, gdy pojawi się błąd specyficzny dla jakiejś aplikacji.

### 1.3 Cofnięcie rozwinięcia

Nie ma sposobu, żeby cofnąć niechcianą podmianę inaczej niż ręcznie. Natywny
`Ctrl+Z` w aplikacji docelowej zwykle cofa całe wklejenie na raz, ale nie
przywraca skasowanego triggera. Do rozważenia: przechwycenie `Ctrl+Z` tuż po
rozwinięciu i odtworzenie stanu sprzed.

### 1.4 Wyłączanie w wybranych aplikacjach

Ustawienie `excludedApps` było zaprojektowane, ale **świadomie nie weszło do
v1** — wymaga odczytu procesu aktywnego okna, czego Electron nie udostępnia.
**Od wersji 0.1.1 jest to znacznie prostsze**: `src/main/keyboard/focus.ts`
woła już `GetForegroundWindow` i `GetWindowThreadProcessId` przez koffi.
Brakuje tylko odczytu nazwy procesu (`QueryFullProcessImageNameW`) i filtra
w `engine.ts`. Sensowne, gdy okaże się realnie potrzebne — np. rozwijanie
przeszkadza w RDP albo w grach.

### 1.5 Rozmiar paczki

Instalator waży ok. 111 MB. `uiohook-napi` wnosi prebuildy dla **wszystkich**
platform (darwin, linux, win32-arm64), z czego używamy jednej. Filtr w
`electron-builder.yml` na `prebuilds/win32-x64/**` utnie kilka MB. Reszta to
Electron i tego nie da się obejść bez zmiany stacku.

(koffi tego problemu nie ma — instaluje binarkę tylko dla bieżącej platformy.)

---

## 2. Dług techniczny

### 2.1 CSP z `unsafe-eval`

`Content-Security-Policy` w plikach HTML dopuszcza `unsafe-inline` i
`unsafe-eval`, bo tego wymaga serwer deweloperski Vite. W produkcji aplikacja
nie ładuje żadnej zdalnej treści, więc praktyczne ryzyko jest zerowe, ale
polityka powinna być zaostrzana przy buildzie produkcyjnym.

### 2.2 Polskie znaki w triggerach

Nie działają — patrz `DOCS.md` 4.2. Obejściem byłoby natywne wywołanie
`ToUnicodeEx` z aktualnym układem klawiatury zamiast własnej tablicy scancode'ów.
Duża robota; do zrobienia tylko jeśli okaże się, że ktoś naprawdę chce trigger
typu `/zażółć`.

### 2.3 Stan CapsLocka przy starcie

Śledzony od momentu uruchomienia aplikacji; jeśli był włączony wcześniej,
`keymap` się myli. Ujawnia się tylko przy `matchCase: true`. Naprawa wymaga
odczytu stanu klawisza z systemu przy starcie.

### 2.4 Brak testów jednostkowych dla bufora i mapy klawiszy

`npm test` pokrywa `placeholders.ts` (29 asercji), `npm run test:e2e` pokrywa
całą ścieżkę end-to-end. Nie ma natomiast testów jednostkowych `buffer.ts`
(dopasowanie triggerów, granica słowa, najdłuższe dopasowanie) ani `keymap.ts`
(klasyfikacja klawiszy). To czysta logika, **daje się testować bez Electrona** —
warto dopisać, bo to właśnie tam siedzą błędy, które kasują użytkownikowi tekst.

### 2.5 Bundle renderera 554 kB

Cały React ląduje w jednym chunku ładowanym przez wszystkie trzy okna. Paleta
i formularz są malutkie i nie potrzebują tego, co manager. Do rozważenia, jeśli
otwieranie palety okaże się zauważalnie wolne.

---

## 3. Pomysły na później

- **Wersja na Androida.** Osobna implementacja: text expansion na Androidzie
  wymaga własnej klawiatury (IME). Przenosi się wyłącznie format danych
  (`snippets.json`) i pomysł na UI zarządzania.
- **Tekst sformatowany** (pogrubienia, linki, listy) dla Outlooka i Gmaila.
  Wymaga edytora WYSIWYG w aplikacji i zapisu do schowka w dwóch formatach
  (HTML + czysty tekst jako fallback).
- **Synchronizacja przez repo GitHub** — snippety jako pliki w repo, historia
  zmian za darmo. Wymaga tokena i obsługi konfliktów.
- **Statystyki użycia** — licznik `usageCount` już jest zbierany i zasila
  sortowanie w palecie, ale nigdzie nie jest pokazany w formie podsumowania.
- **Podpowiedzi triggerów w locie** — małe okienko pokazujące pasujące triggery
  w trakcie pisania, zanim domkniemy cały ciąg.
- **Automatyczne sprawdzanie aktualizacji** — odrzucone w 0.1.3, ale ma sens,
  gdy aplikacja rozejdzie się po dziale i nikt nie będzie klikał znacznika.
  Warunek: przełącznik w Ustawieniach i poprawiony README, żeby nie obiecywać
  pełnego offline'u wbrew faktom.

---

## 4. Zweryfikowane

### Wersja 0.1.3 — znacznik wersji

Numer wersji widoczny w pasku górnym obok nazwy, klikalny — otwiera listę wydań
w przeglądarce. Wcześniej wersja była tylko w Ustawieniach, na dole, obok
ścieżki do bazy.

Sprawdzanie aktualizacji zostało **świadomie ręczne**. Automatyczne odpytywanie
GitHuba przy starcie było rozważane i odrzucone: odebrałoby aplikacji własność
bycia w pełni offline, obiecaną w README i w opisie wydania. Gdyby wracać do
tematu — patrz „Pomysły na później”.

Sprawdzone: znacznik renderuje się w pasku, kanał `app:openReleases` ma adres
zaszyty po stronie procesu głównego (renderer nie może podać własnego URL-a).

### Wersja 0.1.2 — awarie zapisu przestały być niewidzialne

Incydent: podczas pracy nad 0.1.1 test end-to-end **skasował bazę użytkownika
i ubił jego działającą instancję** (`taskkill /IM Snippety.exe /F`, czyli bez
`before-quit`, czyli bez zapisu). Świeżo dodany snippet przetrwał wyłącznie
w kopii zapasowej. Stan na dysku był niespójny: `.bak` nowszy i większy od
pliku głównego.

Dokładnego mechanizmu rozjazdu **nie udało się odtworzyć** z timestampów —
i nie zmyślamy go. Zamiast tego dołożono obserwowalność, żeby następny taki
przypadek dało się rozpoznać zamiast zgadywać:

- `jsonStore` raportuje awarie zapisu przez `log()`, nie `console.error`
  (który na Windows nigdzie nie dociera — awaria bazy była całkowicie cicha)
- rozmiar zapisanego `.tmp` jest porównywany z oczekiwanym; niepełny zapis
  nie podmienia działającego pliku
- niedokończony `.tmp` jest kasowany
- przy starcie `.bak` nowszy od pliku głównego daje ostrzeżenie w logu
- to samo `console.error` usunięte z rejestracji globalnego skrótu — zajęta
  kombinacja klawiszy nie zgłaszała się w żaden sposób

Test end-to-end przestał być groźny dla danych:

- sprząta **wyłącznie własne drzewo procesów** (`taskkill /PID … /T`)
- **odmawia startu**, gdy działa inna instancja aplikacji — blokada jednej
  instancji sprawiłaby i tak, że test steruje cudzą aplikacją, a wyniki
  byłyby fałszywe
- używa osobnego katalogu danych (`--user-data-dir`), wprowadzone w 0.1.1

Sprawdzone: przy działającej aplikacji użytkownika test odmawia startu
i wszystkie jej procesy przeżywają.

### Wersja 0.1.1 — naprawa pierwszego planu okien

Zgłoszony objaw: po wypełnieniu formularza `/oferta` **nic się nie wklejało**.
Diagnoza z pomiarów (`tests/e2e.cjs` + log aplikacji) wykazała **dwa niezależne
błędy**, oba wynikające z tego, że Windows blokuje zmianę okna pierwszoplanowego
procesom, które nie dostały ostatniego zdarzenia wejścia:

1. **Okno formularza nie dostawało focusu klawiatury.** `win.show()` +
   `win.focus()` pokazywało okno, ale wpisywany tekst leciał do aplikacji pod
   spodem. Formularz dawał się wypełnić wyłącznie kliknięciem myszą.
2. **Po `win.hide()` pierwszy plan zostawał na schowanym oknie.** Zmierzone:
   `GetForegroundWindow()` zwracał nasze niewidoczne okno. Backspace'y i Ctrl+V
   szły donikąd — stąd „nic się nie wkleja”.

Naprawione w `src/main/keyboard/focus.ts` (`forceFocusOwnWindow`
i `restoreForeground`). Szczegóły w `DOCS.md` 4.6.

Sprawdzone automatycznie, na wersji ze źródeł **i na spakowanej**:

- `/data` → poprawna data w Notatniku
- `/przywitanie` → poprawny tekst, znacznik kursora zdjęty
- `/oferta` → formularz wypełniony z klawiatury, wartości podstawione,
  `{{data:+14}}` policzone, focus wrócił do Notatnika
- koffi ładuje się w Electronie 44 i poprawnie wychodzi poza archiwum `asar`

### Wersja 0.1.0, sprawdzone automatycznie:

- **Parser placeholderów** — 29 asercji w `tests/placeholders.test.mjs`: formaty
  dat, przesunięcia dni, aliasy angielskie, scalanie powtórzonych pól, pozycja
  kursora, odporność na pojedyncze klamry i nieznane placeholdery.
- **Hook klawiatury** — `uIOhook.start()` / `.stop()` startuje i kończy czysto,
  bez zawieszonego procesu.
- **Prebuild `win32-x64`** ładuje się w Node 25 i w Electronie 44 bez rekompilacji.
- **Typecheck** — `tsc --noEmit` czysty dla obu projektów (main/preload i renderer).
- **Build produkcyjny** — trzy strony renderera, preload jako `.mjs`, main jako ESM.
- **Instalator** — NSIS i portable budują się; binarki `.node` trafiają poza
  archiwum `asar`; `icon.png` dla zasobnika trafia do `resources/`.
- **Spakowana aplikacja startuje** i przy pierwszym uruchomieniu tworzy
  `%APPDATA%/snippety/snippets.json` z trzema przykładami oraz `settings.json`.
- **Wygląd trzech okien** — manager (lista, edytor, wykryte pola, ustawienia),
  paleta (sortowanie po użyciu, filtrowanie wyłączonych), formularz (pole
  tekstowe, wieloliniowe, lista wyboru).
- **Odmiana liczebników** — `withCount()` dla 0/1/2/4/5/12/14/22/102.
