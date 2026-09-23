/**
 * Generates the PWA raster icons without any image dependency.
 *
 * The mark is a small family graph - two generations of nodes joined by stems,
 * the eldest node in saffron - drawn with a tiny software rasteriser and
 * encoded as PNG by hand (zlib deflate + CRC32 chunks). Supersampling keeps the
 * circles smooth. Run with `npm run icons`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

const INK = [0x2a, 0x23, 0x40];
const CREAM = [0xf3, 0xec, 0xe0];
const SAFFRON = [0xc9, 0x8a, 0x3c];

// ---------------------------------------------------------------------------
// Rasteriser (RGBA, source-over)
// ---------------------------------------------------------------------------

function createCanvas(width, height) {
  return { width, height, data: new Float32Array(width * height * 4) };
}

function blend(canvas, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || alpha <= 0) return;
  const index = (y * canvas.width + x) * 4;
  const data = canvas.data;
  const a = Math.min(1, alpha);
  const dstA = data[index + 3];
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    data[index + c] = (color[c] * a + data[index + c] * dstA * (1 - a)) / outA;
  }
  data[index + 3] = outA;
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  for (let py = Math.floor(y); py < y + height; py += 1) {
    for (let px = Math.floor(x); px < x + width; px += 1) {
      const dx = Math.max(x + radius - px - 1, 0, px - (x + width - radius)) ;
      const dy = Math.max(y + radius - py - 1, 0, py - (y + height - radius));
      const distance = Math.hypot(dx, dy);
      if (distance <= radius) blend(canvas, px, py, color, 1);
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius) - 1;
  const maxX = Math.ceil(cx + radius) + 1;
  const minY = Math.floor(cy - radius) - 1;
  const maxY = Math.ceil(cy + radius) + 1;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distance = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (distance <= radius) blend(canvas, px, py, color, 1);
    }
  }
}

function strokeLine(canvas, x1, y1, x2, y2, width, color, alpha = 1) {
  const minX = Math.floor(Math.min(x1, x2) - width) - 1;
  const maxX = Math.ceil(Math.max(x1, x2) + width) + 1;
  const minY = Math.floor(Math.min(y1, y2) - width) - 1;
  const maxY = Math.ceil(Math.max(y1, y2) + width) + 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy || 1;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const t = Math.max(0, Math.min(1, ((px + 0.5 - x1) * dx + (py + 0.5 - y1) * dy) / lengthSquared));
      const distance = Math.hypot(px + 0.5 - (x1 + t * dx), py + 0.5 - (y1 + t * dy));
      if (distance <= width / 2) blend(canvas, px, py, color, alpha);
    }
  }
}

/** Box-downsamples a supersampled canvas into 8-bit RGBA. */
function downsample(canvas, factor) {
  const width = canvas.width / factor;
  const height = canvas.height / factor;
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const index = ((y * factor + sy) * canvas.width + (x * factor + sx)) * 4;
          r += canvas.data[index];
          g += canvas.data[index + 1];
          b += canvas.data[index + 2];
          a += canvas.data[index + 3];
        }
      }
      const samples = factor * factor;
      const outIndex = (y * width + x) * 4;
      out[outIndex] = Math.round(r / samples);
      out[outIndex + 1] = Math.round(g / samples);
      out[outIndex + 2] = Math.round(b / samples);
      out[outIndex + 3] = Math.round((a / samples) * 255);
    }
  }

  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

/**
 * Draws the family-graph mark.
 * `bleed` = true fills the whole square (maskable icons, where the platform
 * crops to its own shape and only the middle 80% is guaranteed visible).
 */
function drawMark(size, { bleed }) {
  const factor = 4;
  const canvas = createCanvas(size * factor, size * factor);
  const s = size * factor;
  const unit = (value) => (value / 100) * s;

  if (bleed) {
    fillRoundedRect(canvas, 0, 0, s, s, 0, INK);
  } else {
    fillRoundedRect(canvas, 0, 0, s, s, unit(22), INK);
  }

  // Nodes sit inside the safe area when bleeding (so launchers can crop).
  const scale = bleed ? 0.78 : 0.86;
  const centreX = s / 2;
  const topY = s * (bleed ? 0.3 : 0.27);
  const midY = s * (bleed ? 0.5 : 0.47);
  const branchY = s * (bleed ? 0.62 : 0.58);
  const rootY = s * (bleed ? 0.74 : 0.7);
  const spread = s * 0.21 * scale;
  const stem = unit(1.6);

  strokeLine(canvas, centreX, rootY, centreX, branchY, stem, CREAM, 0.6);
  strokeLine(canvas, centreX, branchY, centreX - spread, midY, stem, CREAM, 0.6);
  strokeLine(canvas, centreX, branchY, centreX + spread, midY, stem, CREAM, 0.6);
  strokeLine(canvas, centreX, branchY, centreX, topY, stem, CREAM, 0.45);

  fillCircle(canvas, centreX - spread, midY, s * 0.042 * scale, CREAM);
  fillCircle(canvas, centreX + spread, midY, s * 0.042 * scale, CREAM);
  fillCircle(canvas, centreX, branchY, s * 0.048 * scale, CREAM);
  fillCircle(canvas, centreX, topY, s * 0.058 * scale, SAFFRON);
  fillCircle(canvas, centreX, rootY, s * 0.038 * scale, SAFFRON);

  return downsample(canvas, factor);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, bleed: false },
  { file: "icon-512.png", size: 512, bleed: false },
  { file: "icon-maskable-512.png", size: 512, bleed: true },
  { file: "apple-touch-icon.png", size: 180, bleed: false },
];

for (const target of targets) {
  const png = encodePng(drawMark(target.size, { bleed: target.bleed }));
  writeFileSync(path.join(OUT_DIR, target.file), png);
  console.log(`icons: wrote ${target.file} (${target.size}px, ${(png.length / 1024).toFixed(1)} KB)`);
}
