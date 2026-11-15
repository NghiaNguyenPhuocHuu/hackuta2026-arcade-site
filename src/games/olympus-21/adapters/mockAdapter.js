/**
 * In-browser Olympus 21 backend: runs the shared engine locally with real
 * timers and bots. Same adapter shape as the LAN client (CONTRACT §5).
 *
 *   const adapter = createMockAdapter({ name: "Riley", bots: 3 });
 */
import * as engine from "../../../../shared/olympus21/engine.js";
import { seededRng } from "../../../../shared/olympus21/rules.js";
import { MIN_WAGER } from "../../../../shared/olympus21/wagers.js";

const BOT_NAMES = ["Hermes", "Artemis", "Apollo", "Hera", "Hestia", "Ares"];
const TICK_MS = 200;
const LATENCY_MS = 60;

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ playerId?: string, name?: string, bots?: number, balance?: number,
 *   timings?: object, seed?: number, botBalance?: number, latencyMs?: number }} [options]
 */
export function createMockAdapter(options = {}) {
  const playerId = options.playerId ?? newId();
  const defaultBots = clampBots(options.bots ?? 3);
  const balance = options.balance ?? 200;
  const botBalance = options.botBalance ?? 500;
  const latencyMs = options.latencyMs ?? LATENCY_MS;
  const seed = Number.isFinite(options.seed) ? options.seed : Math.floor(Math.random() * 2 ** 31);
  const rng = seededRng(seed);
  const now = () => Date.now();
  let createdAt = now();
  let table = engine.createTable({ id: "mock", timings: options.timings, rng, now: createdAt });
  /** Simulated play window (the sandbox's organizer buttons). Default: live with no end. */
  let win = { status: "live", opensAt: null, closesAt: null };
  let carried = null; // the human's balance from a table that closed (keeps fake points across a reopen)
  const listeners = new Set();
  const timers = new Map(); // timeout id → resolve
  let view = engine.viewFor(table, playerId, now());
  let disposed = false;
  let botSerial = 0;

  function emit() {
    if (disposed) return;
    view = engine.viewFor(table, playerId, now());
    for (const fn of [...listeners]) {
      try {
        fn(view);
      } catch (err) {
        console.error(err);
      }
    }
  }

  let removeListener = engine.addListener(table, emit);

  /** A closed engine table can't reopen: a fresh one (new tableKey) replaces it. The human keeps their points. */
  function freshTable(t) {
    const mine = engine.viewFor(table, playerId, t).me?.balance;
    if (typeof mine === "number") carried = mine;
    removeListener();
    createdAt = Math.max(t, createdAt + 1);
    table = engine.createTable({ id: "mock", timings: options.timings, rng, now: createdAt });
    removeListener = engine.addListener(table, emit);
  }

  function applyWindow(next, t) {
    if (next.status === "live") {
      if (table.status === "closed") freshTable(t);
    } else if (table.status !== "closed") {
      engine.closeTable(table, t); // the round in progress settles and pays out; no new round starts
    }
    win = next;
    emit();
  }

  /** Window edges: teaser → live at opensAt, live → closed at closesAt. */
  function windowTick(t) {
    if (win.status === "teaser" && t >= win.opensAt) applyWindow({ status: "live", opensAt: win.opensAt, closesAt: win.closesAt }, t);
    else if (win.status === "live" && win.closesAt !== null && t >= win.closesAt) applyWindow({ status: "closed", opensAt: win.opensAt, closesAt: win.closesAt }, t);
  }

  const ticker = setInterval(() => {
    if (disposed) return;
    windowTick(now());
    engine.tick(table, now());
  }, TICK_MS);

  function later(fn) {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        timers.delete(id);
        resolve(disposed ? { ok: false, code: "DISPOSED" } : fn());
      }, latencyMs);
      timers.set(id, resolve);
    });
  }

  function command(fn) {
    return later(() => {
      const result = fn(now());
      engine.tick(table, now());
      return result && typeof result === "object" ? { ok: !!result.ok, ...(result.code ? { code: result.code } : {}) } : { ok: false, code: "ERROR" };
    });
  }

  function seatedBots() {
    return table.seats.filter((p) => p && p.bot && !p.gone).length;
  }

  return {
    playerId,
    getState: () => view,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** join(name?, { bots? }): seats the human, then tops the table up to `bots` bot players. */
    join(name, opts = {}) {
      const bots = clampBots(opts.bots ?? defaultBots);
      return command((t) => {
        windowTick(t);
        if (win.status === "teaser") return { ok: false, code: "NO_WINDOW" };
        if (win.status === "closed") return { ok: false, code: "TABLE_CLOSED" };
        const start = carried !== null && carried >= MIN_WAGER ? carried : balance;
        const result = engine.join(table, { id: playerId, name: name || options.name || "You", balance: start }, t);
        if (result.ok) carried = null;
        if (!result.ok) return result;
        let guard = 0;
        while (seatedBots() < bots && guard++ < 8) {
          const botName = BOT_NAMES[botSerial % BOT_NAMES.length];
          botSerial += 1;
          const r = engine.join(table, { id: `bot-${botSerial}-${seed % 1000}`, name: botName, balance: botBalance, bot: true }, t);
          if (!r.ok) break;
        }
        return result;
      });
    },
    leave: () => command((t) => engine.leave(table, playerId, t)),
    placeWager: (amount) => command((t) => engine.placeWager(table, playerId, amount, t)),
    play: (card, color) => command((t) => engine.play(table, playerId, card, color, t)),
    draw: () => command((t) => engine.draw(table, playerId, t)),
    /** PLAY AGAIN: deal me into the next round (CONTRACT §7). */
    ready: () => command((t) => engine.ready(table, playerId, t)),
    /** { status, window: { opensAt, closesAt } | null, player: null }, like the LAN adapter's. */
    getStatus() {
      const w = win.opensAt === null && win.closesAt === null ? null : { opensAt: win.opensAt, closesAt: win.closesAt };
      return { status: win.status, window: w, player: null };
    },
    /**
     * Organizer controls for this in-browser table: { status: "live" | "teaser" | "closed", opensAt?, closesAt? }.
     * live reopens (a fresh table if the old one closed), closed runs closeTable, teaser closes now and
     * opens on its own at opensAt. Returns { ok, code? }.
     */
    setWindow({ status, opensAt = null, closesAt = null } = {}) {
      if (disposed) return { ok: false, code: "DISPOSED" };
      const t = now();
      const time = (v) => v === null || (typeof v === "number" && Number.isFinite(v));
      if (!["live", "teaser", "closed"].includes(status) || !time(opensAt) || !time(closesAt)) return { ok: false, code: "BAD_WINDOW" };
      if (status === "teaser" && (opensAt === null || opensAt <= t)) return { ok: false, code: "BAD_WINDOW" };
      if (opensAt !== null && closesAt !== null && closesAt <= opensAt) return { ok: false, code: "BAD_WINDOW" };
      if (status === "live") applyWindow({ status, opensAt: opensAt ?? t, closesAt }, t);
      else if (status === "closed") applyWindow({ status, opensAt: opensAt ?? win.opensAt, closesAt: closesAt ?? t }, t);
      else applyWindow({ status, opensAt, closesAt }, t);
      windowTick(t); // a live window that already ended closes straight away
      return { ok: true };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(ticker);
      for (const [id, resolve] of timers) {
        clearTimeout(id);
        resolve({ ok: false, code: "DISPOSED" });
      }
      timers.clear();
      removeListener();
      listeners.clear();
    },
  };
}

function clampBots(n) {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : 3;
}
