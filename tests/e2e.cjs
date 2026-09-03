/**
 * Test end-to-end rozwijania tekstu.
 *
 * Uruchamia zbudowana aplikacje, otwiera Notatnik, wpisuje w niego trigger
 * przez realne zdarzenia klawiatury i odczytuje, co faktycznie znalazlo sie
 * w polu. To jedyny sposob, zeby sprawdzic cala sciezke - hook, bufor,
 * dopasowanie, kasowanie triggera, wklejenie i powrot focusu - bez czlowieka.
 *
 * Uruchomienie:
 *   npm run test:e2e            - przeciw wersji ze zrodel (out/)
 *   npm run test:e2e:packaged   - przeciw release/win-unpacked (sprawdza asar)
 *
 * Na czas testu przejmuje klawiature i otwiera Notatnik. Nie wchodzi do buildu.
 */
const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { uIOhook, UiohookKey } = require('uiohook-napi')
const koffi = require('koffi')

/* --- Win32: wymuszenie pierwszego planu dla okna docelowego --- */

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')
const FindWindowW = user32.func('void* FindWindowW(str16 cls, str16 title)')
const GetForegroundWindow = user32.func('void* GetForegroundWindow()')
const SetForegroundWindow = user32.func('bool SetForegroundWindow(void* h)')
const ShowWindow = user32.func('bool ShowWindow(void* h, int cmd)')
const GetWindowTextW = user32.func('int GetWindowTextW(void* h, _Out_ uint16* s, int n)')
const GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(void* h, _Out_ uint32* p)')
const AttachThreadInput = user32.func('bool AttachThreadInput(uint32 a, uint32 b, bool f)')
const GetCurrentThreadId = kernel32.func('uint32 GetCurrentThreadId()')

const fgTitle = () => {
  const h = GetForegroundWindow()
  if (!h) return '(null)'
  const b = new Uint16Array(256)
  const n = GetWindowTextW(h, b, 256)
  return n > 0 ? Buffer.from(b.buffer, 0, n * 2).toString('utf16le') : '(bez tytulu)'
}

/** Podnosi okno na pierwszy plan, obchodzac blokade Windows. */
function forceForeground(hwnd) {
  if (!hwnd) return false
  ShowWindow(hwnd, 9) // SW_RESTORE
  if (SetForegroundWindow(hwnd)) return true
  const ours = GetCurrentThreadId()
  const theirs = GetWindowThreadProcessId(GetForegroundWindow(), new Uint32Array(1))
  if (!theirs || ours === theirs) return false
  AttachThreadInput(ours, theirs, true)
  const ok = SetForegroundWindow(hwnd)
  AttachThreadInput(ours, theirs, false)
  return ok
}

const K = UiohookKey
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const say = (s) => {
  out.push(s)
  fs.writeFileSync(process.argv[2], out.join('\n') + '\n', 'utf8')
}

/* --- pisanie na klawiaturze --- */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const CHAR_KEYS = { '/': K.Slash, ' ': K.Space, '.': K.Period, ',': K.Comma, '-': K.Minus }
for (const ch of LETTERS) CHAR_KEYS[ch] = K[ch.toUpperCase()]
for (let d = 0; d <= 9; d++) CHAR_KEYS[String(d)] = K[d]

async function type(text, perKey = 55) {
  for (const ch of text) {
    const lower = ch.toLowerCase()
    const key = CHAR_KEYS[lower]
    if (key === undefined) continue
    const needsShift = ch !== lower
    if (needsShift) uIOhook.keyTap(key, [K.Shift])
    else uIOhook.keyTap(key)
    await sleep(perKey)
  }
}

/** Zaznacza wszystko i kopiuje, zeby dalo sie odczytac zawartosc pola. */
async function readTargetText() {
  uIOhook.keyTap(K.A, [K.Ctrl])
  await sleep(150)
  uIOhook.keyTap(K.C, [K.Ctrl])
  await sleep(400)
  try {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'],
      { encoding: 'utf8', timeout: 15000 }
    )
  } catch (err) {
    return '(nie udalo sie odczytac schowka: ' + err.message + ')'
  }
}

async function ensureTarget(say) {
  const notepad = FindWindowW('Notepad', null)
  if (fgTitle().indexOf('Notatnik') === -1) forceForeground(notepad)
  await sleep(300)
  return fgTitle().indexOf('Notatnik') !== -1
}

async function clearTarget() {
  uIOhook.keyTap(K.A, [K.Ctrl])
  await sleep(120)
  uIOhook.keyTap(K.Delete)
  await sleep(200)
}

/* --- przebieg --- */

// Test lezy w tests/, aplikacja jest katalog wyzej.
const APP_DIR = path.join(__dirname, '..')
let appProc = null
let notepadProc = null

function cleanup() {
  try {
    uIOhook.stop()
  } catch {}
  try {
    execFileSync('taskkill', ['/IM', 'notepad.exe', '/F'], { stdio: 'ignore' })
  } catch {}
  try {
    execFileSync('taskkill', ['/IM', 'electron.exe', '/F'], { stdio: 'ignore' })
  } catch {}
  try {
    execFileSync('taskkill', ['/IM', 'Snippety.exe', '/F'], { stdio: 'ignore' })
  } catch {}
}

