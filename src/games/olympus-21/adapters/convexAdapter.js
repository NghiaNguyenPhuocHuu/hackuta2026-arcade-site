/**
 * Olympus 21 Convex adapter (CONTRACT §9 "SPA adapter"). Same shape as the mock and LAN
 * adapters (CONTRACT §5 + §7), backed by the real `admin/o21Tables` functions on the
 * deployment the `client` points at.
 *
 *   const adapter = createConvexAdapter({ client, onError });
 *
 * - `client` is a `ConvexClient` from `convex/browser` that the host has already
 *   authenticated. The adapter never handles credentials or tokens.
 * - The server decides everything (seat, legality, balances). The adapter maps shapes,
 *   adds a fresh `actionId` to every mutation, and keeps a server clock offset.
 * - `getMyTable` takes a coarse `nowBucket` so Convex re-runs it as time passes
 *   (queries are cached by their args).
 * - Peccary tables are player vs player: `join(name, { bots })` ignores `bots`.
 * - `getStatus()` → `{ status, window, player }` (or null before the first answer) for the
 *   host and the SPA's lobby. `getState()` is the TableView, or null when not seated.
 *
 * Timers: the SPA computes remaining time as `deadline - view.now - (time since the view
 * arrived)`. A Convex result can be a cached one built a while ago, so `view.now` is
 * rewritten to the current server time estimate every time a view is handed out.
 */

export const TABLE_QUERY = "admin/o21Tables:getMyTable";
export const MUTATIONS = {
  join: "admin/o21Tables:join",
  leave: "admin/o21Tables:leave",
  placeWager: "admin/o21Tables:placeWager",
  play: "admin/o21Tables:play",
  draw: "admin/o21Tables:draw",
  ready: "admin/o21Tables:ready",
};

const STATUSES = new Set(["no_window", "teaser", "live", "closed"]);
const OFFSET_SAMPLE_MS = 2 * 60 * 1000; // offset = best sample seen in this long
const NAME_MAX = 24;

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
    return received ? mapStatus(server, serverNow()) : null;
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
        server = value && typeof value === "object" ? value : null;
        noteServerNow(server?.serverNow);
        emit();
      },
      (error) => onError?.(error),
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
    /** join(name?): the server picks a table (auto-match). Bots don't exist on peccary. */
    join(name) {
      const clean = typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "";
      return call("join", clean ? { name: clean } : {});
    },
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
