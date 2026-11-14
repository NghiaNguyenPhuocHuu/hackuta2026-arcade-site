import type { CSSProperties, ReactNode } from "react";
import { BET_CATALOGUE, COLOR_NAMES, pocketColor, type BetDef } from "../../../shared/roulette/rules";

/**
 * The betting table. "wide": 3 rows × 12 numbers (desktop). "tall": 12 rows ×
 * 3 numbers (phones). Numbers and outside bets are cells of one CSS grid; the
 * split / street / corner spots sit on the lines between numbers, in an overlay
 * over the number area, placed from the cells they cover.
 */

export type Orientation = "wide" | "tall";

type Props = {
  orientation: Orientation;
  bets: Readonly<Record<string, number>>;
  /** Bets that won the last spin (glow), and the pocket that came up. */
  winning: ReadonlySet<string>;
  hit: number | null;
  disabled: boolean;
  onPlace(betId: string): void;
};

/** Centre of a number's cell inside the number area, as fractions (0–1). */
function cellCentre(n: number, o: Orientation) {
  const col = Math.ceil(n / 3); // 1–12 along the long side
  const lane = (n - 1) % 3; // 0 = numbers 1, 4, 7… ; 2 = 3, 6, 9…
  return o === "wide" ? { x: (col - 0.5) / 12, y: (3 - lane - 0.5) / 3 } : { x: (lane + 0.5) / 3, y: (col - 0.5) / 12 };
}

/** Where an inside bet's spot sits (fractions of the number area). */
function spotPosition(def: BetDef, o: Orientation) {
  const nums = def.numbers;
  if (def.kind === "street") {
    const c = cellCentre(nums[0]!, o);
    return o === "wide" ? { x: c.x, y: 1 } : { x: 0, y: c.y };
  }
  if (nums[0] === 0) {
    const c = cellCentre(nums[1]!, o);
    return o === "wide" ? { x: 0, y: c.y } : { x: c.x, y: 0 };
  }
  const cs = nums.map((n) => cellCentre(n, o));
  return { x: cs.reduce((s, c) => s + c.x, 0) / cs.length, y: cs.reduce((s, c) => s + c.y, 0) / cs.length };
}

function numberCell(n: number, o: Orientation): CSSProperties {
  const col = Math.ceil(n / 3);
  const lane = (n - 1) % 3;
  return o === "wide" ? { gridColumn: col + 1, gridRow: 3 - lane } : { gridColumn: lane + 3, gridRow: col + 1 };
}

const OUTSIDE = ["low", "even", "fire", "night", "odd", "high"] as const;
const OUTSIDE_TEXT: Record<(typeof OUTSIDE)[number], string> = { low: "1–18", even: "EVEN", fire: "FIRE", night: "NIGHT", odd: "ODD", high: "19–36" };

function areas(o: Orientation) {
  const wide = o === "wide";
  return {
    zero: wide ? { gridColumn: 1, gridRow: "1 / 4" } : { gridColumn: "3 / 6", gridRow: 1 },
    overlay: wide ? { gridColumn: "2 / 14", gridRow: "1 / 4" } : { gridColumn: "3 / 6", gridRow: "2 / 14" },
    column: (k: number) => (wide ? { gridColumn: 14, gridRow: 4 - k } : { gridColumn: k + 2, gridRow: 14 }),
    dozen: (k: number) => (wide ? { gridColumn: `${4 * k - 2} / ${4 * k + 2}`, gridRow: 4 } : { gridColumn: 2, gridRow: `${4 * k - 2} / ${4 * k + 2}` }),
    outside: (i: number) => (wide ? { gridColumn: `${2 * i + 2} / ${2 * i + 4}`, gridRow: 5 } : { gridColumn: 1, gridRow: `${2 * i + 2} / ${2 * i + 4}` }),
  };
}

export function Chip({ amount }: { amount: number }) {
  const tier = amount >= 25 ? 25 : amount >= 10 ? 10 : 5;
  return (
    <span className={`wof-chip wof-chip--${tier}`} aria-hidden="true">
      {amount}
    </span>
  );
}

function betLabel(def: BetDef, amount: number) {
  const pays = `pays ${def.odds} to 1`;
  const name = def.kind === "straight" ? `${def.numbers[0]} ${COLOR_NAMES[pocketColor(def.numbers[0]!)]}` : def.label;
  return `${name}, ${pays}${amount ? `, ${amount} points bet` : ""}`;
}

export function Board({ orientation: o, bets, winning, hit, disabled, onPlace }: Props) {
  const a = areas(o);
  const spot = (betId: string, className: string, style: CSSProperties, content: ReactNode) => {
    const def = BET_CATALOGUE.get(betId)!;
    const amount = bets[betId] ?? 0;
    const state = winning.has(betId) ? " is-win" : "";
    return (
      <button
        key={betId}
        type="button"
        className={`${className}${state}${amount ? " has-chip" : ""}`}
        style={style}
        disabled={disabled}
        aria-label={betLabel(def, amount)}
        onClick={() => onPlace(betId)}
      >
        {content}
        {amount ? <Chip amount={amount} /> : null}
      </button>
    );
  };

  const numbers = [];
  for (let n = 1; n <= 36; n++) {
    numbers.push(
      spot(`straight:${n}`, `wof-cell wof-cell--num wof-cell--${pocketColor(n)}${hit === n ? " is-hit" : ""}`, numberCell(n, o), <span className="wof-cell__n">{n}</span>),
    );
  }

  const inside = [...BET_CATALOGUE.values()].filter((d) => d.kind === "split" || d.kind === "street" || d.kind === "corner");

  return (
    <div className={`wof-board wof-board--${o}`} role="group" aria-label="Betting table">
      {spot("straight:0", `wof-cell wof-cell--num wof-cell--olympus wof-cell--zero${hit === 0 ? " is-hit" : ""}`, a.zero, <span className="wof-cell__n">0</span>)}
      {numbers}
      {[1, 2, 3].map((k) => spot(`column:${k}`, "wof-cell wof-cell--out wof-cell--column", a.column(k), <span>2:1</span>))}
      {[1, 2, 3].map((k) =>
        spot(`dozen:${k}`, "wof-cell wof-cell--out wof-cell--dozen", a.dozen(k), <span>{["1st", "2nd", "3rd"][k - 1]} 12</span>),
      )}
      {OUTSIDE.map((id, i) =>
        spot(
          id,
          `wof-cell wof-cell--out wof-cell--${id}`,
          a.outside(i),
          id === "fire" || id === "night" ? (
            <>
              <span className={`wof-swatch wof-swatch--${id}`} aria-hidden="true" />
              <span>{OUTSIDE_TEXT[id]}</span>
            </>
          ) : (
            <span>{OUTSIDE_TEXT[id]}</span>
          ),
        ),
      )}
      <div className="wof-board__overlay" style={a.overlay}>
        {inside.map((def) => {
          const pos = spotPosition(def, o);
          return spot(def.id, `wof-hot wof-hot--${def.kind}`, { left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }, null);
        })}
      </div>
    </div>
  );
}
