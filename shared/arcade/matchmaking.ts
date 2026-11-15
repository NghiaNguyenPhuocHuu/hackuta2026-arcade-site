/**
 * Room matchmaking shared by Olympus Poker and Olympus 21 (pure; the server
 * passes in the queue and the open rooms and carries out the plan).
 *
 * - A room starts as soon as 2 hackers are waiting.
 * - Rooms hold up to 4. Waiting hackers first fill open rooms that have a free
 *   seat (the fullest room first, then the oldest), so a seat someone left is
 *   taken by the next hacker in the queue.
 * - Only when every open room is full do the rest start new rooms, 4 at a
 *   time. Many rooms run at once.
 * - Nobody is left alone if it can be avoided: 5 left over make rooms of 3 and
 *   2, not 4 and 1. A single hacker with no open seat waits for the next one.
 */

export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 4;

export type QueuedEntry = { joinedAt: number };

export type OpenRoom<R> = {
  id: R;
  /** Seats taken now (people who are leaving still count until they're gone). */
  players: number;
  createdAt: number;
};

export type SeatingPlan<Q, R> = {
  /** Queued hackers who sit down in an existing room, in queue order. */
  joins: Array<{ room: R; entry: Q }>;
  /** New rooms to open, each 2–4 queued hackers, in queue order. */
  newRooms: Q[][];
};

export function planSeating<Q extends QueuedEntry, R>(
  queue: readonly Q[],
  rooms: ReadonlyArray<OpenRoom<R>>,
  options: { min?: number; max?: number } = {},
): SeatingPlan<Q, R> {
  const min = options.min ?? ROOM_MIN_PLAYERS;
  const max = options.max ?? ROOM_MAX_PLAYERS;
  const waiting = [...queue].sort((a, b) => a.joinedAt - b.joinedAt);
  // Only rooms someone is still playing in can take newcomers.
  const open = rooms.filter((room) => room.players > 0).map((room) => ({ ...room }));
  const joins: SeatingPlan<Q, R>["joins"] = [];
  const leftover: Q[] = [];

  for (const entry of waiting) {
    let best: (typeof open)[number] | null = null;
    for (const room of open) {
      if (room.players >= max) continue;
      if (!best || room.players > best.players || (room.players === best.players && room.createdAt < best.createdAt)) best = room;
    }
    if (best) {
      best.players += 1;
      joins.push({ room: best.id, entry });
    } else {
      leftover.push(entry);
    }
  }

  const newRooms: Q[][] = [];
  while (leftover.length >= min) newRooms.push(leftover.splice(0, Math.min(max, leftover.length)));
  // A lone hacker left over: borrow one from the last full room so both rooms can play.
  const last = newRooms[newRooms.length - 1];
  if (leftover.length > 0 && leftover.length < min && last && last.length - (min - leftover.length) >= min) {
    leftover.unshift(...last.splice(last.length - (min - leftover.length)));
    newRooms.push(leftover.splice(0));
  }
  return { joins, newRooms };
}
