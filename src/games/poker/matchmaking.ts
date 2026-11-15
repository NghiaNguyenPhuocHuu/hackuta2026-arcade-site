import {
  applyAction,
  chooseBotAction,
  cloneTable,
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
  publicTable,
  rotateDealer,
  startHand,
  type PokerAction,
  type PublicTable,
  type Seat,
  type TableState,
} from "../../../shared/poker";
import { publishPoker, subscribePoker, type QueueEntry } from "./bus";

export type PokerPhase = "lobby" | "queued" | "table" | "result";

export type PokerView = {
  youId: string;
  phase: PokerPhase;
  balance: number;
  buyIn: number;
  queue: QueueEntry[];
  queuedAt: number | null;
  table: PublicTable | null;
  result: { returned: number; reason: string } | null;
  error: string | null;
};

export type PokerWallet = {
  getBalance(): number;
  spend(amount: number): boolean;
  credit(amount: number): void;
};

export type PokerClient = {
  getView(): PokerView;
  subscribe(listener: (view: PokerView) => void): () => void;
  findTable(): void;
  cancelQueue(): void;
  act(action: PokerAction): void;
  leaveTable(): void;
  dispose(): void;
};

type HostTable = {
  id: string;
  state: TableState;
  dealerIndex: number;
  seated: string[];
  startedAt: number;
};

const HOST_PULSE_MS = 900;
const HOST_STALE_MS = 2_600;

function newId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function getPokerPlayerId(): string {
  if (typeof sessionStorage === "undefined") return newId("seat");
  const key = "hackuta-arcade-poker-seat";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = newId("seat");
  sessionStorage.setItem(key, id);
  return id;
}

