import type { PokerView } from "./matchmaking";

/**
 * What changed at the table between two server views, as sound cues. Pure, so
 * the table UI can play them and tests can check them. The player's own bets
 * and folds are left out: their buttons already played those sounds.
 */
export type PokerCue =
  | "seated" // the Fates found a table
  | "deal" // a new hand: hole cards
  | "board" // flop, turn or river
  | "bet" // another player put chips in
  | "fold" // another player folded
  | "your-turn"
  | "win" // you won (or split) the pot at showdown
  | "lose" // someone else took the pot at showdown
  | "cashout";

export function pokerCues(prev: PokerView, next: PokerView): PokerCue[] {
  const cues: PokerCue[] = [];
  if (prev.phase !== "table" && next.phase === "table") cues.push("seated");
  if (prev.phase === "table" && next.phase === "result") cues.push("cashout");

  const before = prev.table;
  const after = next.table;
  if (!after || !before || before.id !== after.id) return cues;

  if (after.handNumber !== before.handNumber) {
    cues.push("deal");
  } else {
    if (after.community.length > before.community.length) cues.push("board");
    for (const seat of after.seats) {
      if (seat.id === next.youId) continue;
      const was = before.seats.find((s) => s.id === seat.id);
      if (!was) continue;
      if (seat.folded && !was.folded) cues.push("fold");
      else if (seat.streetBet > was.streetBet) cues.push("bet");
    }
  }

  const youToAct = (view: PokerView) => view.table?.seats.some((seat) => seat.id === view.youId && seat.isToAct) ?? false;
  if (youToAct(next) && !youToAct(prev)) cues.push("your-turn");

  const showdown = (t: typeof after) => t.street === "showdown" && t.winners.length > 0;
  if (showdown(after) && !(showdown(before) && before.handNumber === after.handNumber)) {
    cues.push(after.winners.some((w) => w.playerId === next.youId) ? "win" : "lose");
  }
  return cues;
}
