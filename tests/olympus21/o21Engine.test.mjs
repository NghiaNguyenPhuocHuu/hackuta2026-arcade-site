import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createTable,
  join,
  leave,
  ready,
  placeWager,
  play,
  draw,
  tick,
  closeTable,
  viewFor,
  addListener,
  cardTotal,
  DEFAULT_TIMINGS,
  PLAY_CAP,
  HAND_SIZE,
  nextWakeAt,
  exportState,
  importState,
} from "../../shared/olympus21/engine.js";
import { seededRng, isNumberCard } from "../../shared/olympus21/rules.js";

const T = DEFAULT_TIMINGS;

/**
 * Seat humans, place wagers, run the countdown, return the table in "turns".
 * @param {{ name: string, balance?: number, wager?: number | null }[]} people
 */
function startRound(people, { seed = 1, maxSeats = 4 } = {}) {
  const table = createTable({ id: "t", maxSeats, rng: seededRng(seed), now: 0 });
  let now = 0;
  people.forEach((p, i) => assert.deepEqual(join(table, { id: `p${i}`, name: p.name, balance: p.balance ?? 200 }, now), { ok: true }));
  if (table.status === "waiting") {
    now += T.seatLockMs;
    tick(table, now);
  }
  assert.equal(table.status, "wagering");
  people.forEach((p, i) => {
    if (p.wager != null) assert.deepEqual(placeWager(table, `p${i}`, p.wager, now), { ok: true });
  });
  if (table.status === "wagering") {
    now += T.wagerMs;
    tick(table, now);
  }
  assert.equal(table.status, "countdown");
  now += T.countdownMs;
  tick(table, now);
  assert.equal(table.status, "turns");
  return { table, now };
}

/** Put the table into a known position. */
function rig(table, { hands, top = "R5", count = 5, color, turn = 0, drawPile, direction = 1 }) {
  hands.forEach((hand, seat) => {
    if (table.seats[seat]) table.seats[seat].hand = hand.slice();
  });
  table.playPile = [top];
  table.count = count;
  table.activeColor = color ?? (top === "W" ? "R" : top[0]);
  table.turnSeat = turn;
  table.direction = direction;
  if (drawPile) table.drawPile = drawPile.slice();
}

const sumBalances = (table) => table.seats.filter(Boolean).reduce((s, p) => s + p.balance, 0);

test("seat lock, wager window, countdown, deal", () => {
  const table = createTable({ id: "t", rng: seededRng(3), now: 0 });
  assert.equal(join(table, { id: "a", name: "Ana", balance: 200 }, 0).ok, true);
  assert.equal(table.status, "waiting");
  assert.equal(table.deadline, null);
  join(table, { id: "b", name: "Jo", balance: 200 }, 1000);
  assert.equal(table.deadline, 1000 + T.seatLockMs);
  assert.equal(join(table, { id: "b", name: "Jo" }, 1000).code, "ALREADY_SEATED");
  assert.equal(placeWager(table, "a", 20, 1000).code, "WAGERS_CLOSED");
  tick(table, 1000 + T.seatLockMs);
  assert.equal(table.status, "wagering");
  assert.equal(table.roundNo, 1);
  const n = 1000 + T.seatLockMs;
  assert.equal(placeWager(table, "a", 5, n).code, "BET_TOO_SMALL");
  assert.equal(placeWager(table, "a", 101, n).code, "BET_TOO_BIG", "loss cap 100");
  assert.equal(placeWager(table, "zz", 20, n).code, "NOT_SEATED");
  assert.equal(placeWager(table, "a", 40, n).ok, true);
  assert.equal(viewFor(table, "b", n).seats[0].wager, 40);
  assert.equal(viewFor(table, "b", n).seats[1].wager, null);
  tick(table, n + T.wagerMs);
  assert.equal(table.status, "countdown");
  // Jo didn't pick → gets the average (40); bets are taken from balances
  assert.equal(table.seats[1].wager, 40);
  assert.equal(table.seats[0].balance, 160);
  assert.equal(viewFor(table, null, 0).pot, 80);
  tick(table, n + T.wagerMs + T.countdownMs);
  assert.equal(table.status, "turns");
  assert.equal(table.seats[0].hand.length, HAND_SIZE);
  assert.equal(table.seats[1].hand.length, HAND_SIZE);
  assert.ok(isNumberCard(table.playPile[0]));
  assert.equal(table.playPile.length, 1);
  assert.equal(table.count, Number(table.playPile[0].slice(1)));
  assert.equal(table.turnSeat, 0);
  assert.equal(cardTotal(table), 100);
});

test("full table locks seats immediately; TABLE_FULL", () => {
  const table = createTable({ id: "t", maxSeats: 2, rng: seededRng(1), now: 0 });
  join(table, { id: "a", name: "A", balance: 100 }, 0);
  join(table, { id: "b", name: "B", balance: 100 }, 0);
  assert.equal(table.status, "wagering");
  assert.equal(join(table, { id: "c", name: "C" }, 0).code, "TABLE_FULL");
});

