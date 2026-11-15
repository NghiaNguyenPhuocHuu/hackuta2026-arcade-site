/**
 * Olympus 21 SPA: pure view-model helpers (no DOM). Everything here only
 * formats what the server already decided; nothing works out legality.
 */

export const COLOR_INFO = Object.freeze({
  R: { name: "RED", god: "ARES", label: "Red", hex: "#cf4336" },
  B: { name: "BLUE", god: "POSEIDON", label: "Blue", hex: "#2f74d0" },
  G: { name: "GREEN", god: "ATHENA", label: "Green", hex: "#2f9a58" },
  Y: { name: "YELLOW", god: "ZEUS", label: "Yellow", hex: "#e0a81e" },
});

const RANK_LABEL = { S: "Skip", R: "Reverse", "+2": "+2" };
const RANK_SHORT = { S: "SKIP", R: "REVERSE", "+2": "+2" };
const ACTION_GOD = { S: "Cyclops", R: "Charybdis", "+2": "Sirens" };

/** Default phase lengths, used when a deadline is first seen part-way through. */
export const PHASE_MS = Object.freeze({ waiting: 15000, wagering: 60000, countdown: 5000, turns: 20000, settled: 15000, closed: 6000 });

/** Accessible card name: "Red 7, Ares", "Blue Skip, Cyclops", "Wild, Odysseus". */
export function cardLabel(code) {
  if (code === "W") return "Wild, Odysseus";
  if (code === "BACK" || typeof code !== "string" || code.length < 2) return "Card back";
  const info = COLOR_INFO[code[0]];
  if (!info) return "Card";
  const rank = code.slice(1);
  if (RANK_LABEL[rank]) return `${info.label} ${RANK_LABEL[rank]}, ${ACTION_GOD[rank]}`;
  return `${info.label} ${rank}, ${info.god[0]}${info.god.slice(1).toLowerCase()}`;
}

/** Short code for buttons: "B7", "R SKIP", "WILD". */
export function cardShort(code) {
  if (code === "W") return "WILD";
  if (typeof code !== "string" || code.length < 2) return "";
  const rank = code.slice(1);
  return RANK_SHORT[rank] ? `${code[0]} ${RANK_SHORT[rank]}` : code;
}

/** "MATCH RED OR 7" (top card + active color). */
export function matchCaption(topCard, activeColor) {
  if (!topCard) return "";
  const color = COLOR_INFO[activeColor]?.name;
  if (topCard === "W") return color ? `MATCH ${color}` : "ANY CARD";
  const rank = topCard.slice(1);
  const rankText = RANK_SHORT[rank] ?? rank;
  return color ? `MATCH ${color} OR ${rankText}` : `MATCH ${rankText}`;
}

/**
 * Milliseconds left on the view's deadline, skew-free: `deadline - view.now`
 * is server time remaining when the view was built; subtract the local time
 * elapsed since it arrived (performance.now() clock).
 */
export function remainingMs(view, receivedAt, perfNow) {
  if (!view || typeof view.deadline !== "number" || typeof view.now !== "number") return null;
  const elapsed = Math.max(0, (perfNow ?? receivedAt) - (receivedAt ?? 0));
  return Math.max(0, view.deadline - view.now - elapsed);
}

/** "0:07" */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "+10", "-25", "±0" (ASCII minus: the pixel font has no U+2212). */
export function signed(n) {
  const v = Math.trunc(Number(n) || 0);
  if (v > 0) return `+${v}`;
  if (v < 0) return `-${-v}`;
  return "±0";
}

/** Preview tag for a playable card ("21 ★", "BUST", "+0", "17"); null when there is none. */
export function previewTag(after, count) {
  if (after === "win") return { text: "21 ★", tone: "win" };
  if (after === "bust") return { text: "BUST", tone: "bad" };
  if (typeof after === "number") return { text: after === count ? "+0" : String(after), tone: "" };
  return null;
}

/** Screen-reader phrase for what a card would do. */
export function previewPhrase(after, count) {
  if (after === "win") return "makes 21";
  if (after === "bust") return "busts";
  if (typeof after === "number") return after === count ? "adds 0" : `makes ${after}`;
  return "";
}

/**
 * Place seats around the felt: me at the bottom ("s4"), the others clockwise
 * (left "s1", top "s2", right "s3"). Spectators see the lowest seat at the bottom.
 * @returns {{ seat: object, area: "s1"|"s2"|"s3"|"s4" }[]}
 */
