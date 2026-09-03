import { render, collectFields, formatDate } from '../src/main/expansion/placeholders.ts'

let pass = 0
let fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log('  OK   ' + label) }
  else { fail++; console.log('  BLAD ' + label + '\n        oczekiwano: ' + JSON.stringify(expected) + '\n        otrzymano:  ' + JSON.stringify(actual)) }
}

const now = new Date(2026, 8, 3, 14, 5, 9) // 3 wrzesnia 2026, 14:05:09
const ctx = { clipboard: 'ZE-SCHOWKA', now }

console.log('\n-- formatowanie dat --')
check('domyslny format', formatDate(now, 'DD.MM.RRRR'), '03.09.2026')
check('ISO', formatDate(now, 'RRRR-MM-DD'), '2026-09-03')
check('nazwa miesiaca', formatDate(now, 'DD MMMM RRRR'), '03 wrzesnia 2026')
check('dzien tygodnia', formatDate(now, 'dddd'), 'czwartek')
check('godzina z sekundami', formatDate(now, 'GG:mm:ss'), '14:05:09')

console.log('\n-- zmienne wbudowane --')
check('data', render('Dzis jest {{data}}.', ctx).text, 'Dzis jest 03.09.2026.')
check('data +7', render('Termin: {{data:+7}}', ctx).text, 'Termin: 10.09.2026')
check('data +7 z formatem', render('{{data:+7:RRRR-MM-DD}}', ctx).text, '2026-09-10')
check('data -1', render('{{data:-1}}', ctx).text, '02.09.2026')
check('godzina', render('o {{godzina}}', ctx).text, 'o 14:05')
check('godzina z formatem', render('{{godzina:GG:mm:ss}}', ctx).text, '14:05:09')
check('schowek', render('[{{schowek}}]', ctx).text, '[ZE-SCHOWKA]')
check('alias angielski', render('{{date}} {{time}}', ctx).text, '03.09.2026 14:05')

console.log('\n-- kursor --')
const cur = render('Dzien dobry,\n{{kursor}}\nPozdrawiam', ctx)
check('tekst bez znacznika', cur.text, 'Dzien dobry,\n\nPozdrawiam')
check('cofniecie kursora', cur.cursorBack, 11)
check('brak kursora = 0', render('bez znacznika', ctx).cursorBack, 0)

console.log('\n-- pola do wypelnienia --')
const tpl = 'Witaj {{pole:Imie}},\nw sprawie {{pole:Firma=ACME}}.\nStatus: {{wybor:Status=Nowy|W toku|Zamkniete}}\n{{obszar:Uwagi}}\nPozdrawiam, {{pole:Imie}}'
const fields = collectFields(tpl)
check('liczba pol (Imie sie nie dubluje)', fields.length, 4)
check('pole tekstowe', { k: fields[0].kind, l: fields[0].label }, { k: 'text', l: 'Imie' })
check('wartosc domyslna', fields[1].defaultValue, 'ACME')
check('lista wyboru', fields[2].options, ['Nowy', 'W toku', 'Zamkniete'])
check('domyslna z listy', fields[2].defaultValue, 'Nowy')
check('obszar wieloliniowy', fields[3].kind, 'multiline')

const filled = render(tpl, { ...ctx, values: { imie: 'Danielu', firma: 'Nowa Firma', status: 'W toku', uwagi: 'pilne' } })
check('podstawienie wartosci', filled.text, 'Witaj Danielu,\nw sprawie Nowa Firma.\nStatus: W toku\npilne\nPozdrawiam, Danielu')
check('brak wartosci = domyslna', render(tpl, ctx).text.includes('w sprawie ACME.'), true)

console.log('\n-- przypadki brzegowe --')
check('nieznany placeholder zostaje', render('{{cokolwiek}}', ctx).text, '{{cokolwiek}}')
check('pojedyncze klamry nietkniete', render('{ "a": 1 }', ctx).text, '{ "a": 1 }')
check('pusta tresc', render('', ctx).text, '')
check('polskie znaki w nazwie', render('{{wybór:X=tak|nie}}', ctx).text, 'tak')
check('drugi kursor ignorowany', render('a{{kursor}}b{{kursor}}c', ctx).cursorBack, 2)

console.log('\n=== ' + pass + ' OK, ' + fail + ' bledow ===')
process.exit(fail === 0 ? 0 : 1)