test("play errors: NOT_YOUR_TURN, NOT_IN_HAND, DOESNT_MATCH, PICK_A_COLOR, MUST_PLAY", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R7", "B2", "W"], ["G1"]], top: "R5", count: 5, turn: 0 });
  assert.equal(play(table, "p1", "G1", null, now).code, "NOT_YOUR_TURN");
  assert.equal(draw(table, "p1", now).code, "NOT_YOUR_TURN");
  assert.equal(play(table, "p0", "Y9", null, now).code, "NOT_IN_HAND");
  assert.equal(play(table, "p0", "B2", null, now).code, "DOESNT_MATCH");
  assert.equal(play(table, "p0", "W", null, now).code, "PICK_A_COLOR");
  assert.equal(play(table, "p0", "W", "purple", now).code, "PICK_A_COLOR");
  assert.equal(draw(table, "p0", now).code, "MUST_PLAY");
  assert.equal(play(table, null, undefined, undefined, now).code, "NOT_YOUR_TURN");
});

test("number card adds to the count and passes the turn", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R7", "B2"], ["G1", "G2"]], top: "R5", count: 5, turn: 0 });
  assert.equal(play(table, "p0", "R7", null, now).ok, true);
  assert.equal(table.count, 12);
  assert.equal(table.turnSeat, 1);
  assert.equal(table.deadline, now + T.turnMs);
  assert.equal(viewFor(table, "p0", now).lastMoves.at(-1).text, "Ana played R7 → 12");
});

test("draw takes one card and passes the turn", () => {
  const { table, now } = startRound([{ name: "Sam", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["B2"], ["G1"]], top: "R5", count: 5, turn: 0, drawPile: ["Y1", "Y2"] });
  assert.equal(draw(table, "p0", now).ok, true);
  assert.deepEqual(table.seats[0].hand, ["B2", "Y2"]);
  assert.equal(table.turnSeat, 1);
  const last = viewFor(table, null, now).lastMoves.at(-1);
  assert.equal(last.kind, "draw");
  assert.equal(last.text, "Sam drew a card");
});

test("Skip skips the next player", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["RS", "B1"], ["G1"], ["G2"]], top: "R5", count: 5, turn: 0 });
  play(table, "p0", "RS", null, now);
  assert.equal(table.turnSeat, 2);
  assert.equal(table.count, 5);
  assert.ok(viewFor(table, null, now).lastMoves.some((m) => m.kind === "skip" && m.text === "Nobody! Jo is skipped"));
});

test("Reverse flips direction with 3 players", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["RR", "B1"], ["G1"], ["G2"]], top: "R5", count: 5, turn: 0 });
  play(table, "p0", "RR", null, now);
  assert.equal(table.direction, -1);
  assert.equal(table.turnSeat, 2);
  assert.ok(viewFor(table, null, now).lastMoves.some((m) => m.kind === "reverse"));
});

test("Reverse with 2 live players acts as Skip", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["RR", "B1"], ["G1"]], top: "R5", count: 5, turn: 0 });
  play(table, "p0", "RR", null, now);
  assert.equal(table.direction, 1);
  assert.equal(table.turnSeat, 0);
});

test("+2 makes the next player draw 2 and lose their turn", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["R+2", "B1"], ["G1"], ["G2"]], top: "R5", count: 5, turn: 0, drawPile: ["Y1", "Y2", "Y3"] });
  play(table, "p0", "R+2", null, now);
  assert.deepEqual(table.seats[1].hand, ["G1", "Y3", "Y2"]);
  assert.equal(table.turnSeat, 2);
  assert.ok(viewFor(table, null, now).lastMoves.some((m) => m.kind === "plus2" && m.text === "Sirens! Jo draws 2"));
});

test("Wild sets the color", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["W", "B1"], ["G1"]], top: "R5", count: 5, turn: 0 });
  assert.equal(play(table, "p0", "W", "B", now).ok, true);
  assert.equal(table.activeColor, "B");
  assert.equal(table.count, 5);
  const view = viewFor(table, "p1", now);
  assert.ok(view.lastMoves.some((m) => m.kind === "wild" && m.color === "B" && m.text === "Odysseus! Color is now blue"));
  assert.equal(view.activeColor, "B");
});

test("bust resets the count to 0, card stays on top, player is out", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["R9", "B1"], ["G1"], ["G2"]], top: "R5", count: 15, turn: 0 });
  play(table, "p0", "R9", null, now);
  assert.equal(table.count, 0);
  assert.equal(table.playPile.at(-1), "R9");
  assert.equal(table.seats[0].state, "bust");
  assert.equal(table.turnSeat, 1);
  assert.equal(viewFor(table, null, now).lastMoves.at(-1).text, "Ana busted on 24");
  assert.equal(table.status, "turns");
});

