import { test } from "vitest";
import assert from "node:assert/strict";
import { TUTORIAL_KEY_PREFIX, TUTORIAL_STEPS, autoPlayDecision, readSeen, tutorialBlock, tutorialStorageKey, writeSeen } from "../../src/games/olympus-21/tutorial.js";
import { handScreen, nameList, readyRows } from "../../src/games/olympus-21/viewModel.js";
import { againLine, stateLine, TUTORIAL_OVER_LINE } from "../../src/games/olympus-21/dialogue.js";
import { HACKER_MOODS } from "../../src/games/olympus-slots/hacker";

function seat(seatNo, extra = {}) {
  return { seat: seatNo, playerId: `p${seatNo}`, name: ["Riley", "Achilles", "Ajax", "Jo"][seatNo], bot: seatNo > 0, isMe: seatNo === 0, wager: 10, picked: true, cardCount: 5, state: "playing", pointsDelta: null, timeouts: 0, ready: true, ...extra };
}

function view(extra = {}, meExtra = {}) {
  return {
    tableId: "sandbox",
    tableKey: "sandbox:1000",
    status: "turns",
    roundNo: 3,
    now: 0,
    deadline: 20000,
    count: 14,
    target: 21,
    topCard: "R7",
    activeColor: "R",
    direction: 1,
    drawLeft: 50,
    pot: 40,
    pots: [],
    turnSeat: 1,
    minWager: 10,
    maxSeats: 4,
    seats: [seat(0), seat(1), seat(2), seat(3)],
    lastMoves: [],
    result: null,
    me: { playerId: "p0", seat: 0, balance: 200, lostThisWindow: 0, lossCap: 100, maxWager: 100, wager: 10, picked: true, myTurn: false, canDraw: false, hand: [], history: [], ready: true, ...meExtra },
    ...extra,
  };
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("tutorial steps: 9-12 short steps covering board and cards", () => {
  assert.ok(TUTORIAL_STEPS.length >= 9 && TUTORIAL_STEPS.length <= 12);
  const ids = TUTORIAL_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const id of ["welcome", "count", "match", "numbers", "actions", "wild", "hand", "seats", "bust", "bets", "again"]) assert.ok(ids.includes(id), id);
  for (const s of TUTORIAL_STEPS) {
    assert.ok(s.title && s.title === s.title.toUpperCase(), `${s.id} title`);
    assert.ok(s.line.length > 20 && s.line.length < 240, `${s.id} line length ${s.line.length}`);
    assert.ok(HACKER_MOODS.includes(s.mood), `${s.id} mood`);
    assert.ok(s.demo, `${s.id} has an illustration`);
    assert.ok(Object.isFrozen(s));
  }
  const text = TUTORIAL_STEPS.map((s) => s.line).join(" ");
  for (const word of ["21", "Nobody", "Charybdis", "Sirens", "Odysseus", "DRAW", "PLAY AGAIN", "HOW TO PLAY", "20 seconds", "60-second"]) assert.ok(text.includes(word), word);
});

test("storage key and seen flag", () => {
  assert.equal(TUTORIAL_KEY_PREFIX, "o21-tutorial-seen:");
  assert.equal(tutorialStorageKey("sandbox:1700000000000"), "o21-tutorial-seen:sandbox:1700000000000");
  const store = memoryStorage();
  assert.equal(readSeen(store, "t:1"), false);
  assert.equal(writeSeen(store, "t:1"), true);
  assert.equal(readSeen(store, "t:1"), true);
  assert.equal(readSeen(store, "t:2"), false, "a reset table has a new key");
  assert.ok(store.map.has("o21-tutorial-seen:t:1"));
  // No key, no storage, or storage that throws: never crashes.
  assert.equal(readSeen(store, ""), false);
  assert.equal(writeSeen(store, null), false);
  assert.equal(readSeen(null, "t:1"), false);
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readSeen(broken, "t:1"), false);
  assert.equal(writeSeen(broken, "t:1"), false);
});

test("tutorialBlock: when the tour may auto-play", () => {
  assert.equal(tutorialBlock(null), "no-view");
  assert.equal(tutorialBlock(view({ tableKey: undefined })), "no-table");
  assert.equal(tutorialBlock(view({ status: "closed" })), "closed");
  assert.equal(tutorialBlock(view({ me: null })), "not-seated");
  assert.equal(tutorialBlock(view({}, { myTurn: true })), "my-turn");
  assert.equal(tutorialBlock(view({ status: "wagering" }, { picked: false, wager: null })), "bet-open");
  assert.equal(tutorialBlock(view({ status: "wagering" }, { picked: true })), null, "bet placed: fine");
  const sitting = view({ status: "wagering", seats: [seat(0, { state: "sitting_out" }), seat(1)] }, { picked: false });
  assert.equal(tutorialBlock(sitting), null, "sitting out has no open bet");
  const broke = view({ status: "wagering" }, { picked: false, maxWager: 5 });
  assert.equal(tutorialBlock(broke), null);
  for (const status of ["waiting", "countdown", "turns", "settled"]) assert.equal(tutorialBlock(view({ status })), null, status);
});

