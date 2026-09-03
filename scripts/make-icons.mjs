/**
 * Generator ikon aplikacji: resources/icon.png i resources/icon.ico.
 *
 * Ikona jest rysowana kodem, a nie wklejona jako binarka - dzieki temu da sie
 * ja zmienic jedna linijka i nie ma w repo pliku, ktorego nikt nie umie odtworzyc.
 *
 * Uruchomienie:  node scripts/make-icons.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'resources')

/* ------------------------------------------------------------------ */
/* Rysowanie                                                           */
/* ------------------------------------------------------------------ */

const ACCENT_TOP = [124, 92, 255]
const ACCENT_BOTTOM = [79, 56, 214]
const GLYPH = [255, 255, 255]

/** Odleglosc punktu od zaokraglonego prostokata (ujemna w srodku). */
function roundedRectSdf(x, y, w, h, r) {
  const dx = Math.abs(x - w / 2) - (w / 2 - r)
  const dy = Math.abs(y - h / 2) - (h / 2 - r)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - r
}

/** Odleglosc punktu od odcinka - rysuje ukosnik z zaokraglonymi koncami. */
function segmentSdf(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(wx - t * vx, wy - t * vy)
}

/**
 * Renderuje ikone w podanym rozmiarze.
 * Krawedzie wygladzane nadprobkowaniem 4x4 - bez tego ukosnik jest schodkowy.
 */
function renderIcon(size) {
  const SS = 4
  const pixels = Buffer.alloc(size * size * 4)

  const radius = size * 0.22
  // Ukosnik: od dolu-lewej do gory-prawej, jak znak "/" rozpoczynajacy trigger.
  const ax = size * 0.36
  const ay = size * 0.72
  const bx = size * 0.64
  const by = size * 0.28
  const halfThickness = size * 0.058

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS

          const inside = roundedRectSdf(px, py, size, size, radius) <= 0
          if (!inside) continue

          const t = py / size
          let cr = ACCENT_TOP[0] + (ACCENT_BOTTOM[0] - ACCENT_TOP[0]) * t
          let cg = ACCENT_TOP[1] + (ACCENT_BOTTOM[1] - ACCENT_TOP[1]) * t
          let cb = ACCENT_TOP[2] + (ACCENT_BOTTOM[2] - ACCENT_TOP[2]) * t

          if (segmentSdf(px, py, ax, ay, bx, by) <= halfThickness) {
            cr = GLYPH[0]
            cg = GLYPH[1]
            cb = GLYPH[2]
          }

          r += cr
          g += cg
          b += cb
          a += 255
        }
      }

      const samples = SS * SS
      const i = (y * size + x) * 4
      const coverage = a / samples / 255
      // Kolor uśredniamy tylko po pokrytych próbkach, żeby brzeg nie ciemniał.
      const covered = Math.max(1, a / 255)
      pixels[i] = Math.round(r / covered)
      pixels[i + 1] = Math.round(g / covered)
      pixels[i + 2] = Math.round(b / covered)
      pixels[i + 3] = Math.round(coverage * 255)
    }
  }

  return pixels
}

/* ------------------------------------------------------------------ */
/* Kodowanie PNG                                                       */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bitow na kanal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Kazdy wiersz poprzedzony bajtem filtra (0 = brak).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ------------------------------------------------------------------ */
/* Kodowanie ICO                                                       */
/* ------------------------------------------------------------------ */

/** ICO z osadzonymi PNG-ami - obslugiwane przez Windows od Visty. */
function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // rezerwa
  header.writeUInt16LE(1, 2) // typ: ikona
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((entry, i) => {
    const at = i * 16
    // 256 zapisuje sie jako 0 - pole ma jeden bajt.
    directory[at] = entry.size >= 256 ? 0 : entry.size
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size
    directory[at + 2] = 0 // paleta
    directory[at + 3] = 0 // rezerwa
    directory.writeUInt16LE(1, at + 4) // plaszczyzny
    directory.writeUInt16LE(32, at + 6) // bitow na piksel
    directory.writeUInt32LE(entry.png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)])
}

/* ------------------------------------------------------------------ */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

fs.mkdirSync(OUT_DIR, { recursive: true })

const entries = ICO_SIZES.map((size) => ({ size, png: encodePng(renderIcon(size), size) }))
const main = entries.find((e) => e.size === 256)

fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), main.png)
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(entries))

console.log('icon.png  256x256   ' + main.png.length + ' B')
console.log('icon.ico  ' + ICO_SIZES.join('/') + '   ' + fs.statSync(path.join(OUT_DIR, 'icon.ico')).size + ' B')