export function createPokerClient(options: { player: { id: string; name: string }; wallet: PokerWallet }): PokerClient {
  const { player, wallet } = options;
  const listeners = new Set<(view: PokerView) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  let disposed = false;
  let isHost = false;
  let lastHostAt = 0;
  const seen = new Map<string, number>([[player.id, Date.now()]]);
  let queue: QueueEntry[] = [];
  let queuedAt: number | null = null;
  let escrow = 0;
  let error: string | null = null;
  let result: PokerView["result"] = null;
  let table: PublicTable | null = null;
  let tableId: string | null = null;
  const hostTables = new Map<string, HostTable>();
  const tableTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTableTimer(id: string) {
    const existing = tableTimers.get(id);
    if (existing) {
      clearTimeout(existing);
      timers.delete(existing);
      tableTimers.delete(id);
    }
  }

  function schedule(tableIdToRun: string, fn: () => void, ms: number) {
    clearTableTimer(tableIdToRun);
    const id = later(() => {
      tableTimers.delete(tableIdToRun);
      fn();
    }, ms);
    tableTimers.set(tableIdToRun, id);
  }

  function view(): PokerView {
    return {
      youId: player.id,
      phase: result ? "result" : table ? "table" : queuedAt ? "queued" : "lobby",
      balance: wallet.getBalance(),
      buyIn: POKER_BUY_IN,
      queue: queue.map((entry) => ({ ...entry })),
      queuedAt,
      table,
      result,
      error,
    };
  }

  function emit() {
    if (disposed) return;
    const snapshot = view();
    for (const listener of listeners) listener(snapshot);
  }

  function refundEscrow() {
    if (escrow <= 0) return;
    wallet.credit(escrow);
    escrow = 0;
  }

  function cashOut(reason: string, chips: number) {
    const returned = Math.max(0, chips);
    wallet.credit(returned);
    escrow = 0;
    table = null;
    tableId = null;
    queuedAt = null;
    result = { returned, reason };
    emit();
  }

  function broadcastTable(hosted: HostTable) {
    publishPoker({ type: "table", tableId: hosted.id, payload: cloneTable(hosted.state) });
  }

  function applySnapshot(state: TableState) {
    table = publicTable(state, player.id);
    tableId = state.id;
    emit();
  }

  function makeBots(needed: number): Seat[] {
    return POKER_BOT_NAMES.slice(0, needed).map((name, index) => ({
      id: `bot-${index}-${name.split(" ").at(-1)!.toLowerCase()}`,
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

  function makeSeat(entry: QueueEntry): Seat {
    return {
      id: entry.id,
      name: entry.name,
      chips: POKER_BUY_IN,
      hole: [],
      folded: false,
      allIn: false,
      streetBet: 0,
      committed: 0,
      actedThisStreet: false,
      isBot: false,
    };
  }

  function endHostedTable(hosted: HostTable, reason: string) {
    clearTableTimer(hosted.id);
    publishPoker({
      type: "table",
      tableId: hosted.id,
      payload: { ended: true, reason, chips: Object.fromEntries(hosted.state.seats.map((seat) => [seat.id, seat.chips])) },
    });
    hostTables.delete(hosted.id);
  }

  function maybeContinue(hosted: HostTable) {
    const withChips = hosted.state.seats.filter((seat) => seat.chips > 0);
    const humansLeft = hosted.state.seats.filter((seat) => !seat.isBot && seat.chips > 0);
    if (humansLeft.length === 0 || withChips.length < POKER_MIN_PLAYERS) {
      endHostedTable(hosted, humansLeft.length === 0 ? "You left the felt." : "The table broke.");
      return;
    }
    hosted.dealerIndex = rotateDealer(hosted.state.seats, hosted.dealerIndex);
    hosted.state = startHand(hosted.state.seats, hosted.dealerIndex, hosted.id, hosted.state.handNumber + 1);
    broadcastTable(hosted);
    armTurn(hosted);
  }

  function kickSeat(hosted: HostTable, playerId: string, reason: string) {
    const seat = hosted.state.seats.find((row) => row.id === playerId);
    if (!seat || seat.isBot) return;
    const chips = seat.chips;
    if (hosted.state.toAct !== null && hosted.state.seats[hosted.state.toAct]?.id === playerId) {
      hosted.state = applyAction(hosted.state, playerId, { type: "fold" });
    } else {
      seat.folded = true;
    }
    seat.chips = 0;
    hosted.seated = hosted.seated.filter((id) => id !== playerId);
    hosted.state.actionDeadlineAt = null;
    hosted.state.log = `${seat.name} ran out of time and was stood up.`;
    publishPoker({ type: "kicked", tableId: hosted.id, playerId, reason, chips });
    const humans = hosted.state.seats.filter((row) => !row.isBot && row.id !== playerId && row.chips > 0);
    if (humans.length === 0) {
      endHostedTable(hosted, "The table closed.");
      return;
    }
    broadcastTable(hosted);
    armTurn(hosted);
  }

  function armTurn(hosted: HostTable) {
    const state = hosted.state;
    if (state.street === "showdown") {
      state.actionDeadlineAt = null;
      schedule(hosted.id, () => maybeContinue(hosted), POKER_SHOWDOWN_PAUSE_MS);
      return;
    }
    if (state.toAct === null) {
      state.actionDeadlineAt = null;
      return;
    }
    const actor = state.seats[state.toAct];
    if (!actor) return;
    if (actor.isBot) {
      state.actionDeadlineAt = null;
      schedule(
        hosted.id,
        () => {
          const current = hostTables.get(hosted.id);
          if (!current || current.state.toAct === null) return;
          const bot = current.state.seats[current.state.toAct];
          if (!bot || !bot.isBot) return;
          current.state = applyAction(current.state, bot.id, chooseBotAction(current.state, bot.id));
          broadcastTable(current);
          armTurn(current);
        },
        randomBetween(POKER_BOT_THINK_MIN_MS, POKER_BOT_THINK_MAX_MS),
      );
      return;
    }
    const actorId = actor.id;
    state.actionDeadlineAt = Date.now() + POKER_ACTION_TIMEOUT_MS;
    broadcastTable(hosted);
    schedule(
      hosted.id,
      () => {
        const current = hostTables.get(hosted.id);
        if (!current || current.state.toAct === null) return;
        const seat = current.state.seats[current.state.toAct];
        if (!seat || seat.isBot || seat.id !== actorId) return;
        kickSeat(current, seat.id, "Time's up. You were stood up.");
      },
      POKER_ACTION_TIMEOUT_MS,
    );
  }

  function openTable(humans: QueueEntry[], bots: number) {
    const seats = [...humans.map(makeSeat), ...makeBots(bots)];
    if (seats.length < POKER_MIN_PLAYERS) return;
    const id = newId("table");
    const dealerIndex = 0;
    const hosted: HostTable = {
      id,
      dealerIndex,
      seated: humans.map((row) => row.id),
      startedAt: Date.now(),
      state: startHand(seats, dealerIndex, id, 1),
    };
    hostTables.set(id, hosted);
    const taken = new Set(humans.map((row) => row.id));
    queue = queue.filter((entry) => !taken.has(entry.id));
    broadcastTable(hosted);
    pulseHost();
    armTurn(hosted);
  }

  function trySeat() {
    if (!isHost) return;
    const humans = queue.slice();
    if (humans.length >= POKER_INSTANT_SEATS) {
      openTable(humans.slice(0, POKER_MAX_PLAYERS), 0);
      return;
    }
    const oldest = humans[0];
    if (!oldest) return;
    const waited = Date.now() - oldest.joinedAt;
    if (humans.length >= POKER_MIN_PLAYERS && waited >= POKER_QUEUE_FILL_MS) {
      openTable(humans.slice(0, POKER_MAX_PLAYERS), 0);
      return;
    }
    if (humans.length === 1 && waited >= POKER_BOT_FILL_MS) {
      openTable(humans, POKER_MAX_PLAYERS - 1);
    }
  }

  function pulseHost() {
    if (!isHost) return;
    publishPoker({
      type: "host",
      hostId: player.id,
      at: Date.now(),
      queue,
      tables: [...hostTables.keys()],
    });
  }

  function claimHost() {
    if (isHost) return;
    isHost = true;
    lastHostAt = Date.now();
    pulseHost();
    trySeat();
  }

  function leaderId() {
    const now = Date.now();
    const liveIds = [...seen.entries()].filter(([, at]) => now - at < HOST_STALE_MS * 2).map(([id]) => id);
    if (!liveIds.includes(player.id)) liveIds.push(player.id);
    liveIds.sort();
    return liveIds[0] ?? player.id;
  }

  function considerHost() {
    const leader = leaderId();
    if (leader !== player.id) {
      if (isHost) isHost = false;
      return;
    }
    if (!isHost && Date.now() - lastHostAt > HOST_STALE_MS) claimHost();
  }

  const stopBus = subscribePoker((message) => {
    if (disposed) return;
    if (message.type === "hello") {
      seen.set(message.playerId, message.at);
    }
    if (message.type === "hello" && isHost) {
      pulseHost();
      for (const hosted of hostTables.values()) {
        if (hosted.seated.includes(message.playerId) || hosted.state.seats.some((seat) => seat.id === message.playerId)) {
          broadcastTable(hosted);
        }
      }
    }
    if (message.type === "join-queue") {
      seen.set(message.playerId, message.at);
      if (!queue.some((entry) => entry.id === message.playerId)) {
        queue = [...queue, { id: message.playerId, name: message.name, joinedAt: message.at }];
      }
      if (message.playerId === player.id) queuedAt = message.at;
      emit();
      if (isHost) trySeat();
    }
    if (message.type === "leave-queue") {
      queue = queue.filter((entry) => entry.id !== message.playerId);
      if (message.playerId === player.id && !table) queuedAt = null;
      emit();
    }
    if (message.type === "host") {
      lastHostAt = message.at;
      if (message.hostId !== player.id) isHost = false;
      queue = message.queue;
      if (queuedAt && !queue.some((entry) => entry.id === player.id) && !table) queuedAt = null;
      emit();
    }
    if (message.type === "kicked") {
      if (message.playerId === player.id && !result) {
        cashOut(message.reason, message.chips);
      }
      return;
    }
    if (message.type === "table") {
      if (result) return;
      const payload = message.payload as TableState & { ended?: boolean; reason?: string; chips?: Record<string, number> };
      if (payload && payload.ended) {
        if (tableId === message.tableId || queuedAt) {
          const chips = payload.chips?.[player.id] ?? 0;
          cashOut(payload.reason ?? "The table closed.", chips);
        }
        return;
      }
      if (payload && Array.isArray(payload.seats) && payload.seats.some((seat) => seat.id === player.id)) {
        queuedAt = null;
        applySnapshot(payload);
      }
    }
    if (message.type === "action" && isHost) {
      const hosted = hostTables.get(message.tableId);
      if (!hosted) return;
      if (hosted.state.toAct === null) return;
      const actor = hosted.state.seats[hosted.state.toAct];
      if (!actor || actor.id !== message.playerId) return;
      const action = message.action as PokerAction;
      hosted.state = applyAction(hosted.state, message.playerId, action);
      broadcastTable(hosted);
      armTurn(hosted);
    }
    if (message.type === "leave-table" && isHost) {
      const hosted = hostTables.get(message.tableId);
      if (!hosted) return;
      const seat = hosted.state.seats.find((row) => row.id === message.playerId);
      if (seat && hosted.state.toAct !== null && hosted.state.seats[hosted.state.toAct]?.id === message.playerId) {
        hosted.state = applyAction(hosted.state, message.playerId, { type: "fold" });
      } else if (seat) {
        seat.folded = true;
      }
      hosted.seated = hosted.seated.filter((id) => id !== message.playerId);
      const humans = hosted.state.seats.filter((row) => !row.isBot && row.id !== message.playerId && row.chips > 0);
      if (humans.length === 0) {
        endHostedTable(hosted, "The table closed.");
      } else {
        broadcastTable(hosted);
        armTurn(hosted);
      }
    }
    if (message.type === "goodbye") {
      seen.delete(message.playerId);
      queue = queue.filter((entry) => entry.id !== message.playerId);
      emit();
    }
  });

  publishPoker({ type: "hello", playerId: player.id, name: player.name, at: Date.now() });
  const hostTick = setInterval(() => {
    if (disposed) return;
    if (isHost) {
      pulseHost();
      trySeat();
    } else {
      considerHost();
    }
  }, HOST_PULSE_MS);
  intervals.add(hostTick);
  later(() => considerHost(), 400);

  return {
    getView: view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    findTable() {
      error = null;
      result = null;
      if (queuedAt || table) return;
      if (wallet.getBalance() < POKER_BUY_IN) {
        error = "You need 100 points to take a seat.";
        emit();
        return;
      }
      if (!wallet.spend(POKER_BUY_IN)) {
        error = "You need 100 points to take a seat.";
        emit();
        return;
      }
      escrow = POKER_BUY_IN;
      queuedAt = Date.now();
      publishPoker({ type: "join-queue", playerId: player.id, name: player.name, at: queuedAt });
      emit();
    },
    cancelQueue() {
      if (!queuedAt || table) return;
      publishPoker({ type: "leave-queue", playerId: player.id });
      queuedAt = null;
      refundEscrow();
      emit();
    },
    act(action) {
      if (!tableId) return;
      publishPoker({ type: "action", tableId, playerId: player.id, action });
    },
    leaveTable() {
      if (queuedAt && !table) {
        this.cancelQueue();
        return;
      }
      if (!tableId || !table || result) return;
      const chips = table.you?.chips ?? 0;
      publishPoker({ type: "leave-table", tableId, playerId: player.id });
      cashOut("You stood up.", chips);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (queuedAt && !table) publishPoker({ type: "leave-queue", playerId: player.id });
      if (tableId) {
        const chips = table?.you?.chips ?? 0;
        publishPoker({ type: "leave-table", tableId, playerId: player.id });
        if (!result) wallet.credit(chips);
        escrow = 0;
      }
      publishPoker({ type: "goodbye", playerId: player.id });
      if (escrow > 0 && !table) refundEscrow();
      stopBus();
      for (const id of timers) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      timers.clear();
      intervals.clear();
      listeners.clear();
      isHost = false;
    },
  };
}
