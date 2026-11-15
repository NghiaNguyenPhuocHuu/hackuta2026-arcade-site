import type { ConvexReactClient } from "convex/react";
import { POKER_BUY_IN, type PokerAction } from "../../../shared/poker";
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
  if (code === "INSUFFICIENT_POINTS") return "You need 100 arcade points to take a seat. Deposit some on the Wallet page.";
  if (code === "ARCADE_CLOSED") return "The arcade is closed right now.";
  if (code === "GAME_DISABLED") return "Organizers have paused poker for now.";
  if (code === "NOT_SIGNED_IN") return "You're signed out. Sign in again to play.";
  if (code === "NOT_CHECKED_IN" || code === "NOT_ELIGIBLE" || code === "NOT_PARTICIPANT") return "Only checked-in hackers can take a seat.";
  if (code === "NOT_YOUR_TURN") return "Wait for your turn.";
  if (code === "TABLE_CLOSED") return "That table already closed.";
  if (code === "NOT_SEATED") return "You are not at a table.";
  return "The Fates could not seat you. Try again.";
}

function toView(snapshot: PokerServerView | undefined, error: string | null): PokerView {
  if (!snapshot) {
    return {
      youId: "",
      phase: "lobby",
      balance: 0,
      buyIn: POKER_BUY_IN,
      queue: [],
      queuedAt: null,
      table: null,
      result: null,
      error,
    };
  }
  return {
    youId: snapshot.youId ?? "",
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

/** Poker on the live server, as the signed-in hacker (the Convex client's session). */
export function createLivePokerClient(options: { convex: ConvexReactClient }): PokerClient {
  const { convex } = options;
  const listeners = new Set<(view: PokerView) => void>();
  let disposed = false;
  let error: string | null = null;
  let snapshot: PokerServerView | undefined;

  const watch = convex.watchQuery(getMyPokerViewRef, {});

  function emit() {
    if (disposed) return;
    const view = toView(snapshot, error);
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
      return toView(snapshot, error);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(toView(snapshot, error));
      return () => {
        listeners.delete(listener);
      };
    },
    findTable() {
      void run("join", () => convex.mutation(joinPokerQueueRef, {}));
    },
    cancelQueue() {
      void run("leave the queue", () => convex.mutation(cancelPokerQueueRef, {}));
    },
    act(action: PokerAction) {
      void run("act", () => convex.mutation(pokerActRef, { action }));
    },
    leaveTable() {
      void run("stand up", () => convex.mutation(leavePokerTableRef, {}));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopWatch();
      listeners.clear();
    },
  };
}
