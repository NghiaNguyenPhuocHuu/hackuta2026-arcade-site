/**
 * Olympus 21: a mountable 2–4 player card game SPA (plain browser ESM) in
 * the same 16-bit look as Olympus Slots.
 *
 *   const unmount = mountOlympus21(el, { adapter, view: "auto" });
 *
 * An adapter with getStatus() (the Convex one, CONTRACT §9) gets a status lobby while you are
 * not seated: sign in / not eligible / not checked in / no table (next opening) / closed / live.
 *   ...
 *   unmount();   // removes DOM, stylesheet, timers, listeners, observers
 *
 * Two layouts: the table (laptop: felt, seats, count, side panel, plus a
 * collapsible hand tray so the laptop alone is playable) and the hand
 * (phone: count, top card, your cards, one big button). The adapter is the
 * source of truth; the SPA never decides legality or previews.
 */
import { hackerFrame, HACKER_FRAME_MS } from "../olympus-slots/hacker";
import olympus21Css from "./olympus21.css?inline";
import { renderCard } from "./art.js";
import { eventLine, stateLine, EVENT_MS, TUTORIAL_OVER_LINE } from "./dialogue.js";
import { autoPlayDecision, createTutorial, readSeen } from "./tutorial.js";
import {
  COLOR_INFO,
  PHASE_MS,
  arrangeSeats,
  cardLabel,
  cardShort,
  clampBet,
  colorCounts,
  fanStep,
  formatClock,
  handScreen,
  matchCaption,
  maxSeq,
  potLayers,
  previewPhrase,
  readyRows,
  previewTag,
  remainingMs,
  resultRows,
  resultTitle,
  seatStatus,
  signed,
  tableBadge,
  unseenMoves,
  winIfHit21,
} from "./viewModel.js";

const NARROW_PX = 720;
const TIMER_TICK_MS = 100;
const TYPE_TICK_MS = 30;
const TYPE_CHARS_PER_TICK = 2;
const HURRY_MS = 5000;
const BUSY_FALLBACK_MS = 4000;
const QUICK_BETS = [10, 25, 50];
const CARD_W2 = 96;

const ERROR_COPY = {
  TABLE_FULL: "This table is full.",
  ALREADY_SEATED: "You're already seated.",
  TABLE_CLOSED: "The table is closed.",
  NOT_SEATED: "You're not seated.",
  WAGERS_CLOSED: "Bets are closed for this round.",
  BET_TOO_SMALL: "That bet is below the minimum.",
  BET_TOO_BIG: "That bet is more than you can risk.",
  NOT_YOUR_TURN: "It's not your turn anymore.",
  NOT_IN_HAND: "That card isn't in your hand anymore.",
  DOESNT_MATCH: "That card doesn't match.",
  PICK_A_COLOR: "Pick a color for the Wild.",
  MUST_PLAY: "A card fits, so you can't draw.",
  NETWORK: "Connection hiccup. Try again.",
  NO_READY: "This table can't take PLAY AGAIN yet.",
  TIMEOUT: "The table didn't answer. Try again.",
  NOT_SIGNED_IN: "Sign in first.",
  NOT_PARTICIPANT: "This account isn't a HackUTA hacker.",
  NOT_ELIGIBLE: "This account can't play.",
  NOT_CHECKED_IN: "Check in at the event first.",
  NO_WINDOW: "No table is open right now.",
  ARCADE_CLOSED: "The arcade is closed right now.",
  GAME_DISABLED: "Organizers paused Olympus 21.",
  INSUFFICIENT_POINTS: "You don't have enough points for that.",
  NO_BOTS: "Real tables don't have bots.",
};

const mountedElements = new WeakSet();
let stylesheetRefs = 0;
let stylesheetLink = null;
let instanceCount = 0;

function acquireStylesheet() {
  stylesheetRefs += 1;
  if (stylesheetRefs === 1) {
    stylesheetLink = document.createElement("style");
    stylesheetLink.textContent = olympus21Css;
    stylesheetLink.dataset.olympus21Stylesheet = "";
    document.head.appendChild(stylesheetLink);
  }
}

