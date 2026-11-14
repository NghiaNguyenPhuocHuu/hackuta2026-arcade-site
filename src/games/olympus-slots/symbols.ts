/**
 * Reel symbol art: 16×16 pixel-art busts of Greek gods (16-bit style).
 * Each map row is 16 characters; "." is transparent and every other
 * character is a palette key. symbolSvg() turns a map into a crisp SVG,
 * merging horizontal runs of one colour into a single path segment.
 * All markup is built from the static tables below, never from user input.
 */

export const SPRITE_SIZE = 16;

/** Palette keys → colours. */
export const SPRITE_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  k: "#1a1028", // outline
  s: "#f2c091", // skin
  S: "#c9835a", // skin shade
  w: "#f6f1e4", // white (beard, pearls)
  g: "#a7b0c0", // silver (wings)
  y: "#ffd23f", // gold
  Y: "#c98a1a", // bronze / dark gold
  b: "#3a7bd5", // blue
  B: "#1f3f8a", // deep blue
  r: "#d8483f", // red
  p: "#f28ab2", // pink
  h: "#6b3e26", // brown hair
  c: "#5ce1e6", // sea cyan
  o: "#ff8a2a", // orange
  l: "#4caf50", // green
  v: "#8a4fd8", // purple
  m: "#b0306a", // crimson
});

const SILHOUETTE_OUTLINE = "#0b1d33";
const SILHOUETTE_FILL = "#2c5272";

/** 16 rows × 16 columns per god. */
export const SPRITE_MAPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  zeus: Object.freeze([
    "................",
    "....y..yy..y....",
    "....yyyyyyyy....",
    "...kYYYYYYYYk...",
    "..kwwwwwwwwwwk..",
    "..kwsssssssswk..",
    "..kwsskssksswk..",
    "..kwsssSSssswk..",
    "..kwwwkkkkwwwk..",
    "..kwwwwwwwwwwk..",
    "...kwwwwwwwwk...",
    "....kwwwwwwk..y.",
    ".vvvvkwwwwkvvyv.",
    "vvvvvvkkkkvvyyyv",
    "vvvvvvvvvvvvvyvv",
    "vvvvvvvvvvvvyvvv",
  ]),
  athena: Object.freeze([
    ".....rrrrrr.....",
    "....rrrrrrrr....",
    "...kYYYYYYYYk...",
    "..kYyyYYYYYYYk..",
    "..kYkkkkkkkkYk..",
    "..kYssssssssYk..",
    "..kYssksskssYk..",
    "..kYsssSSsssYk..",
    "..kYsssppsssYk..",
    "...kssssssssk...",
    "....kssssssk....",
    ".....kkSSkk.....",
    ".bbbbbkSSkbbbbb.",
    "bbbbbbbkkbbbbbbb",
    "bbybbbbbbbbbbybb",
    "bbbbbbbbbbbbbbbb",
  ]),
  poseidon: Object.freeze([
    "y.y.y...........",
    "yyyyy...........",
    "..y....kkkkkk...",
    "..y..kccccccccck",
    "..y.kcccccccccck",
    "..y.kcssssssssck",
    "..y.kcssksskssck",
    "..y.kcsssSSsssck",
    "..y.kccckkkkccck",
    "..y.kcccccccccck",
    "..y..kcccccccck.",
    "..y...kcccccck..",
    ".ByBBBBkcccckBBB",
    "BByBBBBBkkkkBBBB",
    "BBybBBBBBBBBBBbB",
    "BByBBBBBBBBBBBBB",
  ]),
  hera: Object.freeze([
    ".....y.yy.y.....",
    ".....yyyyyy.....",
    "...kkYbYYbYkk...",
    "..khhhhhhhhhhk..",
    ".khhsssssssshhk.",
    ".khhsskssksshhk.",
    ".khhsssSSssshhk.",
    ".khhsssrrssshhk.",
    ".khhhsssssshhhk.",
    ".khhhksssskhhhk.",
    ".khhhhkSSkhhhhk.",
    ".khhmmkSSkmmhhk.",
    "..mmmmkkkkmmmm..",
    ".mmmmmmmmmmmmmm.",
    "mmymmmmyymmmmymm",
    "mmmmmmmmmmmmmmmm",
  ]),
  apollo: Object.freeze([
    "..o....oo....o..",
    "...o..yyyy..o...",
    ".....yyyyyy.....",
    "o..kllllllllk..o",
    "..kyyyyyyyyyyk..",
    "..kyssssssssyk..",
    "..kyssksskssyk..",
    "..kysssSSsssyk..",
    "..kyssskksssyk..",
    "...kssssssssk...",
    "....kssssssk....",
    ".....kkSSkk.....",
    ".oooookSSkooooo.",
    "oooooookkooooooo",
    "ooyooooooooooyoo",
    "oooooooooooooooo",
  ]),
  aphrodite: Object.freeze([
    "......rrrr..p.p.",
    ".....rrrrrr.ppp.",
    "....krrrrrrk..p.",
    "..krrrrrrrrrrk..",
    ".krrssssssssrrk.",
    ".krrssksskssrrk.",
    ".krrspsSSspsrrk.",
    ".krrsssrrsssrrk.",
    ".krrrssssssrrrk.",
    ".krrrksssskrrrk.",
    "..krrrkSSkrrrk..",
    "...krrkSSkrrk...",
    ".ppppwkkkkwpppp.",
    "pppppwwwwwwppppp",
    "pppppppppppppppp",
    "pppppppppppppppp",
  ]),
  hermes: Object.freeze([
    ".g............g.",
    ".gg...YYYY...gg.",
    ".ggg.YYYYYY.ggg.",
    "..ggkYYYYYYkgg..",
    "..kYYYYYYYYYYk..",
    "..khsssssssshk..",
    "..khsskssksshk..",
    "..khsssSSssshk..",
    "..khsskkkksshk..",
    "...kssssssssk...",
    "....kssssssk....",
    ".....kkSSkk.....",
    ".lllllkSSklllll.",
    "lllllllkklllllll",
    "llyllllllllllyll",
    "llllllllllllllll",
  ]),
  // The wanderer: bronze pilos (traveller's cap), dark beard, red sailor's cloak.
  odysseus: Object.freeze([
    "......kkkk......",
    ".....kYYYYk.....",
    "....kYyYYYYk....",
    "...kYYYYYYYYk...",
    "..kkkkkkkkkkkk..",
    "..khsssssssshk..",
    "..khsskssksshk..",
    "..khsssSSssshk..",
    "..khhhkkkkhhhk..",
    "..khhhhhhhhhhk..",
    "...khhhhhhhhk...",
    "....khhhhhhk....",
    ".rrrrkhhhhkrrrr.",
    "rrrrrrkkkkrrrrrr",
    "rryrrrrrrrrrryrr",
    "rrrrrrrrrrrrrrrr",
  ]),
});

const SYMBOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  zeus: "Zeus",
  athena: "Athena",
  poseidon: "Poseidon",
  hera: "Hera",
  apollo: "Apollo",
  aphrodite: "Aphrodite",
  hermes: "Hermes",
  odysseus: "Odysseus",
});

const SVG_OPEN =
  '<svg class="minigame__sprite" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">';

const FALLBACK_SVG = `${SVG_OPEN}<path fill="${SILHOUETTE_FILL}" d="M3 3h10v10H3z"/></svg>`;

function has(table: object, key: string) {
  return Object.prototype.hasOwnProperty.call(table, key);
}

export function symbolLabel(symbol: string): string {
  return has(SYMBOL_LABELS, symbol) ? (SYMBOL_LABELS[symbol] ?? symbol) : symbol;
}

/** One path per colour, each horizontal run as an "M x y h n v1 h -n z" segment. */
export function buildPaths(rows: readonly string[], colorOf: (key: string) => string, size = SPRITE_SIZE): string {
  const byColor = new Map<string, string[]>();
  for (let y = 0; y < size; y++) {
    const row = rows[y] ?? "";
    let x = 0;
    while (x < size) {
      const key = row[x];
      if (key === "." || key === undefined) {
        x++;
        continue;
      }
      const color = colorOf(key);
      let end = x + 1;
      while (end < size) {
        const next = row[end];
        if (next === "." || next === undefined || colorOf(next) !== color) break;
        end++;
      }
      const len = end - x;
      const segments = byColor.get(color) ?? [];
      segments.push(`M${x} ${y}h${len}v1h-${len}z`);
      byColor.set(color, segments);
      x = end;
    }
  }
  let out = "";
  for (const [color, segments] of byColor) out += `<path fill="${color}" d="${segments.join("")}"/>`;
  return out;
}

const cache = new Map<string, string>();

/** Inline SVG markup for a symbol (static strings only, never user input). */
export function symbolSvg(symbol: string, { silhouette = false }: { silhouette?: boolean } = {}): string {
  const rows = has(SPRITE_MAPS, symbol) ? SPRITE_MAPS[symbol] : undefined;
  if (!rows) return FALLBACK_SVG;
  const cacheKey = `${symbol}|${silhouette ? 1 : 0}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const colorOf = silhouette
    ? (key: string) => (key === "k" ? SILHOUETTE_OUTLINE : SILHOUETTE_FILL)
    : (key: string) => SPRITE_PALETTE[key] ?? SILHOUETTE_FILL;
  const svg = `${SVG_OPEN}${buildPaths(rows, colorOf)}</svg>`;
  cache.set(cacheKey, svg);
  return svg;
}
