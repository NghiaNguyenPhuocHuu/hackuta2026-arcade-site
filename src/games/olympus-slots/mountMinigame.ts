/**
 * HackUTA points minigame "Olympus Slots": a self-contained, mountable SPA in
 * a 16-bit, 2D pixel-art style.
 *
 *   const unmount = mountMinigame(element, { adapter });
 *   ...
 *   unmount();   // removes DOM, stylesheet, timers, listeners, subscriptions
 *
 * The SPA brings its own scoped stylesheet (minigame.css) and fonts. It never
 * decides outcomes: the adapter is the source of truth, and the UI only
 * animates to the symbols the adapter returns. The caller owns the adapter and
 * disposes it after unmounting.
 */
import { SLOT_DEFAULT_WAGER, SLOT_REEL_COUNT, SLOT_SPIN_COOLDOWN_MS, SLOT_SYMBOLS } from "../../../shared/admin/slotRules";
import { dialogueFor, lossRun, TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY, type Dialogue, type DialogTone, type ResultContext } from "./dialogue";
import { hackerFrame, HACKER_FRAME_MS } from "./hacker";
import { createFullscreenControl } from "../fullscreen";
import { gameSoundEnabled, setGameSoundEnabled, SOUND_OFF_ICON_PATH, SOUND_ON_ICON_PATH, subscribeGameSound } from "../sound";
import { SlotsSfx } from "./sound";
import fullscreenCss from "../fullscreen.css?inline";
import minigameCss from "./minigame.css?inline";
import { symbolLabel, symbolSvg } from "./symbols";
import type { GameState, GameStatus, MountMinigameOptions, SpinFailureStatus, SpinResult, TutorialMode } from "./types";

const TYPE_TICK_MS = 30;
const TYPE_CHARS_PER_TICK = 2;
const NET_HISTORY_LIMIT = 20;
const TUTORIAL_MODES: ReadonlySet<string> = new Set<TutorialMode>(["first-visit", "always", "off"]);
const DIALOG_TONES: ReadonlySet<string> = new Set<DialogTone>(["gold", "green", "cyan", "coral", "marble"]);

function tutorialSeen() {
  try {
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

function markTutorialSeen() {
  try {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "done");
  } catch {
    // Storage blocked (private mode, sandboxed frame): the tutorial just shows again next time.
  }
}

function firstTutorialStep(mode: TutorialMode) {
  if (mode === "off") return -1;
  if (mode === "always") return 0;
  return tutorialSeen() ? -1 : 0;
}

const SPIN_ANIMATION_MS = 1400;
const REEL_TICK_MS = 85;
const REEL_LAND_STAGGER_MS = 320;
const CELEBRATION_MS = 2600;
/** Until the server answers, hold the arcade's points at most this long. */
const ANSWER_WAIT_MS = 15_000;
/** From the answer to the last reel landing (rest of the spin + staggered stops), plus slack. */
const REVEAL_MAX_MS = SPIN_ANIMATION_MS + SLOT_REEL_COUNT * REEL_LAND_STAGGER_MS + 500;
const IDLE_SYMBOLS = ["athena", "hermes", "apollo", "hera"];

const mountedElements = new WeakSet<HTMLElement>();
let stylesheetRefs = 0;
let stylesheetEl: HTMLStyleElement | null = null;
let instanceCount = 0;

function acquireStylesheet() {
  stylesheetRefs += 1;
  if (stylesheetRefs === 1) {
    stylesheetEl = document.createElement("style");
    stylesheetEl.dataset.minigameStylesheet = "";
    stylesheetEl.textContent = `${fullscreenCss}\n${minigameCss}`;
    document.head.appendChild(stylesheetEl);
  }
}

function releaseStylesheet() {
  stylesheetRefs = Math.max(0, stylesheetRefs - 1);
  if (stylesheetRefs === 0 && stylesheetEl) {
    stylesheetEl.remove();
    stylesheetEl = null;
  }
}

function newSpinId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `spin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatPoints(points: number) {
  return points.toLocaleString("en-US");
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${mmss}` : mmss;
}

/** Short signed delta for chips: "+10", "−25", "±0". */
function signedShort(delta: number) {
  if (delta > 0) return `+${formatPoints(delta)}`;
  if (delta < 0) return `−${formatPoints(-delta)}`;
  return "±0";
}

function signedPoints(delta: number) {
  return `${signedShort(delta)} pts`;
}

