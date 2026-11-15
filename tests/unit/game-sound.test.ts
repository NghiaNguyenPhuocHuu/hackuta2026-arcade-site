import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSeat, PublicTable } from "../../shared/poker";
import { pokerCues } from "../../src/games/poker/cues";
import type { PokerView } from "../../src/games/poker/matchmaking";

function seat(id: string, extra: Partial<PublicSeat> = {}): PublicSeat {
  return { id, name: id, chips: 50, folded: false, allIn: false, streetBet: 0, isBot: false, isDealer: false, isToAct: false, hole: null, ...extra };
}

function table(extra: Partial<PublicTable> = {}): PublicTable {
  return {
    id: "t1",
    street: "preflop",
    community: [],
    pot: 15,
    currentBet: 10,
    minRaise: 10,
    log: "",
    handNumber: 1,
    winners: [],
    actionDeadlineAt: null,
    seats: [seat("me"), seat("rival")],
    you: null,
    ...extra,
  } as PublicTable;
}

function view(extra: Partial<PokerView> = {}): PokerView {
  return { youId: "me", phase: "table", balance: 100, buyIn: 50, queue: [], queuedAt: null, table: table(), result: null, error: null, ...extra };
}

describe("pokerCues", () => {
  it("cues the seat fanfare and the cash-out on phase changes", () => {
    expect(pokerCues(view({ phase: "queued", table: null }), view())).toContain("seated");
    expect(pokerCues(view(), view({ phase: "result" }))).toContain("cashout");
  });

  it("deals on a new hand and flips cards when the board grows", () => {
    expect(pokerCues(view(), view({ table: table({ handNumber: 2 }) }))).toEqual(["deal"]);
    const flop = table({ street: "flop", community: [{ rank: "2", suit: "spades" }, { rank: "3", suit: "hearts" }, { rank: "4", suit: "diamonds" }] as PublicTable["community"] });
    expect(pokerCues(view(), view({ table: flop }))).toEqual(["board"]);
  });

  it("sounds other players' bets and folds, not the player's own", () => {
    const next = table({ seats: [seat("me", { streetBet: 10 }), seat("rival", { streetBet: 20 })] });
    expect(pokerCues(view(), view({ table: next }))).toEqual(["bet"]);
    const folded = table({ seats: [seat("me", { folded: true }), seat("rival", { folded: true })] });
    expect(pokerCues(view(), view({ table: folded }))).toEqual(["fold"]);
  });

  it("rings once when it becomes the player's turn", () => {
    const yours = table({ seats: [seat("me", { isToAct: true }), seat("rival")] });
    expect(pokerCues(view(), view({ table: yours }))).toEqual(["your-turn"]);
    expect(pokerCues(view({ table: yours }), view({ table: yours }))).toEqual([]);
  });

  it("plays win or lose once per showdown", () => {
    const won = table({ street: "showdown", winners: [{ playerId: "me", amount: 30 }] });
    const lost = table({ street: "showdown", winners: [{ playerId: "rival", amount: 30 }] });
    expect(pokerCues(view(), view({ table: won }))).toEqual(["win"]);
    expect(pokerCues(view(), view({ table: lost }))).toEqual(["lose"]);
    expect(pokerCues(view({ table: won }), view({ table: won }))).toEqual([]);
  });

  it("stays quiet when nothing changed or the table is gone", () => {
    expect(pokerCues(view(), view())).toEqual([]);
    expect(pokerCues(view({ phase: "lobby", table: null }), view({ phase: "lobby", table: null }))).toEqual([]);
  });
});

describe("game sound switch", () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
  });

  it("is on by default, remembers off, and tells subscribers", async () => {
    const sound = await import("../../src/games/sound");
    expect(sound.gameSoundEnabled()).toBe(true);
    const listener = vi.fn();
    const stop = sound.subscribeGameSound(listener);
    sound.setGameSoundEnabled(false);
    expect(sound.gameSoundEnabled()).toBe(false);
    expect(window.localStorage.getItem("arcade-game-sound")).toBe("off");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    sound.setGameSoundEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("plays nothing (and throws nothing) without an AudioContext", async () => {
    const { ChipTune } = await import("../../src/games/sound");
    const sfx = new ChipTune();
    expect(() => {
      sfx.unlock();
      sfx.blip();
      sfx.fanfare();
      sfx.dispose();
    }).not.toThrow();
  });
});