async function main() {
  say('=== TEST E2E ROZWIJANIA TEKSTU ===')
  say('(dane testowe w tests/.tmp-userdata - prawdziwa baza nie jest ruszana)')

  // Osobny katalog danych na czas testu. Bez tego test kasowalby prawdziwa
  // baze snippetow uzytkownika - a to jest jego jedyna kopia.
  const dataDir = path.join(__dirname, '.tmp-userdata')
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const packaged = process.argv.includes('--packaged')
  const exe = packaged
    ? path.join(APP_DIR, 'release', 'win-unpacked', 'Snippety.exe')
    : path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
  say('startuje aplikacje' + (packaged ? ' (wersja spakowana)' : ' (ze zrodel)') + '...')
  if (packaged && !fs.existsSync(exe)) {
    say('BLAD: brak ' + exe + ' - uruchom najpierw: npm run dist:dir')
    return
  }
  const args = packaged ? [] : ['.']
  args.push('--user-data-dir=' + dataDir)
  appProc = spawn(exe, args, {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore'
  })
  appProc.unref()

  // Nie ruszamy klawiatury, dopoki aplikacja nie potwierdzi startu wpisem w logu.
  const logFile = path.join(dataDir, 'log.txt')
  let started = false
  for (let i = 0; i < 60; i++) {
    if (fs.existsSync(logFile) && fs.readFileSync(logFile, 'utf8').includes('hook wystartowal')) {
      started = true
      break
    }
    await sleep(500)
  }
  if (!started) {
    say('BLAD: aplikacja nie wystartowala w 30 s - przerywam')
    return
  }
  say('aplikacja gotowa')
  await sleep(1000)

  say('otwieram Notatnik...')
  notepadProc = spawn('notepad.exe', { detached: true, stdio: 'ignore' })
  notepadProc.unref()
  await sleep(2500)

  // Bez tego Notatnik zostaje w tle, a test pisze w okno, ktore akurat
  // jest aktywne - wyniki sa wtedy bezwartosciowe.
  const notepad = FindWindowW('Notepad', null)
  if (!notepad) {
    say('BLAD: nie znaleziono okna Notatnika')
    return
  }
  for (let i = 0; i < 10 && fgTitle().indexOf('Notatnik') === -1; i++) {
    forceForeground(notepad)
    await sleep(400)
  }
  say('okno docelowe: ' + fgTitle())
  if (fgTitle().indexOf('Notatnik') === -1) {
    say('BLAD: Notatnik nie przeszedl na pierwszy plan - przerywam, zeby nie pisac w cudze okno')
    return
  }

  uIOhook.start()
  await sleep(300)

  const results = []

  /* --- przypadek 1: prosty trigger bez pol --- */
  say('')
  say('--- 1. /data (bez pol) ---')
  if (!(await ensureTarget(say))) say('  UWAGA: cel nie jest Notatnikiem: ' + fgTitle())
  await clearTarget()
  await type('/data')
  await sleep(2000)
  const got1 = (await readTargetText()).trim()
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const expected1 = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
  say('  oczekiwano: ' + JSON.stringify(expected1))
  say('  otrzymano:  ' + JSON.stringify(got1))
  results.push(['/data', got1 === expected1])

  /* --- przypadek 2: trigger ze znacznikiem kursora --- */
  say('')
  say('--- 2. /przywitanie (znacznik kursora) ---')
  if (!(await ensureTarget(say))) say('  UWAGA: cel nie jest Notatnikiem: ' + fgTitle())
  await clearTarget()
  await type('/przywitanie')
  await sleep(2000)
  const got2 = (await readTargetText()).replace(/\r\n/g, '\n').trim()
  const ok2 = got2.startsWith('Dzien dobry,') && got2.includes('Pozdrawiam serdecznie')
  say('  otrzymano:  ' + JSON.stringify(got2))
  results.push(['/przywitanie', ok2])

  /* --- przypadek 3: trigger z formularzem pol --- */
  say('')
  say('--- 3. /oferta (formularz pol, powrot focusu) ---')
  if (!(await ensureTarget(say))) say('  UWAGA: cel nie jest Notatnikiem: ' + fgTitle())
  await clearTarget()
  await type('/oferta')
  await sleep(2500) // czas na pojawienie sie formularza
  say('  wypelniam formularz...')
  await type('Jan')
  uIOhook.keyTap(K.Tab)
  await sleep(200)
  await type('Testowa')
  await sleep(200)
  uIOhook.keyTap(K.Enter)
  await sleep(2500)
  const got3 = (await readTargetText()).replace(/\r\n/g, '\n').trim()
  const ok3 = got3.includes('Jan') && got3.includes('Testowa') && !got3.includes('/oferta')
  say('  otrzymano:  ' + JSON.stringify(got3))
  results.push(['/oferta', ok3])

  /* --- podsumowanie --- */
  say('')
  say('=== WYNIKI ===')
  for (const [name, ok] of results) say('  ' + (ok ? 'OK   ' : 'BLAD ') + name)
  say('')
  say(results.every((r) => r[1]) ? 'WSZYSTKO DZIALA' : 'SA BLEDY - patrz wyzej')

  // Log aplikacji mowi, co dzialo sie w srodku.
  say('')
  say('=== LOG APLIKACJI ===')
  try {
    say(fs.readFileSync(path.join(dataDir, 'log.txt'), 'utf8'))
  } catch (err) {
    say('(brak logu: ' + err.message + ')')
  }
}

main()
  .catch((err) => say('WYJATEK: ' + err.stack))
  .finally(async () => {
    cleanup()
    process.exit(0)
  })
