import { test } from "vitest";
import assert from "node:assert/strict";
import { MUTATIONS, TABLE_QUERY, createConvexAdapter, mapResult, mapStatus } from "../../src/games/olympus-21/adapters/convexAdapter.js";

const T0 = 1_800_000_000_000;

function tableView(overrides = {}) {
  return {
    tableId: "t1",
    tableKey: "t1:1",
    status: "turns",
    roundNo: 1,
    now: T0 - 30_000, // a cached result built a while ago
    deadline: T0 + 10_000,
    count: 7,
    target: 21,
    seats: [],
    lastMoves: [],
    result: null,
    me: { playerId: "me", seat: 0, balance: 90, hand: [] },
    ...overrides,
  };
}

function serverState(overrides = {}) {
  return {
    status: "live",
    window: { opensAt: T0 - 60_000, closesAt: T0 + 60_000 },
    player: { signedIn: true, eligible: true, checkedIn: true, name: "Ana", balance: 120 },
    view: null,
    serverNow: T0,
    ...overrides,
  };
}

/** Minimal stand-in for ConvexClient: records subscriptions and mutations, lets tests push values. */
function fakeClient(mutationImpl = async () => ({ ok: true, serverNow: T0 })) {
  const subs = [];
  const calls = [];
  return {
    subs,
    calls,
    onUpdate(name, args, callback, onError) {
      const sub = { name, args, callback, onError, active: true };
      subs.push(sub);
      const unsubscribe = () => {
        sub.active = false;
      };
      return Object.assign(unsubscribe, { unsubscribe });
    },
    async mutation(name, args) {
      calls.push({ name, args });
      return mutationImpl(name, args);
    },
    push(value) {
      for (const sub of subs) if (sub.active) sub.callback(value);
    },
    active() {
      return subs.filter((s) => s.active);
    },
  };
}

function clock(start = T0) {
  let t = start;
  const fn = () => t;
  fn.set = (v) => {
    t = v;
  };
  return fn;
}

test("mapStatus: null (signed out / unknown) → no window, signed out", () => {
  assert.deepEqual(mapStatus(null, T0), {
    status: "no_window",
    window: null,
    player: { signedIn: false, eligible: false, checkedIn: false, name: null, balance: 0 },
    buyIn: 0,
    queue: null,
    leaving: false,
    result: null,
  });
});

test("mapStatus: buy-in, queue, leaving and last result pass through (junk is dropped)", () => {
  const s = serverState({ status: "live", window: null });
  const mapped = mapStatus({ ...s, buyIn: 100, queue: { queuedAt: T0, waiting: 3 }, leaving: true, result: { returned: 140, reason: "You left the table." } }, T0);
  assert.equal(mapped.buyIn, 100);
  assert.deepEqual(mapped.queue, { queuedAt: T0, waiting: 3 });
  assert.equal(mapped.leaving, true);
  assert.deepEqual(mapped.result, { returned: 140, reason: "You left the table." });
  const junk = mapStatus({ ...s, buyIn: -5, queue: { queuedAt: "soon" }, result: "nope" }, T0);
  assert.equal(junk.buyIn, 0);
  assert.equal(junk.queue, null);
  assert.equal(junk.result, null);
});

test("mapStatus: copies window and player, flips teaser → live → closed on the server clock", () => {
  const s = serverState({ status: "teaser", window: { opensAt: T0 + 1000, closesAt: T0 + 5000 } });
  assert.equal(mapStatus(s, T0).status, "teaser");
  assert.equal(mapStatus(s, T0 + 1000).status, "live");
  assert.equal(mapStatus(s, T0 + 5000).status, "closed");
  assert.deepEqual(mapStatus(s, T0).window, { opensAt: T0 + 1000, closesAt: T0 + 5000 });
  assert.deepEqual(mapStatus(s, T0).player, { signedIn: true, eligible: true, checkedIn: true, name: "Ana", balance: 120 });
  assert.equal(mapStatus({ ...s, status: "weird" }, T0).status, "no_window");
  assert.equal(mapStatus({ ...s, status: "closed" }, T0 + 1000).status, "closed");
});

