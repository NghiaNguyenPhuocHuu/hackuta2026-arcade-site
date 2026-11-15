/**
 * Event-wide Olympus Poker matchmaking.
 *
 * Every laptop hitting peccary shares one queue. The browser holds a player
 * token; only the SHA-256 hash is stored. Hole cards and the remaining deck
 * stay on the table document and are stripped from public queries.
 */
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../lib/dataModel";
import { sha256Hex } from "../lib/sha256Hex";
import {
  applyAction,
  chooseBotAction,
  POKER_ACTION_TIMEOUT_MS,
  POKER_BOT_FILL_MS,
  POKER_BOT_NAMES,
  POKER_BOT_THINK_MAX_MS,
  POKER_BOT_THINK_MIN_MS,
  POKER_BUY_IN,
  POKER_INSTANT_SEATS,
  POKER_MAX_PLAYERS,
  POKER_MIN_PLAYERS,
  POKER_QUEUE_FILL_MS,
  POKER_SHOWDOWN_PAUSE_MS,
  POKER_STARTING_POINTS,
  publicTable,
  rotateDealer,
  startHand,
  type Card,
  type PokerAction,
  type Seat,
  type TableState,
} from "../../shared/poker";

const TOKEN_MIN = 8;
const TOKEN_MAX = 128;
const NAME_MAX = 32;

const pokerActionValidator = v.union(
  v.object({ type: v.literal("fold") }),
  v.object({ type: v.literal("check") }),
  v.object({ type: v.literal("call") }),
  v.object({ type: v.literal("all_in") }),
  v.object({ type: v.literal("raise"), to: v.number() }),
);

type TableDoc = {
  _id: Id<"pokerTables">;
  status: "playing" | "ended";
  street: TableState["street"];
  community: Card[];
  deck: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  dealerIndex: number;
  toAct: number | null;
  actionDeadlineAt: number | null;
  turnNonce: number;
  handNumber: number;
  log: string;
  winners?: TableState["winners"] extends infer W ? Exclude<W, null> : never;
  endedReason?: string;
};

type SeatDoc = {
  _id: Id<"pokerSeats">;
  tableId: Id<"pokerTables">;
  playerId?: Id<"pokerPlayers">;
  botKey?: string;
  seatIndex: number;
  name: string;
  chips: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  committed: number;
  actedThisStreet: boolean;
  isBot: boolean;
  sittingOut: boolean;
};

function random01(): number {
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto;
  if (webCrypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    webCrypto.getRandomValues(buffer);
    return buffer[0]! / 2 ** 32;
  }
  return Math.random();
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(random01() * (max - min + 1));
}

function asCard(card: { rank: string; suit: string }): Card {
  return card as Card;
}

function normalizeToken(playerToken: string): string | null {
  const token = playerToken.trim();
  if (token.length < TOKEN_MIN || token.length > TOKEN_MAX) return null;
  return token;
}

function normalizeName(displayName: string): string {
  const name = displayName.trim().slice(0, NAME_MAX);
  return name.length > 0 ? name : "Hacker";
}

function seatId(seat: SeatDoc): string {
  return seat.playerId ?? seat.botKey ?? seat._id;
}

function toEngineSeat(seat: SeatDoc): Seat {
  return {
    id: seatId(seat),
    name: seat.name,
    chips: seat.chips,
    hole: seat.hole.map(asCard),
    folded: seat.folded,
    allIn: seat.allIn,
    streetBet: seat.streetBet,
    committed: seat.committed,
    actedThisStreet: seat.actedThisStreet,
    isBot: seat.isBot,
  };
}

function toEngineState(table: TableDoc, seats: SeatDoc[]): TableState {
  return {
    id: table._id,
    seats: seats.map(toEngineSeat),
    dealerIndex: table.dealerIndex,
    street: table.street,
    deck: table.deck.map(asCard),
    community: table.community.map(asCard),
    pot: table.pot,
    currentBet: table.currentBet,
    minRaise: table.minRaise,
    toAct: table.toAct,
    actionDeadlineAt: table.actionDeadlineAt,
    winners: table.winners ?? null,
    handNumber: table.handNumber,
    log: table.log,
  };
}

