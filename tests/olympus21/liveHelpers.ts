/** Engine pieces the live-table tests drive directly. */
import { autoMove } from "../../shared/olympus21/rules.js";
import type { Table } from "../../shared/olympus21/engine.js";

export { DEFAULT_TIMINGS, draw, leave, placeWager, play, viewFor, type Table } from "../../shared/olympus21/engine.js";

/** A legal move for the player whose turn it is (what the engine does on a timeout). */
export function autoMoveFor(table: Table, playerId: string) {
  const p = table.seats.find((seat) => seat?.id === playerId)!;
  const top = table.playPile[table.playPile.length - 1] ?? null;
  return autoMove(p.hand, top, table.activeColor);
}