/** The symbol that appears most often (the "three of a kind" symbol on a win). */
function majoritySymbol(symbols: readonly string[]) {
  const counts = new Map<string, number>();
  for (const symbol of symbols) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  let best = symbols[0] ?? "";
  for (const [symbol, count] of counts) if (count > (counts.get(best) ?? 0)) best = symbol;
  return best;
}

/** Which reels glow after a result. */
function winningReels(outcomeId: string, symbols: readonly string[]) {
  if (outcomeId === "big" || outcomeId === "push") return symbols.map(() => true);
  if (outcomeId === "win") {
    const main = majoritySymbol(symbols);
    return symbols.map((symbol) => symbol === main);
  }
  return symbols.map(() => false);
}

const STATUS_BADGE: Readonly<Record<GameStatus, { label: string; tone: string }>> = {
  teaser: { label: "SOON", tone: "soon" },
  live: { label: "LIVE", tone: "live" },
  closed: { label: "CLOSED", tone: "closed" },
};

const FAILURE_COPY: Readonly<Record<SpinFailureStatus, string>> = {
  closed: "The game is closed right now.",
  insufficient_points: "You don't have enough points for that wager.",
  invalid_wager: "Choose a wager of 5, 10, 25 or 50 points.",
  rate_limited: "One spin every 2 seconds. Try again in a moment.",
  signed_out: "Sign in to play.",
  not_eligible: "Only checked-in, accepted hackers can play.",
  error: "Something went wrong. Your points are safe. Try again.",
};

/** Deterministic pixel stars (percent positions so they scale with the container). */
const STARS = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 46 }, () => ({
    x: (rnd() * 99).toFixed(2),
    y: (rnd() * 99).toFixed(2),
    big: rnd() > 0.8,
    gold: rnd() > 0.7,
  }));
})();

const SPARKLES = [
  { x: 6, y: 26, d: 0.6 },
  { x: 62, y: 24, d: 0.9 },
  { x: 16, y: 21, d: 0.7 },
  { x: 54, y: 20, d: 0.5 },
  { x: 4, y: 52, d: 0.8 },
  { x: 64, y: 51, d: 0.65 },
  { x: 34, y: 18, d: 1 },
  { x: 92, y: 46, d: 0.75 },
];

const PAYLINE_LEFT =
  '<svg class="minigame__payline minigame__payline--left" viewBox="0 0 3 5" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d="M0 0h1v1h1v1h1v1H2v1H1v1H0z"/></svg>';
const PAYLINE_RIGHT =
  '<svg class="minigame__payline minigame__payline--right" viewBox="0 0 3 5" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d="M3 0H2v1H1v1H0v1h1v1h1v1h1z"/></svg>';

