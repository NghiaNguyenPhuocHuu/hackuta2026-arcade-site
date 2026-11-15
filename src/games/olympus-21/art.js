/**
 * Olympus 21 card art: every face is drawn procedurally on a 48x68 canvas
 * (marble statue sprites, Bayer dithering, pixel fonts). Pure canvas code,
 * no assets. Always display at whole-number scales with
 * image-rendering: pixelated.
 *
 *   renderCard(canvas, "R7")   // also "YS", "BR", "G+2", "W", "BACK"
 *   cardDataUrl("W")           // cached PNG data URL
 */
var OUT = '#17141f';
var MARBLE = ['#5b5866', '#8f8b97', '#c4beba', '#e9e3d9', '#fffdf6'];
var GOLD = ['#5c3a0e', '#a8701a', '#e2b03c', '#ffe48a'];
var GODS = {
  R: { name: 'ARES', c: ['#3d0c10', '#7e1c20', '#cf4336', '#ff8f70'] },
  B: { name: 'POSEIDON', c: ['#0b1c44', '#1b4590', '#2f74d0', '#86c4ff'] },
  G: { name: 'ATHENA', c: ['#0d2e1d', '#1c623a', '#2f9a58', '#93dc98'] },
  Y: { name: 'ZEUS', c: ['#4a2f05', '#a06a0c', '#e0a81e', '#ffe27a'] },
  W: { name: 'ODYSSEUS', c: ['#1a1030', '#3a2262', '#6a44a6', '#b493ea'] },
  K: { name: 'OLYMPUS', c: ['#120d22', '#2a1d4a', '#4b3580', '#8f7ad0'] }
};
var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
var PI = Math.PI;

var F3 = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'], '+': ['...', '.#.', '###', '.#.', '...'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], W: ['#.#', '#.#', '###', '###', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###']
};
var F7 = {
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  S: ['..###..', '.#...#.', '#...#.#', '#..#..#', '#.#...#', '.#...#.', '..###..'],
  R: ['....#..', '#######', '....#..', '.......', '..#....', '#######', '..#....']
};

function g(v) { return 'rgb(' + v + ',' + v + ',' + v + ')'; }
function rad(x, cx, cy, r) {
  var gr = x.createRadialGradient(cx - r * 0.45, cy - r * 0.5, 0, cx, cy, r * 1.25);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c4c4c4'); gr.addColorStop(1, '#5a5a5a'); return gr;
}
function lin(x, x0, y0, x1, y1) {
  var gr = x.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#f4f4f4'); gr.addColorStop(1, '#4a4a4a'); return gr;
}
function ell(x, cx, cy, rx, ry, f) { x.fillStyle = f; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, PI * 2); x.fill(); }
function path(x, pts) { x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); }
function poly(x, pts, f) { x.fillStyle = f; path(x, pts); x.fill(); }
function P(x, v) { x.fillStyle = g(v); for (var i = 2; i < arguments.length; i += 4) x.fillRect(arguments[i], arguments[i + 1], arguments[i + 2], arguments[i + 3]); }
function clipped(x, shape, fn) { x.save(); shape(x); x.clip(); fn(); x.restore(); }

function Sprite() {
  var s = { w: 32, h: 34, layers: [] };
  s.L = function (mat) { var c = document.createElement('canvas'); c.width = 32; c.height = 34; var x = c.getContext('2d'); s.layers.push({ mat: mat, x: x }); return x; };
  return s;
}
function bake(s, pals) {
  var W = s.w, H = s.h, i, x, y, k;
  var ds = s.layers.map(function (l) { return { p: pals[l.mat], d: l.x.getImageData(0, 0, W, H).data }; });
  var px = new Array(W * H).fill(null);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    for (k = ds.length - 1; k >= 0; k--) {
      var d = ds[k].d;
      if (d[i * 4 + 3] >= 128) {
        var lum = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765, p = ds[k].p, n = p.length;
        var t = lum * (n - 1) + (BAYER[y & 3][x & 3] / 16 - 0.47) * 0.8;
        px[i] = p[Math.max(0, Math.min(n - 1, Math.round(t)))]; break;
      }
    }
  }
  var o = px.slice();
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    if (px[y * W + x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (a) { var X = x + a[0], Y = y + a[1]; return X >= 0 && Y >= 0 && X < W && Y < H && px[Y * W + X]; })) o[y * W + x] = OUT;
  }
  return o;
}

