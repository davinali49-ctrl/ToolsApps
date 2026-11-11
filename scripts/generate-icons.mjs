// Membuat seluruh aset ikon (PWA, Electron, Android) tanpa dependensi biner.
// Jalankan: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = [8, 12, 25];
const STEEL = [127, 175, 206];
const STEEL_DEEP = [95, 148, 184];

// ---------------------------------------------------------------------------
// Encoder PNG (RGBA, 8-bit)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function writePng(file, width, height, rgba) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(width, height, rgba));
}

// ---------------------------------------------------------------------------
// Rasterisasi logo
// ---------------------------------------------------------------------------
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const HEXAGON = [
  [0.5, 0.175],
  [0.75, 0.3125],
  [0.75, 0.6875],
  [0.5, 0.825],
  [0.25, 0.6875],
  [0.25, 0.3125]
];

const LOGO_SEGMENTS = [
  ...HEXAGON.map((point, index) => {
    const next = HEXAGON[(index + 1) % HEXAGON.length];
    return [point[0], point[1], next[0], next[1]];
  }),
  [0.375, 0.5, 0.625, 0.5],
  [0.5, 0.375, 0.5, 0.625]
];

const STROKE = 0.05;
const STROKE_HALF = STROKE / 2;

function insideShape(x, y, style) {
  if (style === 'full') return true;
  if (style === 'none') return false;
  if (style === 'circle') {
    return Math.hypot(x - 0.5, y - 0.5) <= 0.5;
  }
  // rounded rectangle, radius 22%
  const radius = 0.22;
  const dx = Math.abs(x - 0.5) - (0.5 - radius);
  const dy = Math.abs(y - 0.5) - (0.5 - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) <= radius;
}

function logoAlphaAt(x, y, scale) {
  const lx = 0.5 + (x - 0.5) / scale;
  const ly = 0.5 + (y - 0.5) / scale;
  if (lx < 0.2 || lx > 0.8 || ly < 0.12 || ly > 0.88) return 0;
  let distance = Infinity;
  for (const [ax, ay, bx, by] of LOGO_SEGMENTS) {
    distance = Math.min(distance, segmentDistance(lx, ly, ax, ay, bx, by));
  }
  return distance <= STROKE_HALF ? 1 : 0;
}

function logoColorAt(x, y, scale) {
  const lx = 0.5 + (x - 0.5) / scale;
  const ly = 0.5 + (y - 0.5) / scale;
  const t = clamp((lx - 0.25 + (ly - 0.175)) / 0.9);
  return [
    Math.round(STEEL_DEEP[0] + (STEEL[0] - STEEL_DEEP[0]) * t),
    Math.round(STEEL_DEEP[1] + (STEEL[1] - STEEL_DEEP[1]) * t),
    Math.round(STEEL_DEEP[2] + (STEEL[2] - STEEL_DEEP[2]) * t)
  ];
}

function renderIcon(size, options = {}) {
  const { background = 'rounded', scale = 1, samples = size <= 64 ? 5 : size <= 256 ? 4 : 3 } = options;
  const rgba = Buffer.alloc(size * size * 4);
  const total = samples * samples;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;

          if (insideShape(x, y, background)) {
            cr = BG[0];
            cg = BG[1];
            cb = BG[2];
            ca = 1;
          }

          if (logoAlphaAt(x, y, scale)) {
            const [lr, lg, lb] = logoColorAt(x, y, scale);
            cr = lr * 1 + cr * 0;
            cg = lg * 1 + cg * 0;
            cb = lb * 1 + cb * 0;
            ca = 1;
          }

          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }

      const index = (py * size + px) * 4;
      if (a > 0) {
        rgba[index] = Math.round(r / a);
        rgba[index + 1] = Math.round(g / a);
        rgba[index + 2] = Math.round(b / a);
        rgba[index + 3] = Math.round((a / total) * 255);
      }
    }
  }

  return rgba;
}

function renderLogo(size, scale = 1.15) {
  return renderIcon(size, { background: 'none', scale, samples: size <= 256 ? 4 : 3 });
}

// ---------------------------------------------------------------------------
// ICO (kumpulan PNG, didukung Windows Vista ke atas)
// ---------------------------------------------------------------------------
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;

  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((item) => item.data)]);
}