function template({ uid }: { uid: number }) {
  const stars = STARS.map(
    (star) =>
      `<span class="minigame__star${star.big ? " minigame__star--big" : ""}${star.gold ? " minigame__star--gold" : ""}" style="left:${star.x}%;top:${star.y}%"></span>`,
  ).join("");
  const sparkles = SPARKLES.map(
    (spark) => `<span class="minigame__sparkle" style="left:${spark.x}%;top:${spark.y}%;animation-duration:${spark.d}s"></span>`,
  ).join("");
  const reels = Array.from(
    { length: SLOT_REEL_COUNT },
    (_, index) => `
      <li class="minigame__reel" data-reel="${index}">
        <span class="minigame__reel-window"></span>
        <span class="minigame__reel-label"></span>
      </li>`,
  ).join("");

  return `
    <div class="minigame__stars" aria-hidden="true">${stars}</div>

    <header class="minigame__header">
      <div class="minigame__brand">
        <div class="minigame__brand-copy">
          <h1 class="minigame__title">REELS OF TARTARUS</h1>
          <p class="minigame__tagline">Spin the abyss. Chain the Titans or join them.</p>
        </div>
      </div>
      <div class="minigame__status">
        <button type="button" class="sound-switch" data-ref="sound" aria-label="Game sounds" aria-pressed="true">
          <svg class="sound-switch__icon" viewBox="0 0 9 7" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path data-ref="sound-icon" d=""/></svg><span data-ref="sound-text"></span>
        </button>
        <div class="fullscreen-switch" data-ref="display" role="group" aria-label="Display size" hidden>
          <button type="button" class="fullscreen-switch__option" data-display="normal" aria-pressed="true">NORMAL</button>
          <button type="button" class="fullscreen-switch__option" data-display="full" aria-pressed="false">
            <svg class="fullscreen-switch__icon" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d="M0 0h3v1H1v2H0zM4 0h3v3H6V1H4zM0 4h1v2h2v1H0zM6 4h1v3H4V6h2z"/></svg>FULL SCREEN
          </button>
        </div>
        <span class="minigame__badge" data-ref="badge"><span class="minigame__badge-dot" aria-hidden="true"></span><span data-ref="badge-text"></span></span>
        <span class="minigame__clock" data-ref="clock" hidden></span>
      </div>
    </header>

    <div class="minigame__layout" data-ref="layout">
      <section class="minigame__machine" aria-label="Slot machine">
        <div class="minigame__temple">
          <span class="minigame__roof minigame__roof--1" aria-hidden="true"></span>
          <span class="minigame__roof minigame__roof--2" aria-hidden="true"></span>
          <span class="minigame__roof minigame__roof--3" aria-hidden="true"></span>
          <div class="minigame__frieze" aria-hidden="true">FACE YOUR FATE</div>
          <div class="minigame__bay" data-tut="reels">
            <span class="minigame__column" aria-hidden="true"></span>
            <div class="minigame__reels-wrap">
              ${PAYLINE_LEFT}${PAYLINE_RIGHT}
              <span class="minigame__pop" data-ref="pop" aria-hidden="true" hidden></span>
              <ul class="minigame__reels" data-ref="reels" aria-label="Reels">${reels}</ul>
            </div>
            <span class="minigame__column" aria-hidden="true"></span>
          </div>
          <span class="minigame__step minigame__step--1" aria-hidden="true"></span>
          <span class="minigame__step minigame__step--2" aria-hidden="true"></span>
        </div>

        <div class="minigame__dialog minigame__dialog--techno">
          <span class="minigame__nametag" aria-hidden="true">TECHNO</span>
          <span class="minigame__portrait" aria-hidden="true"><span class="minigame__hacker-wrap" data-ref="hacker"></span></span>
          <div class="minigame__dialog-body">
            <p class="minigame__sr" role="status" aria-live="polite" aria-atomic="true" data-ref="msg-sr"></p>
            <p class="minigame__dialog-title" data-ref="msg-title" aria-hidden="true"></p>
            <p class="minigame__dialog-line" data-ref="msg-line" aria-hidden="true"></p>
            <div class="minigame__tutorial" data-ref="tutorial" hidden>
              <button type="button" class="minigame__tut-btn minigame__tut-btn--next" data-ref="tut-next" aria-label="Next tip">NEXT &gt;</button>
              <button type="button" class="minigame__tut-btn" data-ref="tut-skip">SKIP</button>
              <span class="minigame__tut-count" data-ref="tut-count"></span>
            </div>
          </div>
          <span class="minigame__dialog-caret" data-ref="caret" aria-hidden="true">▼</span>
        </div>
      </section>

      <aside class="minigame__panel" aria-label="Controls">
        <div class="minigame__box" data-tut="balance">
          <p class="minigame__box-label">BALANCE</p>
          <p class="minigame__balance">
            <span class="minigame__coin" aria-hidden="true"></span>
            <span class="minigame__balance-value" data-ref="balance">0</span>
            <span class="minigame__balance-unit">pts</span>
          </p>
        </div>

        <div class="minigame__box" role="group" aria-labelledby="minigame-${uid}-wager-label" data-tut="wager">
          <p class="minigame__box-label" id="minigame-${uid}-wager-label">WAGER</p>
          <div class="minigame__wager-list" data-ref="wagers"></div>
        </div>

        <button type="button" class="minigame__spin" data-ref="spin" data-tut="spin">SPIN</button>

        <div class="minigame__box" data-tut="payouts">
          <p class="minigame__box-label">PAYOUTS</p>
          <dl class="minigame__payouts">
            <div><dt>Zeus × 4</dt><dd class="minigame__mult minigame__mult--gold">5×</dd></div>
            <div><dt>Three of a kind</dt><dd class="minigame__mult minigame__mult--win">2×</dd></div>
            <div><dt>Two pairs</dt><dd class="minigame__mult">1×</dd></div>
            <div><dt>Anything else</dt><dd class="minigame__mult minigame__mult--loss">0×</dd></div>
          </dl>
        </div>
      </aside>
    </div>

    <footer class="minigame__history" data-ref="history-panel">
      <p class="minigame__history-label">LAST SPINS</p>
      <p class="minigame__history-empty" data-ref="history-empty"></p>
      <ul class="minigame__history-list" data-ref="history"></ul>
    </footer>

    <div class="minigame__sparkles" data-ref="sparkles" aria-hidden="true" hidden>${sparkles}</div>`;
}