/* Shared statue parts. Marble tones 0/64/128/191/255, gold and paint tones 0/85/170/255. */
function chest(m, a) {
  poly(m, [[2, 34], [4, 28], [10, 25], [22, 25], [28, 28], [30, 34]], lin(m, 6, 24, 26, 36));
  m.fillStyle = lin(m, 13, 18, 20, 26); m.fillRect(13, 18, 6, 8); P(m, 128, 18, 19, 1, 6);
  if (a) { /* painted drapery: ancient statues were colored */
    poly(a, [[2, 34], [3.5, 28.5], [8, 25.6], [11.5, 27], [21, 34]], lin(a, 3, 25, 18, 34));
    P(a, 85, 6, 29, 1, 1, 7, 30, 1, 1, 8, 31, 1, 1, 9, 32, 1, 1, 10, 33, 1, 1, 10, 28, 1, 1, 11, 29, 1, 1, 12, 30, 1, 1, 13, 31, 1, 1, 14, 32, 1, 1);
    P(a, 255, 4, 28, 1, 1, 5, 27, 1, 1);
  }
}
function ears(m) { ell(m, 9.6, 14, 1.4, 2.2, g(170)); ell(m, 22.4, 14, 1.4, 2.2, g(110)); }
function head(m, rx, ry) { ell(m, 16, 13, rx || 6.5, ry || 8, rad(m, 16, 13, ry || 8)); }
function face(m, bearded) {
  P(m, 64, 12, 11, 3, 1, 18, 11, 3, 1);
  P(m, 128, 12, 12, 3, 1, 18, 12, 3, 1);
  P(m, 255, 13, 12, 1, 1); P(m, 191, 19, 12, 1, 1);
  P(m, 191, 16, 11, 1, 4); P(m, 128, 17, 13, 1, 3); P(m, 64, 15, 16, 3, 1);
  if (!bearded) { P(m, 64, 14, 18, 4, 1); P(m, 191, 15, 19, 2, 1); P(m, 128, 18, 20, 2, 1); }
}
function beard(m, len, style) {
  var pts = [[9.6, 14], [10.4, 20], [12.5, len - 1.5], [16, len], [19.5, len - 1.5], [21.6, 20], [22.4, 14], [20.5, 17.2], [16, 17.6], [11.5, 17.2]];
  poly(m, pts, lin(m, 10, 14, 22, len + 2));
  clipped(m, function (x) { path(x, pts); }, function () {
    for (var y = 15; y <= len; y++) for (var x = 9; x <= 23; x++) {
      var on = style === 'curl' ? (y % 2 === 0 && (x + (y % 4 ? 1 : 0)) % 3 === 0) : ((x + y * 2) % 4 === 0 && y % 2 === 1);
      if (on) P(m, 64, x, y, 1, 1);
    }
  });
  P(m, 191, 12, 17, 3, 1, 17, 17, 3, 1); P(m, 128, 12, 18, 3, 1, 18, 18, 3, 1); P(m, 0, 15, 18, 3, 1);
}
function hairBack(m, cx, cy, rx, ry, style) {
  ell(m, cx, cy, rx, ry, rad(m, cx, cy, ry + 1));
  if (style === 'curl') for (var a = PI * 0.9; a <= PI * 2.1; a += 0.5) ell(m, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * 0.95, 1.8, 1.8, rad(m, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 2.5));
  clipped(m, function (x) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, PI * 2); }, function () {
    for (var y = Math.floor(cy - ry); y < cy + ry; y++) for (var x = Math.floor(cx - rx); x < cx + rx; x++) {
      var on = style === 'curl' ? ((x % 3 === 0 && y % 3 === 1) || (x % 3 === 2 && y % 3 === 2)) : (y % 2 === 0 && (x + Math.floor(y / 2) * 2) % 4 === 0);
      if (on) P(m, 128, x, y, 1, 1);
    }
  });
}
function fringe(m) {
  [10.5, 13, 15.5, 18, 20.5, 22.5].forEach(function (x) { ell(m, x, 6.6, 1.6, 1.5, rad(m, x, 6.6, 2)); });
}
function femHair(m) {
  poly(m, [[8.5, 10], [7.5, 23], [10.5, 23.5], [10.5, 13]], lin(m, 7, 10, 11, 24));
  poly(m, [[23.5, 10], [24.5, 23], [21.5, 23.5], [21.5, 13]], lin(m, 21, 10, 25, 24));
  hairBack(m, 16, 10.5, 7.8, 7, 'wave');
}
function femFringe(m) { P(m, 191, 10, 7, 4, 1, 18, 7, 4, 1); P(m, 128, 10, 8, 2, 1, 12, 7, 1, 1, 20, 8, 2, 1, 19, 7, 1, 1); P(m, 64, 16, 6, 1, 2); }

