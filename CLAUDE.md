# Snippety — instrukcje dla agenta

Ten plik jest auto-ładowany i zawiera **tylko reguły zachowania**.
Referencja techniczna (architektura, składnia placeholderów, przepływ rozwijania,
znane pułapki) jest w **`DOCS.md`** — czytaj na żądanie, gdy zadanie tego wymaga.
Bieżące zadania i dług: **`TODO.md`**.

---

## Stack — minimum do zapamiętania

- **Electron 44 + React 19 + TypeScript**, budowane przez **electron-vite 5**.
- **Vite jest przypięty do 7.x.** `electron-vite@5` nie akceptuje Vite 8, a
  `@vitejs/plugin-react` jest przypięty do `5.1.4` (nowsze wymagają Vite 8).
  Nie podnoś żadnej z tych trzech paczek osobno — albo wszystkie naraz, albo żadnej.
- **`uiohook-napi`** — globalny hook klawiatury i wstrzykiwanie klawiszy.
  Dostarcza gotowe binarki N-API, dlatego `npmRebuild: false` w `electron-builder.yml`.
  **Nie włączaj `electron-builder install-app-deps`** — próbuje kompilować od zera
  i wymaga Visual Studio Build Tools, których w tym projekcie nie potrzeba.
- **Schowek w Electronie 44 jest asynchroniczny.** `clipboard.readText()` zwraca
  `Promise<string>`, nie `string`. Twoja wiedza z treningu jest tu nieaktualna —
  przy każdym użyciu API Electrona sprawdzaj sygnaturę w `node_modules/electron/electron.d.ts`.
- **`koffi`** — FFI do Win32, używane wyłącznie w `src/main/keyboard/focus.ts`
  do zarządzania pierwszym planem okien. Binarka tylko dla bieżącej platformy.
- **Dane w plikach JSON** w `%APPDATA%/snippety/`. Żadnej bazy, żadnej chmury.
- **`console.log` w procesie głównym nie działa.** Electron na Windows nie
  podpina stdout do rodzica — komunikaty znikają. Diagnostykę pisz przez
  `log()` z `src/main/log.ts`, czytaj z `%APPDATA%/snippety/log.txt`.

## Zasady pracy

1. **Zmiany jedna na raz.** Po każdej zmianie zatrzymaj się i czekaj na akceptację.
2. **Nie commituj sam.** Commit i push wyłącznie na wyraźną prośbę użytkownika
   („zacommituj”, „wypchnij”). Nigdy z własnej inicjatywy, nawet po dużej zmianie.
3. **Wersja w tytule commita** — format `Snippety X.Y.Z - opis`. Numer musi zgadzać
   się z `version` w `package.json` (bump jest częścią commita). Samo „zacommituj”
   bez numeru → spytaj, nie zgaduj.
4. **Aktualizuj `DOCS.md` i `TODO.md` w ramach zadania**, nie po fakcie.
   Nowy moduł → wpis w „Struktura plików”. Znaleziona pułapka → „Znane pułapki”.
   Zrobione zadanie → przenieś do „Zweryfikowane”, nie kasuj.

## Zasady architektoniczne — twarde

1. **`src/main/store/` jest jedynym miejscem, które dotyka dysku.** Żaden inny
   moduł nie czyta i nie zapisuje plików z danymi. Podmiana formatu zapisu
   (np. na SQLite albo sync z chmurą) ma być podmianą jednego katalogu.
2. **Renderer nie ma dostępu do Node.** Wszystko idzie przez kanały IPC opisane
   w `src/main/ipc.ts` i wystawione w `src/preload/index.ts`. Nowy kanał trzeba
   dodać w obu miejscach **oraz** w interfejsie `SnippetyApi` w `src/shared/types.ts`.
3. **`src/shared/types.ts` nie importuje niczego z `electron` ani z `node:`.**
   Jest ładowany po obu stronach mostka.
4. **Cały stan bufora klawiatury żyje w `src/main/expansion/engine.ts`** i nigdzie
   indziej. Nie duplikuj go w innych modułach.
5. **`src/main/keyboard/focus.ts` jest jedynym miejscem wołającym Win32.**
   Jeśli potrzebujesz kolejnej funkcji z `user32.dll`, dodaj ją tam, a nie
   rozsiewaj `koffi.load()` po projekcie. Poza Windows moduł ma być no-opem.

## Rozwijanie tekstu — zasada twarda

**Przy jakiejkolwiek wątpliwości co do pozycji karetki bufor się zeruje.**

Fałszywe rozwinięcie kasuje użytkownikowi tekst, którego nie da się odzyskać.
Fałszywy brak rozwinięcia kosztuje go jedno ponowne wpisanie triggera. Ta
asymetria decyduje o każdym sporze projektowym w `engine.ts` i `keymap.ts`.