async function seatsForTable(ctx: QueryCtx | MutationCtx, tableId: Id<"pokerTables">): Promise<SeatDoc[]> {
  const rows = (await ctx.db
    .query("pokerSeats")
    .withIndex("by_table", (q) => q.eq("tableId", tableId))
    .collect()) as SeatDoc[];
  rows.sort((a, b) => a.seatIndex - b.seatIndex);
  return rows;
}

async function loadTable(
  ctx: QueryCtx | MutationCtx,
  tableId: Id<"pokerTables">,
): Promise<{ table: TableDoc; seats: SeatDoc[]; state: TableState } | null> {
  const table = (await ctx.db.get(tableId)) as TableDoc | null;
  if (!table) return null;
  const seats = await seatsForTable(ctx, tableId);
  return { table, seats, state: toEngineState(table, seats) };
}

async function persistState(ctx: MutationCtx, table: TableDoc, seats: SeatDoc[], state: TableState, extra: Partial<TableDoc> = {}) {
  await ctx.db.patch(table._id, {
    street: state.street,
    community: state.community,
    deck: state.deck,
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    dealerIndex: state.dealerIndex,
    toAct: state.toAct,
    actionDeadlineAt: state.actionDeadlineAt,
    handNumber: state.handNumber,
    log: state.log,
    winners: state.winners ?? [],
    updatedAt: Date.now(),
    ...extra,
  });
  for (let i = 0; i < seats.length; i += 1) {
    const doc = seats[i]!;
    const seat = state.seats[i];
    if (!seat) continue;
    await ctx.db.patch(doc._id, {
      chips: seat.chips,
      hole: seat.hole,
      folded: seat.folded,
      allIn: seat.allIn,
      streetBet: seat.streetBet,
      committed: seat.committed,
      actedThisStreet: seat.actedThisStreet,
    });
  }
}