var ART = {
  zeus: function (s) {
    var m = s.L('m'), a = s.L('a'), gl = s.L('g');
    chest(m, a); hairBack(m, 16, 10, 9, 8.5, 'curl'); ears(m); head(m); face(m, true); beard(m, 28, 'curl'); fringe(m);
    for (var x = 9; x <= 23; x += 2) { P(gl, 170, x, 6, 1, 1); P(gl, 255, x + 1, 5, 1, 1); }
    P(gl, 170, 8, 7, 1, 2, 24, 7, 1, 2);
    poly(gl, [[28, 2], [24.5, 13], [27.5, 13], [23.5, 26], [30.5, 11], [27.2, 11], [30.6, 2]], lin(gl, 24, 3, 30, 25));
  },
  poseidon: function (s) {
    var m = s.L('m'), a = s.L('a'), gl = s.L('g');
    chest(m, a);
    poly(m, [[8, 9], [6.8, 24], [10.4, 25.5], [11, 14], [21, 14], [21.6, 25.5], [25.2, 24], [24, 9]], lin(m, 7, 8, 25, 25));
    hairBack(m, 16, 9.5, 8.5, 7.5, 'wave'); head(m); face(m, true); beard(m, 29, 'wave'); fringe(m);
    poly(gl, [[9, 7.5], [9, 3], [11, 5], [13, 1.2], [14.8, 4.6], [16.5, 0.8], [18.2, 4.6], [20, 1.2], [22, 5], [24, 3], [24, 7.5]], lin(gl, 9, 1, 24, 8));
    P(gl, 255, 27, 7, 1, 27); P(gl, 85, 28, 7, 1, 27);
    P(gl, 170, 24, 9, 7, 1); P(gl, 85, 24, 10, 7, 1);
    P(gl, 255, 24, 3, 1, 6, 30, 3, 1, 6, 27, 0, 1, 7); P(gl, 85, 28, 1, 1, 6);
  },
  ares: function (s) {
    var m = s.L('m'), a = s.L('a'), h = s.L('g');
    chest(m, a); head(m); face(m, true); beard(m, 25, 'curl');
    ell(a, 17, 4.5, 11, 3.8, lin(a, 6, 0, 28, 8));
    poly(a, [[24, 2.5], [30, 5], [30.5, 16], [27.5, 11], [25, 7]], lin(a, 24, 2, 31, 16));
    P(a, 85, 8, 3, 1, 1, 11, 2, 1, 1, 14, 1, 1, 1, 17, 1, 1, 1, 20, 1, 1, 1, 23, 2, 1, 1, 28, 8, 1, 1, 29, 11, 1, 1);
    h.fillStyle = rad(h, 16, 10, 9.5); h.beginPath(); h.ellipse(16, 10.5, 8.3, 9, 0, 0, PI * 2); h.fill();
    h.fillRect(7.7, 10, 5.3, 12.5); h.fillRect(19, 10, 5.3, 12.5);
    h.save(); h.globalCompositeOperation = 'destination-out';
    h.fillRect(11, 11, 4, 2); h.fillRect(17, 11, 4, 2); poly(h, [[13, 15], [19, 15], [19.6, 23], [12.4, 23]], '#000'); h.restore();
    P(h, 255, 10, 10, 5, 1); P(h, 170, 17, 10, 5, 1);
    P(h, 255, 3, 6, 1, 28); P(h, 85, 4, 6, 1, 28);
    poly(h, [[3.5, 0.2], [5.6, 4.5], [3.5, 6.5], [1.4, 4.5]], lin(h, 1, 0, 6, 6));
  },
  athena: function (s) {
    var m = s.L('m'), a = s.L('a'), gl = s.L('g');
    [m, a, gl].forEach(function (c) { c.translate(0, 2); });
    chest(m, a); femHair(m); head(m, 6.1, 7.7); face(m, false); femFringe(m);
    ell(a, 16, 1, 9, 2.6, lin(a, 7, -2, 25, 4));
    P(a, 85, 9, 0, 1, 1, 12, -1, 1, 1, 15, -1, 1, 1, 18, -1, 1, 1, 21, 0, 1, 1);
    ell(gl, 16, 4.5, 7.5, 3.6, rad(gl, 16, 4.5, 6));
    poly(gl, [[9, 5], [23, 5], [22, 7.8], [10, 7.8]], lin(gl, 9, 5, 23, 8));
    P(gl, 0, 11, 6, 3, 1, 18, 6, 3, 1); P(gl, 255, 15, 5, 2, 1);
    ell(gl, 26.5, 21, 2.8, 3.4, rad(gl, 26.5, 21, 3.5));
    P(gl, 170, 24, 17, 1, 1, 28, 17, 1, 1); P(gl, 255, 25, 19, 1, 1, 27, 19, 1, 1); P(gl, 0, 26, 20, 1, 1); P(gl, 85, 25, 22, 3, 1);
  },
  odysseus: function (s) {
    var m = s.L('m'), a = s.L('a');
    chest(m, a); hairBack(m, 16, 11.5, 8, 7, 'curl'); ears(m); head(m); face(m, true); beard(m, 26, 'curl');
    poly(a, [[8.3, 10], [9.5, 4], [12.5, 1], [19.5, 1], [22.5, 4], [23.7, 10]], rad(a, 16, 6, 9));
    P(a, 85, 9, 9, 14, 1); P(a, 255, 11, 3, 2, 1, 10, 5, 1, 2);
  },
  cyclops: function (s) {
    var m = s.L('m'), a = s.L('a'), gl = s.L('g');
    chest(m, a); P(m, 128, 7, 10, 2, 5); P(m, 64, 24, 10, 2, 5);
    ell(m, 16, 12.5, 7.6, 9, rad(m, 16, 12.5, 9));
    P(m, 64, 11, 8, 10, 1); P(m, 128, 13, 9, 7, 4); P(m, 255, 14, 10, 4, 2); P(m, 0, 16, 10, 1, 2);
    P(m, 191, 16, 13, 1, 3); P(m, 128, 17, 14, 1, 2); P(m, 64, 15, 16, 3, 1);
    beard(m, 29, 'wave');
    for (var i = 0; i < 12; i++) { P(gl, i < 2 ? 85 : 170, 29 - i, i, 2, 1); P(gl, 255, 29 - i, i, 1, 1); }
    P(gl, 255, 18, 11, 1, 1, 19, 10, 1, 1);
  },
  charybdis: function (s) {
    var m = s.L('m'), a = s.L('a'), m2 = s.L('m'), gl = s.L('g');
    var tones = [255, 170, 85, 170, 85, 0];
    for (var k = 0; k < 6; k++) ell(a, 16, 21 + k * 0.7, 14.5 - k * 2.4, 9.5 - k * 1.55, g(tones[k]));
    for (var t = 0; t < 16; t += 0.1) { var r = 14 * Math.exp(-t * 0.16); P(a, 255, Math.round(16 + Math.cos(t) * r), Math.round(21.5 + Math.sin(t) * r * 0.64), 1, 1); }
    [3, 7, 11, 15, 19, 23, 27, 29].forEach(function (x, i) { ell(m2, x, 13.5 + (i % 2), 2.2, 1.6, rad(m2, x, 13.5, 2.2)); });
    poly(gl, [[18, 15], [27, 12], [26, 15.5], [19.5, 17]], lin(gl, 18, 12, 27, 17));
    P(gl, 255, 22, 4, 1, 10);
    poly(m2, [[23, 5], [27.5, 8], [23, 11]], lin(m2, 23, 5, 28, 11));
    P(m, 0, 0, 0, 0, 0);
  },
  sirens: function (s) {
    var m = s.L('m'), a = s.L('a');
    poly(m, [[11, 24], [3, 10], [1, 17], [2, 26], [6, 32], [11, 31]], lin(m, 1, 10, 11, 32));
    poly(m, [[21, 24], [29, 10], [31, 17], [30, 26], [26, 32], [21, 31]], lin(m, 21, 10, 31, 32));
    P(m, 64, 3, 14, 1, 1, 3, 18, 2, 1, 3, 22, 3, 1, 4, 26, 3, 1, 6, 29, 3, 1, 28, 14, 1, 1, 27, 18, 2, 1, 26, 22, 3, 1, 25, 26, 3, 1, 23, 29, 3, 1);
    chest(m, a); femHair(m); head(m, 6.1, 7.7); face(m, false); femFringe(m);
    P(a, 170, 9, 8, 14, 1); P(a, 255, 9, 8, 3, 1);
  }
};

