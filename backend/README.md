# Game backend for the sandbox deployment (brazen-peccary-506)

A Convex push replaces **every** function on a deployment, and no function on
peccary may be deleted. So the push is never made from this repo's root. It is
made from an **assembled build**: the exact profile backend peccary already
runs, plus the game.

| Path | What |
| --- | --- |
| `BASE.json` | Pinned profile commit (`4ec8892`, the merge of profile PR #26). Its backend matches peccary's live function list exactly (143 functions/routes). It also records the base hashes of the 3 profile files we edit. |
| `overlay/convex/admin/slotSpin.ts` | Hacker-facing `getMyGameState` and `spin` (real Convex Auth; balance on `checkedIn.points`) |
| `overlay/convex/admin/slotWindows.ts` | Admin-only window create/update/cancel/list, plus `*Internal` versions for the CLI |
| `../shared/admin/slotRules.ts` (repo root) | Slot rules, one copy shared by the site and the backend. The assemble script copies `shared/` into the build. |
| `overlay/convex/schema.ts`, `overlay/convex/admin/pointsLedger.ts`, `overlay/convex/admin/fields.ts` | Full copies of the profile schema with additive arcade tables (`slotWindows`, `slotSpins`, `pokerPlayers`, `pokerQueue`, `pokerTables`, `pokerSeats`), the optional `staffConfigLogs.targetSlotWindowId` field, spin deltas in `computeLedgerPoints`, and the 3 `slot_window_*` audit actions |
| `overlay/convex/arcade/poker.ts` | Event-wide Texas Hold'em matchmaking (queue, table, bots, 15s kick). Hole cards and the deck never leave the server. |
| `overlay/convex/admin/o21*.ts` | Preserve peccary's live Olympus 21 functions (windows, tables, seed). Do not drop these on push. |
| `overlay/tests/integration/slot-*.test.ts`, `poker-matchmaking.test.ts` | convex-test integration tests |

## Commands

```bash
npm run backend:assemble   # build/peccary = pinned profile backend + overlay + shared/ (+ npm ci on first run)
npm run backend:test       # assemble with offline codegen stubs, run slot + poker integration tests
npm run backend:check      # read-only: live function list vs build; fails if anything would be lost
npm run convex:push-dev    # assemble (no stubs) + no-function-loss check + push peccary
```

## Push from arcade-site (sandbox only)

Run from this repo's root. The script assembles `build/peccary` first, so the
push never deletes profile functions. It targets `dev:brazen-peccary-506` only.

```bash
npm run convex:push-dev
```

That is:

```bash
node scripts/assemble-backend.mjs                     # fresh build, NO stubs (convex dev generates _generated)
node scripts/check-no-function-loss.mjs --save build/spec-pre.json
cd build/peccary
# push (typechecks, regenerates _generated, deploys schema + functions)
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex dev --once --typecheck enable --tail-logs disable
cd ../..
node scripts/check-no-function-loss.mjs --post build/spec-pre.json
```

In PowerShell, set the variable first with `$env:CONVEX_DEPLOYMENT="dev:brazen-peccary-506"`.

**Opening a play window from the CLI** (times are epoch milliseconds):

```bash
cd build/peccary
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run admin/slotWindows:createSlotWindowInternal '{"opensAt": 1794540000000, "closesAt": 1794543600000}'
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run admin/slotWindows:cancelSlotWindowInternal '{"windowId": "<id>"}'
```

The profile repo's `admin-schema-lock` manifest isn't checked here. That
check belongs to the real hand-off described in `DEPLOYMENT_NOTES.md`.