test("bust leaving one player ends the round as 'last'", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 30 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R9", "B1"], ["G1"]], top: "R5", count: 15, turn: 0 });
  play(table, "p0", "R9", null, now);
  assert.equal(table.status, "settled");
  assert.deepEqual(table.result, { reason: "last", winners: [1], deltas: { 0: -10, 1: 10 } });
  assert.equal(table.seats[0].balance, 190);
  assert.equal(table.seats[1].balance, 210);
  assert.equal(table.seats[0].lostThisWindow, 10);
  assert.equal(table.seats[1].lostThisWindow, 0);
});

test("hitting 21 wins; side-pot example Riley 10 / Sam 50 / Ana 30", () => {
  const people = [
    { name: "Riley", wager: 10 },
    { name: "Sam", wager: 50 },
    { name: "Ana", wager: 30 },
  ];
  const { table, now } = startRound(people);
  assert.equal(viewFor(table, null, now).pots.length, 3);
  rig(table, { hands: [["R7", "B1"], ["G1"], ["G2"]], top: "R5", count: 14, turn: 0 });
  const view0 = viewFor(table, "p0", now);
  assert.deepEqual(view0.me.hand[0], { card: "R7", playable: true, after: "win" });
  play(table, "p0", "R7", null, now);
  assert.equal(table.status, "settled");
  assert.equal(table.count, 21);
  assert.deepEqual(table.result, { reason: "21", winners: [0], deltas: { 0: 20, 1: -10, 2: -10 } });
  assert.equal(viewFor(table, null, now).lastMoves.at(-1).text, "Riley hit 21!");
  assert.deepEqual(table.seats.filter(Boolean).map((p) => p.balance), [220, 190, 190]);
  const v = viewFor(table, "p1", now);
  assert.deepEqual(v.seats.map((s) => s.pointsDelta), [20, -10, -10]);
  assert.deepEqual(v.me.history, [{ roundNo: 1, delta: -10, reason: "21" }]);
  assert.equal(v.seats[0].state, "won");
});

test("side pots in the engine: Sam wins, Ana last one in, cap with Riley and Sam", () => {
  const people = [
    { name: "Riley", wager: 10 },
    { name: "Sam", wager: 50 },
    { name: "Ana", wager: 30 },
  ];
  {
    const { table, now } = startRound(people);
    rig(table, { hands: [["G1"], ["R6", "B1"], ["G2"]], top: "R5", count: 15, turn: 1 });
    play(table, "p1", "R6", null, now);
    assert.deepEqual(table.result.deltas, { 0: -10, 1: 40, 2: -30 });
  }
  {
    const { table, now } = startRound(people);
    rig(table, { hands: [["R9", "G1"], ["R8", "G1"], ["G2"]], top: "R5", count: 15, turn: 0 });
    play(table, "p0", "R9", null, now); // Riley busts, count 0
    table.count = 15;
    play(table, "p1", "R8", null, now); // Sam busts
    assert.deepEqual(table.result, { reason: "last", winners: [2], deltas: { 0: -10, 1: -30, 2: 40 } });
  }
  {
    const { table, now } = startRound(people);
    rig(table, { hands: [["R9", "G1"], ["R1", "R2"], ["R3", "R4"]], top: "R5", count: 15, turn: 2 });
    table.seats[2].state = "bust";
    table.plays = PLAY_CAP - 1;
    table.turnSeat = 1;
    play(table, "p1", "R1", null, now);
    assert.deepEqual(table.result, { reason: "cap", winners: [0, 1], deltas: { 0: 5, 1: 25, 2: -30 } });
  }
});

test("reshuffle the played pile (minus top) when the draw pile is empty", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["B2"], ["G1"]], top: "R5", count: 5, turn: 0, drawPile: [] });
  table.playPile = ["Y1", "Y2", "Y3", "R5"];
  draw(table, "p0", now);
  assert.deepEqual(table.playPile, ["R5"]);
  assert.equal(table.seats[0].hand.length, 2);
  assert.equal(table.drawPile.length, 2);
});

test("both piles empty ends the round as 'cap'", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["B2"], ["G1"]], top: "R5", count: 5, turn: 0, drawPile: [] });
  draw(table, "p0", now);
  assert.equal(table.status, "settled");
  assert.equal(table.result.reason, "cap");
  assert.deepEqual(table.result.winners, [0, 1]);
});

test("timeouts auto-move; 3 in a row unseats after the round", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R1", "R2", "R3", "R4"], ["G6", "G7", "G8", "G9"]], top: "R5", count: 1, turn: 0, drawPile: ["Y9", "Y9", "Y9", "Y9", "Y9"] });
  let t = now;
  t += T.turnMs;
  tick(table, t); // Ana times out → plays R1
  assert.equal(table.seats[0].timeouts, 1);
  assert.equal(table.count, 2);
  assert.equal(table.playPile.at(-1), "R1");
  assert.ok(viewFor(table, null, t).lastMoves.some((m) => m.kind === "timeout"));
  assert.equal(table.turnSeat, 1);
  assert.equal(draw(table, "p1", t).ok, true); // Jo can't play red
  t += T.turnMs;
  tick(table, t);
  assert.equal(table.seats[0].timeouts, 2);
  draw(table, "p1", t);
  t += T.turnMs;
  tick(table, t);
  assert.equal(table.seats[0].timeouts, 3);
  assert.equal(table.seats[0].kick, true);
  assert.ok(table.seats[0], "still seated until the round ends");
});

