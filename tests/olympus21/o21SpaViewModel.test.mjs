import { test } from "vitest";
import assert from "node:assert/strict";
import {
  arrangeSeats,
  cardLabel,
  cardShort,
  clampBet,
  colorCounts,
  fanStep,
  formatClock,
  handScreen,
  matchCaption,
  potLayers,
  previewTag,
  remainingMs,
  resultRows,
  resultTitle,
  seatStatus,
  signed,
  turnsAway,
  unseenMoves,
  winIfHit21,
} from "../../src/games/olympus-21/viewModel.js";
import { eventLine, stateLine } from "../../src/games/olympus-21/dialogue.js";

function seat(seatNo, extra = {}) {
  return { seat: seatNo, playerId: `p${seatNo}`, name: ["Riley", "Sam", "Ana", "Jo"][seatNo], bot: seatNo > 0, isMe: seatNo === 0, wager: 10, picked: true, cardCount: 5, state: "playing", pointsDelta: null, timeouts: 0, ...extra };
}

function baseView(extra = {}) {
  return {
    tableId: "sandbox",
    status: "turns",
    roundNo: 3,
    now: 10_000,
    deadline: 22_000,
    count: 14,
    target: 21,
    topCard: "R7",
    activeColor: "R",
    direction: 1,
    drawLeft: 50,
    pot: 110,
    pots: [
      { amount: 40, eligible: [0, 1, 2, 3], level: 10 },
      { amount: 30, eligible: [1, 2, 3], level: 20 },
      { amount: 40, eligible: [1, 2], level: 40 },
    ],
    turnSeat: 1,
    minWager: 10,
    maxSeats: 4,
    seats: [seat(0), seat(1, { wager: 40 }), seat(2, { wager: 40 }), seat(3, { wager: 20 })],
    lastMoves: [],
    result: null,
    me: { playerId: "p0", seat: 0, balance: 150, lostThisWindow: 0, lossCap: 100, maxWager: 100, wager: 10, picked: true, myTurn: false, canDraw: false, hand: [], history: [] },
    ...extra,
  };
}

test("card labels and short codes", () => {
  assert.equal(cardLabel("R7"), "Red 7, Ares");
  assert.equal(cardLabel("YS"), "Yellow Skip, Cyclops");
  assert.equal(cardLabel("BR"), "Blue Reverse, Charybdis");
  assert.equal(cardLabel("G+2"), "Green +2, Sirens");
  assert.equal(cardLabel("W"), "Wild, Odysseus");
  assert.equal(cardShort("G+2"), "G +2");
  assert.equal(cardShort("W"), "WILD");
  assert.equal(cardShort("B7"), "B7");
});

test("match caption uses the active color and top rank", () => {
  assert.equal(matchCaption("R7", "R"), "MATCH RED OR 7");
  assert.equal(matchCaption("YS", "Y"), "MATCH YELLOW OR SKIP");
  assert.equal(matchCaption("W", "B"), "MATCH BLUE");
  assert.equal(matchCaption(null, null), "");
});

test("remaining time is skew-free: server delta minus local elapsed", () => {
  const view = { now: 5_000_000, deadline: 5_012_000 };
  assert.equal(remainingMs(view, 100, 100), 12000);
  assert.equal(remainingMs(view, 100, 3100), 9000);
  assert.equal(remainingMs(view, 100, 99_999), 0);
  assert.equal(remainingMs({ now: 1, deadline: null }, 0, 0), null);
  assert.equal(formatClock(12000), "0:12");
  assert.equal(formatClock(4001), "0:05");
  assert.equal(formatClock(65000), "1:05");
});

test("signed numbers and preview tags", () => {
  assert.equal(signed(30), "+30");
  assert.equal(signed(-10), "-10");
  assert.equal(signed(0), "±0");
  assert.deepEqual(previewTag("win", 14), { text: "21 ★", tone: "win" });
  assert.deepEqual(previewTag("bust", 14), { text: "BUST", tone: "bad" });
  assert.deepEqual(previewTag(17, 14), { text: "17", tone: "" });
  assert.deepEqual(previewTag(14, 14), { text: "+0", tone: "" });
  assert.equal(previewTag(null, 14), null);
});

test("seats: me at the bottom, others clockwise", () => {
  const seats = [seat(0), seat(1), seat(2), seat(3)];
  const placed = arrangeSeats(seats, 2, 4).map((p) => [p.area, p.seat.seat]);
  assert.deepEqual(placed, [["s4", 2], ["s1", 3], ["s2", 0], ["s3", 1]]);
  assert.deepEqual(arrangeSeats([seat(1), seat(3)], 3, 4).map((p) => [p.area, p.seat.seat]), [["s4", 3], ["s2", 1]]);
  assert.deepEqual(arrangeSeats([seat(1), seat(2)], null, 4).map((p) => p.area), ["s4", "s2"]);
  assert.deepEqual(arrangeSeats([], 0, 4), []);
});

test("turn order follows direction and skips dead seats", () => {
  const view = baseView({ seats: [seat(0), seat(1), seat(2, { state: "bust" }), seat(3)] });
  assert.equal(turnsAway(view, 1), 0);
  assert.equal(turnsAway(view, 3), 1);
  assert.equal(turnsAway(view, 0), 2);
  assert.equal(turnsAway(view, 2), null);
  assert.equal(turnsAway({ ...view, direction: -1 }, 0), 1);
  assert.equal(seatStatus(view, view.seats[1]).text, "THINKING");
  assert.equal(seatStatus(view, view.seats[0]).text, "2 TURNS AWAY");
  assert.equal(seatStatus(view, view.seats[2]).text, "BUST");
});

