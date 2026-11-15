import { describe, expect, it } from "vitest";
import { DEFAULT_TIMINGS, autoMoveFor, draw, leave, placeWager, play, viewFor, type Table } from "./liveHelpers";
import {
  O21_BUY_IN,
  O21_IDLE_CLOSE_MS,
  O21_QUEUE_FILL_MS,
  chooseSeating,
  openLiveTable,
  runLive,
  saveLive,
  seatedPlayer,
  type CashOut,
} from "../../shared/olympus21/live";
import { seededRng } from "../../shared/olympus21/rules.js";

const T0 = 1_800_000_000_000;
const rng = seededRng(7);

const q = (n: number, at = T0) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, joinedAt: at + i }));

describe("chooseSeating (poker's rule, humans only)", () => {
  it("waits with nobody queued, or too early", () => {
    expect(chooseSeating([], T0)).toBeNull();
    expect(chooseSeating(q(2), T0 + 100)).toBeNull();
  });

  it("never seats a lone hacker, however long they wait (no bots)", () => {
    expect(chooseSeating(q(1), T0 + 60 * 60_000)).toBeNull();
  });

  it("seats a full group at once, the four oldest first", () => {
    const queue = [...q(4, T0 + 10), { id: "oldest", joinedAt: T0 }];
    expect(chooseSeating(queue, T0 + 20)!.map((h) => h.id)).toEqual(["oldest", "h0", "h1", "h2"]);
  });

  it("seats 2–3 humans together after the short wait", () => {
    expect(chooseSeating(q(2), T0 + O21_QUEUE_FILL_MS)!.map((h) => h.id)).toEqual(["h0", "h1"]);
    expect(chooseSeating(q(3), T0 + O21_QUEUE_FILL_MS)).toHaveLength(3);
  });
});

/** A stored table plus the run loop the server does: every call is one mutation or tick. */
function harness(humans: string[]) {
  let now = T0;
  let state = saveLive(openLiveTable({ id: "t1", humans: humans.map((id) => ({ id, name: id })), now, rng }));
  let idleSince: number | null = null;
  const paid: CashOut[] = [];
  let closed = false;
  const run = (command?: (table: Table) => { ok: boolean } | null, open = true) => {
    const out = runLive(state, { now, rng, open, idleSince, command: command as never });
    state = saveLive(out.table);
    idleSince = out.idleSince;
    paid.push(...out.cashOuts);
    closed = out.closed;
    return out;
  };
  const table = () => runLive(state, { now, rng, open: true, idleSince }).table;
  return {
    run,
    table,
    paid,
    get now() {
      return now;
    },
    get closed() {
      return closed;
    },
    advance(ms: number) {
      now += ms;
      return run();
    },
  };
}

/** Chips anywhere: seated players, the pots, and what was paid out. Never changes. */
function chipsEverywhere(table: Table, paid: CashOut[]) {
  const seated = table.seats.reduce((sum, p) => sum + (p ? p.balance : 0), 0);
  // Bets sit in the pots only while a round is being played; after it they're paid out.
  const live = table.status === "countdown" || table.status === "turns";
  const pots = live ? table.pots.reduce((sum, pot) => sum + pot.amount, 0) : 0;
  return seated + pots + paid.reduce((sum, c) => sum + c.chips, 0);
}

describe("openLiveTable", () => {
  it("seats only the humans, each with the buy-in as chips", () => {
    const table = openLiveTable({ id: "t", humans: [{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }], now: T0, rng });
    const seated = table.seats.filter(Boolean);
    expect(seated.map((p) => [p!.id, p!.bot, p!.balance])).toEqual([
      ["a", false, O21_BUY_IN],
      ["b", false, O21_BUY_IN],
    ]);
  });
});