export function arrangeSeats(seats, mySeat, maxSeats = 4) {
  if (!Array.isArray(seats) || seats.length === 0) return [];
  const sorted = seats.slice().sort((a, b) => a.seat - b.seat);
  const anchor = sorted.some((s) => s.seat === mySeat) ? mySeat : sorted[0].seat;
  const rel = (s) => (((s.seat - anchor) % maxSeats) + maxSeats) % maxSeats;
  const ordered = sorted.slice().sort((a, b) => rel(a) - rel(b));
  const [bottom, ...others] = ordered;
  const layouts = { 0: [], 1: ["s2"], 2: ["s1", "s3"], 3: ["s1", "s2", "s3"] };
  const areas = layouts[Math.min(3, others.length)];
  return [{ seat: bottom, area: "s4" }, ...others.slice(0, 3).map((seat, i) => ({ seat, area: areas[i] }))];
}

/** Live seats in play order starting at the current turn (visual hint only). */
export function turnOrder(view) {
  if (!view || view.status !== "turns" || view.turnSeat == null) return [];
  const live = view.seats.filter((s) => s.state === "playing").map((s) => s.seat).sort((a, b) => a - b);
  const start = live.indexOf(view.turnSeat);
  if (start < 0) return live;
  const out = [];
  for (let i = 0; i < live.length; i++) {
    const idx = (((start + i * (view.direction === -1 ? -1 : 1)) % live.length) + live.length) % live.length;
    out.push(live[idx]);
  }
  return out;
}

/** How many turns until `seat` plays (0 = now, null = not in the order). */
export function turnsAway(view, seat) {
  const order = turnOrder(view);
  const i = order.indexOf(seat);
  return i < 0 ? null : i;
}

/** Side-pot layers with per-player slice and whether I'm in them. */
export function potLayers(view) {
  const mySeat = view?.me?.seat;
  const names = new Map((view?.seats ?? []).map((s) => [s.seat, s.name]));
  const wagered = (view?.seats ?? []).filter((s) => typeof s.wager === "number" && s.wager > 0).length;
  return (view?.pots ?? []).map((pot) => {
    const n = pot.eligible.length || 1;
    const who = pot.eligible.length >= wagered && wagered > 1 ? "all" : pot.eligible.map((s) => names.get(s) ?? `Seat ${s + 1}`).join(" ");
    return { amount: pot.amount, each: Math.floor(pot.amount / n), count: pot.eligible.length, who, mine: pot.eligible.includes(mySeat) };
  });
}

/** Net points I'd win if I took every layer I'm eligible for (hit 21 now). */
export function winIfHit21(view) {
  const me = view?.me;
  if (!me || typeof me.wager !== "number") return 0;
  const total = (view.pots ?? []).filter((p) => p.eligible.includes(me.seat)).reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, total - me.wager);
}

/** Pick a bet value inside [min, max]. */
export function clampBet(amount, min, max) {
  const hi = Math.max(min, Math.floor(max));
  const v = Math.round(Number(amount) || min);
  return Math.min(hi, Math.max(min, v));
}

/** Moves newer than `lastSeq`, oldest first. */
export function unseenMoves(view, lastSeq) {
  return (view?.lastMoves ?? []).filter((m) => m.seq > lastSeq);
}

export function maxSeq(view) {
  return (view?.lastMoves ?? []).reduce((max, m) => Math.max(max, m.seq), 0);
}

/** Per-opponent rows for the round-over screen, from result.deltas. */
export function resultRows(view) {
  const r = view?.result;
  if (!r) return [];
  const mySeat = view.me?.seat;
  return view.seats
    .filter((s) => s.seat !== mySeat && Object.prototype.hasOwnProperty.call(r.deltas, s.seat))
    .map((s) => ({ name: s.name, delta: r.deltas[s.seat], winner: r.winners.includes(s.seat) }));
}

/** Title for the round-over screen from my point of view. */
export function resultTitle(view) {
  const r = view?.result;
  if (!r) return "";
  const mine = view.me ? r.winners.includes(view.me.seat) : false;
  if (r.reason === "21") return mine ? "YOU HIT 21!" : `${winnerNames(view)} HIT 21`;
  if (r.reason === "last") return mine ? "LAST ONE STANDING!" : `${winnerNames(view)} SURVIVED`;
  if (r.reason === "cap") return "CARDS RAN OUT · SPLIT";
  return "TABLE CLOSED · SPLIT";
}

export function winnerNames(view) {
  const r = view?.result;
  if (!r || r.winners.length === 0) return "NOBODY";
  return r.winners
    .map((seat) => view.seats.find((s) => s.seat === seat)?.name ?? `SEAT ${seat + 1}`)
    .join(" & ")
    .toUpperCase();
}

