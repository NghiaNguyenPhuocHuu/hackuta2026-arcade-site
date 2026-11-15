import { describe, expect, it } from "vitest";
import { planSeating, type OpenRoom } from "../../shared/arcade/matchmaking";

const q = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `h${from + i}`, joinedAt: 1000 + from + i }));
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);
const room = (id: string, players: number, createdAt = 0): OpenRoom<string> => ({ id, players, createdAt });

describe("planSeating", () => {
  it("does nothing for an empty queue, and keeps a lone hacker waiting with no open seat", () => {
    expect(planSeating([], [room("A", 2)])).toEqual({ joins: [], newRooms: [] });
    expect(planSeating(q(1), [])).toEqual({ joins: [], newRooms: [] });
    expect(planSeating(q(1), [room("A", 4)])).toEqual({ joins: [], newRooms: [] });
  });

  it("starts a room as soon as two are waiting", () => {
    const plan = planSeating(q(2), []);
    expect(plan.newRooms.map(ids)).toEqual([["h0", "h1"]]);
  });

  it("fills open rooms before opening new ones, fullest room first, up to 4", () => {
    const plan = planSeating(q(3), [room("A", 2, 10), room("B", 3, 20)]);
    expect(plan.joins.map((j) => [j.room, j.entry.id])).toEqual([
      ["B", "h0"], // B (3) is fullest: now 4, full
      ["A", "h1"], // then A: 3
      ["A", "h2"], // A: 4
    ]);
    expect(plan.newRooms).toEqual([]);
  });

  it("breaks ties by the older room", () => {
    const plan = planSeating(q(1), [room("new", 2, 50), room("old", 2, 10)]);
    expect(plan.joins[0]!.room).toBe("old");
  });

  it("refills a seat someone left: the next in the queue takes it", () => {
    const plan = planSeating(q(1), [room("A", 3)]);
    expect(plan.joins.map((j) => [j.room, j.entry.id])).toEqual([["A", "h0"]]);
  });

  it("opens another room once every room is full, many rooms at once", () => {
    const plan = planSeating(q(6), [room("A", 4), room("B", 4)]);
    expect(plan.joins).toEqual([]);
    expect(plan.newRooms.map(ids)).toEqual([["h0", "h1", "h2", "h3"], ["h4", "h5"]]);
  });

  it("never leaves one hacker alone when others could share: 5 make rooms of 3 and 2", () => {
    expect(planSeating(q(5), []).newRooms.map((r) => r.length)).toEqual([3, 2]);
    expect(planSeating(q(9), []).newRooms.map((r) => r.length)).toEqual([4, 3, 2]);
  });

  it("ignores empty rooms (nobody left to play with) and keeps queue order", () => {
    const plan = planSeating([...q(2, 5), ...q(1, 0)], [room("ghost", 0)]);
    expect(plan.joins).toEqual([]);
    expect(plan.newRooms.map(ids)).toEqual([["h0", "h5", "h6"]]);
  });
});