test("3 timeouts unseat after the round ends", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["R1"], ["R9"], ["G1"]], top: "R5", count: 15, turn: 0 });
  table.seats[0].timeouts = 2;
  tick(table, now + T.turnMs); // Ana times out, plays R1 (16)
  assert.equal(table.seats[0].kick, true);
  play(table, "p1", "R9", null, now + T.turnMs); // Jo busts, count 0
  table.count = 20;
  table.seats[2].hand = ["R1"];
  play(table, "p2", "R1", null, now + T.turnMs); // Sam hits 21
  assert.equal(table.status, "settled");
  assert.ok(table.seats[0], "still seated during the result");
  // Jo and Sam tap PLAY AGAIN; Ana (being unseated) doesn't count, so the round starts early.
  assert.equal(ready(table, "p1", now + T.turnMs + 10).ok, true);
  assert.equal(table.status, "settled");
  assert.equal(ready(table, "p2", now + T.turnMs + 20).ok, true);
  assert.equal(table.seats[0], null);
  assert.equal(table.status, "wagering");
  assert.equal(table.roundNo, 2);
});

test("acting resets the timeout streak", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R1", "R2"], ["G1"]], top: "R5", count: 1, turn: 0 });
  table.seats[0].timeouts = 2;
  play(table, "p0", "R1", null, now);
  assert.equal(table.seats[0].timeouts, 0);
});

test("leaving mid-round folds; bet stays in the pots; last player wins", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 30 }, { name: "Jo", wager: 20 }, { name: "Sam", wager: 10 }]);
  rig(table, { hands: [["R1"], ["G1"], ["G2"]], top: "R5", count: 5, turn: 1 });
  assert.equal(leave(table, "p1", now).ok, true); // Jo leaves on his turn
  assert.equal(table.seats[1].state, "folded");
  assert.equal(table.turnSeat, 2);
  assert.equal(table.seats[1].hand.length, 0);
  assert.equal(leave(table, "p1", now).code, "NOT_SEATED");
  leave(table, "p2", now);
  assert.equal(table.status, "settled");
  assert.equal(table.result.reason, "last");
  assert.deepEqual(table.result.winners, [0]);
  assert.deepEqual(table.result.deltas, { 0: 30, 1: -20, 2: -10 });
  tick(table, now + T.resultMs);
  assert.equal(table.seats[1], null);
  assert.equal(table.seats[2], null);
  assert.equal(table.status, "waiting");
});

test("leaving during the wager window just removes the player", () => {
  const table = createTable({ id: "t", maxSeats: 2, rng: seededRng(1), now: 0 });
  join(table, { id: "a", name: "A", balance: 100 }, 0);
  join(table, { id: "b", name: "B", balance: 100 }, 0);
  assert.equal(table.status, "wagering");
  leave(table, "b", 10);
  assert.equal(table.seats[1], null);
  assert.equal(table.status, "waiting");
  assert.equal(table.seats[0].balance, 100);
});

test("joining mid-round waits for the next wager window", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  assert.equal(join(table, { id: "late", name: "Late", balance: 200 }, now).ok, true);
  const late = table.seats[2];
  assert.equal(late.state, "waiting");
  assert.equal(late.hand.length, 0);
  rig(table, { hands: [["R6"], ["G1"]], top: "R5", count: 15, turn: 0 });
  play(table, "p0", "R6", null, now);
  assert.equal(table.status, "settled");
  assert.equal(late.balance, 200);
  assert.equal(late.ready, true, "joining is the intent to play");
  assert.equal(viewFor(table, "p0", now).me.ready, false);
  ready(table, "p0", now + 1);
  assert.equal(table.status, "settled", "Jo hasn't tapped PLAY AGAIN yet");
  tick(table, now + T.resultMs);
  assert.equal(table.status, "wagering");
  assert.equal(late.state, "playing");
  assert.equal(table.seats[0].state, "playing");
  assert.equal(table.seats[1].state, "sitting_out");
});

test("closeTable splits among players still in and stops new rounds", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 30 }, { name: "Sam", wager: 20 }]);
  rig(table, { hands: [["R9", "G1"], ["G1"], ["G2"]], top: "R5", count: 15, turn: 0 });
  play(table, "p0", "R9", null, now); // Ana busts
  closeTable(table, now);
  assert.equal(table.status, "closed");
  assert.deepEqual(table.result.reason, "closed");
  assert.deepEqual(table.result.winners, [1, 2]);
  // layer 10: 30 split Jo/Sam (15/15); layer 20: 20 split (10/10); layer 30: 10 refunded to Jo
  assert.deepEqual(table.result.deltas, { 0: -10, 1: 5, 2: 5 });
  assert.equal(join(table, { id: "x", name: "X" }, now).code, "TABLE_CLOSED");
  assert.equal(tick(table, now + 1e9), false);
  assert.equal(viewFor(table, null, now).deadline, null);
});

