/**
 * Olympus 21: Techno's animated HOW TO PLAY walkthrough (contract section 8).
 *
 *   const tut = createTutorial({ root, getView, mode: () => "table", onDone });
 *   tut.open();            // HOW TO PLAY, or when autoPlayDecision() says "open"
 *   tut.refresh();         // after the game re-renders (re-places the spotlight)
 *   tut.close("turn");     // my turn started
 *   tut.destroy();         // on unmount: timers, listeners, nodes
 *
 * The overlay lives inside the game root. On the laptop table it cuts a
 * spotlight around the real board element and puts Techno's bubble next to
 * it; when that element isn't on screen (no hand yet, say) the bubble's mini
 * illustration, drawn with the real card art, carries the step. On the phone
 * hand screen every step is a full-width illustrated card.
 *
 * The pure parts (steps, storage key, auto-play decision) have no DOM and are
 * unit-tested in Node.
 */
import { hackerFrame, HACKER_FRAME_MS } from "../olympus-slots/hacker";
import { renderCard } from "./art.js";

export const TUTORIAL_KEY_PREFIX = "o21-tutorial-seen:";

/** localStorage key for "this browser has seen the tutorial at this table". */
export function tutorialStorageKey(tableKey) {
  return `${TUTORIAL_KEY_PREFIX}${tableKey}`;
}

/** True when `storage` says the tutorial ran at `tableKey`. Storage errors read as "not seen". */
export function readSeen(storage, tableKey) {
  if (!tableKey) return false;
  try {
    return storage?.getItem(tutorialStorageKey(tableKey)) === "1";
  } catch {
    return false;
  }
}

