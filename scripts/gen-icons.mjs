// Generates opaque PNG app icons (no native deps) — a green/red "venn" mark on a
// dark rounded-free square (iOS masks corners). Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [0x12, 0x14, 0x24]      // deep indigo
const GREEN = [0x00, 0xc8, 0x75]
const RED = [0xe2, 0x44, 0x5c]

const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const r = size * 0.232
  const cy = size * 0.52
  const lx = size * 0.40, rx = size * 0.60
  const inside = (x, y, cx) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let col = BG
      if (inside(x + 0.5, y + 0.5, lx)) col = GREEN
      if (inside(x + 0.5, y + 0.5, rx)) col = RED // red overlaps green
      const o = (y * size + x) * 4
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255
    }
  }
  // PNG: add filter byte 0 per row
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
for (const size of [180, 192, 512, 1024]) {
  writeFileSync(`public/icon-${size}.png`, drawIcon(size))
  console.log(`public/icon-${size}.png`)
}