test("autoPlayDecision: once per table, waits for the right moment, closes on my turn", () => {
  assert.equal(autoPlayDecision(view(), { seen: false, open: false }), "open");
  assert.equal(autoPlayDecision(view(), { seen: true, open: false }), "none");
  assert.equal(autoPlayDecision(view({}, { myTurn: true }), { seen: false, open: false }), "none", "waits through my turn");
  assert.equal(autoPlayDecision(view({ status: "wagering" }, { picked: false }), { seen: false }), "none", "waits through an open bet");
  assert.equal(autoPlayDecision(view({ tableKey: "" }), { seen: false }), "none");
  // Open: my turn starting closes it; a manual replay during my turn stays open.
  assert.equal(autoPlayDecision(view({}, { myTurn: true }), { open: true, wasMyTurn: false }), "close");
  assert.equal(autoPlayDecision(view({}, { myTurn: true }), { open: true, wasMyTurn: true }), "none");
  assert.equal(autoPlayDecision(view(), { open: true }), "none");
  assert.equal(autoPlayDecision(null, {}), "none");
});

test("handScreen: PLAY AGAIN screens", () => {
  assert.equal(handScreen(view({ status: "settled" })), "result");
  assert.equal(handScreen(view({ status: "waiting", deadline: null }, { ready: false })), "paused");
  assert.equal(handScreen(view({ status: "waiting", deadline: null }, { ready: true })), "waiting");
  assert.equal(handScreen(view({ status: "waiting" }, { ready: undefined })), "waiting", "old views");
  const out = { seats: [seat(0, { state: "sitting_out", wager: null, cardCount: 0 }), seat(1), seat(2)] };
  assert.equal(handScreen(view(out, { ready: false })), "dealin");
  assert.equal(handScreen(view(out, { ready: true })), "nextround");
  assert.equal(handScreen(view({ ...out, status: "wagering" }, { ready: false })), "dealin");
  assert.equal(handScreen(view({ ...out, status: "countdown" }, { ready: true })), "nextround");
  assert.equal(handScreen(view(out, { ready: false, maxWager: 4 })), "sitout", "can't afford stays sitout");
  assert.equal(handScreen(view(out, { ready: undefined })), "sitout", "old views");
});

test("readyRows and nameList", () => {
  const v = view({ status: "settled", seats: [seat(0, { ready: false }), seat(1, { ready: true }), seat(2, { ready: false })] });
  assert.deepEqual(
    readyRows(v).map((r) => [r.name, r.ready, r.isMe]),
    [
      ["Riley", false, true],
      ["Achilles", true, false],
      ["Ajax", false, false],
    ],
  );
  assert.deepEqual(readyRows(view({ seats: [{ ...seat(0), ready: undefined }] })), [], "no ready field: no list");
  assert.equal(nameList([]), "");
  assert.equal(nameList(["Ana"]), "Ana");
  assert.equal(nameList(["Ana", "Sam"]), "Ana and Sam");
  assert.equal(nameList(["Ana", "Sam", "Jo"]), "Ana, Sam and Jo");
});

test("Techno: PLAY AGAIN lines", () => {
  const result = { reason: "21", winners: [1], deltas: { 0: -10, 1: 20, 2: -10 } };
  const seats = [seat(0, { ready: false }), seat(1, { ready: true }), seat(2, { ready: true })];
  const v = view({ status: "settled", result, seats }, { ready: false });
  assert.equal(againLine(v).line, "Achilles and Ajax are in. You?");
  assert.equal(stateLine({ view: v, screen: "result" }).line, "Achilles and Ajax are in. You?");
  const nobody = view({ status: "settled", result, seats: seats.map((s) => ({ ...s, ready: false })) }, { ready: false });
  assert.equal(againLine(nobody), null);
  assert.match(stateLine({ view: nobody, screen: "result" }).line, /Again\? The gods are watching\./);
  const meIn = view({ status: "settled", result, seats: [seat(0), seat(1, { ready: false }), seat(2)] }, { ready: true });
  assert.equal(againLine(meIn).title, "YOU'RE IN");
  assert.match(againLine(meIn).line, /Achilles/);
  // Old adapter: no PLAY AGAIN talk.
  assert.equal(againLine(v, { canReady: false }), null);
  assert.doesNotMatch(stateLine({ view: nobody, screen: "result", canReady: false }).line, /Again\?/);
  assert.equal(stateLine({ view: view({ status: "waiting" }, { ready: false }), screen: "paused" }).title, "TABLE PAUSED");
  assert.equal(stateLine({ view: v, screen: "dealin" }).title, "SITTING THIS ONE OUT");
  assert.match(TUTORIAL_OVER_LINE.line, /Your turn! Tutorial's over\./);
});