Praktycznie: każdy klawisz przesuwający karetkę (Enter, Tab, strzałki, Home/End,
Delete), każde kliknięcie myszą i każdy skrót z Ctrl/Alt czyszczą bufor.

## Focus okien — zasada twarda

**Nigdy nie zakładaj, że `win.show()`, `win.focus()` czy `win.hide()` ustawiły
pierwszy plan tam, gdzie chcesz.** Windows blokuje zmianę pierwszego planu
procesom działającym w tle, a nasz proces zawsze taki jest. Każde okno, które
zabiera focus użytkownikowi, musi:

1. przed pokazaniem wywołać `rememberForeground()`,
2. po pokazaniu wywołać `forceFocusOwnWindow(win.getNativeWindowHandle())`,
3. po schowaniu wywołać `restoreForeground()`.

Pominięcie któregokolwiek kroku daje błąd, który wygląda jak „aplikacja nic nie
robi”. Historia i pomiary w `DOCS.md` 4.6.

## Weryfikacja zmian w rozwijaniu

Zmieniłeś cokolwiek w `keyboard/`, `expansion/` albo w oknach? **Uruchom
`npm run test:e2e`.** Test wpisuje triggery prawdziwymi zdarzeniami klawiatury
do Notatnika i czyta wynik — to jedyny sposób, żeby sprawdzić, czy podmiana
faktycznie działa. Typecheck i testy parsera tego nie wyłapią.

## Języki i teksty

- **Cały interfejs po polsku.** Nie ma i na razie nie będzie i18n — teksty
  są wprost w komponentach.
- **Liczebniki odmieniaj przez `withCount()`** z `src/renderer/src/plural.ts`.
  Polski ma trzy formy; `n === 1 ? a : b` daje „2 snippetów” i wygląda źle.
- **Kod i komentarze bez polskich znaków diakrytycznych.** Teksty widoczne
  dla użytkownika (JSX, etykiety) — z pełną polszczyzną.

## Okna dialogowe — zasada twarda

**Nie używaj `window.prompt()`.** Electron go nie implementuje — nie pokazuje
nic i nie zwraca wartości, więc przycisk cicho przestaje działać. Tak zginął
przycisk „Nowy folder” aż do 0.1.4.

Każde pytanie do użytkownika zadawaj **własnym elementem interfejsu**: pole
tekstowe pojawiające się w miejscu przycisku, z „Zapisz”/„Anuluj”, obsługą
Enter i Escape oraz `autoFocus`. Wzorzec jest w `SnippetEditor` (dodawanie
folderu) i w `SettingsView` (zmiana nazwy). Potwierdzenia destrukcyjne
robimy tak samo — patrz `confirmDelete` w `SnippetEditor`.

## Test end-to-end przejmuje komputer — zasada twarda

`npm run test:e2e` wysyła prawdziwe zdarzenia klawiatury, w tym `Ctrl+A`
i `Delete`, do okna na pierwszym planie. **Nie uruchamiaj go, gdy ktoś przy
tym komputerze pracuje**, i nigdy przy otwartym pulpicie zdalnym — klient RDP
przekazuje klawisze na drugą maszynę i test kasuje tam cudzą pracę. Test sam
to teraz wykrywa i przerywa, ale kontrola nie zwalnia z myślenia: przed
uruchomieniem upewnij się, że użytkownik wie, że za chwilę stracisz kontrolę
nad jego klawiaturą.

## Znaki specjalne w kodzie — zasada twarda

Znaki sterujące i niedrukowalne zapisuj **jawnym escape'em**, nigdy dosłownie:

```ts
// ✅
const CURSOR_MARK = '\u0001'
.replace(/[\u0300-\u036f]/g, '')

// ❌ — przetrwa zapis, ale zginie przy pierwszym nieostrożnym przetworzeniu pliku
const CURSOR_MARK = '<dosłowny znak sterujący>'
```

## Gdzie szukać szczegółów

| Pytanie | Plik |
|---|---|
| Jak działa wykrywanie triggera i podmiana tekstu? | `DOCS.md` → „Przepływ rozwijania” |
| Jaka jest pełna składnia placeholderów? | `DOCS.md` → „Placeholdery” |
| Jak dodać nowy kanał IPC? | `DOCS.md` → „IPC” |
| Dlaczego coś nie działa w konkretnej aplikacji? | `DOCS.md` → „Znane pułapki” |
| Jak zbudować instalator? | `DOCS.md` → „Budowanie” |
| Co jest do zrobienia? | `TODO.md` |
