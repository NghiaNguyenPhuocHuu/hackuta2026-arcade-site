import type { ConvexReactClient } from "convex/react";
import { POKER_BUY_IN, POKER_STARTING_POINTS, type PokerAction } from "../../../shared/poker";
import {
  cancelPokerQueueRef,
  getMyPokerViewRef,
  joinPokerQueueRef,
  leavePokerTableRef,
  pokerActRef,
  type PokerServerView,
} from "../../convex/pokerApi";
import type { PokerClient, PokerView } from "./matchmaking";

function errorMessage(code: string | undefined): string {
  if (code === "INSUFFICIENT_POINTS") return "You need 100 points to take a seat.";
  if (code === "NOT_YOUR_TURN") return "Wait for your turn.";
  if (code === "TABLE_CLOSED") return "That table already closed.";
  if (code === "NOT_SEATED") return "You are not at a table.";
  if (code === "INVALID_TOKEN") return "Could not join the table.";
  return "The Fates could not seat you. Try again.";
}

function toView(playerId: string, snapshot: PokerServerView | undefined, error: string | null): PokerView {
  if (!snapshot) {
    return {
      youId: playerId,
      phase: "lobby",
      balance: POKER_STARTING_POINTS,
      buyIn: POKER_BUY_IN,
      queue: [],
      queuedAt: null,
      table: null,
      result: null,
      error,
    };
  }
  return {
    youId: snapshot.youId ?? playerId,
    phase: snapshot.phase,
    balance: snapshot.balance,
    buyIn: snapshot.buyIn,
    queue: snapshot.queue,
    queuedAt: snapshot.queuedAt,
    table: snapshot.table,
    result: snapshot.result,
    error: error ?? snapshot.error,
  };
}

export function createLivePokerClient(options: {
  convex: ConvexReactClient;
  player: { id: string; name: string };
}): PokerClient {
  const { convex, player } = options;
  const listeners = new Set<(view: PokerView) => void>();
  let disposed = false;
  let error: string | null = null;
  let snapshot: PokerServerView | undefined;

  const watch = convex.watchQuery(getMyPokerViewRef, { playerToken: player.id });

  function emit() {
    if (disposed) return;
    const view = toView(player.id, snapshot, error);
    for (const listener of listeners) listener(view);
  }

  function applyRemote(next: PokerServerView | undefined) {
    snapshot = next;
    emit();
  }

  function readRemote() {
    try {
      applyRemote(watch.localQueryResult());
    } catch {
      applyRemote(undefined);
    }
  }

  readRemote();
  const stopWatch = watch.onUpdate(readRemote);

  async function run(label: string, work: () => Promise<{ status: string; code?: string }>) {
    error = null;
    emit();
    try {
      const result = await work();
      if (result.status === "error") {
        error = errorMessage(result.code);
        emit();
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : `Could not ${label}.`;
      emit();
    }
  }

  return {
    getView() {
      return toView(player.id, snapshot, error);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(toView(player.id, snapshot, error));
      return () => {
        listeners.delete(listener);
      };
    },
    findTable() {
      void run("join", () => convex.mutation(joinPokerQueueRef, { playerToken: player.id, displayName: player.name }));
    },
    cancelQueue() {
      void run("leave the queue", () => convex.mutation(cancelPokerQueueRef, { playerToken: player.id }));
    },
    act(action: PokerAction) {
      void run("act", () => convex.mutation(pokerActRef, { playerToken: player.id, action }));
    },
    leaveTable() {
      void run("stand up", () => convex.mutation(leavePokerTableRef, { playerToken: player.id }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopWatch();
      listeners.clear();
    },
  };
}
