# Olympus 21: admin-side work

Olympus 21 (registry key `pvp-blackjack`) is now in the arcade and playable on
**mock points with bots**. This file lists what's still needed before hackers
can play it with real points. That work is on the admin side:

1. the server engine, in `convex/admin/` (lives in `hackuta-2026-admin`, tried first on the sandbox through this repo's `backend/overlay/`)
2. the organizer controls, in the admin portal's **Arcade** tab

Read `CLAUDE.md` (safety rules) and `docs/ARCADE_PLAN.md` (decisions) first.
Nothing here changes those decisions. The points rules come from the plan's
"Admin switches" section.

## Where things stand (2026-11-14)

| Piece | Where | Status |
| --- | --- | --- |
| Rules, engine, bots, wagers | `shared/olympus21/*.js` (+ `.d.ts`), contract in `shared/olympus21/CONTRACT.md` | **Done.** Copied byte-for-byte from the prototype (`hackuta-2026-gambling-mini_game`, branch `4hacker-pvp-blackjack`); identical to the prototype's `backend/overlay/shared/olympus21/`. |
| Game screen (table + phone hand view, tutorial, Techno) | `src/games/olympus-21/` | **Done.** Plain JS like the prototype, with `.d.ts` files for the parts TypeScript imports. Loads its CSS inline (`?inline`) and shares Slots' fonts and Techno sprite. |
| Arcade game module + lobby card | `src/games/olympus-21/index.ts`, `src/games/registry.ts` | **Done.** `mount` runs on the live server through the Convex adapter (random matchmaking, no bots). |
| Convex adapter (client side) | `src/games/olympus-21/adapters/convexAdapter.js` | Ported, **not used yet**. Calls `admin/o21Tables:*` (see "Server contract"). |
| Tests | `tests/olympus21/*.test.mjs` | **Done.** 104 tests from the prototype (engine, rules, wagers, bots, view model, tutorial, QR, Convex adapter), run by `npm test`. |
| Server engine | `backend/overlay/convex/admin/o21Tables.ts` | **Stub.** Keeps the live function names, refuses every play with `ENGINE_UNAVAILABLE`. **Admin-side work, below.** |
| Play windows | `backend/overlay/convex/admin/o21Windows.ts` | Live on peccary, but goes against the plan's "one schedule" rule. **Admin-side work, below.** |
| Organizer controls | admin portal | **Not started. Admin-side work, below.** |

Not ported, on purpose: the LAN adapter and LAN table server (sandbox-only
phone testing), the prototype's sandbox host page, and `o21Seed` changes (the
arcade keeps its stub).

---

## Part 1: server engine

### Goal

Replace the stub `admin/o21Tables.ts` with the real engine. Start from the
prototype's version (`hackuta-2026-gambling-mini_game/backend/overlay/convex/admin/o21Tables.ts`,
475 lines, tested on peccary), but switch it to the arcade's switches and
points path. **Keep every exported name and argument shape**, because they're
live on peccary and the client adapter calls them:

| Function | Kind | Args |
| --- | --- | --- |
| `getMyTable` | query | `{ nowBucket?: number }` |
| `join` | mutation | `{ actionId, name?, bots? }` (reject `bots`: real tables never get bots) |
| `leave` | mutation | `{ actionId }` |
| `placeWager` | mutation | `{ actionId, amount }` |
| `play` | mutation | `{ actionId, card, color? }` |
| `draw` | mutation | `{ actionId }` |
| `ready` | mutation | `{ actionId }` |
| `tick` | internalMutation | `{ tableId, at? }` (scheduled) |

### What carries over unchanged from the prototype

- The engine runs inside the mutations. The full state stays serialized in
  `o21Tables.state` and **no query returns it**. `getMyTable` returns only
  `engine.viewFor(table, me)`, so other players' hands and the piles never
  leave the server.
- Idempotency on `actionId` (the `o21Actions` table). A repeated id returns
  `DUPLICATE`, which the adapter treats as success.
- Timers: after every mutation and tick, schedule `tick` at the engine's
  `nextWakeAt` (or the closing time), unless one is already due by then.
- Before every engine command, sync each human's engine balance from their
  arcade wallet (`arcadeBalance`, `arcade/wallet.ts`), not `checkedIn.points`
  (changed since the prototype: games only bet the wallet).
- The per-window loss cap (`O21_LOSS_CAP`, `lostThisWindow`).

### What must change

**1. Open/closed comes from the arcade switches, not `o21Windows`.**
The plan says admins schedule play in one place, and Slots already moved off
`slotWindows`. For Olympus 21:

