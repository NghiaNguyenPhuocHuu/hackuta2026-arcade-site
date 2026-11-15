# Game backend for the sandbox deployment (brazen-peccary-506)

A Convex push replaces **every** function on a deployment, and no function on
peccary may be deleted. So the push is never made from this repo's root. It is
made from an **assembled build**: the exact profile backend peccary already
runs, plus the game.

| Path | What |
| --- | --- |
| `BASE.json` | Pinned profile commit (`4ec8892`, the merge of profile PR #26). Its backend matches peccary's live function list exactly (143 functions/routes). It also records the base hashes of the 4 profile files we edit. |
| `overlay/convex/arcade/access.ts` | Who may play (`loadPlayer`: signed in → participant → accepted → checked in, always from the session) and whether it's open (`gameGate`, `requireGameOpen`: arcade switch by the server clock + the game's switch) |
| `overlay/convex/arcade/points.ts` | **The only place games change points.** `beginPlay` (identity, replay of a repeated `playId`, then the open check), `cooldownLeft`, `applyPlay` (refuses a stake above the arcade wallet, writes `arcadePlays`, updates the wallet; never `checkedIn.points`) |
| `overlay/convex/arcade/wallet.ts`, `transfers.ts` | The arcade wallet (`arcadeWallets`) and the only bridge to the profile balance: `deposit`, `withdraw`, `getMyTransfers`, logged in `arcadeTransfers` |
| `overlay/convex/arcade/session.ts` | `getArcadeSession` (switch, games, the caller's name, profile `points` and `arcadePoints`; works signed out) and `getLauncherState` (profile's Arcade button) |
| `overlay/convex/arcade/admin.ts` | Admin-only `getArcadeAdmin`, `updateArcadeSettings`, `updateArcadeGame`, `listArcadeTransfers` (transfer log + per-wallet check), plus `*Internal` versions for the CLI. Audited in `staffConfigLogs` |
| `overlay/convex/arcade/launch.ts`, `launchProvider.ts` | One-time launch codes (`createLaunchCode`, `consumeLaunchCode`) and the `arcade-launch` Convex Auth provider |
| `overlay/convex/arcade/poker.ts` | Event-wide Texas Hold'em matchmaking (queue, table, bots, 15s kick). Hole cards and the deck never leave the server. |
| `overlay/convex/admin/o21*.ts` | Preserve peccary's live Olympus 21 functions (windows, tables, seed). Do not drop these on push. |
| `overlay/convex/admin/slotSpin.ts` | Olympus Slots `getMyGameState` and `spin`, built on the arcade code above |
| `../shared/arcade/rules.ts`, `../shared/admin/slotRules.ts`, `../shared/poker/` (repo root) | Arcade, slot, and poker rules, one copy shared by the site and the backend. The assemble script copies `shared/` into the build. |
| `overlay/convex/schema.ts`, `overlay/convex/admin/pointsLedger.ts`, `overlay/convex/admin/fields.ts`, `overlay/convex/auth.ts` | Full copies of the pinned files with additive edits only: arcade + poker + o21 tables, `arcadePlays` deltas in `computeLedgerPoints`, arcade/o21 audit actions, and the `arcade-launch` provider |
| `overlay/tests/integration/arcade.test.ts`, `slot-spin.test.ts`, `poker-matchmaking.test.ts`, `overlay/tests/helpers/arcadeTestKit.ts` | convex-test integration tests |

## Commands

```bash
npm run backend:assemble   # build/peccary = pinned profile backend + overlay + shared/ (+ npm ci on first run)
npm run backend:test       # assemble with offline codegen stubs, run arcade + slot + poker integration tests
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

**Switching the arcade from the CLI** (times are epoch milliseconds):

```bash
cd build/peccary
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run arcade/admin:updateArcadeSettingsInternal '{"mode": "scheduled", "opensAt": 1794540000000, "closesAt": 1794543600000}'
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run arcade/admin:updateArcadeGameInternal '{"key": "olympus-slots", "enabled": true}'
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run arcade/admin:updateArcadeSettingsInternal '{"mode": "off"}'
```

The profile repo's `admin-schema-lock` manifest isn't checked here. That
check belongs to the real hand-off described in `DEPLOYMENT_NOTES.md`.