/** Remember the tutorial ran at `tableKey`. Returns false if storage is blocked. */
export function writeSeen(storage, tableKey) {
  if (!tableKey) return false;
  try {
    storage?.setItem(tutorialStorageKey(tableKey), "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Why the tutorial can't auto-play right now, or null when it can.
 *   "no-view" | "no-table" (no tableKey) | "closed" | "not-seated" | "my-turn" | "bet-open"
 * Not seated: the lobby is where you type your name, so the tour waits until you sit.
 * Bet open: wagering, and I haven't picked yet (and I'm not sitting the round out).
 */
export function tutorialBlock(view) {
  if (!view) return "no-view";
  if (!view.tableKey) return "no-table";
  if (view.status === "closed") return "closed";
  const me = view.me;
  if (!me) return "not-seated";
  if (me.myTurn) return "my-turn";
  if (view.status === "wagering" && !me.picked) {
    const mine = view.seats?.find((s) => s.seat === me.seat);
    const out = mine?.state === "sitting_out" || me.maxWager < view.minWager;
    if (!out) return "bet-open";
  }
  return null;
}

/**
 * What the host should do with the tutorial for this view.
 * @param {object|null} view TableView
 * @param {{ seen: boolean, open: boolean, wasMyTurn?: boolean }} state
 *   seen: already played at this table; open: overlay showing; wasMyTurn: me.myTurn in the previous view
 * @returns {"open"|"close"|"none"}  close: my turn just started while it was open
 */
export function autoPlayDecision(view, { seen = false, open = false, wasMyTurn = false } = {}) {
  const myTurn = Boolean(view?.me?.myTurn);
  if (open) return myTurn && !wasMyTurn ? "close" : "none";
  if (seen) return "none";
  return tutorialBlock(view) === null ? "open" : "none";
}

/**
 * The walkthrough. `target`: board element to spotlight on the laptop table
 * (see TARGETS in createTutorial); `demo`: the mini illustration; `phoneLine`:
 * wording for the phone when the laptop line points at something only the
 * table has.
 */
export const TUTORIAL_STEPS = Object.freeze(
  [
    { id: "welcome", title: "PSST. TECHNO HERE.", line: "Quick tour? Everyone plays onto one shared count. Land it on exactly 21 and you win. Go over and you're out.", target: "felt", demo: "goal", mood: "smug" },
    { id: "count", title: "THE COUNT", line: "This is the count, and the meter fills toward 21. Every number card adds to it. Watch: 14 … 21. That's the dream.", target: "count", demo: "count", mood: "focus" },
    { id: "match", title: "THE TOP CARD", line: "Your card must match the top card's color or its number. Red or 7 here. Anything else bounces right off.", target: "top", demo: "match", mood: "idle" },
    { id: "numbers", title: "NUMBER CARDS", line: "Cards 1 to 9 add their number to the count. A 5 turns 14 into 19. Simple math, big drama.", target: null, demo: "numbers", mood: "idle" },
    { id: "actions", title: "ACTION CARDS", line: "These add 0, so they're your safe plays. Nobody skips the next player. Charybdis flips the order. The Sirens make the next player draw 2 and lose their turn.", target: null, demo: "actions", mood: "smug" },
    { id: "wild", title: "ODYSSEUS · WILD", line: "Odysseus plays on anything and adds 0. You pick the color the next player has to match.", target: null, demo: "wild", mood: "cheer" },
    { id: "hand", title: "YOUR HAND", line: "Lit cards fit, grey ones don't. Tags show the new count: 21 ★ wins, BUST busts. Tap a card, then PLAY. If something fits you must play; if nothing does, the only button is DRAW.", target: "hand", demo: "hand", mood: "focus" },
    { id: "seats", title: "THE SEATS", line: "Names, bets and how many cards each player holds. You never see their cards. The gold frame and bar show whose turn it is: 20 seconds, or the game plays for them.", target: "seat", demo: "seats", mood: "idle" },
    { id: "bust", title: "BUST AND 21", line: "Push the count past 21 and you're out for the round; the count drops back to 0 and the rest play on. Hit exactly 21 and you win on the spot.", target: "count", demo: "bust", mood: "shock" },
    { id: "bets", title: "BETS AND SIDE POTS", line: "Pick your bet in the 60-second window. You can win from each player at most what you bet. The IN PLAY panel shows the layers.", phoneLine: "Pick your bet in the 60-second window. You can win from each player at most what you bet. Bigger bets stack into side pots.", target: "pots", demo: "bets", mood: "smug" },
    { id: "again", title: "PLAY AGAIN", line: "After each round, tap PLAY AGAIN to get dealt into the next. HOW TO PLAY runs this tour again anytime. Good luck.", target: "howto", demo: "again", mood: "cheer" },
  ].map((step) => Object.freeze(step)),
);

// ---------------------------------------------------------------- DOM part

const TYPE_TICK_MS = 30;
const TYPE_CHARS_PER_TICK = 2;
const COUNT_ROLL_MS = 140;
const HOLE_PAD = 6;
const GAP = 12;

/** Board elements to spotlight on the table view. Each returns elements (unioned) or []. */
const TARGETS = {
  felt: (root) => [root.querySelector('[data-ref="felt"]')],
  count: (root) => [root.querySelector(".o21__count"), root.querySelector('[data-ref="meter"]')],
  top: (root) => [root.querySelector('[data-ref="top"]')],
  hand: (root) => {
    const tray = root.querySelector('[data-ref="tray"]');
    if (!tray || tray.classList.contains("is-collapsed") || !tray.querySelector(".o21__fan .o21__fc")) return [];
    return [tray];
  },
  seat: (root) => {
    const turn = root.querySelector('[data-ref="felt"] .o21__seat.is-turn:not(.is-you)');
    if (turn) return [turn];
    for (const area of ["s2", "s1", "s3"]) {
      const s = root.querySelector(`[data-ref="${area}"] .o21__seat:not(.o21__seat--open)`);
      if (s) return [s];
    }
    return [];
  },
  pots: (root) => [root.querySelector('[data-ref="panel"] .o21__box')],
  howto: (root) => [root.querySelector('[data-act="howto"]')],
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function card(code, { cls = "", label = null, big = true } = {}) {
  const aria = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<canvas class="o21__px ${big ? "o21__x2" : "o21__x1"} ${cls}" data-tcard="${esc(code)}" width="48" height="68" ${aria}></canvas>`;
}

const PIPS = (n) => Array.from({ length: 21 }, (_, i) => `<i class="${i < n ? "on" : ""}${i < n && i >= 15 ? " hot" : ""}${i === 20 ? " goal" : ""}"></i>`).join("");

/** Mini illustration markup for a step. Pure strings; canvases drawn after insertion. */
function demoHtml(kind) {
  switch (kind) {
    case "goal":
      return `<div class="o21t-goal">
        <div class="o21t-tile is-win"><b>21</b><span>EXACTLY · YOU WIN ★</span></div>
        <div class="o21t-tile is-bad"><b>22+</b><span>OVER · YOU'RE OUT</span></div>
      </div>`;
    case "count":
      return `<div class="o21t-count" role="img" aria-label="The count rolls from 14 to 21">
        <p class="o21t-cnum"><b data-tnum>14</b><small> / 21</small></p>
        <div class="o21__meter o21t-meter" data-tmeter>${PIPS(14)}</div>
        <p class="o21t-cap">+7 → 21 ★</p>
      </div>`;
    case "match":
      return `<div class="o21t-match">
        <figure class="o21t-fig"><span class="o21__topcard" style="--ring:#cf4336">${card("R7", { label: "Top card: Red 7" })}</span><figcaption>MATCH RED OR 7</figcaption></figure>
        <figure class="o21t-fig o21t-slide">${card("R3", { label: "Red 3 matches the color" })}<figcaption class="ok">RED · FITS</figcaption></figure>
        <figure class="o21t-fig o21t-nope">${card("B5", { label: "Blue 5 doesn't match" })}<figcaption class="bad">BLUE 5 · NO</figcaption></figure>
      </div>`;
    case "numbers":
      return `<div class="o21t-row3">
        ${[["G2", "+2", "Green 2 adds 2"], ["B5", "+5", "Blue 5 adds 5"], ["Y9", "+9", "Yellow 9 adds 9"]]
          .map(([c, t, l], i) => `<figure class="o21t-fig o21t-pop" style="--d:${i}">${card(c, { label: l })}<figcaption class="o21t-add">${t}</figcaption></figure>`)
          .join("")}
      </div>`;
    case "actions":
      return `<ul class="o21t-acts">
        <li>${card("YS", { big: false, label: "Skip, Nobody" })}<div><p class="o21t-an">SKIP · NOBODY <em>+0</em></p><p class="o21t-ad">Next player loses their turn.</p></div>
          <span class="o21t-skip" aria-hidden="true"><i>A</i><i class="x">B</i><i>C</i><b>➜</b></span></li>
        <li>${card("BR", { big: false, label: "Reverse, Charybdis" })}<div><p class="o21t-an">REVERSE · CHARYBDIS <em>+0</em></p><p class="o21t-ad">Play goes the other way.</p></div>
          <span class="o21t-rev" aria-hidden="true"><b class="a">↻</b><b class="b">↺</b></span></li>
        <li>${card("G+2", { big: false, label: "Plus 2, Sirens" })}<div><p class="o21t-an">+2 · SIRENS <em>+0</em></p><p class="o21t-ad">Next player draws 2, loses their turn.</p></div>
          <span class="o21t-plus" aria-hidden="true">${card("BACK", { big: false, cls: "p1" })}${card("BACK", { big: false, cls: "p2" })}<i>B</i></span></li>
      </ul>`;
    case "wild":
      return `<div class="o21t-wild">
        <figure class="o21t-fig">${card("W", { label: "Wild, Odysseus" })}<figcaption>PLAYS ON ANYTHING · +0</figcaption></figure>
        <div class="o21t-pick" role="img" aria-label="Pick the next color: red, blue, green or yellow">
          <span class="o21__col o21__col--R" style="--d:0">ARES<br>RED</span><span class="o21__col o21__col--B" style="--d:1">POSEIDON<br>BLUE</span>
          <span class="o21__col o21__col--G" style="--d:2">ATHENA<br>GREEN</span><span class="o21__col o21__col--Y" style="--d:3">ZEUS<br>YELLOW</span>
        </div>
      </div>`;
    case "hand": {
      const hand = [
        ["Y7", "21 ★", "win", "Yellow 7 makes 21, wins"],
        ["R3", "17", "", "Red 3 makes 17"],
        ["R9", "BUST", "bad", "Red 9 busts"],
        ["B5", "", "off", "Blue 5 can't be played"],
      ];
      return `<div class="o21t-hand">
        <p class="o21t-cap">COUNT 14 · TOP CARD RED 7</p>
        <div class="o21__fan has-tags o21t-fan">${hand
          .map(([c, t, tone, l], i) => `<span class="o21__fc${tone === "off" ? " is-off" : ""}${i === 0 ? " is-sel o21t-lift" : ""}">${t ? `<span class="o21__pv ${tone}" aria-hidden="true">${t}</span>` : ""}${card(c, { label: l })}</span>`)
          .join("")}</div>
        <span class="o21__btn o21__btn--play o21t-btn">PLAY Y7 → 21 ★</span>
        <p class="o21t-cap">NOTHING FITS? THE ONLY BUTTON IS <b>DRAW</b>.</p>
      </div>`;
    }
    case "seats":
      return `<div class="o21t-seats">
        <div class="o21__seat is-turn o21t-seat">
          <div class="o21__row"><span class="o21__nm">SAM</span><span class="o21__chip">BET 50</span></div>
          <div class="o21__backs" role="img" aria-label="Sam holds 4 cards"><i></i><i></i><i></i><i></i><b>4</b></div>
          <div class="o21__row"><span class="o21__st hot">THINKING</span><span class="o21__sn">0:12</span></div>
          <div class="o21__bar"><i class="o21t-drain"></i></div>
        </div>
        <ul class="o21t-legend"><li><b>GOLD FRAME</b> their turn</li><li><b>BAR</b> 20 s left, then auto-play</li><li><b>BACKS</b> cards held, faces hidden</li></ul>
      </div>`;
    case "bust":
      return `<div class="o21t-bust">
        <div class="o21t-line o21t-l1"><span class="o21t-n">18</span><span>+</span>${card("Y5", { big: false, label: "Yellow 5" })}<span>=</span><span class="o21t-n bad">23</span><span class="o21t-tag bad">BUST · COUNT → 0</span></div>
        <div class="o21t-line o21t-l2"><span class="o21t-n">14</span><span>+</span>${card("R7", { big: false, label: "Red 7" })}<span>=</span><span class="o21t-n ok">21</span><span class="o21t-tag ok">★ YOU WIN</span></div>
      </div>`;
    case "bets":
      return `<div class="o21t-bets">
        <div class="o21t-betrow"><span>RILEY · YOU</span><b>BET 10</b></div>
        <div class="o21t-betrow"><span>SAM</span><b>BET 50</b></div>
        <div class="o21__box o21t-inplay"><p class="o21__lbl">IN PLAY</p>
          <ul class="o21__layers"><li class="is-mine"><span>10 × 2 · all</span><span>20</span></li><li><span>40 × 1 · Sam</span><span>40</span></li></ul>
        </div>
        <p class="o21t-cap">YOU HIT 21: YOU TAKE 10 FROM SAM, NOT 50. HIS OTHER 40 GOES BACK TO HIM.</p>
      </div>`;
    case "again":
      return `<div class="o21t-again">
        <span class="o21__btn o21__btn--again o21t-btn"><span>PLAY AGAIN</span><span class="o21__againbar"><i class="o21t-drain"></i></span></span>
        <ul class="o21__ready o21t-readyl"><li class="is-ready"><span>ANA</span><b>✓ READY</b></li><li><span>SAM</span><em>… WAITING</em></li></ul>
        <span class="o21__howto o21t-howto">? HOW TO PLAY</span>
      </div>`;
    default:
      return "";
  }
}

/**
 * Create the walkthrough controller for one mounted game.
 * @param {{ root: HTMLElement, getView?: () => object|null, mode?: string|(() => string),
 *   onDone?: (reason: "finish"|"skip"|"turn"|"close") => void, still?: () => boolean,
 *   storage?: Storage|null }} options
 */
export function createTutorial({ root, getView = () => null, mode = "table", onDone = () => {}, still, storage } = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError("createTutorial: root element required");
  const getMode = typeof mode === "function" ? mode : () => mode;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const isStill = typeof still === "function" ? still : () => Boolean(reduced?.matches);
  const store = storage !== undefined ? storage : (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  let node = null;
  let els = null;
  let step = 0;
  let openFlag = false;
  let destroyed = false;
  let returnFocus = null;
  let typed = 0;
  let fullLine = "";
  let typer = null;
  let hackerTimer = null;
  let hackerTick = 0;
  let lastSvg = "";
  let demoTimer = null;
  let ro = null;
  let raf = 0;
  const offs = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  }

  function build() {
    node = document.createElement("div");
    node.className = "o21__tut";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", "How to play Olympus 21");
    node.innerHTML = `
      <div class="o21__tut-span" data-tref="span" aria-hidden="true"></div>
      <div class="o21__tut-hole" data-tref="hole" aria-hidden="true"></div>
      <div class="o21__tut-box" data-tref="box">
        <div class="o21__tut-demo" data-tref="demo"></div>
        <div class="o21__dlg o21__tut-dlg">
          <span class="o21__nametag" aria-hidden="true">TECHNO</span>
          <span class="o21__port" aria-hidden="true"><span class="o21__hacker" data-tref="hacker"></span></span>
          <div class="o21__dlg-body">
            <p class="o21__sr" role="status" aria-live="polite" aria-atomic="true" data-tref="sr"></p>
            <p class="o21__dlg-t o21__dlg-t--cyan" data-tref="title" aria-hidden="true"></p>
            <p class="o21__dlg-l" data-tref="line" aria-hidden="true"><span data-tref="shown"></span><span class="o21__tut-ghost" data-tref="ghost"></span></p>
          </div>
        </div>
        <div class="o21__tut-ctl">
          <button type="button" class="o21__btn o21__btn--sm o21__btn--blue" data-tact="back">&lt; BACK</button>
          <span class="o21__tut-count" data-tref="count" aria-hidden="true"></span>
          <button type="button" class="o21__btn o21__btn--sm o21__btn--off o21__tut-skip" data-tact="skip">SKIP</button>
          <button type="button" class="o21__btn o21__btn--sm" data-tact="next">NEXT &gt;</button>
        </div>
      </div>`;
    const q = (n) => node.querySelector(`[data-tref="${n}"]`);
    els = { shown: q("shown"), ghost: q("ghost"), span: q("span"), hole: q("hole"), box: q("box"), demo: q("demo"), hacker: q("hacker"), sr: q("sr"), title: q("title"), line: q("line"), count: q("count"), back: node.querySelector('[data-tact="back"]'), skip: node.querySelector('[data-tact="skip"]'), next: node.querySelector('[data-tact="next"]') };
    root.appendChild(node);
    root.classList.add("has-tut");

    on(node, "click", (e) => {
      const b = e.target.closest?.("[data-tact]");
      if (!b || !node.contains(b)) return;
      e.stopPropagation();
      if (b.dataset.tact === "next") next();
      else if (b.dataset.tact === "back") back();
      else if (b.dataset.tact === "skip") close("skip");
    });
    on(document, "keydown", onKey, true); // capture: the game's own key handlers never see tour keys
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(() => schedule());
      ro.observe(root);
    }
    on(window, "resize", schedule);
    if (reduced?.addEventListener) on(reduced, "change", () => renderStep());
  }

  function onKey(e) {
    if (!openFlag || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const inside = node.contains(t);
    const loose = t === document.body || t === document.documentElement || t === null || (root.contains(t) && !inside);
    if (!inside && !loose) return; // focus is in another widget on the page
    if (!inside && t?.matches?.("input, textarea, select")) return;
    if (!root.isConnected || root.getClientRects().length === 0) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close("skip");
    } else if (e.key === "ArrowRight" || (e.key === "Enter" && !t?.closest?.("button"))) {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      back();
    } else if (e.key === "Tab" && inside) {
      const f = [els.back, els.skip, els.next].filter((b) => !b.disabled && !b.hidden);
      if (!f.length) return;
      const i = f.indexOf(t);
      e.preventDefault();
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
      f[n].focus();
    }
  }

  // ---- typewriter + portrait
  function talking() {
    return typed < fullLine.length;
  }
  function stopTyping() {
    if (typer !== null) clearInterval(typer);
    typer = null;
  }
  function drawHacker() {
    if (!els) return;
    const frame = hackerFrame(TUTORIAL_STEPS[step]?.mood ?? "idle", { frame: hackerTick, talking: talking(), still: isStill() });
    if (frame.svg !== lastSvg) {
      els.hacker.innerHTML = frame.svg;
      lastSvg = frame.svg;
    }
  }
  /** Typed part plus an invisible remainder, so the bubble has its final size from the first frame. */
  function paintLine() {
    els.shown.textContent = fullLine.slice(0, typed);
    els.ghost.textContent = fullLine.slice(typed);
  }
  function finishTyping() {
    stopTyping();
    typed = fullLine.length;
    paintLine();
    drawHacker();
  }
  function type(line) {
    stopTyping();
    fullLine = line;
    if (isStill()) {
      finishTyping();
      return;
    }
    typed = 0;
    paintLine();
    typer = setInterval(() => {
      typed = Math.min(fullLine.length, typed + TYPE_CHARS_PER_TICK);
      paintLine();
      if (!talking()) {
        stopTyping();
        drawHacker();
      }
    }, TYPE_TICK_MS);
  }

  // ---- demos
  function stopDemo() {
    if (demoTimer !== null) clearInterval(demoTimer);
    demoTimer = null;
  }
  function startDemo(kind) {
    stopDemo();
    for (const cv of els.demo.querySelectorAll("canvas[data-tcard]")) {
      try {
        renderCard(cv, cv.dataset.tcard);
      } catch (err) {
        console.error(err);
      }
    }
    if (kind === "count") {
      const num = els.demo.querySelector("[data-tnum]");
      const pips = Array.from(els.demo.querySelectorAll("[data-tmeter] i"));
      const paint = (n) => {
        num.textContent = String(n);
        pips.forEach((p, i) => {
          p.classList.toggle("on", i < n);
          p.classList.toggle("hot", i < n && i >= 15);
        });
        els.demo.querySelector(".o21t-count").classList.toggle("is-21", n === 21);
      };
      if (isStill()) {
        paint(21);
        return;
      }
      let n = 14;
      let hold = 0;
      paint(n);
      demoTimer = setInterval(() => {
        if (hold > 0) {
          hold -= 1;
          if (hold === 0 && n === 21) {
            n = 14;
            paint(n);
            hold = 4;
          }
          return;
        }
        n += 1;
        paint(n);
        if (n === 21) hold = 12;
      }, COUNT_ROLL_MS);
    }
  }

  // ---- layout
  function targetRect(stepDef) {
    if (getMode() !== "table" || !stepDef.target) return null;
    const list = (TARGETS[stepDef.target]?.(root) ?? []).filter(Boolean);
    let r = null;
    for (const el of list) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    return r;
  }

  function schedule() {
    if (!openFlag || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      layout();
    });
  }

  function layout() {
    if (!openFlag || !els) return;
    const phone = getMode() !== "table";
    node.classList.toggle("is-phone", phone);
    const box = els.box;
    if (phone) {
      els.hole.hidden = true;
      node.classList.remove("has-hole");
      box.style.left = box.style.top = "";
      return;
    }
    const base = root.getBoundingClientRect();
    const t = targetRect(TUTORIAL_STEPS[step]);
    const W = base.width;
    const H = base.height;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    // Visible slice of the root (it can be taller than the window).
    const vTop = Math.max(0, -base.top);
    const vBot = Math.min(H, (window.innerHeight || H) - base.top);
    let x;
    let y;
    if (t) {
      const hole = { left: t.left - base.left - HOLE_PAD, top: t.top - base.top - HOLE_PAD, right: t.right - base.left + HOLE_PAD, bottom: t.bottom - base.top + HOLE_PAD };
      els.hole.hidden = false;
      node.classList.add("has-hole");
      Object.assign(els.hole.style, { left: `${hole.left}px`, top: `${hole.top}px`, width: `${hole.right - hole.left}px`, height: `${hole.bottom - hole.top}px` });
      const midY = (hole.top + hole.bottom) / 2;
      const fitsRight = W - hole.right - GAP >= bw + 8;
      const fitsLeft = hole.left - GAP >= bw + 8;
      if (fitsRight || fitsLeft) {
        x = fitsRight ? hole.right + GAP : hole.left - GAP - bw;
        y = midY - bh / 2;
      } else {
        x = (hole.left + hole.right) / 2 - bw / 2;
        const below = H - hole.bottom - GAP >= bh;
        const above = hole.top - GAP >= bh;
        y = above && !below ? hole.top - GAP - bh : below ? hole.bottom + GAP : hole.top - GAP - bh;
        if (!below && !above) y = H - bh - 8; // overlap the hole's far edge rather than leave the root
      }
      // Beside the hole: keep it level with what's visible when possible (reveal() scrolls the rest).
      if (fitsRight || fitsLeft) {
        const cy = Math.max(vTop + 8, Math.min(vBot - bh - 8, y));
        if (Number.isFinite(cy) && cy <= hole.bottom && cy + bh >= hole.top) y = cy;
      }
    } else {
      els.hole.hidden = true;
      node.classList.remove("has-hole");
      x = W / 2 - bw / 2;
      y = (vTop + vBot) / 2 - bh / 2;
    }
    x = Math.max(8, Math.min(W - bw - 8, x));
    y = Math.max(8, Math.min(H - bh - 8, y));
    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
  }

  /** Bring the spotlight and bubble into the window (laptop: the root can be taller than it). */
  function reveal() {
    if (getMode() !== "table") {
      node.scrollIntoView?.({ block: "nearest" });
      return;
    }
    // Scroll an invisible box spanning spotlight + bubble into view. scrollIntoView works
    // whatever element scrolls the page (the host may scroll a container, not the window).
    const behavior = isStill() ? "auto" : "smooth";
    const box = { top: els.box.offsetTop, bottom: els.box.offsetTop + els.box.offsetHeight };
    const hole = els.hole.hidden ? box : { top: els.hole.offsetTop, bottom: els.hole.offsetTop + els.hole.offsetHeight };
    const top = Math.min(box.top, hole.top) - 12;
    const bottom = Math.max(box.bottom, hole.bottom) + 12;
    Object.assign(els.span.style, { top: `${top}px`, height: `${bottom - top}px` });
    const r = els.span.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (r.top >= 0 && r.bottom <= vh) return;
    els.span.scrollIntoView?.({ block: r.height > vh ? "start" : "nearest", behavior });
  }

  // ---- steps
  function renderStep() {
    if (!openFlag) return;
    const def = TUTORIAL_STEPS[step];
    const phone = getMode() !== "table";
    node.classList.toggle("is-still", isStill());
    node.classList.toggle("is-phone", phone);
    node.dataset.step = def.id;
    els.demo.innerHTML = demoHtml(def.demo);
    els.demo.className = `o21__tut-demo o21__tut-demo--${def.demo}`;
    startDemo(def.demo);
    const line = phone && def.phoneLine ? def.phoneLine : def.line;
    els.title.textContent = def.title;
    els.sr.textContent = `Step ${step + 1} of ${TUTORIAL_STEPS.length}. ${def.title}. ${line}`;
    els.count.textContent = `${step + 1}/${TUTORIAL_STEPS.length}`;
    const last = step === TUTORIAL_STEPS.length - 1;
    els.back.disabled = step === 0;
    els.next.textContent = last ? "PLAY!" : "NEXT >";
    els.next.setAttribute("aria-label", last ? "Finish the tour" : "Next step");
    els.skip.hidden = last;
    if (document.activeElement && node.contains(document.activeElement) && (document.activeElement.disabled || document.activeElement.hidden)) els.next.focus({ preventScroll: true });
    type(line);
    drawHacker();
    layout();
    reveal();
  }

  function next() {
    if (!openFlag) return;
    if (talking()) {
      finishTyping();
      return;
    }
    if (step >= TUTORIAL_STEPS.length - 1) {
      close("finish");
      return;
    }
    step += 1;
    renderStep();
  }

  function back() {
    if (!openFlag || step === 0) return;
    step -= 1;
    renderStep();
  }

  function open({ at = 0 } = {}) {
    if (destroyed) return;
    if (openFlag) {
      els.next.focus({ preventScroll: true });
      return;
    }
    if (!node) build();
    node.hidden = false;
    root.classList.add("has-tut");
    openFlag = true;
    step = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, at));
    const active = document.activeElement;
    returnFocus = active && active !== document.body && !node.contains(active) ? active : null;
    hackerTimer = setInterval(() => {
      if (isStill()) return;
      hackerTick += 1;
      drawHacker();
    }, HACKER_FRAME_MS);
    renderStep();
    els.next.focus({ preventScroll: true });
  }

  function teardown() {
    stopTyping();
    stopDemo();
    if (hackerTimer !== null) clearInterval(hackerTimer);
    hackerTimer = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function close(reason = "close") {
    if (!openFlag) return;
    openFlag = false;
    teardown();
    const hadFocus = node && node.contains(document.activeElement);
    if (node) {
      node.hidden = true;
      els.demo.innerHTML = "";
    }
    root.classList.remove("has-tut");
    writeSeen(store, getView()?.tableKey);
    if (hadFocus) {
      const back = returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length ? returnFocus : root.querySelector('[data-act="howto"]');
      back?.focus?.({ preventScroll: true });
    }
    returnFocus = null;
    try {
      onDone(reason);
    } catch (err) {
      console.error(err);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    openFlag = false;
    teardown();
    for (const off of offs.splice(0)) off();
    ro?.disconnect();
    ro = null;
    node?.remove();
    node = null;
    els = null;
    root.classList.remove("has-tut");
  }

  return {
    open,
    close,
    destroy,
    isOpen: () => openFlag,
    step: () => step,
    /** Re-place the spotlight after the game re-rendered or the layout mode changed. */
    refresh() {
      if (!openFlag) return;
      const phone = getMode() !== "table";
      if (phone !== node.classList.contains("is-phone")) renderStep();
      else schedule();
    },
  };
}