test("viewFor hides other hands and only previews `after` on my turn", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["R7", "B2", "W", "R9"], ["G1", "R3"]], top: "R5", count: 14, turn: 0 });
  const mine = viewFor(table, "p0", now);
  assert.equal(mine.me.myTurn, true);
  assert.equal(mine.me.canDraw, false);
  assert.deepEqual(mine.me.hand, [
    { card: "R7", playable: true, after: "win" },
    { card: "B2", playable: false, after: null },
    { card: "W", playable: true, after: 14 },
    { card: "R9", playable: true, after: "bust" },
  ]);
  assert.equal(mine.me.maxWager, 100);
  const theirs = viewFor(table, "p1", now);
  assert.equal(theirs.me.myTurn, false);
  assert.ok(theirs.me.hand.every((h) => h.after === null));
  assert.equal(theirs.seats[0].cardCount, 4);
  assert.equal(theirs.seats[0].pointsDelta, null);
  assert.ok(!JSON.stringify(theirs.seats).includes("R7"));
  const spectator = viewFor(table, null, now);
  assert.equal(spectator.me, null);
  assert.ok(!JSON.stringify(spectator).includes("hand"));
  assert.equal(spectator.target, 21);
  assert.equal(spectator.turnSeat, 0);
  assert.equal(spectator.drawLeft, table.drawPile.length);
  assert.deepEqual(Object.keys(spectator).sort(), [
    "activeColor", "count", "deadline", "direction", "drawLeft", "lastMoves", "maxSeats", "me", "minWager",
    "now", "pot", "pots", "result", "roundNo", "seats", "status", "tableId", "tableKey", "target", "topCard", "turnSeat",
  ]);
  assert.deepEqual(Object.keys(spectator.seats[0]).sort(), [
    "bot", "cardCount", "isMe", "name", "picked", "playerId", "pointsDelta", "ready", "seat", "state", "timeouts", "wager",
  ]);
  rig(table, { hands: [["B2"], ["G1"]], top: "R5", count: 14, turn: 0 });
  assert.equal(viewFor(table, "p0", now).me.canDraw, true);
});

test("addListener fires on commands and ticks; unsubscribe works", () => {
  const table = createTable({ id: "t", rng: seededRng(1), now: 0 });
  let calls = 0;
  const off = addListener(table, () => {
    calls += 1;
  });
  join(table, { id: "a", name: "A", balance: 100 }, 0);
  join(table, { id: "b", name: "B", balance: 100 }, 0);
  assert.equal(calls, 2);
  assert.equal(tick(table, 1), false);
  assert.equal(calls, 2);
  tick(table, T.seatLockMs);
  assert.equal(calls, 3);
  off();
  placeWager(table, "a", 10, T.seatLockMs);
  assert.equal(calls, 3);
});

test("lastMoves keeps the newest 8 with increasing seq", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }]);
  rig(table, { hands: [["B1"], ["G1"]], top: "R5", count: 5, turn: 0, drawPile: Array(20).fill("Y1") });
  for (let i = 0; i < 10; i += 1) draw(table, i % 2 ? "p1" : "p0", now);
  const moves = viewFor(table, null, now).lastMoves;
  assert.equal(moves.length, 8);
  for (let i = 1; i < moves.length; i += 1) assert.ok(moves[i].seq > moves[i - 1].seq);
});

// ---------------------------------------------------------------------------
// play again (CONTRACT §7)

/** End the round in `table` with `seat` hitting 21. */
function winRound(table, seat, now) {
  const hands = table.seats.map((p, i) => (p && p.state === "playing" ? (i === seat ? ["R6", "G1"] : ["G2"]) : []));
  rig(table, { hands, top: "R5", count: 15, turn: seat });
  assert.equal(play(table, table.seats[seat].id, "R6", null, now).ok, true);
  assert.equal(table.status, "settled");
}

/** From wagering: everyone playing bets 10, run the countdown, return the time in "turns". */
function betAndDeal(table, now) {
  for (const p of table.seats.filter((s) => s && s.state === "playing")) placeWager(table, p.id, 10, now);
  assert.equal(table.status, "countdown");
  now += T.countdownMs;
  tick(table, now);
  assert.equal(table.status, "turns");
  return now;
}

test("play again: settle resets ready, deadline is the PLAY AGAIN window, all ready starts early", () => {
  const { table, now } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  assert.ok(viewFor(table, "p0", now).seats.every((s) => s.ready === true), "seated players are ready");
  winRound(table, 0, now);
  const v = viewFor(table, "p1", now);
  assert.equal(v.deadline, now + T.resultMs);
  assert.equal(T.resultMs, 15000);
  assert.equal(v.me.ready, false);
  assert.ok(v.seats.every((s) => s.ready === false));
  assert.equal(ready(table, "p0", now + 1).ok, true);
  assert.equal(ready(table, "p0", now + 1).ok, true, "idempotent");
  assert.equal(viewFor(table, null, now).lastMoves.filter((m) => m.kind === "ready").length, 1);
  assert.equal(viewFor(table, null, now).lastMoves.at(-1).text, "Ana is ready");
  ready(table, "p1", now + 2);
  assert.equal(table.status, "settled");
  ready(table, "p2", now + 3);
  assert.equal(table.status, "wagering");
  assert.equal(table.roundNo, 2);
  assert.equal(table.deadline, now + 3 + T.wagerMs);
  assert.ok(table.seats.filter(Boolean).every((p) => p.state === "playing"));
});