test("mapResult: ok, DUPLICATE counts as ok, codes pass through, junk is BAD_RESPONSE", () => {
  assert.deepEqual(mapResult({ ok: true, serverNow: 1 }), { ok: true });
  assert.deepEqual(mapResult({ ok: false, code: "DUPLICATE" }), { ok: true });
  assert.deepEqual(mapResult({ ok: false, code: "NOT_YOUR_TURN" }), { ok: false, code: "NOT_YOUR_TURN" });
  assert.deepEqual(mapResult({ ok: false }), { ok: false, code: "REJECTED" });
  assert.deepEqual(mapResult(null), { ok: false, code: "BAD_RESPONSE" });
});

test("requires a client", () => {
  assert.throws(() => createConvexAdapter({}), TypeError);
});

test("subscribes to getMyTable with a nowBucket; null until the first answer", () => {
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock(), nowBucketMs: 15000 });
  try {
    assert.equal(client.subs.length, 1);
    assert.equal(client.subs[0].name, TABLE_QUERY);
    assert.deepEqual(client.subs[0].args, { nowBucket: Math.floor(T0 / 15000) });
    assert.equal(adapter.getState(), null);
    assert.equal(adapter.getStatus(), null);
  } finally {
    adapter.dispose();
  }
});

test("not seated: getState null, getStatus has status/window/player; listeners get null", () => {
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock() });
  const seen = [];
  adapter.subscribe((v) => seen.push(v));
  try {
    client.push(serverState({ status: "teaser", window: { opensAt: T0 + 60_000, closesAt: T0 + 120_000 } }));
    assert.equal(adapter.getState(), null);
    assert.deepEqual(seen, [null]);
    const status = adapter.getStatus();
    assert.equal(status.status, "teaser");
    assert.equal(status.player.balance, 120);
    assert.equal(status.player.name, "Ana");
  } finally {
    adapter.dispose();
  }
});

test("seated: view.now is rewritten to the current server time (deadline math stays right)", () => {
  const client = fakeClient();
  const now = clock(T0 + 5000); // local clock is 5 s ahead of the server
  const adapter = createConvexAdapter({ client, now });
  const seen = [];
  adapter.subscribe((v) => seen.push(v));
  try {
    client.push(serverState({ view: tableView(), serverNow: T0 }));
    assert.equal(adapter.serverOffset(), -5000);
    const v = adapter.getState();
    assert.equal(v.now, T0); // not the stale T0 - 30 s the query was built at
    assert.equal(v.deadline - v.now, 10_000);
    assert.equal(seen[0].now, T0);
    now.set(T0 + 7000);
    assert.equal(adapter.getState().now, T0 + 2000);
    assert.equal(adapter.serverNow(), T0 + 2000);
  } finally {
    adapter.dispose();
  }
});

test("clock offset: keeps the best (largest) recent sample, so a stale cached result can't drag it back", () => {
  const client = fakeClient();
  const now = clock(T0);
  const adapter = createConvexAdapter({ client, now });
  try {
    client.push(serverState({ serverNow: T0 + 1000 }));
    assert.equal(adapter.serverOffset(), 1000);
    client.push(serverState({ serverNow: T0 - 20_000 })); // cached result from earlier
    assert.equal(adapter.serverOffset(), 1000);
  } finally {
    adapter.dispose();
  }
});

