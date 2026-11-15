import { describe, expect, it } from "vitest";
import { DEFAULT_TIMINGS, autoMoveFor, draw, leave, placeWager, play, viewFor, type Table } from "./liveHelpers";
import {
  O21_BUY_IN,
  O21_IDLE_CLOSE_MS,
  joinLive,
  openLiveTable,
  roomPlayers,
  runLive,
  saveLive,
  seatedPlayer,
  type CashOut,
} from "../../shared/olympus21/live";
import { seededRng } from "../../shared/olympus21/rules.js";

const T0 = 1_800_000_000_000;
const rng = seededRng(7);

describe("joinLive / roomPlayers (filling a running table)", () => {
  it("a newcomer sits down mid-round with the buy-in and is dealt in next round", () => {
    const table = openLiveTable({ id: "t", humans: [{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }], now: T0, rng });
    expect(roomPlayers(table)).toBe(2);
    expect(joinLive(table, { id: "c", name: "Cy" }, T0)).toEqual({ ok: true });
    expect(roomPlayers(table)).toBe(3);
    expect(seatedPlayer(table, "c")).toMatchObject({ balance: O21_BUY_IN, bot: false });
  });

  it("refuses a fifth player", () => {
    const table = openLiveTable({ id: "t", humans: ["a", "b", "c", "d"].map((id) => ({ id, name: id })), now: T0, rng });
    expect(joinLive(table, { id: "e", name: "E" }, T0)).toEqual({ ok: false, code: "TABLE_FULL" });
  });
});

/** A stored table plus the run loop the server does: every call is one mutation or tick. */
function harness(humans: string[]) {
  let now = T0;
  let state = saveLive(openLiveTable({ id: "t1", humans: humans.map((id) => ({ id, name: id })), now, rng }));
  let idleSince: number | null = null;
  const paid: CashOut[] = [];
  let closed = false;
  const run = (command?: (table: Table) => { ok: boolean } | null, open = true, queueWaiting = false) => {
    const out = runLive(state, { now, rng, open, idleSince, queueWaiting, command: command as never });
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

  it("keeps a table with one player open while someone is queued, so the next hacker takes the seat", () => {
    const h = harness(["a", "b"]);
    const out = h.run((table) => leave(table, "a", h.now), true, true);
    expect(out.closed).toBe(false);
    expect(out.cashOuts).toEqual([{ playerId: "a", chips: O21_BUY_IN, reason: "left" }]);
    // The queued hacker sits down and the table plays on.
    expect(h.run((table) => joinLive(table, { id: "c", name: "Cy" }, h.now)).closed).toBe(false);
    expect(roomPlayers(h.table())).toBe(2);
    // With nobody queued, a lone player's table breaks and pays them.
    const h2 = harness(["a", "b"]);
    expect(h2.run((table) => leave(table, "a", h2.now)).closed).toBe(true);
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