// ---------------------------------------------------------------------------
// Splash screen: latar gelap + logo di tengah
// ---------------------------------------------------------------------------
function blitScaled(destination, canvasWidth, canvasHeight, source, sourceSize, left, top, targetWidth, targetHeight) {
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = clamp(((y + 0.5) / targetHeight) * sourceSize - 0.5, 0, sourceSize - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceSize - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sx = clamp(((x + 0.5) / targetWidth) * sourceSize - 0.5, 0, sourceSize - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceSize - 1, x0 + 1);
      const fx = sx - x0;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [ox, oy, weight] of [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy]
      ]) {
        const index = (oy * sourceSize + ox) * 4;
        const alpha = (source[index + 3] / 255) * weight;
        r += source[index] * alpha;
        g += source[index + 1] * alpha;
        b += source[index + 2] * alpha;
        a += alpha;
      }

      if (a <= 0) continue;
      const index = ((top + y) * canvasWidth + (left + x)) * 4;
      const sr = r / a;
      const sg = g / a;
      const sb = b / a;
      destination[index] = Math.round(sr * a + destination[index] * (1 - a));
      destination[index + 1] = Math.round(sg * a + destination[index + 1] * (1 - a));
      destination[index + 2] = Math.round(sb * a + destination[index + 2] * (1 - a));
      destination[index + 3] = 255;
    }
  }
}

function renderSplash(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const minDimension = Math.min(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      rgba[index] = BG[0];
      rgba[index + 1] = BG[1];
      rgba[index + 2] = BG[2];
      rgba[index + 3] = 255;
    }
  }

  const spriteSize = 512;
  const sprite = renderLogo(spriteSize, 1.15);
  const box = Math.round(minDimension * 0.36);
  const left = Math.round((width - box) / 2);
  const top = Math.round((height - box) / 2);
  blitScaled(rgba, width, height, sprite, spriteSize, left, top, box, box);
  return rgba;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const WEB_PUBLIC = path.join(ROOT, 'apps/web/public');
const DESKTOP_BUILD = path.join(ROOT, 'apps/desktop/build');
const ANDROID_RES = path.join(ROOT, 'apps/web/android/app/src/main/res');

function writeIcon(file, size, options) {
  writePng(file, size, size, renderIcon(size, options));
  console.log(`  ${path.relative(ROOT, file)} (${size}x${size})`);
}

console.log('Ikon web & PWA');
writeIcon(path.join(WEB_PUBLIC, 'pwa-192x192.png'), 192, { background: 'rounded' });
writeIcon(path.join(WEB_PUBLIC, 'pwa-512x512.png'), 512, { background: 'rounded' });
writeIcon(path.join(WEB_PUBLIC, 'maskable-512x512.png'), 512, { background: 'full', scale: 1.1 });
writeIcon(path.join(WEB_PUBLIC, 'apple-touch-icon.png'), 180, { background: 'full' });

console.log('Ikon Electron');
writeIcon(path.join(DESKTOP_BUILD, 'icon.png'), 512, { background: 'rounded' });
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map((size) => ({
  size,
  data: encodePng(size, size, renderIcon(size, { background: 'rounded' }))
}));
fs.mkdirSync(DESKTOP_BUILD, { recursive: true });
fs.writeFileSync(path.join(DESKTOP_BUILD, 'icon.ico'), encodeIco(icoPngs));
console.log(`  apps/desktop/build/icon.ico (${icoSizes.join(', ')})`);

console.log('Ikon Android');
const densities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432]
];
for (const [density, legacySize, foregroundSize] of densities) {
  const directory = path.join(ANDROID_RES, `mipmap-${density}`);
  writeIcon(path.join(directory, 'ic_launcher.png'), legacySize, { background: 'rounded' });
  writeIcon(path.join(directory, 'ic_launcher_round.png'), legacySize, { background: 'circle' });
  writeIcon(path.join(directory, 'ic_launcher_foreground.png'), foregroundSize, {
    background: 'none',
    scale: 1.2
  });
}

console.log('Splash screen Android');
const splashFiles = [];
for (const entry of fs.readdirSync(ANDROID_RES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(ANDROID_RES, entry.name, 'splash.png');
  if (fs.existsSync(candidate)) splashFiles.push(candidate);
}
const splashCache = new Map();
for (const file of splashFiles) {
  const { width, height } = pngSize(file);
  const key = `${width}x${height}`;
  if (!splashCache.has(key)) splashCache.set(key, renderSplash(width, height));
  writePng(file, width, height, splashCache.get(key));
  console.log(`  ${path.relative(ROOT, file)} (${width}x${height})`);
}

console.log('Selesai.');
