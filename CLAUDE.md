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
- **Dane w plikach JSON** w `%APPDATA%/snippety/`. Żadnej bazy, żadnej chmury.

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

## Rozwijanie tekstu — zasada twarda

**Przy jakiejkolwiek wątpliwości co do pozycji karetki bufor się zeruje.**

Fałszywe rozwinięcie kasuje użytkownikowi tekst, którego nie da się odzyskać.
Fałszywy brak rozwinięcia kosztuje go jedno ponowne wpisanie triggera. Ta
asymetria decyduje o każdym sporze projektowym w `engine.ts` i `keymap.ts`.

Praktycznie: każdy klawisz przesuwający karetkę (Enter, Tab, strzałki, Home/End,
Delete), każde kliknięcie myszą i każdy skrót z Ctrl/Alt czyszczą bufor.

## Języki i teksty

- **Cały interfejs po polsku.** Nie ma i na razie nie będzie i18n — teksty
  są wprost w komponentach.
- **Liczebniki odmieniaj przez `withCount()`** z `src/renderer/src/plural.ts`.
  Polski ma trzy formy; `n === 1 ? a : b` daje „2 snippetów” i wygląda źle.
- **Kod i komentarze bez polskich znaków diakrytycznych.** Teksty widoczne
  dla użytkownika (JSX, etykiety) — z pełną polszczyzną.

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