test("play again: an unready human sits the round out (no hand, no bet, never acts, no timeouts)", () => {
  const { table, now: n0 } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  const total = sumBalances(table) + 30;
  winRound(table, 0, n0);
  ready(table, "p0", n0);
  ready(table, "p1", n0);
  assert.equal(table.status, "settled");
  let now = n0 + T.resultMs;
  tick(table, now);
  assert.equal(table.status, "wagering");
  const sam = table.seats[2];
  assert.equal(sam.state, "sitting_out");
  assert.equal(placeWager(table, "p2", 10, now).code, "WAGERS_CLOSED");
  const samBalance = sam.balance;
  now = betAndDeal(table, now);
  assert.equal(sam.wager, null);
  assert.equal(sam.hand.length, 0);
  assert.equal(cardTotal(table), 100);
  assert.ok(!table.roundWagers.some((w) => w.seat === 2));
  const sv = viewFor(table, "p2", now);
  assert.equal(sv.seats[2].state, "sitting_out");
  assert.equal(sv.me.hand.length, 0);
  assert.equal(sv.me.ready, false);
  assert.equal(sumBalances(table) + 20, total);
  // Nobody acts: every turn times out. Sam is never asked to act.
  for (let i = 0; i < 200 && table.status === "turns"; i += 1) {
    assert.notEqual(table.turnSeat, 2);
    now += T.turnMs;
    tick(table, now);
  }
  assert.equal(table.status, "settled");
  assert.equal(sam.timeouts, 0);
  assert.equal(sam.balance, samBalance);
  assert.equal(sam.pointsDelta, null);
  assert.ok(!(2 in table.result.deltas));
  assert.equal(sumBalances(table), total, "points conserved");
  assert.equal(Object.values(table.result.deltas).reduce((a, b) => a + b, 0), 0);
});

test("play again: a ready press during the round deals a sitting-out player into the next one", () => {
  const { table, now: n0 } = startRound([{ name: "Ana", wager: 10 }, { name: "Jo", wager: 10 }, { name: "Sam", wager: 10 }]);
  winRound(table, 0, n0);
  ready(table, "p0", n0);
  ready(table, "p1", n0);
  let now = n0 + T.resultMs;
  tick(table, now);
  assert.equal(table.seats[2].state, "sitting_out");
  assert.equal(ready(table, "p2", now).ok, true, "during wagering");
  assert.equal(table.seats[2].state, "sitting_out", "still out this round");
  now = betAndDeal(table, now);
  assert.equal(table.seats[2].hand.length, 0);
  winRound(table, 1, now);
  assert.equal(table.seats[2].ready, true, "the queued press survives the settle");
  assert.equal(table.seats[0].ready, false);
  ready(table, "p0", now + 1);
  ready(table, "p1", now + 2);
  assert.equal(table.status, "wagering");
  assert.equal(table.roundNo, 3);
  assert.equal(table.seats[2].state, "playing");
});

test("play again: bots don't play alone; the table pauses with no timer until a human is ready", () => {
  const table = createTable({ id: "t", rng: seededRng(5), now: 0 });
  join(table, { id: "h", name: "Riley", balance: 200 }, 0);
  join(table, { id: "b1", name: "Achilles", balance: 500, bot: true }, 0);
  join(table, { id: "b2", name: "Penelope", balance: 500, bot: true }, 0);
  let now = T.seatLockMs;
  tick(table, now);
  assert.equal(table.status, "wagering");
  placeWager(table, "h", 10, now);
  now += T.wagerMs;
  tick(table, now); // bots picked (or got the average) by now
  now += T.countdownMs;
  tick(table, now);
  assert.equal(table.status, "turns");
  const total = sumBalances(table) + table.roundWagers.reduce((s, w) => s + w.wager, 0);
  winRound(table, 0, now);
  const settledAt = now;
  // Bots tap PLAY AGAIN one by one during the result screen.
  now += T.botThinkMs[1];
  tick(table, now);
  assert.equal(table.status, "settled");
  assert.deepEqual(viewFor(table, "h", now).seats.map((s) => s.ready), [false, true, true]);
  assert.ok(viewFor(table, null, now).lastMoves.some((m) => m.kind === "ready" && m.text === "Achilles is ready"));
  now = settledAt + T.resultMs;
  tick(table, now);
  assert.equal(table.status, "waiting");
  assert.equal(table.deadline, null);
  assert.equal(viewFor(table, "h", now).deadline, null);
  tick(table, now + 10 * 60 * 1000);
  assert.equal(table.status, "waiting", "still paused");
  assert.equal(table.roundNo, 1);
  assert.equal(sumBalances(table), total);
  assert.equal(ready(table, "h", now + 1).ok, true);
  assert.equal(table.status, "wagering", "starts at once on ready");
  assert.equal(table.roundNo, 2);
  assert.ok(table.seats.filter(Boolean).every((p) => p.state === "playing"));
});