/** Status chip for a seat. */
export function seatStatus(view, seat) {
  const s = seat;
  const status = view.status;
  if (status === "wagering") return s.state === "sitting_out" ? { text: "SITTING OUT", tone: "" } : s.picked ? { text: "BET IN", tone: "ok" } : { text: "PICKING…", tone: "" };
  if (status === "countdown") return { text: s.state === "sitting_out" ? "SITTING OUT" : "READY", tone: "" };
  if (status === "settled" || status === "closed") {
    if (typeof s.pointsDelta === "number") return { text: signed(s.pointsDelta), tone: s.pointsDelta > 0 ? "ok" : s.pointsDelta < 0 ? "bad" : "" };
    return { text: s.state === "won" ? "WON" : "—", tone: s.state === "won" ? "ok" : "" };
  }
  if (status === "waiting") return { text: "SEATED", tone: "" };
  switch (s.state) {
    case "bust":
      return { text: "BUST", tone: "bad" };
    case "won":
      return { text: "WON", tone: "ok" };
    case "folded":
      return { text: "LEFT", tone: "bad" };
    case "sitting_out":
      return { text: "SITTING OUT", tone: "" };
    case "waiting":
      return { text: "NEXT ROUND", tone: "" };
    default: {
      if (view.turnSeat === s.seat) return { text: s.isMe ? "YOUR TURN" : "THINKING", tone: "hot" };
      const away = turnsAway(view, s.seat);
      if (away === 1) return { text: "NEXT", tone: s.isMe ? "ok" : "" };
      if (away != null) return { text: `${away} TURNS AWAY`, tone: s.isMe ? "ok" : "" };
      return { text: "PLAYING", tone: "" };
    }
  }
}

/** Badge for the table/round. tone: live (green), bet (gold), closed (grey). */
export function tableBadge(view) {
  if (!view) return { text: "CONNECTING…", tone: "dim" };
  const tone = view.status === "turns" ? "live" : view.status === "wagering" || view.status === "countdown" ? "bet" : view.status === "closed" ? "dim" : "idle";
  const round = view.roundNo > 0 ? ` · ROUND ${view.roundNo}` : "";
  return { text: `TABLE ${String(view.tableId ?? "").toUpperCase()}${round}`, tone };
}

/**
 * Screen for a seated player who isn't dealt into the running round
 * (seat state "sitting_out"). "sitout": can't afford the minimum bet;
 * "dealin": chose not to play again yet (me.ready false, v2 tables);
 * "nextround": already marked to be dealt into the next round.
 */
function outScreen(view, me) {
  if (me.maxWager < view.minWager) return "sitout";
  if (me.ready === false) return "dealin";
  if (me.ready === true) return "nextround";
  return "sitout";
}

/** Which hand-panel screen to show. */
export function handScreen(view, { picking = false } = {}) {
  if (!view) return "connecting";
  const me = view.me;
  if (!me) return view.status === "closed" ? "closed" : "lobby";
  const seat = view.seats.find((s) => s.seat === me.seat);
  if (view.status === "closed") return "result";
  // v2: a seated player who isn't ready while the table waits sees the paused screen.
  if (view.status === "waiting") return me.ready === false ? "paused" : "waiting";
  if (view.status === "wagering") return seat?.state === "sitting_out" || me.maxWager < view.minWager ? outScreen(view, me) : "bet";
  if (view.status === "countdown") return seat?.state === "sitting_out" ? outScreen(view, me) : "countdown";
  if (view.status === "settled") return "result";
  if (seat?.state === "waiting") return "nextround";
  if (seat?.state === "sitting_out") return outScreen(view, me);
  if (me.myTurn) return picking ? "wild" : me.canDraw ? "draw" : "turn";
  return "watch";
}

/** Rows for the READY list on the result / paused screens (v2 tables only: needs Seat.ready). */
export function readyRows(view) {
  return (view?.seats ?? [])
    .filter((s) => typeof s.ready === "boolean")
    .map((s) => ({ seat: s.seat, name: s.name, isMe: Boolean(s.isMe), bot: Boolean(s.bot), ready: s.ready }));
}

/** "Ana", "Ana and Sam", "Ana, Sam and Jo". */
export function nameList(names) {
  const list = (names ?? []).filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Count of each color in a hand ("You hold: 2 red · 1 blue"). */
export function colorCounts(hand) {
  const counts = { R: 0, B: 0, G: 0, Y: 0 };
  for (const h of hand ?? []) {
    const c = typeof h === "string" ? h : h.card;
    if (counts[c?.[0]] !== undefined && c !== "W") counts[c[0]]++;
  }
  return counts;
}

/** Fan overlap: pixel step between cards so `n` cards of width `w` fit in `avail`. */
export function fanStep(n, w, avail, maxStep) {
  if (n <= 1) return w;
  const step = Math.floor((avail - w) / (n - 1));
  return Math.max(12, Math.min(maxStep ?? w + 8, step));
}