async function playerByToken(ctx: QueryCtx | MutationCtx, playerToken: string) {
  const token = normalizeToken(playerToken);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  return ctx.db
    .query("pokerPlayers")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

async function ensurePlayer(ctx: MutationCtx, playerToken: string, displayName: string) {
  const token = normalizeToken(playerToken);
  if (!token) return { error: "INVALID_TOKEN" as const };
  const tokenHash = await sha256Hex(token);
  const existing = await ctx.db
    .query("pokerPlayers")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  const now = Date.now();
  const name = normalizeName(displayName);
  if (existing) {
    if (existing.displayName !== name) {
      await ctx.db.patch(existing._id, { displayName: name, updatedAt: now });
    }
    return { player: { ...existing, displayName: name } };
  }
  const playerId = await ctx.db.insert("pokerPlayers", {
    tokenHash,
    displayName: name,
    points: POKER_STARTING_POINTS,
    createdAt: now,
    updatedAt: now,
  });
  const player = await ctx.db.get(playerId);
  return { player: player! };
}

async function queueRow(ctx: QueryCtx | MutationCtx, playerId: Id<"pokerPlayers">) {
  return ctx.db
    .query("pokerQueue")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .unique();
}

async function seatedRow(ctx: QueryCtx | MutationCtx, playerId: Id<"pokerPlayers">) {
  const seats = await ctx.db
    .query("pokerSeats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  for (const seat of seats) {
    if (seat.sittingOut) continue;
    const table = await ctx.db.get(seat.tableId);
    if (table && table.status === "playing") return { table, seat };
  }
  return null;
}

async function waitingQueue(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db.query("pokerQueue").withIndex("by_joinedAt").collect();
  rows.sort((a, b) => a.joinedAt - b.joinedAt);
  const entries = [];
  for (const row of rows) {
    const player = await ctx.db.get(row.playerId);
    if (!player) continue;
    entries.push({
      queueId: row._id,
      playerId: row.playerId,
      name: player.displayName,
      joinedAt: row.joinedAt,
    });
  }
  return entries;
}

async function creditPlayer(
  ctx: MutationCtx,
  playerId: Id<"pokerPlayers">,
  chips: number,
  reason: string,
) {
  const player = await ctx.db.get(playerId);
  if (!player) return;
  const returned = Math.max(0, chips);
  await ctx.db.patch(playerId, {
    points: player.points + returned,
    lastResult: { returned, reason, at: Date.now() },
    updatedAt: Date.now(),
  });
}

async function cashOutSeat(
  ctx: MutationCtx,
  table: TableDoc,
  seats: SeatDoc[],
  state: TableState,
  playerId: Id<"pokerPlayers">,
  reason: string,
) {
  const index = seats.findIndex((seat) => seat.playerId === playerId && !seat.sittingOut);
  if (index === -1) return { table, seats, state, left: false };
  const seat = state.seats[index]!;
  if (state.toAct !== null && state.seats[state.toAct]?.id === seat.id) {
    state = applyAction(state, seat.id, { type: "fold" });
  } else {
    seat.folded = true;
  }
  const chips = seat.chips;
  seat.chips = 0;
  await ctx.db.patch(seats[index]!._id, { sittingOut: true, chips: 0, folded: true });
  await creditPlayer(ctx, playerId, chips, reason);
  return { table, seats, state, left: true };
}

function humansLeft(state: TableState): Seat[] {
  return state.seats.filter((seat) => !seat.isBot && seat.chips > 0);
}

async function endTable(ctx: MutationCtx, table: TableDoc, seats: SeatDoc[], state: TableState, reason: string) {
  for (let i = 0; i < seats.length; i += 1) {
    const doc = seats[i]!;
    if (doc.isBot || doc.sittingOut || !doc.playerId) continue;
    const chips = state.seats[i]?.chips ?? doc.chips;
    await ctx.db.patch(doc._id, { sittingOut: true, chips: 0 });
    await creditPlayer(ctx, doc.playerId, chips, reason);
  }
  await persistState(ctx, table, seats, { ...state, toAct: null, actionDeadlineAt: null }, {
    status: "ended",
    endedReason: reason,
  } as Partial<TableDoc>);
}

async function scheduleAdvance(ctx: MutationCtx, tableId: Id<"pokerTables">) {
  await ctx.scheduler.runAfter(0, internal.arcade.poker.advanceTurn, { tableId });
}

async function persistAndAdvance(ctx: MutationCtx, table: TableDoc, seats: SeatDoc[], state: TableState) {
  const turnNonce = table.turnNonce + 1;
  await persistState(ctx, table, seats, state, { turnNonce } as Partial<TableDoc>);
  await scheduleAdvance(ctx, table._id);
}

function makeBotSeats(needed: number): Seat[] {
  return POKER_BOT_NAMES.slice(0, needed).map((name, index) => ({
    id: `bot-${index}-${name.split(" ").slice(-1)[0]!.toLowerCase()}`,
    name,
    chips: POKER_BUY_IN,
    hole: [],
    folded: false,
    allIn: false,
    streetBet: 0,
    committed: 0,
    actedThisStreet: false,
    isBot: true,
  }));
}

async function openTable(
  ctx: MutationCtx,
  humans: Array<{ playerId: Id<"pokerPlayers">; name: string }>,
  botCount: number,
) {
  const humanSeats: Seat[] = humans.map((human) => ({
    id: human.playerId,
    name: human.name,
    chips: POKER_BUY_IN,
    hole: [],
    folded: false,
    allIn: false,
    streetBet: 0,
    committed: 0,
    actedThisStreet: false,
    isBot: false,
  }));
  const seats = [...humanSeats, ...makeBotSeats(botCount)];
  if (seats.length < POKER_MIN_PLAYERS) return null;
  const now = Date.now();
  const tableId = await ctx.db.insert("pokerTables", {
    status: "playing",
    street: "preflop",
    community: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: 0,
    dealerIndex: 0,
    toAct: null,
    actionDeadlineAt: null,
    turnNonce: 0,
    handNumber: 1,
    log: "The Fates shuffle the deck.",
    createdAt: now,
    updatedAt: now,
  });
  const state = startHand(seats, 0, tableId, 1, random01);
  for (let i = 0; i < state.seats.length; i += 1) {
    const seat = state.seats[i]!;
    const human = humans.find((row) => row.playerId === seat.id);
    await ctx.db.insert("pokerSeats", {
      tableId,
      playerId: human?.playerId,
      botKey: seat.isBot ? seat.id : undefined,
      seatIndex: i,
      name: seat.name,
      chips: seat.chips,
      hole: seat.hole,
      folded: seat.folded,
      allIn: seat.allIn,
      streetBet: seat.streetBet,
      committed: seat.committed,
      actedThisStreet: seat.actedThisStreet,
      isBot: seat.isBot,
      sittingOut: false,
    });
  }
  await persistState(ctx, { _id: tableId, turnNonce: 0 } as TableDoc, await seatsForTable(ctx, tableId), state, {
    turnNonce: 1,
  } as Partial<TableDoc>);
  await scheduleAdvance(ctx, tableId);
  return tableId;
}

/** Public view for one laptop. Never returns other hole cards or the deck. */
export const getMyPokerView = query({
  args: { playerToken: v.string() },
  handler: async (ctx, { playerToken }) => {
    const buyIn = POKER_BUY_IN;
    const queue = (await waitingQueue(ctx)).map((entry) => ({
      id: entry.playerId,
      name: entry.name,
      joinedAt: entry.joinedAt,
    }));
    const empty = {
      youId: null as string | null,
      phase: "lobby" as const,
      balance: POKER_STARTING_POINTS,
      buyIn,
      queue,
      queuedAt: null as number | null,
      table: null,
      result: null as { returned: number; reason: string } | null,
      error: null as string | null,
    };
    const player = await playerByToken(ctx, playerToken);
    if (!player) return empty;

    const seated = await seatedRow(ctx, player._id);
    if (seated) {
      const loaded = await loadTable(ctx, seated.table._id);
      if (loaded && loaded.table.status === "playing") {
        return {
          youId: player._id as string,
          phase: "table" as const,
          balance: player.points,
          buyIn,
          queue,
          queuedAt: null,
          table: publicTable(loaded.state, player._id),
          result: null,
          error: null,
        };
      }
    }

    const waiting = await queueRow(ctx, player._id);
    if (waiting) {
      return {
        youId: player._id as string,
        phase: "queued" as const,
        balance: player.points,
        buyIn,
        queue,
        queuedAt: waiting.joinedAt,
        table: null,
        result: null,
        error: null,
      };
    }

    return {
      youId: player._id as string,
      phase: player.lastResult ? ("result" as const) : ("lobby" as const),
      balance: player.points,
      buyIn,
      queue,
      queuedAt: null,
      table: null,
      result: player.lastResult ? { returned: player.lastResult.returned, reason: player.lastResult.reason } : null,
      error: null,
    };
  },
});

export const joinQueue = mutation({
  args: { playerToken: v.string(), displayName: v.string() },
  handler: async (ctx, { playerToken, displayName }) => {
    const ensured = await ensurePlayer(ctx, playerToken, displayName);
    if ("error" in ensured) return { status: "error" as const, code: ensured.error };
    const player = ensured.player;
    const seated = await seatedRow(ctx, player._id);
    if (seated) return { status: "ok" as const, phase: "table" as const };
    const waiting = await queueRow(ctx, player._id);
    if (waiting) return { status: "ok" as const, phase: "queued" as const };
    if (player.points < POKER_BUY_IN) {
      return { status: "error" as const, code: "INSUFFICIENT_POINTS" as const };
    }
    const now = Date.now();
    await ctx.db.patch(player._id, {
      points: player.points - POKER_BUY_IN,
      updatedAt: now,
    });
    await ctx.db.insert("pokerQueue", { playerId: player._id, joinedAt: now });
    await ctx.scheduler.runAfter(0, api.arcade.poker.trySeat, {});
    await ctx.scheduler.runAfter(POKER_QUEUE_FILL_MS, api.arcade.poker.trySeat, {});
    await ctx.scheduler.runAfter(POKER_BOT_FILL_MS, api.arcade.poker.trySeat, {});
    return { status: "ok" as const, phase: "queued" as const };
  },
});

export const cancelQueue = mutation({
  args: { playerToken: v.string() },
  handler: async (ctx, { playerToken }) => {
    const player = await playerByToken(ctx, playerToken);
    if (!player) return { status: "error" as const, code: "NOT_FOUND" as const };
    const waiting = await queueRow(ctx, player._id);
    if (!waiting) return { status: "ok" as const };
    await ctx.db.delete(waiting._id);
    await ctx.db.patch(player._id, {
      points: player.points + POKER_BUY_IN,
      updatedAt: Date.now(),
    });
    return { status: "ok" as const };
  },
});

export const act = mutation({
  args: { playerToken: v.string(), action: pokerActionValidator },
  handler: async (ctx, { playerToken, action }) => {
    const player = await playerByToken(ctx, playerToken);
    if (!player) return { status: "error" as const, code: "NOT_FOUND" as const };
    const seated = await seatedRow(ctx, player._id);
    if (!seated) return { status: "error" as const, code: "NOT_SEATED" as const };
    const loaded = await loadTable(ctx, seated.table._id);
    if (!loaded || loaded.table.status !== "playing") {
      return { status: "error" as const, code: "TABLE_CLOSED" as const };
    }
    if (loaded.state.toAct === null) return { status: "ok" as const };
    const actor = loaded.state.seats[loaded.state.toAct];
    if (!actor || actor.id !== player._id) return { status: "error" as const, code: "NOT_YOUR_TURN" as const };
    const next = applyAction(loaded.state, player._id, action as PokerAction);
    await persistAndAdvance(ctx, loaded.table, loaded.seats, next);
    return { status: "ok" as const };
  },
});

export const leaveTable = mutation({
  args: { playerToken: v.string() },
  handler: async (ctx, { playerToken }) => {
    const player = await playerByToken(ctx, playerToken);
    if (!player) return { status: "error" as const, code: "NOT_FOUND" as const };
    const waiting = await queueRow(ctx, player._id);
    if (waiting) {
      await ctx.db.delete(waiting._id);
      await ctx.db.patch(player._id, {
        points: player.points + POKER_BUY_IN,
        lastResult: { returned: POKER_BUY_IN, reason: "You left the queue.", at: Date.now() },
        updatedAt: Date.now(),
      });
      return { status: "ok" as const };
    }
    const seated = await seatedRow(ctx, player._id);
    if (!seated) return { status: "ok" as const };
    const loaded = await loadTable(ctx, seated.table._id);
    if (!loaded || loaded.table.status !== "playing") return { status: "ok" as const };
    const after = await cashOutSeat(ctx, loaded.table, loaded.seats, loaded.state, player._id, "You stood up.");
    if (humansLeft(after.state).length === 0) {
      await endTable(ctx, after.table, after.seats, after.state, "The table closed.");
      return { status: "ok" as const };
    }
    await persistAndAdvance(ctx, after.table, after.seats, after.state);
    return { status: "ok" as const };
  },
});

/** Public so tests and a delayed client can nudge seating; only seats when the house rules say so. */
export const trySeat = mutation({
  args: {},
  handler: async (ctx) => {
    const waiting = await waitingQueue(ctx);
    if (waiting.length === 0) return;
    const now = Date.now();
    const take = waiting.slice(0, POKER_MAX_PLAYERS);
    const oldest = take[0]!;
    const waited = now - oldest.joinedAt;
    let humans = take;
    let bots = 0;
    if (take.length >= POKER_INSTANT_SEATS) {
      humans = take.slice(0, POKER_MAX_PLAYERS);
    } else if (take.length >= POKER_MIN_PLAYERS && waited >= POKER_QUEUE_FILL_MS) {
      humans = take.slice(0, POKER_MAX_PLAYERS);
    } else if (take.length >= 1 && waited >= POKER_BOT_FILL_MS) {
      humans = take.slice(0, 1);
      bots = POKER_MAX_PLAYERS - humans.length;
    } else {
      return;
    }
    for (const human of humans) {
      await ctx.db.delete(human.queueId);
    }
    await openTable(
      ctx,
      humans.map((row) => ({ playerId: row.playerId, name: row.name })),
      bots,
    );
  },
});

export const advanceTurn = internalMutation({
  args: { tableId: v.id("pokerTables") },
  handler: async (ctx, { tableId }) => {
    const loaded = await loadTable(ctx, tableId);
    if (!loaded || loaded.table.status !== "playing") return;
    const { table, state } = loaded;
    if (state.street === "showdown") {
      await persistState(ctx, table, loaded.seats, { ...state, actionDeadlineAt: null });
      await ctx.scheduler.runAfter(POKER_SHOWDOWN_PAUSE_MS, internal.arcade.poker.nextHand, {
        tableId,
        handNumber: state.handNumber,
      });
      return;
    }
    if (state.toAct === null) {
      await persistState(ctx, table, loaded.seats, { ...state, actionDeadlineAt: null });
      return;
    }
    const actor = state.seats[state.toAct];
    if (!actor) return;
    if (actor.isBot) {
      await persistState(ctx, table, loaded.seats, { ...state, actionDeadlineAt: null });
      await ctx.scheduler.runAfter(randomBetween(POKER_BOT_THINK_MIN_MS, POKER_BOT_THINK_MAX_MS), internal.arcade.poker.playBot, {
        tableId,
        turnNonce: table.turnNonce,
      });
      return;
    }
    const deadlineAt = Date.now() + POKER_ACTION_TIMEOUT_MS;
    await persistState(ctx, table, loaded.seats, { ...state, actionDeadlineAt: deadlineAt });
    await ctx.scheduler.runAfter(POKER_ACTION_TIMEOUT_MS, internal.arcade.poker.kickIfIdle, {
      tableId,
      turnNonce: table.turnNonce,
      playerId: actor.id,
    });
  },
});

export const playBot = internalMutation({
  args: { tableId: v.id("pokerTables"), turnNonce: v.number() },
  handler: async (ctx, { tableId, turnNonce }) => {
    const loaded = await loadTable(ctx, tableId);
    if (!loaded || loaded.table.status !== "playing") return;
    if (loaded.table.turnNonce !== turnNonce) return;
    if (loaded.state.toAct === null) return;
    const actor = loaded.state.seats[loaded.state.toAct];
    if (!actor?.isBot) return;
    const next = applyAction(loaded.state, actor.id, chooseBotAction(loaded.state, actor.id, random01));
    await persistAndAdvance(ctx, loaded.table, loaded.seats, next);
  },
});

export const kickIfIdle = internalMutation({
  args: { tableId: v.id("pokerTables"), turnNonce: v.number(), playerId: v.string() },
  handler: async (ctx, { tableId, turnNonce, playerId }) => {
    const loaded = await loadTable(ctx, tableId);
    if (!loaded || loaded.table.status !== "playing") return;
    if (loaded.table.turnNonce !== turnNonce) return;
    if (loaded.state.toAct === null) return;
    const actor = loaded.state.seats[loaded.state.toAct];
    if (!actor || actor.isBot || actor.id !== playerId) return;
    const playerDocId = playerId as Id<"pokerPlayers">;
    const after = await cashOutSeat(
      ctx,
      loaded.table,
      loaded.seats,
      loaded.state,
      playerDocId,
      "Time's up. You were stood up.",
    );
    after.state.log = `${actor.name} ran out of time and was stood up.`;
    if (humansLeft(after.state).length === 0) {
      await endTable(ctx, after.table, after.seats, after.state, "The table closed.");
      return;
    }
    await persistAndAdvance(ctx, after.table, after.seats, after.state);
  },
});

export const nextHand = internalMutation({
  args: { tableId: v.id("pokerTables"), handNumber: v.number() },
  handler: async (ctx, { tableId, handNumber }) => {
    const loaded = await loadTable(ctx, tableId);
    if (!loaded || loaded.table.status !== "playing") return;
    if (loaded.state.handNumber !== handNumber) return;
    const withChips = loaded.state.seats.filter((seat) => seat.chips > 0);
    if (humansLeft(loaded.state).length === 0 || withChips.length < POKER_MIN_PLAYERS) {
      await endTable(
        ctx,
        loaded.table,
        loaded.seats,
        loaded.state,
        humansLeft(loaded.state).length === 0 ? "The table closed." : "The table broke.",
      );
      return;
    }
    const dealerIndex = rotateDealer(loaded.state.seats, loaded.state.dealerIndex);
    const next = startHand(loaded.state.seats, dealerIndex, loaded.table._id, loaded.state.handNumber + 1, random01);
    await persistAndAdvance(ctx, loaded.table, loaded.seats, next);
  },
});