- `join`, `placeWager`, `play`, `draw` and `ready` call
  `requireGameOpen(ctx, "pvp-blackjack", now)` (`convex/arcade/access.ts`).
  That returns `ARCADE_CLOSED` / `GAME_DISABLED` / the player errors, and
  gives you the `checkedIn` row from the session. Remove the prototype's own
  eligibility lookup.
- `leave` should still work while closed, so a player can always stand up.
- `tick` checks `gameGate(ctx, "pvp-blackjack", now)`. If the game is no
  longer open (the arcade's `closesAt` passed, an admin switched the arcade
  off, or the game was disabled), it runs `engine.closeTable`. The round in
  progress settles ("closed") and the players still in it split the pots.
- Closing has to happen promptly when an admin flips a switch. In
  `arcade/admin.ts` `updateArcadeSettings` / `updateArcadeGame` (and their
  `*Internal` versions), when the result closes `pvp-blackjack`, schedule
  `tick` right away for every open `o21Tables` row. Also schedule one tick at
  `closesAt` when a schedule is saved.
- The loss-cap window becomes the arcade session: sum this player's Olympus 21
  losses since the current `opensAt` (see point 2 for where those rows are).
- `getMyTable` returns `status` (`no_window` | `teaser` | `live` | `closed`) and
  `window: { opensAt, closesAt }` built from `loadArcade` + the game's switch,
  so the game's lobby and the arcade's teaser screen show the same schedule.

**2. Points go through `convex/arcade/points.ts`.**
The rule: games never write `checkedIn.points` directly, and every play is one
`arcadePlays` row that `computeLedgerPoints` counts. The prototype breaks
both: it patches points itself and writes `o21Hands`.

The catch: `applyPlay` is one step (stake and payout together), but an
Olympus 21 round has two steps, wager when the round locks and payout at
settlement, possibly minutes apart. Pick one approach and record it in
`ARCADE_PLAN.md`. **Decided 2026-11-14: option B (two-phase)**, recorded in `ARCADE_PLAN.md`:

| Option | How | Trade-off |
| --- | --- | --- |
| A. Settle once (not chosen) | Change nothing in points during the round. At settlement, for each human seat call `applyPlay({ game: "pvp-blackjack", playId: \`${tableId}:${roundNo}:${checkedInId}\`, stake: wager, payout: wager + delta })`. | Smallest change, and it uses `applyPlay` unchanged. Risk: the player spends points (shop) mid-round and has less than their wager at settlement. To handle it, the engine's per-command balance sync can lower their engine balance, or the settle step can take only what's left (needs a small `applyPlay` variant). |
| **B. Two-phase (chosen)** | Add `reservePlay` (takes the stake, writes the row with `payout: 0`) and `settlePlay` (adds the payout to the same row) to `points.ts`. | Points are always exact, but it changes the shared points module and its tests. |

Either way:

- `playId` must be deterministic per seat per round, so a retried tick never
  pays twice (`beginPlay`'s replay check covers this).
- **`o21Hands`: don't drop the table.** Check whether peccary has rows:
  `npx convex data o21Hands` from `build/peccary`. The arcade's
  `computeLedgerPoints` doesn't count `o21Hands` (the prototype's did). If
  peccary has rows with non-zero deltas, either keep counting them in
  `computeLedgerPoints` or zero them with an admin adjustment, or the ledger
  check will report a mismatch for those hackers.

