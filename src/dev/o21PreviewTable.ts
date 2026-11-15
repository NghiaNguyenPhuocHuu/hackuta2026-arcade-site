/**
 * Dev-only: real Olympus 21 table views for the preview page (no server), so
 * the table layout can be inspected in each phase. Not part of the site build.
 */
import { createTable, join, placeWager, play, draw, tick, viewFor, type Table, type TableView } from "../../shared/olympus21/engine.js";
import { seededRng } from "../../shared/olympus21/rules.js";

export type PreviewPhase = "wagering" | "turns" | "settled";

const ME = "me";

function step(table: Table, now: number) {
  const deadline = (table as unknown as { deadline: number | null }).deadline;
  const at = Math.max(now + 1, (deadline ?? now) + 1);
  tick(table, at);
  return at;
}

export function previewTableView(phase: PreviewPhase, players = 3): TableView {
  let now = Date.now() - 600_000;
  const table = createTable({ id: "preview", rng: seededRng(21), now });
  const names = ["Riley", "Achilles", "Penelope", "Ajax"];
  const ids = [ME, "p2", "p3", "p4"].slice(0, players);
  ids.forEach((id, i) => join(table, { id, name: names[i], balance: 50 }, now));
  for (let i = 0; i < 5 && viewFor(table, ME, now).status !== "wagering"; i += 1) now = step(table, now);
  if (phase === "wagering") return viewFor(table, ME, now);
  ids.forEach((id, i) => placeWager(table, id, [10, 20, 15, 5][i]!, now));
  for (let i = 0; i < 5 && viewFor(table, ME, now).status !== "turns"; i += 1) now = step(table, now);
  // Play a few turns so the pile, count and log have something in them.
  const turns = phase === "turns" ? 4 : 400;
  for (let i = 0; i < turns; i += 1) {
    const view = viewFor(table, ME, now);
    if (view.status !== "turns") break;
    const seat = view.seats.find((s) => s.seat === view.turnSeat);
    if (!seat) break;
    const hand = viewFor(table, seat.playerId, now).me!.hand;
    const fit = hand.find((h) => h.playable);
    if (fit) play(table, seat.playerId, fit.card, fit.card === "W" ? "R" : undefined, now);
    else draw(table, seat.playerId, now);
    now += 500;
  }
  // Mid-round: stop on my turn so the hand shows playable cards.
  if (phase === "turns") {
    for (let i = 0; i < 6; i += 1) {
      const view = viewFor(table, ME, now);
      if (view.me?.myTurn || view.status !== "turns") break;
      const seat = view.seats.find((s) => s.seat === view.turnSeat)!;
      const hand = viewFor(table, seat.playerId, now).me!.hand;
      const fit = hand.find((h) => h.playable);
      if (fit) play(table, seat.playerId, fit.card, fit.card === "W" ? "R" : undefined, now);
      else draw(table, seat.playerId, now);
      now += 500;
    }
  }
  // The SPA counts down from deadline against view.now; show it as "now".
  const view = viewFor(table, ME, now);
  const shift = Date.now() - now;
  return { ...view, now: view.now + shift, deadline: view.deadline === null ? null : view.deadline + shift };
}