test("play again: seat lock counts only ready players", () => {
  const table = createTable({ id: "t", rng: seededRng(2), now: 0 });
  join(table, { id: "a", name: "Ana", balance: 200 }, 0);
  table.seats[0].ready = false; // e.g. Ana is still on a result screen
  join(table, { id: "b", name: "Jo", balance: 200 }, 0);
  assert.equal(table.status, "waiting");
  assert.equal(table.deadline, null, "one ready player: no seat lock");
  ready(table, "a", 100);
  assert.equal(table.deadline, 100 + T.seatLockMs);
  tick(table, 100 + T.seatLockMs);
  assert.equal(table.status, "wagering");
});

test("ready: codes and tableKey", () => {
  const table = createTable({ id: "t", rng: seededRng(1), now: 1234 });
  assert.equal(viewFor(table, null, 1234).tableKey, "t:1234");
  assert.notEqual(viewFor(createTable({ id: "t", now: 1235 }), null, 0).tableKey, viewFor(table, null, 0).tableKey);
  assert.equal(ready(table, "nobody", 0).code, "NOT_SEATED");
  assert.equal(ready(null, "x", 0).ok, false);
  join(table, { id: "a", name: "Ana", balance: 200 }, 0);
  assert.equal(viewFor(table, "a", 0).me.ready, true);
  assert.deepEqual(ready(table, "a", 0), { ok: true });
  closeTable(table, 0);
  assert.equal(ready(table, "a", 0).code, "TABLE_CLOSED");
});

// ---------------------------------------------------------------------------
// seeded bot simulations

const FAST = { seatLockMs: 100, wagerMs: 500, countdownMs: 100, turnMs: 2000, resultMs: 100, botThinkMs: [10, 60] };

/**
 * Run bot-only rounds on a table, checking invariants on every step.
 * @returns {{ rounds: number, plays: number[] }}
 */
function simulate(seed, { rounds = 1, check = true, lossCap = 100 } = {}) {
  const rng = seededRng(seed);
  const table = createTable({ id: `sim${seed}`, rng: seededRng(seed * 7919 + 1), now: 0, timings: FAST, lossCap });
  const nBots = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nBots; i += 1) {
    join(table, { id: `bot${i}`, name: `Bot${i}`, balance: 20 + Math.floor(rng() * 500), bot: true }, 0);
  }
  const total = sumBalances(table);
  const plays = [];
  let now = 0;
  let seenRound = 0;
  for (let steps = 0; steps < 200000 && plays.length < rounds; steps += 1) {
    now += 20;
    const before = table.status;
    tick(table, now);
    if (check) {
      assert.ok(table.count <= 21, "count never above 21");
      for (const p of table.seats.filter(Boolean)) assert.ok(p.balance >= 0, "no negative balance");
      if (table.status === "turns") assert.equal(cardTotal(table), 100);
      const held = table.status === "countdown" || table.status === "turns" ? table.roundWagers.reduce((s, w) => s + w.wager, 0) : 0;
      assert.equal(sumBalances(table) + held, total, "points conserved");
      if (table.status === "turns" || table.status === "settled") {
        for (const p of table.seats.filter(Boolean)) {
          const v = viewFor(table, p.id, now);
          assert.deepEqual(v.me.hand.map((h) => h.card), p.hand);
          for (const s of v.seats) {
            assert.ok(!("hand" in s) && !("cards" in s));
            const other = table.seats[s.seat];
            assert.equal(s.cardCount, other.hand.length);
            if (!s.isMe && table.status !== "settled") assert.equal(s.pointsDelta, null);
          }
        }
      }
    }
    if (before === "turns" && table.status === "settled" && table.roundNo !== seenRound) {
      seenRound = table.roundNo;
      plays.push(table.plays);
      assert.equal(Object.values(table.result.deltas).reduce((a, b) => a + b, 0), 0, "zero-sum round");
      assert.ok(table.plays <= PLAY_CAP);
    }
    if (table.status === "waiting" && table.roundNo > 0 && table.seats.filter(Boolean).length < 2) break;
  }
  return { rounds: plays.length, plays, table, total };
}

test("300 seeded bot games: zero-sum, no negatives, every round ends, no leaks", () => {
  let finished = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const { rounds, table, total } = simulate(seed, { rounds: 1 });
    if (rounds === 1) finished += 1;
    assert.equal(sumBalances(table) + (table.status === "turns" || table.status === "countdown" ? table.roundWagers.reduce((s, w) => s + w.wager, 0) : 0), total);
  }
  assert.equal(finished, 300, "every game finished its round");
});