describe("runLive", () => {
  it("leaving before a round pays the whole buy-in back", () => {
    const h = harness(["a", "b"]);
    const out = h.run((table) => leave(table, "a", h.now));
    // b is alone now: like poker, the table breaks and pays b too, in the same run.
    expect(h.closed).toBe(true);
    expect(out.cashOuts).toEqual([
      { playerId: "a", chips: O21_BUY_IN, reason: "left" },
      { playerId: "b", chips: O21_BUY_IN, reason: "closed" },
    ]);
  });

  it("closing the game (arcade off) closes the table and pays everyone their chips", () => {
    const h = harness(["a", "b"]);
    const out = h.run(undefined, false);
    expect(out.closed).toBe(true);
    expect(out.wakeAt).toBeNull();
    expect(out.cashOuts.map((c) => [c.playerId, c.chips, c.reason])).toEqual([
      ["a", O21_BUY_IN, "closed"],
      ["b", O21_BUY_IN, "closed"],
    ]);
    // A closed table never pays twice.
    expect(h.run(undefined, false).cashOuts).toEqual([]);
  });

  it("plays full rounds: chips are conserved, and the table pays everyone out when it ends", () => {
    const h = harness(["a", "b", "c"]);
    const start = chipsEverywhere(h.table(), h.paid);
    expect(start).toBe(3 * O21_BUY_IN);
    // Nobody acts: bets default, turns time out, players get unseated after 3 timeouts or
    // the idle rule closes the table. Not one chip appears or disappears on the way.
    for (let i = 0; i < 2_000 && !h.closed; i += 1) {
      h.advance(1_000);
      expect(chipsEverywhere(h.table(), h.paid)).toBe(start);
    }
    expect(h.closed).toBe(true);
    expect(h.paid.map((c) => c.playerId).sort()).toEqual(["a", "b", "c"]);
    expect(h.paid.reduce((sum, c) => sum + c.chips, 0)).toBe(start);
  });

  it("a player who leaves mid-round loses their bet and gets the rest when the round settles", () => {
    const h = harness(["a", "b", "c"]);
    h.advance(DEFAULT_TIMINGS.seatLockMs); // wagering
    for (const id of ["a", "b", "c"]) h.run((table) => placeWager(table, id, 20, h.now));
    h.advance(DEFAULT_TIMINGS.countdownMs); // turns
    expect(h.table().status).toBe("turns");
    const out = h.run((table) => leave(table, "a", h.now));
    expect(out.cashOuts).toEqual([]); // still in the pots until the result
    expect(seatedPlayer(h.table(), "a")?.gone).toBe(true);
    // Let b and c finish the round by playing legal moves.
    for (let i = 0; i < 200 && h.paid.length === 0; i += 1) {
      const table = h.table();
      if (table.status === "turns" && table.turnSeat !== null) {
        const p = table.seats[table.turnSeat]!;
        const move = autoMoveFor(table, p.id);
        h.run((t) => (move.kind === "play" ? play(t, p.id, move.card, move.color, h.now) : draw(t, p.id, h.now)));
      } else {
        h.advance(1_000);
      }
    }
    const mine = h.paid.find((c) => c.playerId === "a");
    expect(mine).toEqual({ playerId: "a", chips: O21_BUY_IN - 20, reason: "left" });
  });

  it("closes a table where no human has been ready for too long", () => {
    const h = harness(["a", "b"]);
    // Nobody presses anything: the round plays out on timeouts, then nobody presses PLAY AGAIN.
    for (let i = 0; i < 2_000 && !h.closed; i += 1) h.advance(5_000);
    expect(h.closed).toBe(true);
    expect(h.paid.map((c) => c.playerId).sort()).toEqual(["a", "b"]);
    expect(h.paid.reduce((sum, c) => sum + c.chips, 0)).toBe(2 * O21_BUY_IN);
  });

  it("asks to be woken before the next timer and at least every heartbeat", () => {
    const h = harness(["a", "b"]);
    const out = h.run();
    expect(out.wakeAt).toBeGreaterThanOrEqual(h.now);
    expect(out.wakeAt).toBeLessThanOrEqual(h.now + DEFAULT_TIMINGS.seatLockMs);
    expect(O21_IDLE_CLOSE_MS).toBeGreaterThan(DEFAULT_TIMINGS.resultMs);
  });

  it("never shows hands or piles in a player's view", () => {
    const h = harness(["a", "b"]);
    h.advance(DEFAULT_TIMINGS.seatLockMs);
    h.run((table) => placeWager(table, "a", 10, h.now));
    h.run((table) => placeWager(table, "b", 10, h.now));
    h.advance(DEFAULT_TIMINGS.countdownMs);
    const view = viewFor(h.table(), "a", h.now);
    expect(JSON.stringify(view)).not.toContain("drawPile");
    expect(view.me?.hand.length).toBeGreaterThan(0);
    for (const seat of view.seats) expect(seat).not.toHaveProperty("hand");
  });
});
