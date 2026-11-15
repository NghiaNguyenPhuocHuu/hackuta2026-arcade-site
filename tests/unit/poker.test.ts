import { describe, expect, it } from "vitest";
import {
  applyAction,
  cardId,
  compareHands,
  evaluateBest,
  evaluateFive,
  legalActions,
  makeDeck,
  shuffle,
  startHand,
  type Seat,
} from "../../shared/poker";

function card(id: string) {
  const rankRaw = id.slice(0, -1);
  const suitChar = id.slice(-1);
  const rank = (rankRaw === "T" ? "10" : rankRaw) as Seat["hole"][number]["rank"];
  const suit = ({ S: "spades", H: "hearts", D: "diamonds", C: "clubs" } as const)[suitChar as "S" | "H" | "D" | "C"];
  if (!suit) throw new Error(id);
  return { rank, suit };
}

function seat(id: string, chips = 100, hole: string[] = []): Seat {
  return {
    id,
    name: id,
    chips,
    hole: hole.map(card),
    folded: false,
    allIn: false,
    streetBet: 0,
    committed: 0,
    actedThisStreet: false,
    isBot: false,
  };
}

describe("deck", () => {
  it("has 52 unique cards", () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
  });

  it("shuffle keeps every card", () => {
    const deck = makeDeck();
    const mixed = shuffle(deck, () => 0.3);
    expect(mixed).toHaveLength(52);
    expect(new Set(mixed.map(cardId))).toEqual(new Set(deck.map(cardId)));
    expect(mixed.map(cardId).join()).not.toBe(deck.map(cardId).join());
  });
});

describe("hands", () => {
  it("ranks a royal flush above a straight flush", () => {
    const royal = evaluateFive(["AS", "KS", "QS", "JS", "TS"].map(card));
    const straightFlush = evaluateFive(["9H", "8H", "7H", "6H", "5H"].map(card));
    expect(royal.category).toBe("royal_flush");
    expect(straightFlush.category).toBe("straight_flush");
    expect(compareHands(royal, straightFlush)).toBeGreaterThan(0);
  });

  it("treats A-2-3-4-5 as a wheel straight", () => {
    const wheel = evaluateFive(["AH", "2C", "3D", "4S", "5H"].map(card));
    expect(wheel.category).toBe("straight");
    expect(wheel.kickers[0]).toBe(5);
  });

  it("breaks pair ties with kickers", () => {
    const aceKicker = evaluateBest(["AH", "AD", "KS", "8C", "3D", "2H", "9S"].map(card));
    const lowKicker = evaluateBest(["AH", "AD", "QS", "8C", "3D", "2H", "7S"].map(card));
    expect(aceKicker.category).toBe("pair");
    expect(compareHands(aceKicker, lowKicker)).toBeGreaterThan(0);
  });

  it("reads a full house from seven cards", () => {
    const house = evaluateBest(["KH", "KD", "KS", "2C", "2D", "9S", "4H"].map(card));
    expect(house.category).toBe("full_house");
    expect(house.kickers).toEqual([13, 2]);
  });
});

describe("hold'em engine", () => {
  it("posts blinds and deals two hole cards", () => {
    const state = startHand([seat("a"), seat("b"), seat("c")], 0, "t1", 1, () => 0.5);
    expect(state.street).toBe("preflop");
    expect(state.actionDeadlineAt).toBeNull();
    expect(state.pot).toBe(15);
    expect(state.seats.every((row) => row.hole.length === 2)).toBe(true);
    expect(state.toAct).not.toBeNull();
  });

  it("awards the pot when everyone else folds", () => {
    const state = startHand([seat("a"), seat("b")], 0, "t1", 1, () => 0.2);
    const actor = state.seats[state.toAct!]!;
    const next = applyAction(state, actor.id, { type: "fold" });
    expect(next.street).toBe("showdown");
    expect(next.winners).toHaveLength(1);
    expect(next.winners![0]!.playerId).not.toBe(actor.id);
    expect(next.pot).toBe(0);
  });

  it("only lets the player to act bet", () => {
    const state = startHand([seat("a"), seat("b")], 0, "t1", 1, () => 0.4);
    const other = state.seats.find((_, index) => index !== state.toAct)!;
    expect(legalActions(state, other.id)).toEqual([]);
    expect(legalActions(state, state.seats[state.toAct!]!.id).length).toBeGreaterThan(0);
  });
});
