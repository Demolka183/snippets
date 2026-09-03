# Snippety — zadania i dług

Reguły pracy: `CLAUDE.md`. Referencja techniczna: `DOCS.md`.
Zrobione zadania **przenoś do „Zweryfikowane”, nie kasuj** — następny agent ma
wiedzieć, że to już sprawdzone.

---

## 1. Do zrobienia przy najbliższej okazji

### 1.1 Test na żywym systemie — PRIORYTET

Kod nie był ani razu przetestowany z człowiekiem przy klawiaturze. Automat nie
jest w stanie tego sprawdzić: podmiana tekstu wymaga faktycznego wpisywania
w cudzej aplikacji. Do przejścia:

- [ ] Wpisać `/data` w Notatniku → ma się zamienić na dzisiejszą datę.
- [ ] To samo w przeglądarce (pole tekstowe), Outlooku, Teams i Wordzie.
- [ ] `/przywitanie` → sprawdzić, czy kursor ląduje w pustej linii (`{{kursor}}`).
- [ ] `/oferta` → formularz pól, wypełnić, sprawdzić czy tekst trafia we właściwe
      miejsce **i czy focus wraca** do aplikacji docelowej.
- [ ] Sprawdzić, czy schowek wraca do poprzedniej zawartości po wklejeniu.
- [ ] `Ctrl+Shift+Space` → okno szybkiego wyboru, wstawienie strzałkami i Enterem.

Jeśli tekst trafia w złe miejsce albo gubią się znaki — pierwsze do ruszenia są
stałe `DELAY` w `src/main/keyboard/inject.ts` i `REFOCUS_DELAY` w
`src/main/expansion/engine.ts`.

### 1.2 Cofnięcie rozwinięcia

Nie ma sposobu, żeby cofnąć niechcianą podmianę inaczej niż ręcznie. Natywny
`Ctrl+Z` w aplikacji docelowej zwykle cofa całe wklejenie na raz, ale nie
przywraca skasowanego triggera. Do rozważenia: przechwycenie `Ctrl+Z` tuż po
rozwinięciu i odtworzenie stanu sprzed.

### 1.3 Wyłączanie w wybranych aplikacjach

Ustawienie `excludedApps` było zaprojektowane, ale **świadomie nie weszło do
v1** — wymaga odczytu procesu aktywnego okna, czego Electron nie udostępnia.
Opcje: dociągnięcie natywnego wywołania `GetForegroundWindow` +
`GetWindowThreadProcessId` albo cache'owane odpytywanie PowerShella. Sensowne
dopiero, gdy okaże się realnie potrzebne (np. rozwijanie przeszkadza w RDP
albo w grach).

### 1.4 Rozmiar paczki

Instalator waży 111 MB. `uiohook-napi` wnosi prebuildy dla **wszystkich**
platform (darwin, linux, win32-arm64), z czego używamy jednej. Filtr w
`electron-builder.yml` na `prebuilds/win32-x64/**` utnie kilka MB. Reszta to
Electron i tego nie da się obejść bez zmiany stacku.

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

### 2.4 Brak testów poza parserem

`npm test` pokrywa tylko `placeholders.ts` (29 asercji). `buffer.ts`
(dopasowanie triggerów, granica słowa, najdłuższe dopasowanie) i `keymap.ts`
(klasyfikacja klawiszy) to czysta logika i **dają się testować bez Electrona** —
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

---

## 4. Zweryfikowane

Wersja 0.1.0, sprawdzone automatycznie:

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