var spriteCache = {};
function sprite(art, key) {
  var id = art + ':' + key;
  if (spriteCache[id]) return spriteCache[id];
  var s = Sprite(); ART[art](s);
  return (spriteCache[id] = bake(s, { m: MARBLE, g: GOLD, a: GODS[key].c }));
}

var hexCache = {};
function rgb(h) { return hexCache[h] || (hexCache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); }
function textW(str, f) { var w = 0; for (var i = 0; i < str.length; i++) { var gph = f[str[i]]; w += (gph ? gph[0].length : 1) + 1; } return w - 1; }
function text(set, str, x, y, col, f) {
  f = f || F3;
  for (var i = 0; i < str.length; i++) {
    var gph = f[str[i]]; if (!gph) { x += 2; continue; }
    gph.forEach(function (row, ry) { for (var rx = 0; rx < row.length; rx++) if (row[rx] === '#') set(x + rx, y + ry, col); });
    x += gph[0].length + 1;
  }
}
function engrave(set, get, str, cx, y, f) {
  var x = Math.round(cx - textW(str, f) / 2);
  var cells = [];
  text(function (X, Y) { cells.push(X + ',' + Y); }, str, x, y, null, f);
  var on = {}; cells.forEach(function (c) { on[c] = 1; });
  cells.forEach(function (c) { var p = c.split(',').map(Number); set(p[0], p[1], MARBLE[0]); if (!on[(p[0] + 1) + ',' + (p[1] + 1)]) set(p[0] + 1, p[1] + 1, MARBLE[4]); });
}

