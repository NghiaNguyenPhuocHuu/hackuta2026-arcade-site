import { test } from "vitest";
import assert from "node:assert/strict";
import {
  COLORS,
  TARGET,
  buildDeck,
  shuffle,
  colorOf,
  rankOf,
  valueOf,
  canPlay,
  legalCards,
  scorePlay,
  nextSeat,
  autoMove,
  seededRng,
} from "../../shared/olympus21/rules.js";

test("deck has 100 cards with the right mix", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 100);
  assert.equal(deck.filter((c) => c === "W").length, 4);
  for (const color of COLORS) {
    assert.equal(deck.filter((c) => colorOf(c) === color).length, 24);
    for (const rank of ["1", "5", "9", "S", "R", "+2"]) {
      assert.equal(deck.filter((c) => c === color + rank).length, 2, color + rank);
    }
  }
  assert.equal(TARGET, 21);
});

test("shuffle is a seeded permutation and returns a new array", () => {
  const deck = buildDeck();
  const a = shuffle(deck, seededRng(7));
  const b = shuffle(deck, seededRng(7));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, deck);
  assert.deepEqual(a.slice().sort(), deck.slice().sort());
  assert.equal(deck[0], "R1", "input is not mutated");
});

test("seededRng stays in [0, 1)", () => {
  const rng = seededRng(42);
  for (let i = 0; i < 1000; i += 1) {
    const x = rng();
    assert.ok(x >= 0 && x < 1);
  }
});

test("colorOf, rankOf, valueOf", () => {
  assert.equal(colorOf("R7"), "R");
  assert.equal(colorOf("W"), null);
  assert.equal(rankOf("G+2"), "+2");
  assert.equal(rankOf("YS"), "S");
  assert.equal(rankOf("W"), "W");
  assert.equal(valueOf("B9"), 9);
  for (const c of ["RS", "BR", "G+2", "W"]) assert.equal(valueOf(c), 0);
});

test("canPlay: active color, same rank, or wild", () => {
  assert.ok(canPlay("R3", "R7", "R"));
  assert.ok(canPlay("B7", "R7", "R"));
  assert.ok(canPlay("W", "R7", "R"));
  assert.ok(!canPlay("B3", "R7", "R"));
  // after a wild, the active color matters, not the W rank
  assert.ok(canPlay("G2", "W", "G"));
  assert.ok(!canPlay("R2", "W", "G"));
  assert.ok(canPlay("BS", "RS", "R"));
  assert.ok(canPlay("Y+2", "G+2", "G"));
  assert.ok(!canPlay("XX", "R7", "R"));
  assert.deepEqual(legalCards(["R1", "B2", "W", "G7"], "R7", "R"), ["R1", "W", "G7"]);
});

test("scorePlay: continue, exact 21 wins, over 21 busts to 0", () => {
  assert.deepEqual(scorePlay(10, "R7"), { count: 17, outcome: "continue" });
  assert.deepEqual(scorePlay(14, "B7"), { count: 21, outcome: "win" });
  assert.deepEqual(scorePlay(18, "G5"), { count: 0, outcome: "bust" });
  assert.deepEqual(scorePlay(20, "W"), { count: 20, outcome: "continue" });
  assert.deepEqual(scorePlay(20, "RS"), { count: 20, outcome: "continue" });
});

test("nextSeat wraps in both directions", () => {
  const live = [0, 1, 3];
  assert.equal(nextSeat(live, 0, 1), 1);
  assert.equal(nextSeat(live, 1, 1), 3);
  assert.equal(nextSeat(live, 3, 1), 0);
  assert.equal(nextSeat(live, 0, -1), 3);
  assert.equal(nextSeat(live, 3, -1), 1);
  assert.equal(nextSeat(live, 0, 1, true), 3);
  assert.equal(nextSeat(live, 0, -1, true), 1);
});

test("nextSeat with `from` missing starts from the gap", () => {
  const live = [0, 2, 3];
  assert.equal(nextSeat(live, 1, 1), 2);
  assert.equal(nextSeat(live, 1, -1), 0);
  assert.equal(nextSeat([0, 1], 3, 1), 0, "wrap to lowest");
  assert.equal(nextSeat([1, 2], 0, -1), 2, "wrap to highest");
  assert.equal(nextSeat([1, 2], 3, -1), 2);
  assert.equal(nextSeat([0, 2], 1, 1, true), 0);
  assert.equal(nextSeat([], 1, 1), null);
});

test("nextSeat with two players: skipping returns to the same player", () => {
  assert.equal(nextSeat([0, 2], 0, 1, true), 0);
  assert.equal(nextSeat([0, 2], 2, -1, true), 2);
});

test("autoMove plays the lowest-value legal card, wild keeps color, else draws", () => {
  assert.deepEqual(autoMove(["R9", "R2", "B5"], "R7", "R"), { kind: "play", card: "R2", color: "R" });
  assert.deepEqual(autoMove(["R9", "RS"], "R7", "R"), { kind: "play", card: "RS", color: "R" });
  assert.deepEqual(autoMove(["W", "B9"], "R7", "R"), { kind: "play", card: "W", color: "R" });
  assert.deepEqual(autoMove(["B1", "G2"], "R7", "R"), { kind: "draw" });
  assert.deepEqual(autoMove(["B7"], "R7", "R"), { kind: "play", card: "B7", color: "B" });
});