function releaseStylesheet() {
  stylesheetRefs = Math.max(0, stylesheetRefs - 1);
  if (stylesheetRefs === 0 && stylesheetLink) {
    stylesheetLink.remove();
    stylesheetLink = null;
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function cardCanvas(code, { cls = "", label = null } = {}) {
  const aria = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<canvas class="o21__px ${cls}" data-card="${esc(code)}" width="48" height="68" ${aria}></canvas>`;
}

/** Deterministic pixel stars, like the slots backdrop. */
const STARS = (() => {
  let seed = 21;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 40 }, () => ({ x: (rnd() * 99).toFixed(2), y: (rnd() * 99).toFixed(2), big: rnd() > 0.8, gold: rnd() > 0.7 }));
})();

function template(uid) {
  const stars = STARS.map((s) => `<span class="o21__star${s.big ? " o21__star--big" : ""}${s.gold ? " o21__star--gold" : ""}" style="left:${s.x}%;top:${s.y}%"></span>`).join("");
  const pips = Array.from({ length: 21 }, (_, i) => `<i${i === 20 ? ' class="goal"' : ""}></i>`).join("");
  return `
    <div class="o21__stars" aria-hidden="true">${stars}</div>
    <header class="o21__head">
      <div class="o21__brand">
        <h2 class="o21__title">OLYMPUS 21</h2>
        <p class="o21__tag">Land the count on 21. Not 22.</p>
      </div>
      <div class="o21__badges" data-ref="badges"></div>
    </header>
    <div class="o21__body">
      <div class="o21__left">
        <section class="o21__felt" data-ref="felt" aria-label="Table">
          <div class="o21__slot" style="grid-area:s1" data-ref="s1"></div>
          <div class="o21__slot" style="grid-area:s2" data-ref="s2"></div>
          <div class="o21__slot" style="grid-area:s3" data-ref="s3"></div>
          <div class="o21__slot" style="grid-area:s4" data-ref="s4"></div>
          <div class="o21__mid" style="grid-area:mid">
            <div class="o21__count" aria-hidden="true"><span data-count-num>0</span><small> / 21</small></div>
            <div class="o21__meter" data-ref="meter" role="img" aria-label="Count 0 of 21">${pips}</div>
            <div class="o21__pilerow">
              <div class="o21__top" data-ref="top"></div>
              <div class="o21__top" data-ref="pile"></div>
              <div class="o21__top" data-ref="dir"></div>
            </div>
            <div class="o21__sparkles" data-ref="sparkles" aria-hidden="true"></div>
          </div>
          <p class="o21__banner" data-ref="banner" aria-hidden="true" hidden></p>
        </section>
        <div class="o21__ticker" data-ref="ticker" aria-label="Recent moves"></div>
        <div class="o21__dslot" data-slot="dialog-table"></div>
      </div>
      <aside class="o21__panel" data-ref="panel" aria-label="Bets and pots"></aside>
    </div>
    <div class="o21__hist" data-ref="hist"></div>
    <section class="o21__tray" data-ref="tray" aria-label="Your hand">
      <div class="o21__tray-head">
        <button type="button" class="o21__tray-toggle" data-act="tray" aria-expanded="true" aria-controls="o21-tray-${uid}">
          <span>YOUR HAND</span><span class="o21__tray-caret" aria-hidden="true"></span>
        </button>
        <span class="o21__keys" aria-hidden="true">LEFT/RIGHT CHOOSE · ENTER PLAY · D DRAW</span>
      </div>
      <div class="o21__tray-body" id="o21-tray-${uid}" data-slot="hand-table"></div>
    </section>
    <section class="o21__phone" aria-label="Your hand">
      <div class="o21__phead" data-ref="phead"></div>
      <div class="o21__pseats" data-ref="pseats"></div>
      <div class="o21__strip" data-ref="pstrip"></div>
      <div class="o21__hslot" data-slot="hand-phone"></div>
      <div class="o21__dslot" data-slot="dialog-phone"></div>
      <div class="o21__pfoot" data-ref="pfoot"></div>
    </section>
    <div class="o21__hand" data-ref="hand"></div>
    <div class="o21__dlg" data-ref="dialog">
      <span class="o21__nametag" aria-hidden="true">TECHNO</span>
      <span class="o21__port" aria-hidden="true"><span class="o21__hacker" data-ref="hacker"></span></span>
      <div class="o21__dlg-body">
        <p class="o21__sr" role="status" aria-live="polite" aria-atomic="true" data-ref="msg-sr"></p>
        <p class="o21__dlg-t" data-ref="msg-title" aria-hidden="true"></p>
        <p class="o21__dlg-l" data-ref="msg-line" aria-hidden="true"></p>
      </div>
    </div>
    <div class="o21__fly" data-ref="fly" aria-hidden="true"></div>
  `;
}

/**
 * Mount Olympus 21 into `el`.
 * @param {HTMLElement} el
 * @param {{ adapter: object, view?: "auto"|"table"|"hand" }} options
 * @returns {() => void} unmount
 */
export function mountOlympus21(el, options = {}) {
  if (!(el instanceof HTMLElement)) throw new TypeError("mountOlympus21: a host element is required");
  if (mountedElements.has(el)) throw new Error("mountOlympus21: this element already has a mounted game");
  const adapter = options.adapter;
  if (!adapter || typeof adapter.getState !== "function" || typeof adapter.subscribe !== "function" || typeof adapter.getStatus !== "function") {
    throw new TypeError("mountOlympus21: the live Convex adapter is required");
  }
  mountedElements.add(el);

  const viewOption = ["table", "hand", "auto"].includes(options.view) ? options.view : "auto";
  const timeouts = new Set();
  const intervals = new Set();
  const cleanups = [];
  let disposed = false;

  acquireStylesheet();
  instanceCount += 1;
  const uid = instanceCount;
  const root = document.createElement("div");
  root.className = "o21";
  root.innerHTML = template(uid);
  el.appendChild(root);

  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const slot = (name) => root.querySelector(`[data-slot="${name}"]`);
  const els = {
    badges: ref("badges"),
    felt: ref("felt"),
    seats: { s1: ref("s1"), s2: ref("s2"), s3: ref("s3"), s4: ref("s4") },
    meter: ref("meter"),
    pips: Array.from(ref("meter").children),
    top: ref("top"),
    pile: ref("pile"),
    dir: ref("dir"),
    sparkles: ref("sparkles"),
    banner: ref("banner"),
    ticker: ref("ticker"),
    panel: ref("panel"),
    hist: ref("hist"),
    tray: ref("tray"),
    trayToggle: root.querySelector('[data-act="tray"]'),
    phead: ref("phead"),
    pseats: ref("pseats"),
    pstrip: ref("pstrip"),
    pfoot: ref("pfoot"),
    hand: ref("hand"),
    dialog: ref("dialog"),
    hacker: ref("hacker"),
    msgTitle: ref("msg-title"),
    msgLine: ref("msg-line"),
    msgSr: ref("msg-sr"),
    fly: ref("fly"),
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const still = () => Boolean(reducedMotion?.matches);

  // ---- state
  let view = null;
  let receivedAt = performance.now();
  let mode = viewOption === "auto" ? "table" : viewOption;
  let screen = "connecting";
  let selected = null; // index into me.hand
  let picking = false; // wild color picker open
  let busy = false;
  let busyMark = "";
  let busyTimer = null;
  let betDraft = null;
  let betRound = -1;
  let trayOpen = true;
  let joining = false;
  let confirmLeave = false;
  let errorText = "";
  let errorTimer = null;
  let lastSeq = -1;
  let event = null; // { move, until }
  let lastDeadline = null;
  let phaseTotal = 0;
  let countShown = 0;
  let countTimer = null;
  let countDelay = null; // pending delayed start of a count roll (after a bust flash)
  let flashUntil = 0;
  let winUntil = 0;
  let lastHandKey = "";
  let notice = null; // { title, line, mood, tone, until }: a one-off Techno line (tutorial closed on my turn)
  let wasMyTurn = false;
  const seenTables = new Set(); // tutorial seen this session (covers blocked localStorage)

  // Dialogue/typewriter/Techno state.
  let dialogueKey = "";
  let fullLine = "";
  let typedLen = 0;
  let typer = null;
  let mood = "idle";
  let hackerTick = 0;
  let lastHackerSvg = "";

  // ---- tracked timers and listeners
  function after(ms, fn) {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (!disposed) fn();
    }, ms);
    timeouts.add(id);
    return id;
  }
  function cancelAfter(id) {
    if (id === null || id === undefined) return;
    clearTimeout(id);
    timeouts.delete(id);
  }
  function every(ms, fn) {
    const id = setInterval(() => {
      if (!disposed) fn();
    }, ms);
    intervals.add(id);
    return id;
  }
  function stopInterval(id) {
    if (id === null || id === undefined) return;
    clearInterval(id);
    intervals.delete(id);
  }
  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  }

  /** Replace innerHTML only when the markup changed; keeps focus by data-focus key; draws new canvases. */
  const lastHtml = new WeakMap();
  function patch(node, html) {
    if (!node || lastHtml.get(node) === html) return false;
    const active = document.activeElement;
    const focusKey = active && node.contains(active) ? active.getAttribute("data-focus") : null;
    node.innerHTML = html;
    lastHtml.set(node, html);
    drawCanvases(node);
    if (focusKey) node.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    return true;
  }
  function drawCanvases(node) {
    for (const cv of node.querySelectorAll("canvas[data-card]")) {
      try {
        renderCard(cv, cv.dataset.card);
      } catch (err) {
        console.error(err);
      }
    }
  }
  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  // ---- layout mode
  function applyMode() {
    let next = viewOption;
    if (viewOption === "auto") next = (el.clientWidth || window.innerWidth) < NARROW_PX ? "hand" : "table";
    const changed = next !== mode || !root.classList.contains(`o21--${next}`);
    mode = next;
    root.classList.toggle("o21--table", mode === "table");
    root.classList.toggle("o21--hand", mode === "hand");
    const handSlot = slot(mode === "table" ? "hand-table" : "hand-phone");
    const dialogSlot = slot(mode === "table" ? "dialog-table" : "dialog-phone");
    if (els.hand.parentNode !== handSlot) handSlot.appendChild(els.hand);
    if (els.dialog.parentNode !== dialogSlot) dialogSlot.appendChild(els.dialog);
    els.dialog.classList.toggle("o21__dlg--sm", mode === "hand");
    return changed;
  }

  // ---- derived values
  const me = () => view?.me ?? null;
  const remaining = () => remainingMs(view, receivedAt, performance.now());
  const seatName = (seat) => view?.seats.find((s) => s.seat === seat)?.name ?? `Seat ${seat + 1}`;

  // ---- rendering: header
  function renderHeader() {
    const badge = screen === "status" ? statusBadge() : tableBadge(view);
    const m = me();
    let html = `<span class="o21__badge o21__badge--${badge.tone}"><span class="o21__dot" aria-hidden="true"></span>${esc(badge.text)}</span>`;
    if (m) html += `<span class="o21__badge o21__badge--dim">BALANCE ${m.balance}</span>`;
    else if (screen === "status" && backendStatus()?.player?.checkedIn) html += `<span class="o21__badge o21__badge--dim">BALANCE ${backendStatus().player.balance}</span>`;
    html += `<span class="o21__badge o21__badge--dim">HAND: TRAY BELOW</span>`;
    html += howtoButton();
    patch(els.badges, html);
  }

  function howtoButton(cls = "") {
    return `<button type="button" class="o21__howto ${cls}" data-act="howto" data-focus="howto${cls ? "-sm" : ""}" aria-haspopup="dialog">? HOW TO PLAY</button>`;
  }

  /** PLAY AGAIN is offered only when the adapter has ready() (older adapters: no button). */
  const canReady = () => typeof adapter.ready === "function";
  // The live server's lobby state (window, account, queue, last result) while not seated.
  const backendStatus = () => adapter.getStatus();
  const statusClock = () => (typeof adapter.serverNow === "function" ? adapter.serverNow() : Date.now());

  // ---- rendering: felt
  function seatHtml(s) {
    const st = seatStatus(view, s);
    const turn = view.status === "turns" && view.turnSeat === s.seat;
    const cls = ["o21__seat", turn ? "is-turn" : "", s.isMe ? "is-you" : "", s.state === "bust" || s.state === "folded" || s.state === "sitting_out" ? "is-out" : "", s.state === "won" ? "is-won" : ""].join(" ");
    const backs = Math.min(10, s.cardCount);
    const readyPhase = (view.status === "settled" || view.status === "waiting") && typeof s.ready === "boolean";
    const chip = readyPhase
      ? s.ready
        ? `<span class="o21__chip o21__chip--ok">READY ✓</span>`
        : `<span class="o21__chip o21__chip--dim">…</span>`
      : typeof s.wager === "number"
        ? `<span class="o21__chip">BET ${s.wager}</span>`
        : `<span class="o21__chip o21__chip--dim">${view.status === "wagering" ? "…" : "—"}</span>`;
    const name = `${s.name}${s.isMe ? " · YOU" : ""}`;
    return `<div class="${cls}" data-seat="${s.seat}">
      <div class="o21__row"><span class="o21__nm">${esc(name.toUpperCase())}</span>${chip}</div>
      <div class="o21__backs" role="img" aria-label="${s.cardCount} cards">${"<i></i>".repeat(backs)}<b>${s.cardCount}</b></div>
      <div class="o21__row"><span class="o21__st ${st.tone}">${esc(st.text)}</span>${turn ? `<span class="o21__sn" data-timer="clock"></span>` : ""}</div>
      ${turn ? `<div class="o21__bar"><i data-timer="bar"></i></div>` : ""}
    </div>`;
  }

  function renderFelt() {
    const placed = view ? arrangeSeats(view.seats, me()?.seat, view.maxSeats) : [];
    const byArea = new Map(placed.map((p) => [p.area, p.seat]));
    for (const area of ["s1", "s2", "s3", "s4"]) {
      const s = byArea.get(area);
      patch(els.seats[area], s ? seatHtml(s) : view && view.seats.length < view.maxSeats && ["waiting", "wagering"].includes(view.status) ? `<div class="o21__seat o21__seat--open">OPEN SEAT</div>` : "");
    }
    const top = view?.topCard;
    const ring = COLOR_INFO[view?.activeColor]?.hex ?? "#8ca1aa";
    patch(
      els.top,
      top
        ? `<span class="o21__topcard" style="--ring:${ring}">${cardCanvas(top, { cls: "o21__x2", label: `Top card ${cardLabel(top)}` })}</span><span class="o21__sn">${esc(matchCaption(top, view.activeColor))}</span>`
        : `<span class="o21__topcard o21__topcard--empty"></span><span class="o21__sn">NO CARD YET</span>`,
    );
    const left = view?.drawLeft ?? 0;
    patch(
      els.pile,
      `<span class="o21__pile">${left > 0 ? cardCanvas("BACK", { cls: "o21__pc1" }) + cardCanvas("BACK", { cls: "o21__pc2" }) + cardCanvas("BACK", { cls: "o21__pc3", label: `Draw pile, ${left} cards` }) : ""}</span><span class="o21__sn">${left} LEFT</span>`,
    );
    const dir = view?.direction === -1 ? -1 : 1;
    patch(els.dir, `<span class="o21__dir${dir === -1 ? " is-rev" : ""}" role="img" aria-label="Play goes ${dir === 1 ? "clockwise" : "counter-clockwise"}">${dir === 1 ? "↻" : "↺"}</span><span class="o21__sn">ORDER</span>`);
    els.meter.setAttribute("aria-label", `Count ${view?.count ?? 0} of 21`);
  }

  function renderTicker() {
    const moves = (view?.lastMoves ?? []).slice(-5).reverse();
    const html = moves.length
      ? moves
          .map((m, i) => {
            const text = String(m.text ?? "");
            const body = m.name && text.startsWith(m.name) ? `<b>${esc(m.name.toUpperCase())}</b>${esc(text.slice(m.name.length))}` : esc(text);
            return `${i ? '<span class="o21__tk" aria-hidden="true">·</span>' : ""}<span class="o21__tk${i === 0 ? " is-new" : ""}">${body}</span>`;
          })
          .join("")
      : `<span class="o21__tk">No moves yet.</span>`;
    patch(els.ticker, html);
  }

  function leaveHtml() {
    const m = me();
    if (!m) return "";
    if (confirmLeave) {
      return `<div class="o21__confirm" role="group" aria-label="Confirm leaving">
        <p class="o21__sub">Leave mid-round? Your bet stays in the pot and is lost.</p>
        <div class="o21__2"><button type="button" class="o21__btn o21__btn--sm o21__btn--red" data-act="leave-yes" data-focus="leave-yes">LEAVE</button><button type="button" class="o21__btn o21__btn--sm o21__btn--blue" data-act="leave-no" data-focus="leave-no">STAY</button></div>
      </div>`;
    }
    return `<button type="button" class="o21__leave" data-act="leave" data-focus="leave">LEAVE TABLE</button>`;
  }

  function renderPanel() {
    const m = me();
    const layers = potLayers(view);
    let html = `<div class="o21__box"><p class="o21__lbl">IN PLAY</p><p class="o21__big">${view?.pot ?? 0} <span class="o21__unit">pts</span></p>`;
    if (layers.length) {
      html += `<ul class="o21__layers">${layers.map((l) => `<li class="${l.mine ? "is-mine" : ""}"><span>${l.each} × ${l.count} · ${esc(l.who)}</span><span>${l.amount}</span></li>`).join("")}</ul>`;
    } else {
      html += `<p class="o21__sub">${view?.status === "wagering" ? "Bets are being placed." : "Pots form when bets lock."}</p>`;
    }
    html += `</div>`;
    if (m) {
      const win = winIfHit21(view);
      const bet = typeof m.wager === "number" ? m.wager : null;
      const settledDelta = view.result ? view.result.deltas[m.seat] : undefined;
      const sub = typeof settledDelta === "number" ? `This round: ${signed(settledDelta)}.` : bet == null ? "No bet yet this round." : view.pots.length ? `Hit 21 now and you win +${win}.` : `Win up to ${bet} from each player.`;
      html += `<div class="o21__box"><p class="o21__lbl">YOUR BET</p><p class="o21__big">${bet ?? "—"}</p><p class="o21__sub">${esc(sub)}</p></div>`;
    }
    html += leaveHtml();
    patch(els.panel, html);
  }

  const REASON_SHORT = { 21: "21", last: "LAST", cap: "SPLIT", closed: "CLOSED" };
  function renderHistory() {
    const rows = (me()?.history ?? []).slice().reverse();
    const html = `<p class="o21__lbl">LAST ROUNDS</p>${
      rows.length
        ? rows.map((h) => `<span class="o21__hc ${h.delta > 0 ? "is-w" : h.delta < 0 ? "is-l" : ""}">R${h.roundNo} ${esc(REASON_SHORT[h.reason] ?? String(h.reason ?? "").toUpperCase())} ${signed(h.delta)}</span>`).join("")
        : `<span class="o21__sub">Your rounds will show here.</span>`
    }`;
    patch(els.hist, html);
  }

  // ---- rendering: the hand panel (tray on the table, main area on the phone)
  function othersBets() {
    const rows = view.seats.filter((s) => !s.isMe);
    if (!rows.length) return "";
    return `<ul class="o21__bets">${rows
      .map((s) => `<li><span>${esc(s.name)}</span>${s.state === "sitting_out" ? "<em>sitting out</em>" : typeof s.wager === "number" ? `<b>${s.wager}</b>` : "<em>picking…</em>"}</li>`)
      .join("")}</ul>`;
  }

  function errorHtml() {
    return errorText ? `<p class="o21__err" role="alert">${esc(errorText)}</p>` : "";
  }

  function betHtml() {
    const m = me();
    const max = m.maxWager;
    const min = view.minWager;
    if (betRound !== view.roundNo || betDraft === null) {
      betRound = view.roundNo;
      betDraft = clampBet(m.picked && typeof m.wager === "number" ? m.wager : 25, min, max);
    }
    betDraft = clampBet(betDraft, min, max);
    const chips = [...QUICK_BETS.map((v) => ({ v, label: String(v) })), { v: max, label: "MAX" }]
      .map(({ v, label }) => `<button type="button" class="o21__btn o21__btn--sm ${betDraft === v ? "" : "o21__btn--blue"}" data-act="chip" data-amt="${v}" data-focus="chip-${label}" aria-pressed="${betDraft === v}" ${v > max || v < min ? "disabled" : ""}>${label}</button>`)
      .join("");
    const placed = m.picked && m.wager === betDraft;
    const why = max < m.balance ? "loss cap" : "balance";
    return `<div class="o21__screen o21__bet">
      <div class="o21__shead"><span class="o21__h">PLACE YOUR BET</span><span class="o21__badge o21__badge--dim">R${view.roundNo}</span></div>
      <div class="o21__ring" data-timer="ring" role="timer" aria-label="Bet window"><b data-timer="secs"></b></div>
      <div class="o21__step">
        <button type="button" class="o21__btn o21__btn--sm o21__btn--blue" data-act="step" data-d="-5" data-focus="step-down" aria-label="Lower bet by 5" ${betDraft <= min ? "disabled" : ""}>-</button>
        <output class="o21__stepval" aria-live="polite">${betDraft}</output>
        <button type="button" class="o21__btn o21__btn--sm o21__btn--blue" data-act="step" data-d="5" data-focus="step-up" aria-label="Raise bet by 5" ${betDraft >= max ? "disabled" : ""}>+</button>
      </div>
      <div class="o21__4">${chips}</div>
      <p class="o21__sub o21__c">Win up to ${betDraft} from each player. Max ${max} (${why}).</p>
      ${othersBets()}
      <button type="button" class="o21__btn ${placed ? "o21__btn--ok" : ""}" data-act="bet" data-focus="bet" ${busy ? "disabled" : ""}>${busy ? "…" : placed ? `BET IN: ${betDraft} ✓` : m.picked ? `CHANGE BET TO ${betDraft}` : `BET ${betDraft}`}</button>
      ${errorHtml()}
    </div>`;
  }

  function fanHtml(kind) {
    const m = me();
    const items = m.hand
      .map((h, i) => {
        const live = kind === "turn" && h.playable;
        const off = kind === "turn" || kind === "draw" ? !h.playable : kind === "out";
        const sel = live && selected === i;
        const tag = kind === "turn" && h.playable ? previewTag(h.after, view.count) : null;
        const phrase = kind === "turn" ? (h.playable ? previewPhrase(h.after, view.count) : "can't play") : "";
        const label = `${cardLabel(h.card)}${phrase ? `, ${phrase}` : ""}`;
        const tabbable = live && (selected === i || (selected === null && m.hand.findIndex((x) => x.playable) === i));
        return `<button type="button" class="o21__fc${sel ? " is-sel" : ""}${off ? " is-off" : ""}" data-act="card" data-i="${i}" data-focus="card-${i}" aria-label="${esc(label)}" ${kind === "turn" ? `aria-pressed="${sel}"` : ""} ${live ? "" : 'aria-disabled="true"'} tabindex="${tabbable ? 0 : -1}">${
          tag ? `<span class="o21__pv ${tag.tone}" aria-hidden="true">${esc(tag.text)}</span>` : ""
        }${cardCanvas(h.card, { cls: "o21__x2" })}</button>`;
      })
      .join("");
    return `<div class="o21__fan${kind === "turn" ? " has-tags" : ""}" data-ref="fan" role="group" aria-label="Your cards">${items || '<p class="o21__sub">No cards.</p>'}</div>`;
  }

  function turnHtml() {
    const m = me();
    const h = selected !== null ? m.hand[selected] : null;
    let label = "TAP A CARD";
    if (busy) label = "…";
    else if (h && h.card === "W") label = "PLAY WILD · PICK COLOR";
    else if (h) {
      const tag = previewTag(h.after, view.count);
      label = `PLAY ${cardShort(h.card)}${tag ? ` → ${tag.text}` : ""}`;
    }
    return `<div class="o21__screen o21__turn">
      ${fanHtml("turn")}
      <button type="button" class="o21__btn o21__btn--play" data-act="play" data-focus="play" ${!h || busy ? "disabled" : ""}>${esc(label)}</button>
      <p class="o21__sub o21__c">Tap a card, then PLAY. Grey cards don't match.</p>
      ${errorHtml()}
    </div>`;
  }

  function drawHtml() {
    const color = COLOR_INFO[view.activeColor]?.name?.toLowerCase() ?? "the color";
    const rank = view.topCard && view.topCard !== "W" ? view.topCard.slice(1) : null;
    return `<div class="o21__screen o21__turn">
      ${fanHtml("draw")}
      <button type="button" class="o21__btn o21__btn--blue o21__btn--play" data-act="draw" data-focus="draw" ${busy ? "disabled" : ""}>${busy ? "…" : "DRAW A CARD"}</button>
      <p class="o21__sub o21__c">Nothing matches ${esc(color)}${rank ? ` or ${esc(rank === "S" ? "Skip" : rank === "R" ? "Reverse" : rank)}` : ""}. Drawing ends your turn.</p>
      ${errorHtml()}
    </div>`;
  }

  function wildHtml() {
    const counts = colorCounts(me().hand);
    const hold = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([c, n]) => `${n} ${COLOR_INFO[c].label.toLowerCase()}`)
      .join(" · ");
    const btns = ["R", "B", "G", "Y"]
      .map((c) => `<button type="button" class="o21__col o21__col--${c}" data-act="color" data-c="${c}" data-focus="color-${c}" ${busy ? "disabled" : ""}>${COLOR_INFO[c].god}<br>${COLOR_INFO[c].name}</button>`)
      .join("");
    return `<div class="o21__screen o21__wild">
      <p class="o21__h o21__c">PICK A COLOR</p>
      <p class="o21__sub o21__c">Odysseus adds 0. The next player must match the color you choose.</p>
      <div class="o21__2">${btns}</div>
      <p class="o21__sub o21__c">${hold ? `You hold: ${esc(hold)}` : "You hold no colored cards."}</p>
      <button type="button" class="o21__btn o21__btn--sm o21__btn--blue" data-act="wild-back" data-focus="wild-back" ${busy ? "disabled" : ""}>BACK</button>
      ${errorHtml()}
    </div>`;
  }

  function watchHtml() {
    const m = me();
    const mine = view.seats.find((s) => s.seat === m.seat);
    const out = mine && mine.state !== "playing";
    const label = out ? (mine.state === "bust" ? "OUT THIS ROUND" : mine.state === "won" ? "YOU WON" : "OUT THIS ROUND") : `WAITING FOR ${seatName(view.turnSeat).toUpperCase()}`;
    return `<div class="o21__screen o21__turn">
      ${fanHtml(out ? "out" : "watch")}
      <button type="button" class="o21__btn o21__btn--off o21__btn--play" disabled>${esc(label)}</button>
      <p class="o21__sub o21__c">${out ? "Your bet still rides on who's left." : "Plan ahead: the count may change before you play."}</p>
    </div>`;
  }

  function resultHtml() {
    const m = me();
    const r = view.result;
    const delta = r && m ? r.deltas[m.seat] ?? 0 : m?.seat != null ? view.seats.find((s) => s.isMe)?.pointsDelta ?? 0 : 0;
    const rows = resultRows(view);
    const mine = r && m ? r.winners.includes(m.seat) : false;
    return `<div class="o21__screen o21__result">
      <p class="o21__h o21__c ${mine ? "is-win" : delta < 0 ? "is-loss" : ""}">${esc(resultTitle(view) || "ROUND OVER")}</p>
      <p class="o21__net o21__c ${delta > 0 ? "is-win" : delta < 0 ? "is-loss" : ""}">${signed(delta)}</p>
      ${rows.length ? `<ul class="o21__res">${rows.map((row) => `<li><span>${esc(row.name)}${row.winner ? " ★" : ""}</span><b class="${row.delta > 0 ? "is-win" : row.delta < 0 ? "is-loss" : ""}">${signed(row.delta)}</b></li>`).join("")}</ul>` : ""}
      <p class="o21__sub o21__c">Balance ${m?.balance ?? 0}.</p>
      ${view.status === "settled" ? againHtml() : ""}
      ${errorHtml()}
    </div>`;
  }

  /** READY list from Seat.ready (✓ ready / … waiting). */
  function readyListHtml() {
    const rows = readyRows(view);
    if (!rows.length) return "";
    return `<ul class="o21__ready" aria-label="Who's playing again">${rows
      .map((r) => `<li class="${r.ready ? "is-ready" : ""}"><span>${esc(r.name)}${r.isMe ? " (you)" : ""}</span>${r.ready ? "<b>✓ READY</b>" : "<em>… waiting</em>"}</li>`)
      .join("")}</ul>`;
  }

  /** The PLAY AGAIN block: big button with the 15 s bar, then the READY list. */
  function againHtml({ paused = false } = {}) {
    const m = me();
    const timed = !paused && typeof view.deadline === "number";
    if (!canReady() || !m || typeof m.ready !== "boolean") {
      return timed ? `<p class="o21__btn o21__btn--off o21__c" role="timer">NEXT BET IN <span data-timer="secs"></span></p>` : "";
    }
    const bar = timed ? `<span class="o21__againbar" aria-hidden="true"><i data-timer="bar"></i></span>` : "";
    const btn = m.ready
      ? `<button type="button" class="o21__btn o21__btn--again o21__btn--ok" data-focus="again" disabled><span>READY ✓, WAITING FOR OTHERS</span>${bar}</button>`
      : `<button type="button" class="o21__btn o21__btn--again" data-act="again" data-focus="again" ${busy ? "disabled" : ""}><span>${busy ? "…" : "PLAY AGAIN"}</span>${bar}</button>`;
    const clock = timed ? `<p class="o21__sub o21__c" role="timer">Next round in <span data-timer="secs"></span> s</p>` : "";
    return `${btn}${clock}${readyListHtml()}`;
  }

  function dealInHtml() {
    const ok = canReady();
    return `<div class="o21__screen o21__dealin">
      <p class="o21__h o21__c">YOU'RE SITTING THIS ROUND OUT</p>
      <p class="o21__sub o21__c">The table plays on without you. ${ok ? "Tap below and you're dealt into the next round." : "You'll be dealt in at the next round."}</p>
      ${ok ? `<button type="button" class="o21__btn o21__btn--again" data-act="again" data-focus="again" ${busy ? "disabled" : ""}><span>${busy ? "…" : "DEAL ME IN"}</span></button>` : ""}
      ${errorHtml()}
    </div>`;
  }

  // ---- real backend (CONTRACT §9): lobby states from adapter.getStatus() while not seated
  function statusBadge() {
    const st = backendStatus();
    if (!st) return { text: "CONNECTING…", tone: "dim" };
    return st.status === "live" ? { text: "TABLES OPEN", tone: "live" } : st.status === "teaser" ? { text: "OPENS SOON", tone: "idle" } : { text: "NO TABLE", tone: "dim" };
  }

  function clockTime(ms) {
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  }

  /** { title, sub, live } for the status lobby, or null while the first answer is on its way. */
  function statusCopy() {
    const st = backendStatus();
    if (!st) return null;
    if (st.unavailable) return { title: "TABLES UNAVAILABLE", sub: "Olympus 21 can't reach its tables on the server right now. Try again in a little while." };
    const p = st.player;
    if (st.leaving) return { title: "LEAVING THE TABLE", sub: "Your bet stays in this round. Your chips come back to your arcade wallet when it ends." };
    if (st.queue) {
      const others = Math.max(0, st.queue.waiting - 1);
      return {
        title: "FINDING YOUR TABLE",
        sub: others
          ? `${others} other hacker${others === 1 ? " is" : "s are"} waiting. The Fates seat you together in a moment.`
          : "You're first in line. The Fates seat you as soon as another hacker joins.",
        queued: true,
      };
    }
    if (!p.signedIn) return { title: "SIGN IN TO PLAY", sub: "Sign in with your HackUTA account to take a seat." };
    if (!p.eligible) return { title: "NOT ELIGIBLE", sub: "This account isn't an accepted hacker, so it can't play." };
    if (!p.checkedIn) return { title: "NOT CHECKED IN", sub: "Check in at the event first. Your points start when you check in, then come back here." };
    if (st.status === "live") {
      return {
        title: "TAKE A SEAT",
        sub: `Buy in for ${st.buyIn} arcade points; they become your chips. You're matched with 1–3 other hackers. Your chips go back to your wallet when you leave.`,
        live: true,
      };
    }
    if (st.status === "closed") return { title: "TABLES CLOSED", sub: "Organizers have paused Olympus 21. Watch for it to reopen." };
    if (st.status === "teaser" && st.window) return { title: "NO TABLE OPEN RIGHT NOW", sub: `Tables open at ${clockTime(st.window.opensAt)}.`, opensAt: st.window.opensAt };
    return { title: "NO TABLE OPEN RIGHT NOW", sub: "Watch for the next play window." };
  }

  function statusHtml() {
    const copy = statusCopy();
    if (!copy) return simpleHtml("CONNECTING…", "Reaching the table server.");
    const p = backendStatus().player;
    const opens = copy.opensAt ? `<p class="o21__sub o21__c" role="timer">Opens in <b data-timer="opens" data-at="${Number(copy.opensAt)}"></b></p>` : "";
    const st = backendStatus();
    const bal = p?.checkedIn ? `<p class="o21__sub o21__c">${p.name ? `${esc(p.name)} · ` : ""}Arcade wallet: <b>${p.balance}</b> pts</p>` : "";
    const last = st.result ? `<p class="o21__sub o21__c">Last table: ${esc(st.result.reason)} <b>${st.result.returned}</b> pts back to your wallet.</p>` : "";
    if (copy.queued) {
      return simpleHtml(
        copy.title,
        copy.sub,
        `<p class="o21__sub o21__c" role="timer">Waiting <b data-timer="since" data-at="${Number(st.queue.queuedAt)}"></b></p>${bal}
        <button type="button" class="o21__btn o21__btn--blue" data-act="cancel-queue" data-focus="cancel-queue" ${busy ? "disabled" : ""}>${busy ? "…" : `LEAVE THE QUEUE (+${st.buyIn} BACK)`}</button>`,
      );
    }
    if (!copy.live) return simpleHtml(copy.title, copy.sub, `${opens}${bal}`);
    const short = p.balance < st.buyIn;
    return `<div class="o21__screen o21__lobby">
      <p class="o21__h">TAKE A SEAT</p>
      ${bal}
      ${last}
      <p class="o21__sub">${esc(copy.sub)}</p>
      <button type="button" class="o21__btn" data-act="join" data-focus="join" ${joining || short ? "disabled" : ""}>${joining ? "…" : short ? `NEED ${st.buyIn} PTS` : `BUY IN · ${st.buyIn}`}</button>
      ${short ? `<p class="o21__sub o21__c">Deposit points on the Wallet page to play.</p>` : ""}
      ${errorHtml()}
    </div>`;
  }

  function simpleHtml(title, sub, extra = "") {
    return `<div class="o21__screen"><p class="o21__h o21__c">${esc(title)}</p><p class="o21__sub o21__c">${esc(sub)}</p>${extra}${errorHtml()}</div>`;
  }

  function handHtml() {
    switch (screen) {
      case "connecting":
        return simpleHtml("CONNECTING…", "Joining the table.");
      case "closed":
        return simpleHtml("TABLE CLOSED", "No new rounds at this table.");
      case "status":
        return statusHtml();
      case "waiting": {
        const names = view.seats.map((s) => `<li><span>${esc(s.name)}${s.isMe ? " (you)" : ""}</span><b>${s.bot ? "BOT" : ""}</b></li>`).join("");
        return simpleHtml(
          "WAITING FOR PLAYERS",
          view.seats.length < 2 ? "Bets open once a second player sits down." : "Seats lock soon, then the bet window opens.",
          `<ul class="o21__bets">${names}</ul>${view.deadline ? `<p class="o21__sub o21__c">Seats lock in <span data-timer="clock"></span></p>` : ""}`,
        );
      }
      case "bet":
        return betHtml();
      case "sitout": {
        const m = me();
        const capped = m.lostThisWindow >= m.lossCap;
        return simpleHtml("SITTING OUT", capped ? "You've hit the loss cap for this window." : `You need at least ${view.minWager} chips to bet. Leave the table to take the rest back to your wallet.`);
      }
      case "countdown": {
        const m = me();
        return simpleHtml("DEALING IN", `Your bet: ${m.wager ?? "—"}`, `<div class="o21__ring" data-timer="ring" role="timer"><b data-timer="secs"></b></div>${othersBets()}`);
      }
      case "nextround": {
        const mine = view.seats.find((s) => s.isMe);
        return mine?.state === "sitting_out"
          ? simpleHtml("YOU'RE IN NEXT ROUND ✓", "Watch this one. You're dealt in when the next bet window opens.")
          : simpleHtml("YOU'RE IN NEXT ROUND", "You sat down mid-round. You're dealt in at the next bet window.");
      }
      case "dealin":
        return dealInHtml();
      case "paused":
        return simpleHtml(
          "TABLE PAUSED",
          canReady() ? "Tap PLAY AGAIN to start the next round." : "Waiting for players to start the next round.",
          `<div class="o21__screen">${againHtml({ paused: true })}</div>`,
        );
      case "turn":
        return turnHtml();
      case "draw":
        return drawHtml();
      case "wild":
        return wildHtml();
      case "watch":
        return watchHtml();
      case "result":
        return resultHtml();
      default:
        return simpleHtml("OLYMPUS 21", "");
    }
  }

  function layoutFan() {
    const fan = els.hand.querySelector('[data-ref="fan"]');
    if (!fan) return;
    const n = fan.children.length;
    const avail = fan.clientWidth || el.clientWidth || 320;
    const step = fanStep(n, CARD_W2, avail - 8, mode === "table" ? CARD_W2 + 8 : 60);
    fan.style.setProperty("--step", `${step}px`);
  }

  function renderHand() {
    const changed = patch(els.hand, handHtml());
    if (changed) layoutFan();
    els.tray.classList.toggle("is-collapsed", !trayOpen);
    els.trayToggle.setAttribute("aria-expanded", String(trayOpen));
  }

  // ---- rendering: phone chrome
  function renderPhone() {
    const m = me();
    let badge = "";
    if (view?.status === "turns") {
      badge = m?.myTurn ? `<span class="o21__badge o21__badge--live">YOUR TURN <span data-timer="clock"></span></span>` : `<span class="o21__badge o21__badge--dim">${esc(seatName(view.turnSeat).toUpperCase())} <span data-timer="clock"></span></span>`;
    } else if (view?.status === "wagering") badge = `<span class="o21__badge o21__badge--bet">BETS <span data-timer="clock"></span></span>`;
    else if (view) badge = `<span class="o21__badge o21__badge--dim">${view.roundNo ? `R${view.roundNo}` : "OLYMPUS 21"}</span>`;
    const brand = ["lobby", "status", "connecting", "closed", "waiting"].includes(screen);
    patch(els.phead, `${brand ? `<h2 class="o21__title o21__title--sm">OLYMPUS 21</h2>` : `<span class="o21__pcount" aria-hidden="true"><span data-count-num>${countShown}</span><small> / 21</small></span>`}${badge}`);
    const showTable = view && ["turns", "settled", "countdown"].includes(view.status) && view.seats.length;
    patch(
      els.pseats,
      showTable
        ? view.seats
            .map((s) => {
              const st = seatStatus(view, s);
              const rd = view.status === "settled" && s.ready === true ? " ✓" : "";
              return `<span class="o21__pseat${view.turnSeat === s.seat ? " is-turn" : ""}${s.isMe ? " is-you" : ""}${s.state === "bust" || s.state === "folded" || s.state === "sitting_out" ? " is-out" : ""}">${esc(s.isMe ? "YOU" : s.name.toUpperCase())} · ${s.cardCount}<em class="${st.tone}">${esc(st.text + rd)}</em></span>`;
            })
            .join("")
        : "",
    );
    const top = view?.topCard;
    let caption = top ? matchCaption(top, view.activeColor).replace(" OR ", "<br>OR ") : "";
    if (top && screen === "watch") {
      const mine = view.seats.find((s) => s.isMe);
      const order = mine?.state === "playing" ? (view.seats.length ? turnLabel() : "") : "";
      if (order) caption = order;
    }
    const ring = COLOR_INFO[view?.activeColor]?.hex ?? "#8ca1aa";
    patch(
      els.pstrip,
      top && STRIP_SCREENS.includes(screen)
        ? `<span class="o21__topcard o21__topcard--sm" style="--ring:${ring}">${cardCanvas(top, { label: `Top card ${cardLabel(top)}` })}</span><span class="o21__sn">${caption}</span><span class="o21__dir o21__dir--sm" role="img" aria-label="Play goes ${view.direction === -1 ? "counter-clockwise" : "clockwise"}">${view.direction === -1 ? "↺" : "↻"}</span>`
        : "",
    );
    els.pstrip.hidden = !(top && STRIP_SCREENS.includes(screen));
    patch(els.pfoot, view ? `${howtoButton("o21__howto--sm")}${m ? leaveHtml() : ""}` : "");
  }

  const STRIP_SCREENS = ["turn", "draw", "watch", "wild", "dealin", "nextround"];

  function turnLabel() {
    const order = [];
    const seats = view.seats.filter((s) => s.state === "playing").map((s) => s.seat).sort((a, b) => a - b);
    const start = seats.indexOf(view.turnSeat);
    if (start < 0) return "";
    for (let i = 0; i < seats.length; i++) order.push(seats[(((start + i * (view.direction === -1 ? -1 : 1)) % seats.length) + seats.length) % seats.length]);
    const away = order.indexOf(me().seat);
    if (away <= 0) return "";
    return away === 1 ? "YOU'RE<br>UP NEXT" : `YOU'RE UP<br>IN ${away} TURNS`;
  }

  // ---- Techno
  function currentDialogue() {
    if (notice && notice.until > performance.now()) return notice;
    if (event && event.until > performance.now()) {
      const line = eventLine(event.move, me()?.seat);
      if (line) return line;
    }
    if (screen === "status") {
      const copy = statusCopy();
      if (copy?.live) return stateLine({ view: { me: null, seats: [] }, screen: "lobby" });
      if (copy) return { title: copy.title, line: copy.sub, mood: "idle", tone: "cyan" };
    }
    return stateLine({ view, screen, remainingMs: view?.status === "turns" && me()?.myTurn ? remaining() : null, canReady: canReady() });
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
    const scale = (els.hacker.clientWidth || 48) / 16;
    const dx = still() ? 0 : (frame.dx ?? 0) * scale;
    const dy = still() ? 0 : (frame.dy ?? 0) * scale;
    els.hacker.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  }
  function stopTyping() {
    stopInterval(typer);
    typer = null;
  }
  function renderMessage() {
    const d = currentDialogue();
    mood = d.mood ?? "idle";
    els.msgTitle.className = `o21__dlg-t o21__dlg-t--${d.tone ?? "gold"}`;
    const key = `${d.title}|${d.line}`;
    if (key !== dialogueKey) {
      dialogueKey = key;
      fullLine = d.line;
      setText(els.msgTitle, d.title);
      const title = /[.!?]$/.test(d.title) ? d.title : `${d.title}.`;
      setText(els.msgSr, `${title} ${d.line}`);
      stopTyping();
      if (still()) typedLen = fullLine.length;
      else {
        typedLen = 0;
        typer = every(TYPE_TICK_MS, () => {
          typedLen = Math.min(fullLine.length, typedLen + TYPE_CHARS_PER_TICK);
          setText(els.msgLine, fullLine.slice(0, typedLen));
          if (!talking()) {
            stopTyping();
            drawHacker();
          }
        });
      }
    }
    setText(els.msgLine, fullLine.slice(0, typedLen));
    drawHacker();
  }

  // ---- timers (countdowns, bars, rings)
  function updateTimers() {
    const left = remaining();
    const total = phaseTotal || PHASE_MS[view?.status] || 1;
    const hurry = left !== null && left <= HURRY_MS && (view?.status === "turns" || view?.status === "wagering");
    for (const node of root.querySelectorAll("[data-timer]")) {
      const kind = node.dataset.timer;
      if (kind === "opens") {
        setText(node, formatClock(Math.max(0, Number(node.dataset.at) - statusClock())));
        continue;
      }
      if (kind === "since") {
        setText(node, formatClock(Math.max(0, statusClock() - Number(node.dataset.at))));
        continue;
      } else if (kind === "clock") setText(node, left === null ? "" : formatClock(left));
      else if (kind === "secs") setText(node, left === null ? "" : String(Math.ceil(left / 1000)));
      else if (kind === "bar") node.style.width = `${left === null ? 0 : Math.max(0, Math.min(100, (left / total) * 100)).toFixed(1)}%`;
      else if (kind === "ring") node.style.setProperty("--p", `${left === null ? 0 : Math.max(0, Math.min(100, (left / total) * 100)).toFixed(1)}%`);
      node.classList.toggle("is-hurry", hurry);
    }
    // "5 s left" line for my turn.
    if (view?.status === "turns" && me()?.myTurn) renderMessage();
  }

  // ---- count roll + meter
  function paintCount(n) {
    for (const node of root.querySelectorAll("[data-count-num]")) setText(node, String(n));
    els.pips.forEach((pip, i) => {
      const on = i < n;
      pip.classList.toggle("on", on);
      pip.classList.toggle("hot", on && i >= 15);
    });
    const nowP = performance.now();
    root.classList.toggle("is-bust-flash", flashUntil > nowP);
    root.classList.toggle("is-21", winUntil > nowP || (view?.count === 21 && n === 21));
  }
  function rollCount(rawTarget) {
    // Only one roll may ever be running or pending: every view calls this, so cancel both
    // the running interval and any delayed start left over from an earlier view.
    stopInterval(countTimer);
    countTimer = null;
    cancelAfter(countDelay);
    countDelay = null;
    const target = Math.max(0, Math.min(21, Math.round(Number(rawTarget) || 0)));
    if (still() || target === countShown) {
      countShown = target;
      paintCount(countShown);
      return;
    }
    const delayStart = flashUntil > performance.now() && target < countShown ? flashUntil - performance.now() : 0;
    const start = () => {
      countDelay = null;
      stopInterval(countTimer);
      const id = every(target < countShown ? 30 : 55, () => {
        if (countShown !== target) countShown += target > countShown ? 1 : -1;
        paintCount(countShown);
        if (countShown === target) {
          stopInterval(id);
          if (countTimer === id) countTimer = null;
        }
      });
      countTimer = id;
    };
    if (delayStart > 0) {
      paintCount(countShown);
      countDelay = after(delayStart, start);
    } else start();
  }

  // ---- motion for new moves
  function showBanner(text) {
    if (mode !== "table") return;
    setText(els.banner, text);
    els.banner.hidden = false;
    els.banner.classList.remove("is-in");
    void els.banner.offsetWidth;
    els.banner.classList.add("is-in");
    cancelAfter(showBanner.timer);
    showBanner.timer = after(1700, () => {
      els.banner.hidden = true;
    });
  }

  function slideCard(move) {
    if (still() || mode !== "table" || !move.card || typeof els.fly.animate !== "function") return;
    const seatEl = els.felt.querySelector(`[data-seat="${move.seat}"]`);
    const topEl = els.top.querySelector("canvas") ?? els.top;
    if (!seatEl || !topEl) return;
    const base = root.getBoundingClientRect();
    const a = seatEl.getBoundingClientRect();
    const b = topEl.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const cv = document.createElement("canvas");
    cv.className = "o21__px o21__x2 o21__flycard";
    renderCard(cv, move.card);
    els.fly.appendChild(cv);
    const x0 = a.left + a.width / 2 - 48 - base.left;
    const y0 = a.top + a.height / 2 - 68 - base.top;
    const x1 = b.left - base.left;
    const y1 = b.top - base.top;
    cv.style.left = "0px";
    cv.style.top = "0px";
    const anim = cv.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.5)`, opacity: 0.6 },
        { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 1 },
      ],
      { duration: 420, easing: "steps(8, end)" },
    );
    topEl.style.visibility = "hidden";
    const done = () => {
      cv.remove();
      topEl.style.visibility = "";
    };
    anim.onfinish = done;
    anim.oncancel = done;
    after(900, done);
  }

  function shakeSeat(seat) {
    if (still()) return;
    const seatEl = els.felt.querySelector(`[data-seat="${seat}"]`);
    if (!seatEl) return;
    seatEl.classList.remove("is-shake");
    void seatEl.offsetWidth;
    seatEl.classList.add("is-shake");
  }

  function sparkle() {
    if (still()) return;
    const spots = [
      [8, 10],
      [86, 6],
      [20, 70],
      [78, 64],
      [50, -4],
      [2, 40],
      [96, 36],
      [62, 86],
    ];
    els.sparkles.innerHTML = spots.map(([x, y], i) => `<span class="o21__spark" style="left:${x}%;top:${y}%;animation-delay:${i * 0.08}s"></span>`).join("");
    after(2600, () => {
      els.sparkles.innerHTML = "";
    });
  }

  function handleMoves(prevView) {
    const seq = maxSeq(view);
    if (lastSeq < 0 || !prevView) {
      lastSeq = seq;
      return;
    }
    const fresh = unseenMoves(view, lastSeq);
    lastSeq = Math.max(lastSeq, seq);
    let slid = false;
    for (const move of fresh) {
      if (["play", "wild", "skip", "reverse", "plus2", "bust", "win"].includes(move.kind) && move.card && !slid) {
        slideCard(move);
        slid = true;
      }
      if (move.kind === "bust") {
        flashUntil = performance.now() + 700;
        shakeSeat(move.seat);
      }
      if (move.kind === "win") {
        winUntil = performance.now() + 2600;
        sparkle();
      }
      if (move.kind === "skip") showBanner(`NOBODY! ${move.text}`);
      else if (move.kind === "reverse") showBanner(`CHARYBDIS! ${move.text}`);
      else if (move.kind === "plus2") showBanner(`SIRENS! ${move.text}`);
      else if (move.kind === "wild") showBanner(`ODYSSEUS! ${move.text}`);
      if (eventLine(move, me()?.seat)) event = { move, until: performance.now() + EVENT_MS };
    }
    if (flashUntil > performance.now()) after(flashUntil - performance.now() + 20, () => paintCount(countShown));
    if (winUntil > performance.now()) after(winUntil - performance.now() + 20, () => paintCount(countShown));
    if (event) after(EVENT_MS + 30, renderMessage);
  }

  // ---- main render
  function render() {
    if (disposed) return;
    screen = !view?.me ? "status" : handScreen(view, { picking });
    renderHeader();
    if (mode === "table") {
      renderFelt();
      renderTicker();
      renderPanel();
      renderHistory();
    } else {
      renderPhone();
    }
    renderHand();
    paintCount(countShown);
    renderMessage();
    updateTimers();
  }

  function onView(next) {
    if (disposed) return;
    if (!next) {
      // Not seated (queued, just left, or never sat): the lobby comes from adapter.getStatus().
      view = null;
      lastSeq = -1;
      selected = null;
      picking = false;
      confirmLeave = false;
      if (busy && busyKey() !== busyMark) unlock();
      render();
      return;
    }
    const prev = view;
    view = next;
    receivedAt = performance.now();
    if (view.deadline !== lastDeadline) {
      lastDeadline = view.deadline;
      const left = remaining() ?? 0;
      phaseTotal = Math.max(PHASE_MS[view.status] ?? 0, left);
    }
    // Selection survives only while it's still my turn with the same hand.
    const m = view.me;
    const handKey = m ? `${m.myTurn}|${m.hand.map((h) => h.card).join(",")}|${view.count}|${view.topCard}|${view.activeColor}` : "";
    if (handKey !== lastHandKey) {
      lastHandKey = handKey;
      selected = null;
      if (!m?.myTurn) picking = false;
    }
    if (selected !== null && !(m?.myTurn && m.hand[selected]?.playable)) selected = null;
    if (!m?.myTurn) picking = false;
    if (!m) confirmLeave = false;
    if (busy) {
      const mark = busyKey();
      if (mark !== busyMark) unlock();
    }
    handleMoves(prev);
    rollCount(view.count ?? 0);
    render();
    syncTutorial();
  }

  // ---- tutorial (contract section 8)
  function tutorialSeen(key) {
    if (!key) return false;
    if (seenTables.has(key)) return true;
    let store = null;
    try {
      store = window.localStorage;
    } catch {
      store = null;
    }
    return readSeen(store, key);
  }
  function syncTutorial() {
    const myTurn = Boolean(view?.me?.myTurn);
    const decision = autoPlayDecision(view, { seen: tutorialSeen(view?.tableKey), open: tutorial.isOpen(), wasMyTurn });
    wasMyTurn = myTurn;
    if (decision === "open") tutorial.open();
    else if (decision === "close") {
      tutorial.close("turn");
      notice = { ...TUTORIAL_OVER_LINE, until: performance.now() + EVENT_MS };
      renderMessage();
      after(EVENT_MS + 30, renderMessage);
    }
    tutorial.refresh();
  }

  function busyKey() {
    if (!view) return "";
    return `${view.status}|${maxSeq(view)}|${view.turnSeat}|${view.me?.wager}|${view.me?.picked}|${view.me?.hand?.length}|${view.me?.ready}`;
  }
  function lock() {
    busy = true;
    busyMark = busyKey();
    cancelAfter(busyTimer);
    busyTimer = after(BUSY_FALLBACK_MS, () => {
      unlock();
      render();
    });
  }
  function unlock() {
    busy = false;
    cancelAfter(busyTimer);
    busyTimer = null;
  }

  function showError(code) {
    errorText = ERROR_COPY[code] ?? (code ? `Couldn't do that (${code}).` : "Something went wrong.");
    cancelAfter(errorTimer);
    errorTimer = after(4000, () => {
      errorText = "";
      render();
    });
  }

  async function act(fn) {
    if (busy) return;
    lock();
    errorText = "";
    render();
    let result;
    try {
      result = await fn();
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    if (disposed) return;
    if (!result?.ok) {
      unlock();
      showError(result?.code);
      render();
    } else if (busyKey() !== busyMark) {
      // The new view already arrived.
      unlock();
      render();
    }
  }

  // ---- actions
  function selectCard(i) {
    const m = me();
    if (!m?.myTurn || busy) return;
    const h = m.hand[i];
    if (!h?.playable) return;
    selected = selected === i ? null : i;
    picking = false;
    render();
  }

  function playSelected() {
    const m = me();
    if (!m?.myTurn || selected === null || busy) return;
    const h = m.hand[selected];
    if (!h?.playable) return;
    if (h.card === "W") {
      picking = true;
      render();
      root.querySelector('[data-act="color"]')?.focus({ preventScroll: true });
      return;
    }
    act(() => adapter.play(h.card));
  }

  function playWild(color) {
    const m = me();
    if (!m?.myTurn || busy || !COLOR_INFO[color]) return;
    act(() => adapter.play("W", color)).then(() => {
      picking = false;
      if (!disposed) render();
    });
  }

  function drawCard() {
    const m = me();
    if (!m?.canDraw || busy) return;
    act(() => adapter.draw());
  }

  function placeBet() {
    if (!me() || busy) return;
    act(() => adapter.placeWager(betDraft));
  }

  function playAgain() {
    if (!me() || busy) return;
    if (!canReady()) {
      showError("NO_READY");
      render();
      return;
    }
    act(() => adapter.ready());
  }

  function midRound() {
    const mine = view?.seats.find((s) => s.isMe);
    return Boolean(mine && (view.status === "countdown" || view.status === "turns") && mine.state === "playing");
  }

  function leaveTable() {
    if (midRound() && !confirmLeave) {
      confirmLeave = true;
      render();
      root.querySelector('[data-act="leave-no"]')?.focus({ preventScroll: true });
      return;
    }
    confirmLeave = false;
    act(() => adapter.leave());
  }

  async function join() {
    if (joining) return;
    joining = true;
    errorText = "";
    render();
    let result;
    try {
      result = await adapter.join();
    } catch {
      result = { ok: false, code: "NETWORK" };
    }
    joining = false;
    if (disposed) return;
    if (!result?.ok) showError(result?.code);
    render();
  }

  function moveSelection(dir) {
    const m = me();
    if (!m?.myTurn) return;
    const playable = m.hand.map((h, i) => (h.playable ? i : -1)).filter((i) => i >= 0);
    if (!playable.length) return;
    let idx = playable.indexOf(selected);
    idx = idx < 0 ? (dir > 0 ? 0 : playable.length - 1) : (idx + dir + playable.length) % playable.length;
    selected = playable[idx];
    picking = false;
    render();
    els.hand.querySelector(`[data-i="${selected}"]`)?.focus({ preventScroll: true });
  }

  on(root, "click", (e) => {
    const target = e.target.closest("[data-act]");
    if (!target || !root.contains(target) || target.disabled || target.getAttribute("aria-disabled") === "true") return;
    switch (target.dataset.act) {
      case "card":
        selectCard(Number(target.dataset.i));
        break;
      case "play":
        playSelected();
        break;
      case "draw":
        drawCard();
        break;
      case "color":
        playWild(target.dataset.c);
        break;
      case "wild-back":
        picking = false;
        render();
        break;
      case "chip":
        betDraft = Number(target.dataset.amt);
        render();
        break;
      case "step":
        betDraft = (betDraft ?? 0) + Number(target.dataset.d);
        render();
        break;
      case "bet":
        placeBet();
        break;
      case "cancel-queue":
        act(() => adapter.cancelQueue());
        break;
      case "join":
        join();
        break;
      case "leave":
      case "leave-yes":
        leaveTable();
        break;
      case "leave-no":
        confirmLeave = false;
        render();
        break;
      case "tray":
        trayOpen = !trayOpen;
        render();
        break;
      case "again":
        playAgain();
        break;
      case "howto":
        tutorial.open();
        break;
      default:
        break;
    }
  });

  on(root, "keydown", (e) => {
    const t = e.target;
    if (t.matches?.("input, textarea")) return;
    if (!els.hand.contains(t) && !(mode === "table" && els.tray.contains(t)) && t !== root && !root.contains(t)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (screen === "turn" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      moveSelection(e.key === "ArrowRight" ? 1 : -1);
    } else if (screen === "turn" && e.key === "Enter" && t.closest?.('[data-act="card"]')) {
      e.preventDefault();
      if (selected === null || Number(t.dataset.i) !== selected) selectCard(Number(t.dataset.i));
      else playSelected();
    } else if ((e.key === "d" || e.key === "D") && screen === "draw") {
      e.preventDefault();
      drawCard();
    } else if (e.key === "Escape" && picking) {
      picking = false;
      render();
    }
  });

  // Laptop keyboard: arrows / Enter / D work anywhere on the page while it's your turn
  // and focus isn't in a text field or another widget outside the game.
  on(document, "keydown", (e) => {
    if (e.defaultPrevented || mode !== "table" || !trayOpen) return;
    // The host may hide the game (another tab is open) while it stays mounted: no hidden plays.
    if (!root.isConnected || root.getClientRects().length === 0) return;
    const t = e.target;
    if (root.contains(t)) return; // handled above
    if (t && t !== document.body && t !== document.documentElement) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (screen === "turn" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      moveSelection(e.key === "ArrowRight" ? 1 : -1);
    } else if (screen === "turn" && e.key === "Enter") {
      e.preventDefault();
      playSelected();
    } else if ((e.key === "d" || e.key === "D") && screen === "draw") {
      e.preventDefault();
      drawCard();
    }
  });

  // ---- layout observers
  const resize = () => {
    if (applyMode()) {
      // Re-render everything for the new layout (patch cache may hold stale hidden parts).
      render();
    }
    layoutFan();
    tutorial.refresh();
  };
  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(resize);
    ro.observe(el);
  } else on(window, "resize", resize);
  if (reducedMotion?.addEventListener) on(reducedMotion, "change", render);

  const tutorial = createTutorial({
    root,
    getView: () => view,
    mode: () => mode,
    still,
    onDone: () => {
      if (view?.tableKey) seenTables.add(view.tableKey);
      layoutFan(); // the phone hid the hand while the tour was up
    },
  });

  // ---- start
  applyMode();
  const unsubscribe = adapter.subscribe(onView);
  every(TIMER_TICK_MS, updateTimers);
  every(HACKER_FRAME_MS, () => {
    if (still()) return;
    hackerTick += 1;
    drawHacker();
  });
  const initial = adapter.getState();
  if (initial) onView(initial);
  else render();

  return function unmount() {
    if (disposed) return;
    disposed = true;
    try {
      unsubscribe?.();
    } catch {
      // adapter already gone
    }
    for (const id of timeouts) clearTimeout(id);
    for (const id of intervals) clearInterval(id);
    timeouts.clear();
    intervals.clear();
    for (const fn of cleanups.splice(0)) fn();
    tutorial.destroy();
    ro?.disconnect();
    root.remove();
    mountedElements.delete(el);
    releaseStylesheet();
  };
}
