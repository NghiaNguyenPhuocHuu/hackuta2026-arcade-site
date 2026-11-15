/**
 * Olympus 21 Convex adapter, backed by `arcade/olympus21` on the deployment the `client`
 * points at. Matchmaking works like Olympus Poker: `join()` buys in from the arcade wallet
 * and waits in the event-wide queue; the server seats you with other hackers (humans only).
 *
 *   const adapter = createConvexAdapter({ client, onError });
 *
 * - `client` is a `ConvexClient` from `convex/browser` that the host has already
 *   authenticated. The adapter never handles credentials or tokens.
 * - The server decides everything (seat, legality, balances). The adapter maps shapes,
 *   adds a fresh `actionId` to every mutation, and keeps a server clock offset.
 * - `getMyTable` takes a coarse `nowBucket` so Convex re-runs it as time passes
 *   (queries are cached by their args).
 * - `getStatus()` → `{ status, window, player, buyIn, queue, leaving, result }` (or null
 *   before the first answer) for the SPA's lobby. `getState()` is the TableView, or null when
 *   not seated.
 *
 * Timers: the SPA computes remaining time as `deadline - view.now - (time since the view
 * arrived)`. A Convex result can be a cached one built a while ago, so `view.now` is
 * rewritten to the current server time estimate every time a view is handed out.
 */

export const TABLE_QUERY = "arcade/olympus21:getMyTable";
export const MUTATIONS = {
  join: "arcade/olympus21:joinQueue",
  cancelQueue: "arcade/olympus21:cancelQueue",
  leave: "arcade/olympus21:leave",
  placeWager: "arcade/olympus21:placeWagerMove",
  play: "arcade/olympus21:playCard",
  draw: "arcade/olympus21:drawCard",
  ready: "arcade/olympus21:playAgain",
};

const STATUSES = new Set(["no_window", "teaser", "live", "closed"]);
const OFFSET_SAMPLE_MS = 2 * 60 * 1000; // offset = best sample seen in this long

function newActionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return `a-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function callUnsubscribe(handle) {
  if (typeof handle === "function") handle();
  else handle?.unsubscribe?.();
}

const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/**
 * Pure: the `getMyTable` result → `{ status, window, player }`. The status flips at the
 * window edges on the server clock (`serverNow`), so teaser → live → closed happens on time
 * between server updates.
 * @param {any} server
 * @param {number} serverNow
 */
export function mapStatus(server, serverNow = Date.now()) {
  if (!server || typeof server !== "object") {
    return {
      status: "no_window",
      window: null,
      player: { signedIn: false, eligible: false, checkedIn: false, name: null, balance: 0 },
      buyIn: 0,
      queue: null,
      leaving: false,
      result: null,
    };
  }
  const win =
    server.window && Number.isFinite(server.window.opensAt) && Number.isFinite(server.window.closesAt)
      ? { opensAt: server.window.opensAt, closesAt: server.window.closesAt }
      : null;
  let status = STATUSES.has(server.status) ? server.status : "no_window";
  if (win) {
    if (status === "teaser" && serverNow >= win.opensAt) status = "live";
    if ((status === "teaser" || status === "live") && serverNow >= win.closesAt) status = "closed";
  }
  const p = server.player && typeof server.player === "object" ? server.player : {};
  return {
    status,
    window: win,
    player: {
      signedIn: Boolean(p.signedIn),
      eligible: Boolean(p.eligible),
      checkedIn: Boolean(p.checkedIn),
      name: typeof p.name === "string" && p.name ? p.name : null,
      balance: toCount(p.balance),
    },
    buyIn: toCount(server.buyIn),
    queue:
      server.queue && typeof server.queue === "object" && Number.isFinite(server.queue.queuedAt)
        ? { queuedAt: server.queue.queuedAt, waiting: toCount(server.queue.waiting) }
        : null,
    leaving: Boolean(server.leaving),
    result:
      server.result && typeof server.result === "object"
        ? { returned: toCount(server.result.returned), reason: typeof server.result.reason === "string" ? server.result.reason : "" }
        : null,
  };
}

/** Pure: a mutation result → `{ ok, code? }`. DUPLICATE means the action already happened. */
export function mapResult(result) {
  if (!result || typeof result !== "object") return { ok: false, code: "BAD_RESPONSE" };
  if (result.ok) return { ok: true };
  if (result.code === "DUPLICATE") return { ok: true };
  return { ok: false, code: typeof result.code === "string" && result.code ? result.code : "REJECTED" };
}

/**
 * @param {{ client: { onUpdate: Function, mutation: Function },
 *   onError?: (error: unknown) => void, nowBucketMs?: number, now?: () => number }} options
 */
export function createConvexAdapter({ client, onError, nowBucketMs = 15000, now = Date.now } = {}) {
  if (!client || typeof client.onUpdate !== "function" || typeof client.mutation !== "function") {
    throw new TypeError("createConvexAdapter: a ConvexClient is required");
  }
  const listeners = new Set();
  let server = null; // last getMyTable result
  let received = false;
  /** The table query failed (e.g. the functions aren't deployed yet); cleared by the next answer. */
  let unavailable = false;
  let disposed = false;
  let bucket = null;
  let handle = null;
  let edgeTimer = null;
  /** Clock offset samples (serverNow - local clock). Each is a lower bound (latency, caching). */
  let samples = [];
  let offset = 0;

  function noteServerNow(serverNow, localAt = now()) {
    if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
    const t = now();
    samples = samples.filter((s) => t - s.at < OFFSET_SAMPLE_MS);
    samples.push({ value: serverNow - localAt, at: t });
    offset = Math.max(...samples.map((s) => s.value));
  }

  const serverNow = () => now() + offset;
  const bucketFor = (time) => Math.floor(time / nowBucketMs);

  function getState() {
    const view = server?.view;
    if (!view || typeof view !== "object") return null;
    return { ...view, now: serverNow() };
  }

  function getStatus() {
    if (unavailable && !received) return { ...mapStatus(null), unavailable: true };
    return received ? { ...mapStatus(server, serverNow()), unavailable: false } : null;
  }

  function emit() {
    if (disposed) return;
    const view = getState();
    for (const fn of [...listeners]) {
      try {
        fn(view);
      } catch (err) {
        console.error(err);
      }
    }
    scheduleEdge();
  }

  /** Re-emit exactly at the next window edge so the lobby flips on time. */
  function scheduleEdge() {
    clearTimeout(edgeTimer);
    edgeTimer = null;
    const win = server?.window;
    if (!win || disposed) return;
    const t = serverNow();
    const next = [win.opensAt, win.closesAt].filter((edge) => Number.isFinite(edge) && edge > t).sort((a, b) => a - b)[0];
    if (next === undefined) return;
    edgeTimer = setTimeout(() => {
      edgeTimer = null;
      emit();
      resubscribe(true);
    }, Math.min(next - t + 50, 2 ** 31 - 1));
  }

  function resubscribe(force = false) {
    if (disposed) return;
    const nextBucket = bucketFor(serverNow());
    if (!force && nextBucket === bucket) return;
    bucket = nextBucket;
    const previous = handle;
    handle = client.onUpdate(
      TABLE_QUERY,
      { nowBucket: bucket },
      (value) => {
        if (disposed) return;
        received = true;
        unavailable = false;
        server = value && typeof value === "object" ? value : null;
        noteServerNow(server?.serverNow);
        emit();
      },
      (error) => {
        if (disposed) return;
        onError?.(error);
        if (!received) {
          unavailable = true;
          emit();
        }
      },
    );
    callUnsubscribe(previous);
  }

  const ticker = setInterval(() => resubscribe(), Math.max(1000, Math.floor(nowBucketMs / 3)));

  async function call(kind, args = {}) {
    if (disposed) return { ok: false, code: "DISPOSED" };
    const sentAt = now();
    try {
      const result = await client.mutation(MUTATIONS[kind], { actionId: newActionId(), ...args });
      // Midpoint of the round trip: the server answered roughly halfway.
      if (result && typeof result === "object") noteServerNow(result.serverNow, sentAt + (now() - sentAt) / 2);
      return mapResult(result);
    } catch (error) {
      onError?.(error);
      return { ok: false, code: "NETWORK" };
    }
  }

  resubscribe(true);

  return {
    getState,
    getStatus,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Buy in and wait in the queue; the server seats you (poker's matchmaking). */
    join: () => call("join"),
    /** Leave the queue before a seat comes up; the buy-in goes back to the wallet. */
    cancelQueue: () => call("cancelQueue"),
    leave: () => call("leave"),
    placeWager: (amount) => call("placeWager", { amount }),
    play: (card, color) => call("play", color ? { card, color } : { card }),
    draw: () => call("draw"),
    /** PLAY AGAIN: deal me into the next round (CONTRACT §7). */
    ready: () => call("ready"),
    /** Server clock minus local clock, in ms. */
    serverOffset: () => offset,
    serverNow,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(ticker);
      clearTimeout(edgeTimer);
      callUnsubscribe(handle);
      handle = null;
      listeners.clear();
    },
  };
}