/**
 * Mount the minigame into `el`. The game renders inline. On laptop/desktop
 * browsers (fine pointer, hover, ≥1024px wide, Fullscreen API available) a
 * NORMAL | FULL SCREEN switch puts the game into browser full screen (the
 * shared control in ../fullscreen.ts); Esc or NORMAL leaves it.
 * Returns `unmount`, which is safe to call more than once.
 */
export function mountMinigame(el: HTMLElement, options: MountMinigameOptions): () => void {
  if (!(el instanceof HTMLElement)) throw new TypeError("mountMinigame: a host element is required");
  if (mountedElements.has(el)) throw new Error("mountMinigame: this element already has a mounted minigame");
  mountedElements.add(el);

  const { adapter } = options;
  const points = options.points ?? { hold() {}, release() {} };
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const cleanups: Array<() => void> = [];
  let disposed = false;

  acquireStylesheet();

  const root = document.createElement("div");
  root.className = "minigame";
  instanceCount += 1;
  root.innerHTML = template({ uid: instanceCount });
  el.appendChild(root);

  function ref<T extends HTMLElement = HTMLElement>(name: string): T {
    const node = root.querySelector<T>(`[data-ref="${name}"]`);
    if (!node) throw new Error(`mountMinigame: missing [data-ref="${name}"]`);
    return node;
  }
  const els = {
    sound: ref("sound"),
    soundIcon: root.querySelector<SVGPathElement>('[data-ref="sound-icon"]')!,
    soundText: ref("sound-text"),
    display: ref("display"),
    badge: ref("badge"),
    badgeText: ref("badge-text"),
    clock: ref("clock"),
    reels: ref("reels"),
    pop: ref("pop"),
    msgTitle: ref("msg-title"),
    msgLine: ref("msg-line"),
    msgSr: ref("msg-sr"),
    caret: ref("caret"),
    hacker: ref("hacker"),
    tutorial: ref("tutorial"),
    tutNext: ref<HTMLButtonElement>("tut-next"),
    tutSkip: ref<HTMLButtonElement>("tut-skip"),
    tutCount: ref("tut-count"),
    balance: ref("balance"),
    wagers: ref("wagers"),
    spin: ref<HTMLButtonElement>("spin"),
    historyPanel: ref("history-panel"),
    historyEmpty: ref("history-empty"),
    history: ref("history"),
    sparkles: ref("sparkles"),
  };
  const reelEls = Array.from(els.reels.querySelectorAll<HTMLElement>(".minigame__reel"));

  let state: GameState = adapter.getState();
  let wager = state.wagers.includes(SLOT_DEFAULT_WAGER) ? SLOT_DEFAULT_WAGER : (state.wagers[0] ?? SLOT_DEFAULT_WAGER);
  let spinning = false;
  let cooldownUntil = 0;
  /** Context of the last landed spin (fed to dialogueFor), or null. */
  let resultCtx: ResultContext | null = null;
  /** A spin failure to show instead of the normal dialogue, or null. */
  let failure: Dialogue | null = null;
  /** Net points of this session's spins, newest first (for streak quips). */
  let netHistory: Array<{ net: number }> = [];
  /** Symbols currently on the reels (adapter-provided after the first spin). */
  let shownSymbols = [...IDLE_SYMBOLS];
  let celebrationTimer: ReturnType<typeof setTimeout> | null = null;
  const tutorialMode: TutorialMode = options.tutorial && TUTORIAL_MODES.has(options.tutorial) ? options.tutorial : "first-visit";
  let tutorialStep = firstTutorialStep(tutorialMode);
  const tutTargets = Array.from(root.querySelectorAll<HTMLElement>("[data-tut]"));
  const reducedMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const still = () => Boolean(reducedMotion?.matches);

  // Dialogue/typewriter/Techno state.
  let dialogueKey = "";
  let fullLine = "";
  let typedLen = 0;
  let typer: ReturnType<typeof setInterval> | null = null;
  let mood = "idle";
  let hackerTick = 0;
  let lastHackerSvg = "";

  // ---- timer helpers (everything tracked so unmount leaves nothing behind)
  function after(ms: number, fn: () => void) {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (!disposed) fn();
    }, ms);
    timeouts.add(id);
    return id;
  }

  function cancelAfter(id: ReturnType<typeof setTimeout>) {
    clearTimeout(id);
    timeouts.delete(id);
  }

  function every(ms: number, fn: () => void) {
    const id = setInterval(() => {
      if (!disposed) fn();
    }, ms);
    intervals.add(id);
    return id;
  }

  function stopInterval(id: ReturnType<typeof setInterval>) {
    clearInterval(id);
    intervals.delete(id);
  }

  function wait(ms: number) {
    return new Promise<void>((resolve) => after(ms, resolve));
  }

  function on(target: EventTarget, type: string, handler: (event: Event) => void) {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  }

  function setText(node: Element, text: string) {
    if (node.textContent !== text) node.textContent = text;
  }

  // ---- rendering
  function setReel(reelEl: HTMLElement, symbol: string, { silhouette = false, label }: { silhouette?: boolean; label?: string } = {}) {
    const windowEl = reelEl.querySelector(".minigame__reel-window");
    const labelEl = reelEl.querySelector(".minigame__reel-label");
    if (windowEl) windowEl.innerHTML = symbolSvg(symbol, { silhouette });
    if (labelEl) setText(labelEl, label ?? symbolLabel(symbol).toUpperCase());
  }

  function clearReelHighlights() {
    for (const reelEl of reelEls) reelEl.classList.remove("minigame__reel--win", "minigame__reel--landed");
  }

  /** Teaser and closed share one look: silhouette gods, "???", controls off. */
  function isDormant() {
    return state.status === "teaser" || state.status === "closed";
  }

  function renderReels() {
    if (spinning) return;
    const dormant = isDormant();
    reelEls.forEach((reelEl, index) => {
      setReel(reelEl, shownSymbols[index] ?? "", dormant ? { silhouette: true, label: "???" } : {});
    });
    root.classList.toggle("minigame--teaser", dormant);
    root.classList.toggle("minigame--closed", state.status === "closed");
    if (dormant) clearReelHighlights();
  }

  function renderWagers() {
    els.wagers.replaceChildren(
      ...state.wagers.map((amount) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "minigame__wager";
        button.dataset.wager = String(amount);
        button.textContent = String(amount);
        button.setAttribute("aria-label", `${amount} points`);
        return button;
      }),
    );
  }

  function renderControls() {
    const live = state.status === "live";
    for (const button of els.wagers.querySelectorAll<HTMLButtonElement>(".minigame__wager")) {
      const amount = Number(button.dataset.wager);
      const selected = amount === wager;
      button.classList.toggle("minigame__wager--active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = spinning || !live || amount > state.balance;
    }
    const canAfford = wager <= state.balance;
    els.spin.disabled = spinning || !live || !canAfford || Date.now() < cooldownUntil;
    let label = "SPIN";
    if (state.status === "teaser") label = "OPENS SOON";
    else if (state.status === "closed") label = "CLOSED";
    else if (spinning) label = "SPINNING";
    else if (!canAfford) label = "NOT ENOUGH";
    setText(els.spin, label);
    els.spin.setAttribute("aria-label", live && !spinning && canAfford ? `Spin for ${wager} points` : label.toLowerCase());
  }

  // ---- tutorial
  function tutorialActive() {
    return tutorialStep >= 0 && tutorialStep < TUTORIAL_STEPS.length && state.status === "live" && !spinning;
  }

  function finishTutorial() {
    if (tutorialStep < 0) return;
    tutorialStep = -1;
    markTutorialSeen();
  }

  function renderTutorial() {
    const active = tutorialActive();
    els.tutorial.hidden = !active;
    const target = active ? (TUTORIAL_STEPS[tutorialStep]?.target ?? null) : null;
    for (const node of tutTargets) node.classList.toggle("minigame__tut-target", node.dataset.tut === target);
    if (!active) return;
    const last = tutorialStep === TUTORIAL_STEPS.length - 1;
    els.tutNext.hidden = last;
    setText(els.tutSkip, last ? "GOT IT" : "SKIP");
    els.tutSkip.setAttribute("aria-label", last ? "Got it, close the tour" : "Skip the tour");
    setText(els.tutCount, `${tutorialStep + 1}/${TUTORIAL_STEPS.length}`);
  }

  // ---- Techno + dialogue
  function currentDialogue(): Dialogue {
    if (state.status === "live" && failure && !spinning) return failure;
    if (tutorialActive()) {
      const step = TUTORIAL_STEPS[tutorialStep];
      if (step) return { title: step.title, line: step.line, tone: "cyan", mood: step.mood };
    }
    const shortOfPoints = state.status === "live" && !spinning && wager > state.balance;
    const result = state.status === "live" && !spinning ? resultCtx : null;
    const d = dialogueFor({
      status: state.status,
      spinning,
      tutorialStep: null,
      shortOfPoints,
      balance: state.balance,
      opensAt: state.opensAt ?? null,
      result,
    });
    return result && !shortOfPoints && result.sr !== undefined ? { ...d, sr: result.sr } : d;
  }

  function talking() {
    return typedLen < fullLine.length;
  }

  function drawHacker() {
    const frame = hackerFrame(mood, { frame: hackerTick, talking: talking(), still: still() });
    if (frame.svg !== lastHackerSvg) {
      els.hacker.innerHTML = frame.svg;
      lastHackerSvg = frame.svg;
    }
    const scale = (els.hacker.clientWidth || 80) / 16;
    const dx = still() ? 0 : frame.dx * scale;
    const dy = still() ? 0 : frame.dy * scale;
    els.hacker.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  }

  function renderTyped() {
    setText(els.msgLine, fullLine.slice(0, typedLen));
    els.caret.hidden = talking() || tutorialActive();
  }

  function stopTyping() {
    if (typer !== null) stopInterval(typer);
    typer = null;
  }

  function finishTyping() {
    typedLen = fullLine.length;
    stopTyping();
    renderTyped();
    drawHacker();
  }

  function renderMessage() {
    const d = currentDialogue();
    const tone = DIALOG_TONES.has(d.tone) ? d.tone : "cyan";
    els.msgTitle.className = `minigame__dialog-title minigame__dialog-title--${tone}`;
    mood = d.mood;
    const key = `${d.title}|${d.line}`;
    if (key !== dialogueKey) {
      dialogueKey = key;
      fullLine = d.line;
      setText(els.msgTitle, d.title);
      // Screen readers get the whole message once; the typed text is aria-hidden.
      // Titles may already end in "." / "!" / "?"; only add a full stop when they don't.
      const title = /[.!?]$/.test(d.title) ? d.title : `${d.title}.`;
      setText(els.msgSr, `${d.sr ?? ""}${title} ${d.line}`);
      stopTyping();
      if (still()) {
        typedLen = fullLine.length;
      } else {
        typedLen = 0;
        typer = every(TYPE_TICK_MS, () => {
          typedLen = Math.min(fullLine.length, typedLen + TYPE_CHARS_PER_TICK);
          renderTyped();
          if (!talking()) {
            stopTyping();
            drawHacker();
          }
        });
      }
    }
    renderTyped();
    renderTutorial();
    drawHacker();
  }

  function renderClock() {
    const now = Date.now();
    let text = "";
    if (state.status === "teaser" && state.opensAt) text = `OPENS IN ${formatClock(state.opensAt - now)}`;
    else if (state.status === "live" && state.closesAt) text = `CLOSES IN ${formatClock(state.closesAt - now)}`;
    else if (state.status === "closed") text = "CLOSED";
    setText(els.clock, text);
    els.clock.hidden = text === "";
  }

  function renderStatus() {
    const badge = STATUS_BADGE[state.status];
    setText(els.badgeText, badge.label);
    els.badge.className = `minigame__badge minigame__badge--${badge.tone}`;

    // Closed looks like the teaser; the clock chip reads "CLOSED", so the badge steps aside.
    const closed = state.status === "closed";
    els.badge.hidden = closed;
    if (closed) stopCelebration();
    renderClock();
  }

  function renderHistory() {
    const spins = state.recentSpins;
    const emptyText: Partial<Record<GameStatus, string>> = {
      teaser: "Your legend begins when the gates open.",
      closed: "The temple sleeps. No spins this round.",
    };
    els.historyPanel.hidden = false;
    setText(els.historyEmpty, spins.length ? "" : (emptyText[state.status] ?? "No legends written yet."));
    els.historyEmpty.hidden = spins.length > 0;
    els.history.replaceChildren(
      ...spins.map((spin) => {
        const item = document.createElement("li");
        const delta = spin.delta;
        const tone = delta > 0 ? "up" : delta < 0 ? "down" : "even";
        item.className = `minigame__chip minigame__chip--${tone}`;
        item.textContent = signedShort(delta);
        item.setAttribute(
          "aria-label",
          `${spin.symbols.map(symbolLabel).join(", ")}: ${spin.outcomeLabel}, wagered ${spin.wager}, ${signedPoints(delta)}`,
        );
        return item;
      }),
    );
  }

  function render() {
    setText(els.balance, formatPoints(state.balance));
    renderStatus();
    renderReels();
    renderControls();
    renderMessage();
    renderHistory();
  }

  // ---- celebration (pop + sparkles)
  function stopCelebration() {
    if (celebrationTimer !== null) cancelAfter(celebrationTimer);
    celebrationTimer = null;
    els.pop.hidden = true;
    els.sparkles.hidden = true;
    root.classList.remove("minigame--jackpot", "minigame--celebrating");
  }

  function celebrate(delta: number, jackpot: boolean) {
    stopCelebration();
    if (delta <= 0) return;
    els.pop.textContent = `+${formatPoints(delta)}`;
    els.pop.classList.toggle("minigame__pop--jackpot", jackpot);
    els.pop.hidden = false;
    els.sparkles.hidden = !jackpot;
    root.classList.toggle("minigame--jackpot", jackpot);
    root.classList.add("minigame--celebrating");
    celebrationTimer = after(CELEBRATION_MS, () => {
      celebrationTimer = null;
      stopCelebration();
    });
  }

  // ---- spin flow
  function startReelAnimation(landed: { count: number }) {
    root.classList.add("minigame--spinning");
    els.reels.setAttribute("aria-busy", "true");
    return every(REEL_TICK_MS, () => {
      sfx.reelTick();
      reelEls.forEach((reelEl, index) => {
        if (index < landed.count) return;
        setReel(reelEl, SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)] ?? "zeus", { label: ". . ." });
      });
    });
  }

  async function landReels(symbols: readonly string[], animated: boolean, landed: { count: number }) {
    for (let index = 0; index < reelEls.length; index += 1) {
      if (animated && index > 0) await wait(REEL_LAND_STAGGER_MS);
      if (disposed) return;
      landed.count = index + 1;
      const reelEl = reelEls[index];
      if (!reelEl) continue;
      if (animated) sfx.reelStop(index);
      setReel(reelEl, symbols[index] ?? "");
      reelEl.classList.add("minigame__reel--landed");
    }
  }

  async function spin() {
    if (spinning || state.status !== "live" || wager > state.balance || Date.now() < cooldownUntil) return;
    finishTutorial();
    spinning = true;
    failure = null;
    stopCelebration();
    clearReelHighlights();
    sfx.lever();
    // What every screen shows until the reels land: the stake taken, nothing more.
    const heldBalance = state.balance - wager;
    setText(els.balance, formatPoints(heldBalance));
    points.hold(heldBalance, ANSWER_WAIT_MS);
    renderControls();
    renderMessage();

    const animated = !reducedMotion?.matches;
    const startedAt = Date.now();
    const landed = { count: 0 };
    const ticker = animated ? startReelAnimation(landed) : null;

    let result: SpinResult;
    try {
      result = await adapter.spin({ spinId: newSpinId(), wager });
    } catch (error) {
      console.error("[minigame] spin failed", error);
      result = { status: "error" };
    }
    // Answer in: hold only as long as the reels can take (also if the player leaves now).
    if (result.status === "ok") points.hold(heldBalance, animated ? REVEAL_MAX_MS : 0);
    else points.release();
    if (disposed) return;

    if (animated) await wait(Math.max(0, SPIN_ANIMATION_MS - (Date.now() - startedAt)));
    if (disposed) return;

    if (result.status === "ok") {
      await landReels(result.symbols, animated, landed);
      if (disposed) return;
      if (ticker !== null) stopInterval(ticker);
      points.release();
      shownSymbols = [...result.symbols];
      const glow = winningReels(result.outcome.id, result.symbols);
      reelEls.forEach((reelEl, index) => reelEl.classList.toggle("minigame__reel--win", glow[index] === true));
      const net = result.payout - result.wager;
      const previous = netHistory;
      netHistory = [{ net }, ...previous].slice(0, NET_HISTORY_LIMIT);
      resultCtx = {
        outcome: result.outcome.id,
        net,
        wager: result.wager,
        reels: [...result.symbols],
        quipIndex: Math.floor(Math.random() * 1000),
        lossStreak: lossRun(netHistory),
        prevLosses: lossRun(previous),
        sr: `${result.symbols.map(symbolLabel).join(", ")}. `,
      };
      celebrate(net, result.outcome.id === "big");
      sfx.result(result.outcome.id, net);
      cooldownUntil = startedAt + SLOT_SPIN_COOLDOWN_MS;
    } else {
      if (ticker !== null) stopInterval(ticker);
      sfx.error();
      failure = {
        title: "HOLD, MORTAL!",
        line: FAILURE_COPY[result.status],
        tone: "coral",
        mood: "sad",
      };
    }
    root.classList.remove("minigame--spinning");
    els.reels.removeAttribute("aria-busy");
    spinning = false;

    state = adapter.getState();
    render();
    const remaining = cooldownUntil - Date.now();
    if (remaining > 0) after(remaining + 20, renderControls);
  }

  // ---- wiring
  renderWagers();
  on(els.wagers, "click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>(".minigame__wager");
    if (!button || button.disabled) return;
    wager = Number(button.dataset.wager);
    sfx.blip();
    renderControls();
    renderMessage();
  });
  on(els.spin, "click", () => {
    void spin();
  });
  on(els.tutNext, "click", () => {
    if (!tutorialActive()) return;
    if (talking()) {
      finishTyping();
      return;
    }
    tutorialStep = Math.min(TUTORIAL_STEPS.length - 1, tutorialStep + 1);
    renderMessage();
  });
  on(els.tutSkip, "click", () => {
    finishTutorial();
    renderMessage();
  });

  // ---- 8-bit sounds: the arcade-wide SOUND ON | OFF switch, unlocked by the first tap
  const sfx = new SlotsSfx();
  cleanups.push(sfx.unlockOn(root));

  function renderSound() {
    const on = gameSoundEnabled();
    els.sound.setAttribute("aria-pressed", String(on));
    els.soundIcon.setAttribute("d", on ? SOUND_ON_ICON_PATH : SOUND_OFF_ICON_PATH);
    setText(els.soundText, on ? "SOUND ON" : "SOUND OFF");
  }

  on(els.sound, "click", () => {
    const next = !gameSoundEnabled();
    setGameSoundEnabled(next);
    if (next) {
      sfx.unlock();
      sfx.hello();
    }
  });
  cleanups.push(subscribeGameSound(renderSound));
  renderSound();

  // ---- optional full screen: the arcade-wide control does the browser work
  const fullscreen = createFullscreenControl(root, { className: "minigame--fullscreen" });
  const displayOptions = Array.from(els.display.querySelectorAll<HTMLElement>("[data-display]"));

  function renderFullscreen() {
    const { offered, active } = fullscreen.getState();
    els.display.hidden = !offered && !active;
    for (const option of displayOptions) {
      option.setAttribute("aria-pressed", String((option.dataset.display === "full") === active));
    }
  }

  on(els.display, "click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const option = target?.closest<HTMLElement>("[data-display]");
    if (!option) return;
    if (option.dataset.display === "full") fullscreen.enter();
    else fullscreen.exit();
  });
  const stopFullscreen = fullscreen.subscribe(renderFullscreen);
  renderFullscreen();

  if (!still()) {
    every(HACKER_FRAME_MS, () => {
      hackerTick += 1;
      drawHacker();
    });
  }

  const unsubscribe = adapter.subscribe((next) => {
    const statusChanged = next.status !== state.status;
    state = next;
    if (statusChanged) {
      failure = null;
      resultCtx = null;
    }
    // While reels spin, hold the balance at "wager deducted" so the result isn't spoiled early;
    // the full render after the reels land shows the real balance.
    if (!spinning) render();
  });
  every(1000, renderClock);
  render();

  return function unmount() {
    if (disposed) return;
    disposed = true;
    for (const id of timeouts) clearTimeout(id);
    for (const id of intervals) clearInterval(id);
    timeouts.clear();
    intervals.clear();
    for (const cleanup of cleanups.splice(0)) cleanup();
    unsubscribe();
    stopFullscreen();
    fullscreen.dispose();
    sfx.dispose();
    root.remove();
    releaseStylesheet();
    mountedElements.delete(el);
  };
}
