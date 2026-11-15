/**
 * Minimal QR code generator (ISO/IEC 18004): byte mode, UTF-8, error
 * correction level L or M, versions 1–40, automatic mask choice.
 * Pure module (no DOM) except qrSvg(), which only builds a string.
 *
 *   const { size, modules } = qrEncode("http://…", "M");   // modules[y][x] true = dark
 *   el.innerHTML = qrSvg("http://…");
 */

// Per version (index 1–40): error-correction codewords per block, and block count.
const ECC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
const EC_BITS = { L: 1, M: 0 };

/** Total codewords-carrying modules for a version, in bits. */
export function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

export function dataCodewords(ver, ecl) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * BLOCKS[ecl][ver];
}

// ---- GF(256) Reed–Solomon (polynomial 0x11D)
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Reed–Solomon remainder (the ECC codewords) of `data` for `degree` ECC bytes. */
export function rsRemainder(data, degree) {
  const divisor = rsDivisor(degree);
  const result = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return result;
}

function utf8(text) {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
  return Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
}

/** Data + ECC codewords, interleaved, ready to place. */
export function codewordsFor(bytes, ver, ecl) {
  const capacity = dataCodewords(ver, ecl);
  const bits = [];
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4); // byte mode
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  const numBlocks = BLOCKS[ecl][ver];
  const eccLen = ECC_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, eccLen);
    if (i < numShort) dat.push(-1); // placeholder so all blocks align
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
    }
  }
  return out;
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const num = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < num; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** 15-bit format word (already XORed with the 0x5412 mask). */
export function formatBits(ecl, mask) {
  const data = (EC_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
export const QR_MASKS = MASKS;

function buildBase(ver) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const align = alignmentPositions(ver);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  // Reserve format areas (filled per mask later) and the dark module.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue; // timing modules cross here
    set(8, i, false);
    set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8, false);
    set(8, size - 1 - i, false);
  }
  set(8, size - 8, true);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
  return { size, m, fn };
}

/** Module coordinates in codeword placement (zigzag) order, skipping function modules. */
export function placementOrder(size, fn) {
  const order = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x]) order.push([x, y]);
      }
    }
  }
  return order;
}

function drawFormat(m, size, ecl, mask) {
  const bits = formatBits(ecl, mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
  m[size - 8][8] = true;
}

function penalty(m, size) {
  let score = 0;
  const lineScore = (get) => {
    let s = 0;
    for (let a = 0; a < size; a++) {
      let run = 1;
      const line = [];
      for (let b = 0; b < size; b++) line.push(get(a, b));
      for (let b = 1; b <= size; b++) {
        if (b < size && line[b] === line[b - 1]) run++;
        else {
          if (run >= 5) s += run - 2;
          run = 1;
        }
      }
      const str = line.map((v) => (v ? "1" : "0")).join("");
      for (const pat of ["10111010000", "00001011101"]) {
        let at = str.indexOf(pat);
        while (at !== -1) {
          s += 40;
          at = str.indexOf(pat, at + 1);
        }
      }
    }
    return s;
  };
  score += lineScore((a, b) => m[a][b]);
  score += lineScore((a, b) => m[b][a]);
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
      }
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encode `text` as a QR code.
 * @param {string} text
 * @param {"L"|"M"} [ecl]
 * @param {number} [forceMask] 0–7 to skip automatic mask choice
 * @returns {{ version: number, size: number, ecl: string, mask: number, modules: boolean[][] }}
 */
export function qrEncode(text, ecl = "M", forceMask) {
  if (ecl !== "L" && ecl !== "M") ecl = "M";
  const bytes = utf8(String(text));
  let ver = 1;
  while (ver <= 40 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver, ecl) * 8) ver++;
  if (ver > 40) throw new RangeError("qrEncode: text too long");
  const codewords = codewordsFor(bytes, ver, ecl);
  const { size, m, fn } = buildBase(ver);
  const order = placementOrder(size, fn);
  order.forEach(([x, y], i) => {
    const cw = codewords[i >>> 3];
    m[y][x] = cw !== undefined && ((cw >>> (7 - (i & 7))) & 1) === 1;
  });
  let best = null;
  const masks = Number.isInteger(forceMask) && forceMask >= 0 && forceMask < 8 ? [forceMask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const mask of masks) {
    const t = m.map((row) => row.slice());
    for (const [x, y] of order) if (MASKS[mask](x, y)) t[y][x] = !t[y][x];
    drawFormat(t, size, ecl, mask);
    const score = masks.length === 1 ? 0 : penalty(t, size);
    if (!best || score < best.score) best = { score, mask, modules: t };
  }
  return { version: ver, size, ecl, mask: best.mask, modules: best.modules };
}

/** SVG markup (crisp squares, 4-module quiet zone). */
export function qrSvg(text, { ecl = "M", dark = "#1a1028", light = "#ffffff", label = "QR code" } = {}) {
  const { size, modules } = qrEncode(text, ecl);
  const q = 4;
  const dim = size + q * 2;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (modules[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  }
  const safe = String(label).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="${safe}"><rect width="${dim}" height="${dim}" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`;
}