test("pot layers and what I'd win", () => {
  const view = baseView();
  const layers = potLayers(view);
  assert.equal(layers[0].who, "all");
  assert.equal(layers[0].each, 10);
  assert.equal(layers[0].mine, true);
  assert.equal(layers[1].mine, false);
  assert.equal(layers[2].who, "Sam Ana");
  assert.equal(winIfHit21(view), 30);
  assert.equal(winIfHit21({ ...view, me: null }), 0);
});

test("bet clamp", () => {
  assert.equal(clampBet(5, 10, 80), 10);
  assert.equal(clampBet(500, 10, 80), 80);
  assert.equal(clampBet(25, 10, 80.9), 25);
  assert.equal(clampBet(Number.NaN, 10, 80), 10);
});

test("hand screen picks the right state", () => {
  assert.equal(handScreen(null), "connecting");
  assert.equal(handScreen(baseView({ me: null })), "lobby");
  assert.equal(handScreen(baseView({ status: "waiting" })), "waiting");
  assert.equal(handScreen(baseView({ status: "wagering" })), "bet");
  const broke = baseView({ status: "wagering" });
  broke.me = { ...broke.me, maxWager: 5 };
  assert.equal(handScreen(broke), "sitout");
  assert.equal(handScreen(baseView({ status: "countdown" })), "countdown");
  const mine = baseView({ turnSeat: 0 });
  mine.me = { ...mine.me, myTurn: true, hand: [{ card: "B7", playable: true, after: "win" }] };
  assert.equal(handScreen(mine), "turn");
  assert.equal(handScreen(mine, { picking: true }), "wild");
  mine.me = { ...mine.me, canDraw: true };
  assert.equal(handScreen(mine), "draw");
  assert.equal(handScreen(baseView()), "watch");
  assert.equal(handScreen(baseView({ status: "settled" })), "result");
  const late = baseView({ seats: [seat(0, { state: "waiting" }), seat(1)] });
  assert.equal(handScreen(late), "nextround");
});

test("round-over rows and titles from result.deltas", () => {
  const view = baseView({ status: "settled", result: { reason: "21", winners: [0], deltas: { 0: 30, 1: -10, 2: -10, 3: -10 } } });
  assert.equal(resultTitle(view), "YOU HIT 21!");
  assert.deepEqual(resultRows(view).map((r) => [r.name, r.delta]), [["Sam", -10], ["Ana", -10], ["Jo", -10]]);
  const lost = { ...view, result: { reason: "last", winners: [1], deltas: { 0: -10, 1: 30, 2: -10, 3: -10 } } };
  assert.equal(resultTitle(lost), "SAM SURVIVED");
  assert.equal(resultTitle({ ...view, result: { reason: "cap", winners: [0, 1], deltas: {} } }), "CARDS RAN OUT · SPLIT");
});

test("unseen moves, color counts, fan step", () => {
  const view = { lastMoves: [{ seq: 4 }, { seq: 5 }, { seq: 6 }] };
  assert.deepEqual(unseenMoves(view, 4).map((m) => m.seq), [5, 6]);
  assert.deepEqual(colorCounts([{ card: "R1" }, { card: "R9" }, { card: "W" }, { card: "B+2" }]), { R: 2, B: 1, G: 0, Y: 0 });
  assert.equal(fanStep(5, 96, 336, 60), 60);
  assert.equal(fanStep(9, 96, 336, 60), 30);
  assert.equal(fanStep(30, 96, 336, 60), 12);
  assert.equal(fanStep(1, 96, 336, 60), 96);
});

test("Techno reacts to action cards and states", () => {
  assert.equal(eventLine({ kind: "skip", seat: 1, name: "Ana", seq: 1 }, 0).title, "NOBODY!");
  assert.equal(eventLine({ kind: "reverse", seat: 1, name: "Ana", seq: 1 }, 0).title, "CHARYBDIS!");
  assert.equal(eventLine({ kind: "plus2", seat: 1, name: "Ana", seq: 1 }, 0).title, "SIRENS!");
  assert.match(eventLine({ kind: "wild", seat: 1, name: "Ana", color: "G", seq: 1 }, 0).line, /green/);
  assert.equal(eventLine({ kind: "bust", seat: 0, name: "Riley", seq: 1 }, 0).title, "BUSTED");
  assert.equal(eventLine({ kind: "win", seat: 0, name: "Riley", seq: 1 }, 0).title, "YOU HIT 21!");
  assert.equal(eventLine({ kind: "play", seat: 0, name: "Riley", seq: 1 }, 0), null);
  const mine = baseView({ turnSeat: 0, count: 16 });
  mine.me = { ...mine.me, myTurn: true, hand: [{ card: "R3", playable: true, after: 19 }] };
  assert.equal(stateLine({ view: mine, screen: "turn", remainingMs: 12000 }).title, "CLOSE TO 21");
  assert.equal(stateLine({ view: mine, screen: "turn", remainingMs: 4000 }).title, "5 SECONDS!");
  assert.equal(stateLine({ view: baseView({ status: "waiting", seats: [seat(0)] }), screen: "waiting" }).title, "WAITING FOR PLAYERS");
  assert.equal(stateLine({ view: baseView({ status: "wagering" }), screen: "bet" }).title, "BET PLACED");
  assert.equal(stateLine({ view: baseView(), screen: "watch" }).title, "SAM'S TURN");
  assert.equal(stateLine({ view: null, screen: "connecting" }).title, "CONNECTING");
});