test("mutations: names, fresh actionIds, args; join and cancelQueue take no arguments", async () => {
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock() });
  try {
    assert.deepEqual(await adapter.join(), { ok: true });
    await adapter.cancelQueue();
    await adapter.placeWager(25);
    await adapter.play("R7");
    await adapter.play("W", "B");
    await adapter.draw();
    await adapter.ready();
    await adapter.leave();
    const names = client.calls.map((c) => c.name);
    assert.deepEqual(names, [MUTATIONS.join, MUTATIONS.cancelQueue, MUTATIONS.placeWager, MUTATIONS.play, MUTATIONS.play, MUTATIONS.draw, MUTATIONS.ready, MUTATIONS.leave]);
    const strip = ({ actionId, ...rest }) => rest;
    assert.deepEqual(client.calls.map((c) => strip(c.args)), [{}, {}, { amount: 25 }, { card: "R7" }, { card: "W", color: "B" }, {}, {}, {}]);
    const ids = client.calls.map((c) => c.args.actionId);
    assert.ok(ids.every((id) => typeof id === "string" && id.length >= 8));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(MUTATIONS.join, "arcade/olympus21:joinQueue");
    assert.equal(TABLE_QUERY, "arcade/olympus21:getMyTable");
  } finally {
    adapter.dispose();
  }
});

test("mutations: error codes pass through, DUPLICATE is ok, thrown errors → NETWORK + onError", async () => {
  const errors = [];
  let reply = { ok: false, code: "NOT_CHECKED_IN", serverNow: T0 };
  const client = fakeClient(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const adapter = createConvexAdapter({ client, now: clock(), onError: (e) => errors.push(e) });
  try {
    assert.deepEqual(await adapter.join(), { ok: false, code: "NOT_CHECKED_IN" });
    reply = { ok: false, code: "DUPLICATE", serverNow: T0 };
    assert.deepEqual(await adapter.draw(), { ok: true });
    reply = new Error("offline");
    assert.deepEqual(await adapter.draw(), { ok: false, code: "NETWORK" });
    assert.equal(errors.length, 1);
  } finally {
    adapter.dispose();
  }
});

test("mutation serverNow updates the clock offset", async () => {
  const client = fakeClient(async () => ({ ok: true, serverNow: T0 + 3000 }));
  const adapter = createConvexAdapter({ client, now: clock() });
  try {
    await adapter.draw();
    assert.equal(adapter.serverOffset(), 3000);
  } finally {
    adapter.dispose();
  }
});

test("query errors go to onError", () => {
  const errors = [];
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock(), onError: (e) => errors.push(e) });
  try {
    client.subs[0].onError(new Error("boom"));
    assert.equal(errors.length, 1);
  } finally {
    adapter.dispose();
  }
});

test("dispose unsubscribes, clears listeners and refuses commands", async () => {
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock() });
  const seen = [];
  adapter.subscribe((v) => seen.push(v));
  adapter.dispose();
  assert.equal(client.active().length, 0);
  client.subs[0].callback(serverState());
  assert.deepEqual(seen, []);
  assert.deepEqual(await adapter.draw(), { ok: false, code: "DISPOSED" });
  assert.equal(client.calls.length, 0);
});

test("unsubscribe from subscribe() stops updates", () => {
  const client = fakeClient();
  const adapter = createConvexAdapter({ client, now: clock() });
  const seen = [];
  const off = adapter.subscribe((v) => seen.push(v));
  try {
    off();
    client.push(serverState());
    assert.deepEqual(seen, []);
  } finally {
    adapter.dispose();
  }
});

test("a failing table query (functions not deployed) reports unavailable instead of connecting forever", () => {
  const errors = [];
  let fail;
  const client = {
    onUpdate(_name, _args, _onValue, onError) {
      fail = onError;
      return () => {};
    },
    mutation: async () => ({ ok: true }),
  };
  const adapter = createConvexAdapter({ client, onError: (e) => errors.push(e) });
  try {
    assert.equal(adapter.getStatus(), null);
    fail(new Error("Could not find public function for 'arcade/olympus21:getMyTable'"));
    assert.equal(errors.length, 1);
    assert.equal(adapter.getStatus()?.unavailable, true);
  } finally {
    adapter.dispose();
  }
});
