import { test } from "vitest";
import assert from "node:assert/strict";
import { qrEncode, rsRemainder, formatBits, dataCodewords, placementOrder, QR_MASKS, qrSvg } from "../../src/games/olympus-21/qr.js";

test("Reed–Solomon matches the textbook HELLO WORLD 1-M vector", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("format words match the spec table", () => {
  assert.equal(formatBits("M", 0), 0b101010000010010);
  assert.equal(formatBits("L", 0), 0b111011111000100);
  assert.equal(formatBits("L", 4), 0b110011000101111);
  assert.equal(formatBits("M", 7), 0b100101010100000);
  assert.equal(formatBits("M", 5), 0b100000011001110);
});

test("capacities match the spec (byte mode data codewords)", () => {
  assert.equal(dataCodewords(1, "L"), 19);
  assert.equal(dataCodewords(1, "M"), 16);
  assert.equal(dataCodewords(5, "M"), 86);
  assert.equal(dataCodewords(7, "M"), 124);
  assert.equal(dataCodewords(10, "L"), 274);
  assert.equal(dataCodewords(40, "M"), 2334);
});

// Independent reader: function-module map rebuilt from the spec layout, then
// format read, unmask, de-interleave, check RS, and parse the byte segment.
function readFormat(m) {
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= (m[i][8] ? 1 : 0) << i;
  bits |= (m[7][8] ? 1 : 0) << 6;
  bits |= (m[8][8] ? 1 : 0) << 7;
  bits |= (m[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) bits |= (m[8][14 - i] ? 1 : 0) << i;
  for (const ecl of ["L", "M"]) for (let mask = 0; mask < 8; mask++) if (formatBits(ecl, mask) === bits) return { ecl, mask };
  return null;
}

// [blocks, ecc codewords per block] from ISO/IEC 18004 Table 9.
const BLOCK_TABLE = {
  L: { 1: [1, 7], 2: [1, 10], 3: [1, 15], 4: [1, 20], 5: [1, 26], 6: [2, 18], 7: [2, 20], 8: [2, 24], 9: [2, 30], 10: [4, 18] },
  M: { 1: [1, 10], 2: [1, 16], 3: [1, 26], 4: [2, 18], 5: [2, 24], 6: [4, 16], 7: [4, 18], 8: [4, 22], 9: [5, 22], 10: [5, 26] },
};

function decode(qr) {
  const { size, modules: m, version } = qr;
  const fmt = readFormat(m);
  assert.ok(fmt, "format info readable");
  // Function modules per spec.
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true; };
  mark(0, 0, 9, 9); mark(size - 8, 0, 8, 9); mark(0, size - 8, 9, 8);
  mark(6, 0, 1, size); mark(0, 6, size, 1);
  if (version >= 2) {
    const tables = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
    const pos = tables[version];
    for (const a of pos) for (const b of pos) {
      if ((a === 6 && b === 6) || (a === 6 && b === pos.at(-1)) || (a === pos.at(-1) && b === 6)) continue;
      mark(a - 2, b - 2, 5, 5);
    }
  }
  if (version >= 7) { mark(size - 11, 0, 3, 6); mark(0, size - 11, 6, 3); }
  const order = placementOrder(size, fn);
  const bits = order.map(([x, y]) => (m[y][x] !== QR_MASKS[fmt.mask](x, y) ? 1 : 0));
  const raw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) raw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const [nBlocks, eccLen] = BLOCK_TABLE[fmt.ecl][version];
  const total = raw.length;
  const shortLen = Math.floor(total / nBlocks);
  const numShort = nBlocks - (total % nBlocks);
  const blocks = Array.from({ length: nBlocks }, (_, i) => ({ len: shortLen + (i < numShort ? 0 : 1), cw: [] }));
  let k = 0;
  const dataLen = (b) => b.len - eccLen;
  const maxData = Math.max(...blocks.map(dataLen));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < dataLen(b)) b.cw.push(raw[k++]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) b.cw.push(raw[k++]);
  const data = [];
  for (const b of blocks) {
    const d = b.cw.slice(0, dataLen(b));
    assert.deepEqual(rsRemainder(d, eccLen), b.cw.slice(dataLen(b)), "ECC block valid");
    data.push(...d);
  }
  const bitstr = data.map((b) => b.toString(2).padStart(8, "0")).join("");
  assert.equal(bitstr.slice(0, 4), "0100", "byte mode");
  const lenBits = version < 10 ? 8 : 16;
  const n = parseInt(bitstr.slice(4, 4 + lenBits), 2);
  const bytes = [];
  for (let i = 0; i < n; i++) bytes.push(parseInt(bitstr.slice(4 + lenBits + i * 8, 12 + lenBits + i * 8), 2));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), ...fmt };
}

test("encoded symbols decode back to the input (several versions, both levels)", () => {
  const samples = [
    ["hi", "M"],
    ["http://192.168.1.20:5380/", "L"],
    ["http://192.168.1.20:5380/?o21=hand&player=3f1c2a9e-77b0-4c8e-9d2a-0a1b2c3d4e5f", "M"],
    ["http://192.168.100.200:5380/?o21=hand&player=3f1c2a9e-77b0-4c8e-9d2a-0a1b2c3d4e5f&name=Riley%20Q", "M"],
    ["x".repeat(200), "M"],
    ["Olympus 21 ★ Ares", "L"],
  ];
  for (const [text, ecl] of samples) {
    const qr = qrEncode(text, ecl);
    assert.equal(qr.size, qr.version * 4 + 17);
    assert.ok(BLOCK_TABLE[ecl][qr.version], `version ${qr.version} covered by test table`);
    const out = decode(qr);
    assert.equal(out.text, text);
    assert.equal(out.ecl, ecl);
    assert.equal(out.mask, qr.mask);
  }
});

test("every mask produces a decodable symbol", () => {
  for (let mask = 0; mask < 8; mask++) {
    const qr = qrEncode("http://10.0.0.5:5380/?o21=hand", "M", mask);
    assert.equal(qr.mask, mask);
    assert.equal(decode(qr).text, "http://10.0.0.5:5380/?o21=hand");
  }
});

test("finder patterns and timing are in place", () => {
  const { modules: m, size } = qrEncode("abc");
  const row0 = m[0].slice(0, 7).map(Number).join("");
  assert.equal(row0, "1111111");
  assert.equal(m[1].slice(0, 7).map(Number).join(""), "1000001");
  assert.equal(m[0][7], false);
  for (let i = 8; i < size - 8; i++) assert.equal(m[6][i], i % 2 === 0);
});

test("qrSvg escapes the label and emits a square viewBox", () => {
  const svg = qrSvg("abc", { label: 'a"<b>' });
  assert.match(svg, /viewBox="0 0 29 29"/);
  assert.ok(!svg.includes('a"<b>'));
});