function parse(code) {
  if (code === 'BACK') return { back: true };
  if (code === 'W') return { wild: true, key: 'W', art: 'odysseus' };
  var key = code[0], rank = code.slice(1);
  var art = /^[1-9]$/.test(rank) ? { R: 'ares', B: 'poseidon', G: 'athena', Y: 'zeus' }[key] : { S: 'cyclops', R: 'charybdis', '+2': 'sirens' }[rank];
  return { key: key, rank: rank, art: art };
}
var ACTION_NAME = { S: 'NOBODY', R: 'CHARYBDIS', '+2': 'SIRENS' };

function paint(cv, code) {
  var card = parse(code);
  var Wd = 48, Hd = 68, ctx = cv.getContext('2d'), img = ctx.createImageData(Wd, Hd), D = img.data;
  var grid = new Array(Wd * Hd).fill(null);
  function set(x, y, h) { if (x >= 0 && y >= 0 && x < Wd && y < Hd && h) grid[y * Wd + x] = h; }
  function get(x, y) { return grid[y * Wd + x]; }
  var god = GODS[card.back ? 'K' : card.key];
  var c = god.c, x, y;
  function fc(x, y) {
    if (!card.wild) return c;
    return GODS[x < 24 ? (y < 34 ? 'R' : 'Y') : (y < 34 ? 'B' : 'G')].c;
  }
  for (y = 0; y < Hd; y++) for (x = 0; x < Wd; x++) {
    var dx = Math.min(x, Wd - 1 - x), dy = Math.min(y, Hd - 1 - y), r = Math.min(dx, dy);
    if (dx + dy < 2) continue;
    if (dx === 0 || dy === 0 || dx + dy === 2) { set(x, y, OUT); continue; }
    if (r <= 2) { var cc = fc(x, y); set(x, y, r === 1 ? ((x <= 1 || y <= 1) ? cc[3] : cc[1]) : cc[2]); continue; }
    if (r === 3) { set(x, y, OUT); continue; }
    set(x, y, c[1]);
  }
  var b = function (x, y) { return BAYER[y & 3][x & 3] / 16; };
  function meander(y0) {
    var tile = ['111110', '000010', '111010', '100010', '101110', '100000'];
    for (y = y0; y < y0 + 8; y++) for (x = 4; x < 44; x++) {
      set(x, y, c[0]);
      var ty = y - y0 - 1;
      if (ty >= 0 && ty < 6 && tile[ty][(x - 4) % 6] === '1') set(x, y, GOLD[2]);
    }
  }

  if (card.back) {
    for (y = 4; y < 64; y++) for (x = 4; x < 44; x++) set(x, y, ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) ? c[1] : c[0]);
    meander(4); meander(56);
    for (x = 4; x < 44; x++) { set(x, 12, GOLD[2]); set(x, 55, GOLD[2]); }
    for (y = 13; y < 55; y++) for (x = 4; x < 44; x++) {
      var d = Math.hypot(x - 23.5, y - 34), ang = Math.atan2(y - 34, x - 23.5);
      if (d < 10.5) set(x, y, d < 9.5 ? c[2] : c[1]);
      else if (d < 13 && !(ang < -1.25 && ang > -1.9)) set(x, y, b(x, y) < (d < 11.7 ? 0.75 : 0.4) ? GOLD[2] : GOLD[1]);
      else if (Math.abs(d - 13.5) < 0.6 && !(ang < -1.25 && ang > -1.9)) set(x, y, OUT);
    }
    text(set, 'OLYMPUS', Math.round(24 - textW('OLYMPUS', F3) / 2), 15, GOLD[3]);
    text(set, '21', Math.round(24 - textW('21', F7) / 2), 31, GOLD[3], F7);
    text(set, '21', Math.round(24 - textW('21', F7) / 2) + 1, 32, null, F7);
  } else {
    for (y = 4; y <= 10; y++) for (x = 4; x < 44; x++) set(x, y, c[0]);
    for (x = 4; x < 44; x++) { set(x, 11, GOLD[2]); set(x, 55, GOLD[2]); }
    for (y = 12; y <= 54; y++) for (x = 4; x < 44; x++) {
      set(x, y, ((y - 12) / 42 + (b(x, y) - 0.5) * 0.9) < 0.5 ? c[0] : c[1]);
      var hd = Math.hypot(x - 23.5, y - 25);
      if (hd < 12.5) {
        var hc = card.wild ? fc(x < 24 ? 0 : 47, y < 25 ? 0 : 67) : c;
        set(x, y, hd > 10 && b(x, y) > 0.5 ? hc[1] : hc[2]);
        if (hd > 11.8) set(x, y, hc[3]);
      }
    }
    [[4, 1], [41, -1]].forEach(function (col) {
      var x0 = col[0];
      for (y = 14; y <= 51; y++) { set(x0, y, MARBLE[3]); set(x0 + 1, y, (y % 2) ? MARBLE[2] : MARBLE[3]); set(x0 + 2, y, MARBLE[1]); }
      for (x = x0 - 0; x <= x0 + 2; x++) { set(x, 12, MARBLE[4]); set(x, 13, MARBLE[2]); set(x, 52, MARBLE[3]); set(x, 53, MARBLE[2]); set(x, 54, MARBLE[1]); }
      set(col[1] > 0 ? x0 + 3 : x0 - 1, 12, MARBLE[3]); set(col[1] > 0 ? x0 + 3 : x0 - 1, 13, MARBLE[1]);
    });
    var sp = sprite(card.art, card.key);
    for (y = 0; y < 34; y++) for (x = 0; x < 32; x++) if (sp[y * 32 + x]) set(8 + x, 12 + y, sp[y * 32 + x]);
    for (x = 12; x <= 35; x++) if (!get(x, 45) || get(x, 45) === c[0] || get(x, 45) === c[1] || get(x, 45) === c[2] || get(x, 45) === c[3]) set(x, 45, OUT);
    for (x = 12; x <= 35; x++) set(x, 46, x === 12 ? MARBLE[4] : x === 35 ? MARBLE[1] : MARBLE[3]);
    for (y = 47; y <= 54; y++) for (x = 13; x <= 34; x++) set(x, y, x === 13 ? MARBLE[4] : x === 34 ? MARBLE[1] : y === 54 ? MARBLE[1] : MARBLE[2]);
    if (card.wild) {
      for (y = 47; y <= 53; y++) for (x = 20; x <= 26; x++) {
        var ddx = x - 23, ddy = y - 50;
        if (Math.abs(ddx) + Math.abs(ddy) <= 3) set(x, y, GODS[ddx < 0 ? (ddy < 0 ? 'R' : 'Y') : (ddy < 0 ? 'B' : 'G')].c[(Math.abs(ddx) + Math.abs(ddy) === 3) ? 1 : 2]);
      }
    } else if (/^[1-9]$/.test(card.rank)) engrave(set, get, card.rank, 23.5, 47, F7);
    else if (card.rank === '+2') engrave(set, get, '+2', 24, 47, F7);
    else engrave(set, get, card.rank, 24, 47, F7);
    meander(56);
    if (card.wild || /^[1-9]$/.test(card.rank)) {
      text(set, card.wild ? 'W' : card.rank, 5, 5, MARBLE[4]);
      text(set, god.name, 43 - textW(god.name, F3), 5, c[3]);
    } else {
      var nm = ACTION_NAME[card.rank];
      text(set, nm, Math.round(24 - textW(nm, F3) / 2), 5, c[3]);
    }
  }
  for (var i = 0; i < grid.length; i++) if (grid[i]) { var q = rgb(grid[i]); D[i * 4] = q[0]; D[i * 4 + 1] = q[1]; D[i * 4 + 2] = q[2]; D[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

export const CARD_W = 48;
export const CARD_H = 68;
const bitmapCache = {};
const urlCache = {};

export function validCode(code) {
  return typeof code === "string" && /^(BACK|W|[RBGY]([1-9]|S|R|\+2))$/.test(code);
}

function bitmap(code) {
  if (bitmapCache[code]) return bitmapCache[code];
  const cv = document.createElement("canvas");
  cv.width = CARD_W;
  cv.height = CARD_H;
  paint(cv, code);
  return (bitmapCache[code] = cv);
}

/** Draw card `code` onto `canvas` (sized to 48x68). Unknown codes draw a card back. */
export function renderCard(canvas, code) {
  if (!validCode(code)) code = "BACK";
  if (canvas.width !== CARD_W) canvas.width = CARD_W;
  if (canvas.height !== CARD_H) canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.drawImage(bitmap(code), 0, 0);
}

/** Cached PNG data URL of a card face. */
export function cardDataUrl(code) {
  if (!validCode(code)) code = "BACK";
  return urlCache[code] || (urlCache[code] = bitmap(code).toDataURL("image/png"));
}
