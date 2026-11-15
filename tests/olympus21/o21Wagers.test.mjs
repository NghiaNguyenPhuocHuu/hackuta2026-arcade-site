import { test } from "vitest";
import assert from "node:assert/strict";
import { MIN_WAGER, resolveWagers, buildPots, settlePots } from "../../shared/olympus21/wagers.js";
import { seededRng } from "../../shared/olympus21/rules.js";

const RILEY = 0;
const SAM = 1;
const ANA = 2;
const sidePot = [
  { seat: RILEY, wager: 10 },
  { seat: SAM, wager: 50 },
  { seat: ANA, wager: 30 },
];
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

test("resolveWagers clamps picks, averages non-pickers, sits out the broke", () => {
  const { wagers, sittingOut } = resolveWagers([
    { seat: 0, balance: 200, lossRoom: 100, pick: 500 },
    { seat: 1, balance: 200, lossRoom: 100, pick: 3 },
    { seat: 2, balance: 25, lossRoom: 100, pick: null },
    { seat: 3, balance: 9, lossRoom: 100, pick: 50 },
  ]);
  assert.deepEqual(sittingOut, [3]);
  assert.deepEqual(wagers, [
    { seat: 0, wager: 100, picked: true },
    { seat: 1, wager: 10, picked: true },
    { seat: 2, wager: 25, picked: false }, // avg 55, clamped to own max 25
  ]);
});

test("resolveWagers: nobody picked → MIN_WAGER; lossRoom limits", () => {
  const { wagers } = resolveWagers([
    { seat: 0, balance: 200, lossRoom: 100, pick: null },
    { seat: 1, balance: 200, lossRoom: 100, pick: null },
  ]);
  assert.deepEqual(wagers.map((w) => w.wager), [MIN_WAGER, MIN_WAGER]);
  const r = resolveWagers([
    { seat: 0, balance: 200, lossRoom: 5, pick: 10 },
    { seat: 1, balance: 200, lossRoom: 33.7, pick: 50 },
    { seat: 2, balance: 200, lossRoom: 100, pick: null },
  ]);
  assert.deepEqual(r.sittingOut, [0]);
  assert.deepEqual(r.wagers.map((w) => w.wager), [33, 33]);
});

test("buildPots makes poker-style layers", () => {
  assert.deepEqual(buildPots(sidePot), [
    { amount: 30, eligible: [0, 1, 2], level: 10 },
    { amount: 40, eligible: [1, 2], level: 30 },
    { amount: 20, eligible: [1], level: 50 },
  ]);
});

test("side pots: Riley wins → +20/−10/−10", () => {
  assert.deepEqual(settlePots(sidePot, [RILEY]).deltas, { 0: 20, 1: -10, 2: -10 });
});
test("side pots: Sam wins → −10/+40/−30", () => {
  assert.deepEqual(settlePots(sidePot, [SAM]).deltas, { 0: -10, 1: 40, 2: -30 });
});
test("side pots: Ana last one in → −10/−30/+40", () => {
  assert.deepEqual(settlePots(sidePot, [ANA]).deltas, { 0: -10, 1: -30, 2: 40 });
});
test("side pots: cap with Riley and Sam still in → +5/+25/−30", () => {
  const { payouts, deltas } = settlePots(sidePot, [RILEY, SAM]);
  assert.deepEqual(deltas, { 0: 5, 1: 25, 2: -30 });
  assert.deepEqual(payouts, { 0: 15, 1: 75, 2: 0 });
});

test("odd splits give the remainder one point at a time in seat order", () => {
  const { deltas } = settlePots(
    [
      { seat: 3, wager: 11 },
      { seat: 1, wager: 11 },
      { seat: 2, wager: 11 },
    ],
    [3, 1],
  );
  // 33 split by seats 1 and 3: 17 to seat 1, 16 to seat 3
  assert.deepEqual(deltas, { 1: 6, 2: -11, 3: 5 });
});

test("settlePots is zero-sum for random wagers and winners", () => {
  const rng = seededRng(99);
  for (let i = 0; i < 2000; i += 1) {
    const n = 2 + Math.floor(rng() * 3);
    const wagers = Array.from({ length: n }, (_, seat) => ({ seat, wager: 10 + Math.floor(rng() * 91) }));
    const winners = wagers.filter(() => rng() < 0.4).map((w) => w.seat);
    const { payouts, deltas } = settlePots(wagers, winners);
    assert.equal(sum(deltas), 0);
    assert.equal(sum(payouts), wagers.reduce((a, w) => a + w.wager, 0));
    for (const w of wagers) {
      // nobody wins more from each opponent than their own wager
      const maxWin = wagers.filter((o) => o.seat !== w.seat).reduce((a, o) => a + Math.min(o.wager, w.wager), 0);
      assert.ok(deltas[w.seat] <= maxWin);
      assert.ok(deltas[w.seat] >= -w.wager);
    }
  }
});
