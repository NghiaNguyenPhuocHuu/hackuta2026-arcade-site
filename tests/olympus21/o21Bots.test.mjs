import { test } from "vitest";
import assert from "node:assert/strict";
import { botWager, botMove, BOT_WAGER_OPTIONS } from "../../shared/olympus21/bots.js";
import { seededRng } from "../../shared/olympus21/rules.js";

const constant = (value) => () => value;

test("botWager: about 20% null, otherwise a listed amount within range", () => {
  const rng = seededRng(5);
  let nulls = 0;
  for (let i = 0; i < 2000; i += 1) {
    const w = botWager(rng, { balance: 500, lossRoom: 100 });
    if (w === null) nulls += 1;
    else assert.ok(BOT_WAGER_OPTIONS.includes(w));
  }
  assert.ok(nulls > 300 && nulls < 500, `nulls=${nulls}`);
  for (let i = 0; i < 200; i += 1) {
    const w = botWager(rng, { balance: 22, lossRoom: 100 });
    assert.ok(w === null || w === 10 || w === 20);
  }
  assert.equal(botWager(constant(0.9), { balance: 5, lossRoom: 100 }), null);
});

test("botMove wins with 21 when it can", () => {
  assert.deepEqual(botMove(["R9", "R4", "RS"], "R2", "R", 17, constant(0)), { kind: "play", card: "R4", color: "R" });
});

test("botMove plays the highest card that stays at or under 20", () => {
  assert.deepEqual(botMove(["R9", "R2", "R5", "RS"], "R2", "R", 13, constant(0)), { kind: "play", card: "R5", color: "R" });
});

test("botMove falls back to an action card, then a wild with its favorite color", () => {
  assert.deepEqual(botMove(["R9", "RS"], "R2", "R", 15, constant(0)), { kind: "play", card: "RS", color: "R" });
  assert.deepEqual(botMove(["R9", "W", "G1", "G4", "B1"], "R3", "R", 15, constant(0)), { kind: "play", card: "W", color: "G" });
});

test("botMove plays the lowest number when everything busts; draws when nothing is legal", () => {
  assert.deepEqual(botMove(["R9", "R7"], "R2", "R", 18, constant(0)), { kind: "play", card: "R7", color: "R" });
  assert.deepEqual(botMove(["B9", "G7"], "R2", "R", 18, constant(0)), { kind: "draw" });
});
