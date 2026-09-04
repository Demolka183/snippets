# Snippety

> ## [Pobierz instalator](https://github.com/Demolka183/snippets/releases/latest)
>
> **Nie pobieraj zielonym przyciskiem „Code → Download ZIP”.** To kod źródłowy —
> nie ma w nim programu do uruchomienia. Instalator jest w sekcji **Releases**,
> pod linkiem powyżej, jako plik `Snippety-Setup-X.Y.Z.exe`.

Aplikacja na Windows do powtarzalnych tekstów. Wpisujesz `/przywitanie`
w dowolnym polu — w mailu, na czacie, w formularzu CRM — a aplikacja w tym
miejscu podmienia to na przygotowany wcześniej szablon.

Działa wszędzie tam, gdzie da się pisać: Outlook, Teams, przeglądarka, Word.

Wszystko dzieje się lokalnie, na Twoim komputerze. Bez konta, bez serwera, bez
wysyłania czegokolwiek do internetu — jedyne, co aplikacja kiedykolwiek otwiera
na zewnątrz, to strona z wydaniami, gdy sam klikniesz numer wersji.

---

## Pobranie i instalacja

1. Wejdź w **[Releases](https://github.com/Demolka183/snippets/releases/latest)**
   i w sekcji **Assets** pobierz `Snippety-Setup-X.Y.Z.exe`.
   To pojedynczy plik, nie archiwum — nic nie trzeba rozpakowywać.
2. Uruchom pobrany plik.
3. Windows pokaże niebieskie okno **„System Windows ochronił Twój komputer”**.
   To normalne — aplikacja nie ma certyfikatu podpisu kodu (kosztuje kilkaset
   złotych rocznie i nie ma sensu przy narzędziu wewnętrznym).
   Kliknij **„Więcej informacji”**, potem **„Uruchom mimo to”**.
4. Przeklikaj instalator. Aplikacja wyląduje w menu Start i na pulpicie.

Instalator przechodzisz **raz**. Potem uruchamiasz skrótem jak każdy program.

> **Wersja portable** — jeśli nie chcesz nic instalować, pobierz
> `Snippety-X.Y.Z-portable.exe`. Jeden plik, uruchamiasz i działa. Minus:
> startuje wolniej i **nie zadziała autostart** z systemem.

### Aktualizacja

Pobierz i uruchom nowy instalator — podmieni wersję w miejscu.
**Twoje snippety przeżywają aktualizację**, leżą osobno w `%APPDATA%\snippety\`.
Odinstalowanie też ich nie kasuje.

---

## Pierwsze kroki

Po uruchomieniu aplikacja siedzi **w zasobniku obok zegara** (fioletowa ikona `/`).
Okno jest tylko widokiem na bazę — właściwa praca dzieje się w tle.

1. Kliknij ikonę w zasobniku, żeby otworzyć okno.
2. **+ Nowy** → wpisz nazwę, trigger (np. `/podpis`) i treść → **Utwórz snippet**.
3. Otwórz cokolwiek, w czym się pisze, i wpisz `/podpis`.
   Tekst podmieni się sam.

Na start masz trzy przykłady: `/data`, `/przywitanie` i `/oferta` — ten ostatni
pokazuje pola do wypełnienia.

### Warto ustawić od razu

**Ustawienia → Uruchamiaj z systemem.** Aplikacja ma działać cały czas w tle;
bez tego trzeba ją odpalać ręcznie po każdym restarcie.

**Ustawienia → Skrót okna szybkiego wyboru** (domyślnie `Ctrl+Shift+Space`).
Otwiera listę z wyszukiwarką, gdy nie pamiętasz triggera — strzałki wybierają,
Enter wstawia. Przy kilkudziesięciu snippetach to różnica między używaniem
a nieużywaniem.

### Skąd wiesz, że masz aktualną wersję

Numer wersji jest w pasku górnym, obok nazwy „Snippety”. Kliknięcie w niego
otwiera listę wydań — jeśli na górze widnieje wyższy numer niż Twój, jest
nowsza wersja.

Aplikacja **nie sprawdza tego sama** i nie łączy się z niczym w tle. To
świadoma decyzja: ma działać w całości offline.

### Zamykanie

Kliknięcie **X tylko chowa okno** — aplikacja działa dalej. Żeby wyjść naprawdę:
prawy przycisk na ikonie w zasobniku → **Zakończ**. Tam jest też przełącznik
**Rozwijanie włączone**, gdyby na chwilę przeszkadzało.

---

## Szablony: zmienne i pola

Snippet nie musi być sztywnym tekstem. Może wstawiać dzisiejszą datę, pytać
o imię klienta albo ustawiać kursor w konkretnym miejscu.

```
Dzień dobry {{pole:Imię}},

w sprawie {{pole:Firma=ACME}} — termin do {{data:+14}}.
Status: {{wybor:Status=Nowy|W toku|Zamknięty}}

{{kursor}}

Pozdrawiam
```

Po wpisaniu triggera wyskoczy okienko z pytaniem o „Imię”, „Firma” i „Status”.
Wypełniasz, Enter — i dopiero wtedy gotowy tekst trafia do maila, z datą
policzoną na 14 dni do przodu i kursorem ustawionym w pustej linii.

| Zapis | Co robi |
|---|---|
| `{{data}}` | dzisiejsza data, np. `03.09.2026` |
| `{{data:+7}}` | data za 7 dni (`-7` — siedem dni wstecz) |
| `{{data:RRRR-MM-DD}}` | data w wybranym formacie |
| `{{data:+14:DD MMMM RRRR}}` | jedno i drugie naraz |
| `{{godzina}}` | aktualna godzina |
| `{{schowek}}` | to, co masz akurat w schowku |
| `{{kursor}}` | tu stanie kursor po wklejeniu |
| `{{pole:Nazwa}}` | zapyta o wartość przed wklejeniem |
| `{{pole:Nazwa=domyślna}}` | to samo, z podpowiedzianą wartością |
| `{{obszar:Nazwa}}` | pole na dłuższy tekst |
| `{{wybor:Nazwa=A\|B\|C}}` | lista wyboru |

Nie musisz tego pamiętać — w edytorze pod polem treści są przyciski, które
wstawiają gotowy zapis w miejscu kursora. Poniżej widzisz na żywo, o co
aplikacja zapyta.

**Ta sama etykieta użyta kilka razy to jedno pole.** `{{pole:Imię}}` na początku
i na końcu maila zapyta raz, a wstawi w obu miejscach.

Formaty daty: `RRRR` rok, `MM` miesiąc, `DD` dzień, `MMMM` nazwa miesiąca,
`dddd` dzień tygodnia, `GG:mm:ss` godzina.

---

## Dobre praktyki

**Zaczynaj triggery od znaku, nie od litery.** `/oferta` jest bezpieczne.
Trigger `oferta` odpaliłby się w środku zwykłego zdania.

**Trigger bez polskich znaków.** `/zazolc` zadziała, `/zażółć` nie —
z przyczyn technicznych opisanych w [DOCS.md](DOCS.md) 4.2.
Treść snippetu może mieć pełną polszczyznę.

**Nazywaj po ludzku.** Trigger to skrót do wpisywania, a nazwa służy do
odnalezienia w wyszukiwarce. „Odpowiedź na reklamację — brak części” znajdziesz
za pół roku, „odp2” nie.

---

## Kopia i przenoszenie

**Ustawienia → Eksportuj do pliku** zapisuje wszystko do jednego pliku JSON.
Import wciąga go na innym komputerze — z wyborem, czy nadpisywać snippety
o tym samym triggerze, czy je pominąć.

Tak samo dzieli się snippetami z zespołem: eksport, wysyłka pliku, import.

---

## Coś nie działa

**Trigger się nie zamienia**

- Sprawdź, czy ikona jest w zasobniku i czy „Rozwijanie włączone” jest włączone.
- Sprawdź, czy snippet nie jest wyłączony (szara etykieta „wyłączony” na liście).
- Sprawdź, czy trigger nie ma polskich znaków.

**Tekst wstawia się w złym miejscu albo wcale**

Zajrzyj do `%APPDATA%\snippety\log.txt` — ostatnie linie mówią wprost, do
którego okna poszło wklejenie. Prześlij ten fragment razem z nazwą aplikacji,
w której to się stało.

**Uruchamiam, a nic się nie dzieje**

Aplikacja pozwala na jedną instancję naraz. Prawdopodobnie już działa —
poszukaj ikony w zasobniku (bywa schowana pod strzałką „pokaż ukryte ikony”).

---

## Dla programistów

```bash
npm install               # patrz DOCS.md 10.1, jeśli coś pójdzie nie tak
npm run dev               # tryb deweloperski
npm test                  # testy parsera szablonów
npm run test:e2e          # test end-to-end: pisze do Notatnika i czyta wynik
npm run dist              # instalator + portable do release/
```

- **[CLAUDE.md](CLAUDE.md)** — reguły pracy nad tym kodem
- **[DOCS.md](DOCS.md)** — architektura, przepływ rozwijania, znane pułapki
- **[TODO.md](TODO.md)** — zadania i dług techniczny

Stack: Electron 44 · React 19 · TypeScript · electron-vite · uiohook-napi · koffi

## Licencja

MIT