test("simulator: average round length over seeded bot games", () => {
  const lengths = [];
  for (let seed = 1000; seed < 1100; seed += 1) lengths.push(...simulate(seed, { rounds: 3, check: false, lossCap: 1e6 }).plays);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const capped = lengths.filter((n) => n >= PLAY_CAP).length;
  console.log(`# Olympus 21 sim: ${lengths.length} rounds, average ${avg.toFixed(1)} plays, max ${Math.max(...lengths)}, ${capped} hit the cap`);
  assert.ok(avg < PLAY_CAP);
});

test("multi-round bot tables keep balances conserved and count losses", () => {
  const { table, total, rounds } = simulate(4242, { rounds: 5, lossCap: 1e6 });
  assert.equal(rounds, 5);
  assert.equal(sumBalances(table), total);
  for (const p of table.seats.filter(Boolean)) {
    const lost = p.history.reduce((s, h) => s + (h.delta < 0 ? -h.delta : 0), 0);
    assert.ok(p.lostThisWindow >= lost);
  }
});

// ---------------------------------------------------------------------------
// persistence: nextWakeAt / exportState / importState (CONTRACT §9)

test("nextWakeAt follows the phase deadline and is null when nothing is pending", () => {
  const table = createTable({ id: "w", rng: seededRng(3), now: 0 });
  assert.equal(nextWakeAt(table), null);
  join(table, { id: "a", name: "A", balance: 200 }, 0);
  assert.equal(nextWakeAt(table), null);
  join(table, { id: "b", name: "B", balance: 200 }, 100);
  assert.equal(nextWakeAt(table), 100 + T.seatLockMs);
  tick(table, 100 + T.seatLockMs);
  assert.equal(table.status, "wagering");
  assert.equal(nextWakeAt(table), table.deadline);
  closeTable(table, 200 + T.seatLockMs);
  assert.equal(nextWakeAt(table), null);
});

test("nextWakeAt includes bot think timers before the deadline", () => {
  const table = createTable({ id: "w", rng: seededRng(4), now: 0 });
  join(table, { id: "h", name: "H", balance: 200 }, 0);
  join(table, { id: "bot", name: "Bot", balance: 500, bot: true }, 0);
  tick(table, T.seatLockMs);
  assert.equal(table.status, "wagering");
  const bot = table.seats.find((p) => p && p.bot);
  assert.ok(bot.botAt < table.deadline);
  assert.equal(nextWakeAt(table), bot.botAt);
  // Nothing changes before the wake time; something does at it.
  assert.equal(tick(table, bot.botAt - 1), false);
  assert.equal(tick(table, bot.botAt), true);
});

test("exportState is plain JSON with no functions, and hides nothing it needs", () => {
  const { table } = startRound([{ name: "A", wager: 20 }, { name: "B", wager: 30 }]);
  addListener(table, () => {});
  const state = exportState(table);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal("rng" in state, false);
  assert.equal("listeners" in state, false);
  assert.equal(state.seats.filter(Boolean).length, 2);
  assert.equal(state.drawPile.length, table.drawPile.length);
});

test("export → import round trip plays on identically with the same rng", () => {
  const playOn = (table, start) => {
    let now = start;
    for (let i = 0; i < 400 && table.status === "turns"; i += 1) {
      now += T.turnMs;
      tick(table, now); // every turn times out → autoMove
    }
    return now;
  };
  const a = startRound([{ name: "A", wager: 20 }, { name: "B", wager: 30 }, { name: "C", wager: 10 }], { seed: 9 });
  const b = startRound([{ name: "A", wager: 20 }, { name: "B", wager: 30 }, { name: "C", wager: 10 }], { seed: 9 });
  // Same position; the restored copy gets an rng in the same state as the original's.
  const snapshot = exportState(b.table);
  const restored = importState(JSON.stringify(snapshot), { rng: seededRng(77) });
  a.table.rng = seededRng(77);
  assert.deepEqual(exportState(restored), exportState(a.table));
  const endA = playOn(a.table, a.now);
  const endR = playOn(restored, b.now);
  assert.equal(endA, endR);
  assert.notEqual(a.table.status, "turns");
  assert.deepEqual(exportState(restored), exportState(a.table));
  assert.deepEqual(viewFor(restored, "p0", endR), viewFor(a.table, "p0", endA));
  assert.equal(cardTotal(restored), 100);
});

test("importState accepts an object and keeps listeners empty and working", () => {
  const table = createTable({ id: "x", rng: seededRng(1), now: 5 });
  join(table, { id: "a", name: "A", balance: 200 }, 5);
  const restored = importState(exportState(table), { rng: seededRng(2) });
  let calls = 0;
  addListener(restored, () => (calls += 1));
  assert.deepEqual(join(restored, { id: "b", name: "B", balance: 200 }, 6), { ok: true });
  assert.equal(calls, 1);
  assert.equal(viewFor(restored, "a", 6).tableKey, "x:5");
  // the original is untouched
  assert.equal(table.seats.filter(Boolean).length, 1);
});