**3. `o21Windows`: retire it without deleting anything.**
Its functions are live on peccary and nothing may be deleted. Keep the
exports, and make `createO21Window` / `updateO21Window` (and the `Internal`
versions) refuse with a clear message ("Olympus 21 now follows the arcade
schedule; use the Arcade tab"). Keep `listO21Windows` read-only, and keep the
table and the `o21_window_*` audit actions.

**4. Real tables never get bots.** `join` rejects `bots`. Bot winnings would
create or destroy real points. Bots are mock-only.

### Server contract the client already expects

`src/games/olympus-21/adapters/convexAdapter.js` (unit-tested in
`tests/olympus21/o21ConvexAdapter.test.mjs`):

- `getMyTable` returns `{ status, window, player: { signedIn, eligible, checkedIn, name, balance }, view: TableView | null, serverNow }`.
  The field is **`view`** (the adapter reads `server.view`, like the prototype), not `table`.
- Mutations return `{ ok: true }`, `{ ok: false, code }`, or `{ ok: false, code: "DUPLICATE" }`.
- Error copy in the game (`ERROR_COPY` in `mountOlympus21.js`) already covers
  `ARCADE_CLOSED`, `GAME_DISABLED`, `NOT_PARTICIPANT`, `NOT_CHECKED_IN`,
  `INSUFFICIENT_POINTS` and `NO_BOTS` (done 2026-11-14).

### Tests (convex-test, `backend/overlay/tests/integration/`)

Port the prototype's `o21-tables.test.ts` (409 lines) onto
`tests/helpers/arcadeTestKit.ts`, and add:

- arcade `off` / `scheduled` before `opensAt` → `join` refused `ARCADE_CLOSED`; game disabled → `GAME_DISABLED`
- not signed in / not accepted / not checked in → the player error codes
- `bots` argument rejected
- a full round settles: one `arcadePlays` row per human seat, `computeLedgerPoints === checkedIn.points` for everyone
- a retried `tick` / repeated `actionId` doesn't pay twice
- switching the arcade off (and disabling the game) closes open tables on the next tick and pays the pots out
- loss cap resets when a new arcade session opens
- `getMyTable` never contains another seat's hand or the draw pile
- `o21Windows` create/update refuse; list still works

Then `npm run backend:test` and `npm run backend:check` (needs
`../hackuta-2026-profile` cloned next to this repo; it isn't on every
machine).

### Arcade side: done (2026-11-14)

- `game.mount` in `src/games/olympus-21/index.ts`: `createConvexAdapter`
  over `host.client` (through `adapters/reactClientBridge.ts`) →
  `mountOlympus21`. Disposes on unmount. No bots option on the live lobby.
- Once the engine is pushed, two signed-in accounts in two browsers should
  land at the same table.
- **Points come from the arcade wallet** (`arcade/wallet.ts`), like every game
  on `main`: sync the engine balance from `arcadeBalance`, never `checkedIn.points`.

---

## Part 2: organizer controls (admin portal)

The Arcade tab is already in the plan (step 6). Olympus 21 adds no new switch
of its own, only these needs:

| Need | Detail |
| --- | --- |
| **Arcade schedule** | `off` / `scheduled` / `on` with `opensAt` and `closesAt` (`arcade/admin:updateArcadeSettings`). While `scheduled`, hackers see the new countdown teaser (`src/pages/TeaserScreen.tsx`), so the form should show the opening time in the organizer's local time and refuse `closesAt <= opensAt`. |
| **Per-game switch** | A row for Olympus 21 (`arcade/admin:updateArcadeGame` with `key: "pvp-blackjack"`). Show a warning when switching it off mid-event: "Open tables close now; rounds in progress pay out to the players still in them." |
| **Live tables (recommended)** | A read-only admin query (e.g. `admin/o21Tables:listTablesForAdmin`, `requireAdminRole`) returning per open table: seat names, round number, phase, pot. **Never return hands or piles.** Optional: a "Close table" action that runs `closeTable` and logs an audit row. |
| **Audit labels** | The `arcade_*` actions (and new `o21_table_closed` if you add the close action) need labels in `src/lib/staffLogFormat.ts`. |
| **Access** | Admin-only route (volunteers `false` in `staffRouteAccess.ts`); add the tab to `AdminLayout.tsx` and update `tests/unit/staff-routing.test.tsx`, which pins the tab list. |

The admin repo's checks still apply: `npm run lint && npm run typecheck &&
npm run test:coverage` (90% minimum), `npm run verify:register-schema-lock`
(the `arcade*` and `o21*` tables go in `ADMIN_EDITABLE_TABLES`), and the
no-table-loss check from the prototype's `port/scripts/check-no-table-loss.mjs`.

---

## Checklist

- [x] Decide option A or B for points; record it in `ARCADE_PLAN.md` (B, two-phase)
- [ ] Check peccary for `o21Hands` rows; decide how the ledger treats them
- [ ] Real `o21Tables.ts` on the arcade gate + points path, same exports
- [ ] Close tables on switch-off / `closesAt` (scheduled ticks + admin hooks)
- [ ] `o21Windows` create/update refuse, list stays
- [ ] Integration tests above; `backend:test` and `backend:check` pass
- [ ] Push to peccary with `npm run convex:push-dev` (never from `src/`)
- [x] Live mount in `src/games/olympus-21/index.ts`
- [ ] Admin portal: schedule form, Olympus 21 switch, live tables view, audit labels, route + tab + tests
- [x] Error copy for `ARCADE_CLOSED` / `GAME_DISABLED` in the game
