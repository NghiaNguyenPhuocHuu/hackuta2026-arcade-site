# Session handoff

Context carried over from the Claude session that started this repo (it ran in
`hackuta-2026-gambling-mini_game`, on 2026-11-14). Read this together with
`CLAUDE.md` (rules, layout, commands) and `docs/ARCADE_PLAN.md` (design,
decisions, step plan). Update this file at the end of each working session.

## Where things stand (2026-11-14)

| | |
| --- | --- |
| Repo | `~/Codespace/hackuta2026-arcade-site`, GitHub `NghiaNguyenPhuocHuu/hackuta2026-arcade-site`, branch `main` |
| Commits | `79be161` repo setup (pushed) · `ae16fb4` HackUTA-themed UI (**local, not pushed yet**) |
| Checks | `npm run typecheck`, `npm test` (13), `npm run build`, `npm run backend:test` (15) all pass |
| Plan status | Live sandbox: site + games + wallet on **brazen-peccary-506** (no mock mode). |

### What's built

- **Site shell** in the participant portal's look: sidebar (brand + "Arcade"
  tag, Lobby, games, Wallet, Back to profile, account footer), which becomes
  the portal's top tab bar at ≤900px.
- **Lobby** (`/`): frieze header + points pill, open/scheduled status banner
  with live countdown, game cards, "House rules" panel.
- **Play** (`/play/:gameKey`): lazy-loads the game; every shipped game talks
  to Convex (slots, wheel, poker).
- **Full-page screens** for `off`, `signed-out`, `loading`, and can't-play-yet:
  profile's sign-in card over the temple art.
- **`useArcadeSession`** reads `arcade/session:getArcadeSession` live.

### Where the theme came from

Copied from `hackuta-2026-profile` (commit `d838016`), not recreated:
- `src/styles/portal.css` = profile's `src/styles/participant-dashboard.css`
  verbatim. Don't edit; re-copy when profile changes.
- `src/styles/theme.css` = the `@theme` tokens, `@font-face` and base layer from
  profile's `src/styles/index.css`, as plain CSS (no Tailwind here).
- `src/styles/arcade.css` starts with copies of profile's `.sign-in-card*` and
  `.sign-in-btn` rules, then arcade-only styles.
- `public/` fonts, logos, favicons; `public/images/art/` pillars + temple.
- `src/components/brand/` Logo, LogoMark, NavIcons from profile.

## Live backend, no mocks (2026-11-14, pushed to brazen-peccary-506)

- **Backend:** Wheel of the Fates on the server (`arcade/roulette`:
  `getMyTable`, `spin`, `rouletteSpins`, daily loss limit by the event's day).
  Olympus Poker moved to signed-in hackers and the arcade wallet (buy-in via
  `applyPlay`, cash-outs and refunds via `creditWallet`, all in `arcadePlays`);
  `pokerAudit` queries are admin-only. 60 backend tests; the profile suite (136)
  passes on the build. Pushed with `npm run convex:push-dev` after a backup
  (`backups/peccary-20261114-2223.zip`): 201 functions, none lost.
- **Site:** `ConvexAuthProvider`; the signed-out screen has the email + password
  form; `useArcadeSession` reads `arcade/session:getArcadeSession` live; a gate
  shows loading / sign-in / "not yet" (can't play) / sealed (Wallet still
  reachable) / the arcade. Games mount with `{ client, reveal, player }` on
  their Convex adapters; the Wallet uses the real deposit/withdraw/log. All mock
  code is gone (mock wallet, mock adapters, the offline poker client, `?preview=`).
- **To test signed in:** an accepted, checked-in account on the sandbox, with
  the arcade and the games switched on (see README).
- **Note for kolorless:** the poker functions no longer take `playerToken`;
  the site's poker client is updated. Legacy token players keep their chips.

## Arcade wallet: deposit and withdraw

- **Backend** (`backend/overlay/convex/arcade/`): `wallet.ts`, `transfers.ts`
  (`deposit`, `withdraw`, `getMyTransfers`), games via `applyPlay` on the arcade
  wallet.
- **Site:** `/wallet` uses live balances and transfer history from Convex.

## Graceful close + points audit (2026-11-14 evening, local)

Verified server rules and tightened close UX (not pushed yet):

- **Points:** All game stakes go through `beginPlay` → `applyPlay` on the arcade wallet only;
  profile balance moves only via `transfers` (deposit gated when closed; withdraw always).
  Idempotent `playId` / `transferId` prevents double-charge on retries. Poker `creditWallet`
  is internal-only (cash-out / queue refund).
- **When gates close:** New wagers and deposits return `ARCADE_CLOSED`; replay of an in-flight
  spin still settles (`beginPlay` checks replay before `gameGate`). Poker `act` has no arcade
  gate so hands finish; `trySeat` now no-ops when closed (no new tables).
- **UI:** `/play/*` stays mounted when `off` with `ArcadeStatusBanner` (“finish your trial”);
  lobby/wallet/off screen unchanged except wallet always reachable. Gate no longer kicks active play.
- **Tests:** `npm test` (45), `npm run backend:test` (65), `npm run backend:check` pass.

Next: commit + `npm run convex:push-dev` so peccary gets `trySeat` gate and any other overlay edits.

## Open items (need the user)

1. **Convex CLI access** for contributors who are not on the peccary team.
   Push with `npm run convex:push-dev` only after `npm run backend:check` passes.
2. **CS Gelios font license.** `public/fonts/CSGelios-LICENSE.txt` says the
   bundled file is a personal-use demo and a commercial/web license is needed
   before the public site deploys. Same file profile ships. Confirm HackUTA has
   the license before step 7.
3. **Profile URL unknown.** `VITE_PROFILE_URL` (in `src/constants/site.ts`)
   defaults to `https://hackuta.com` until the user gives the participant
   dashboard's address.
4. **Domain and host** for the arcade: not decided (step 7).
5. **Olympus Slots in profile:** the prototype prepared a full Gamble page for
   profile. Undecided whether to drop it (arcade only) or keep both for a while.
6. The sidebar sign-out button has no handler yet (wired with auth in step 2).

## Step 1 (backend) is done: 2026-11-14, not pushed

All in `backend/overlay/convex/arcade/` (see `backend/README.md` for the
file list). `npm run backend:test` runs 32 tests; `node scripts/test-backend.mjs --all`
(the profile's whole suite on the build) passes 108.

- **One shared points path.** Games never write `checkedIn.points` directly:
  `beginPlay` → `cooldownLeft` → result → `applyPlay`, inside the game's
  mutation (one transaction). `arcadePlays` holds one row per play for every
  game and `computeLedgerPoints` counts it.
- **The player always comes from the session**, never from an id the browser sends.
- **Olympus Slots** now opens and closes with the arcade switch and its own
  game switch. `slotWindows` was removed (never deployed). New error codes
  `ARCADE_CLOSED`, `GAME_DISABLED`, `INVALID_PLAY_ID` replace
  `WINDOW_CLOSED` / `INVALID_SPIN_ID`; the site's adapter maps them.
- **`convex/auth.ts`** is now an edited base file (the `arcade-launch`
  provider); its hash is in `BASE.json`.
- Site: `src/convex/arcadeApi.ts` has the references; `GameKey` comes from
  `shared/arcade/rules.ts`, and a test keeps the registry and the server list equal.

Edge cases covered by tests: signed out / not a participant / waitlisted /
not checked in / acceptance revoked after check-in; schedule before, during
and after (by the server clock); an "on" switch past its end time; game off
with the arcade on; admin switching off mid-session; repeated play ids
(no second charge, still answered after closing; the same id in another game
is a separate play); stakes of 0, negative, fractional or above the balance;
betting down to exactly 0; cooldowns per game; one balance across games and
outside changes (shop, volunteers) showing in the session; ledger parity;
non-admins and bad admin input changing nothing; launch codes single use,
60 s expiry, hash-only storage, malformed or unknown codes, launch codes
switched off after a code was handed out, rate limit and clean-up.

Not testable in convex-test: the `arcade-launch` provider itself (Convex Auth's
sign-in action). It only calls `consumeLaunchCode`, which is tested; try it end to
end in step 2.

## Olympus 21 on the live server (2026-11-14, branch `olympus-21`, not pushed)

Rebuilt on a fresh branch from `main` after the revert of PR #2, so it lands as
new commits (merging the old `blackjack` branch again would drop it silently).

- **Backend:** `convex/arcade/olympus21.ts`, same system as poker: queue
  (`o21Queue`), 50-point buy-in from the arcade wallet, seating by poker's rule
  (humans only, no bots), table chips, cash-outs to the wallet. New tables `o21Queue`, `o21LiveTables`,
  `o21Seats` (additive). Legacy `admin/o21*.ts` and the `o21Tables` /
  `o21Hands` / `o21Actions` tables are untouched (never deleted).
- **Pure rules:** `shared/olympus21/live.ts` (seating, `runLive`: timers,
  closing, idle and broken tables, cash-outs with the exact chips at the
  moment the engine unseats someone). Tested in `tests/olympus21/o21Live.test.ts`.
- **Site:** the game mounts live only; the mock adapter, the bots/name lobby,
  the LAN sandbox paths and phone QR pairing are removed. The lobby shows the
  buy-in, the queue (with a leave-the-queue refund), "leaving" and the last result.
- **Checked (2026-11-14):** `backend:test` 72 passed (7 new Olympus 21),
  the profile's full suite (`--all`) 148 passed, `tsc` on the assembled backend
  clean, `backend:check`: 202 live functions kept, 10 new (`arcade/olympus21`).
  Site: 159 tests, typecheck and build pass. **Not pushed.**

## Next steps

- `/launch` flow for `arcade-launch` codes (when organizers use backup sign-in).
- Sidebar sign-out wired to Convex Auth.
- Olympus 21: `npm run convex:push-dev`, switch `pvp-blackjack` on, and try
  two accounts in two browsers.

## Environment notes

- Sibling repos in `~/Codespace/`: `hackuta-2026-profile` (backend source for
  `backend:assemble`, pinned at `4ec8892` in `backend/BASE.json`),
  `hackuta-2026-admin`, and the old prototype `hackuta-2026-gambling-mini_game`
  (frozen; its own `npm run sandbox` serves on port 5380).
- Arcade dev server: `npm run dev` → http://127.0.0.1:5573 (strict port).
- Screenshots: headless Google Chrome won't go below 500px wide, so use
  Playwright for phone sizes. A copy is at
  `../hackuta-2026-admin/node_modules/playwright-core`, with Chromium in
  `~/Library/Caches/ms-playwright`.
- `npm run backend:test` leaves offline stubs in `build/peccary`; run
  `npm run backend:assemble` before any push.

## Full screen + uniform game headers + dead code (2026-11-14, local)

- **Full screen** is on every game (Slots, Wheel, Poker) through the shared
  `src/games/fullscreen.ts` control. `<FullscreenSwitch>` now imports
  `fullscreen.css` itself, so React games (Wheel, Poker) get its styles however
  they mount; Slots (plain DOM) still inlines it. Laptop/desktop only.
- **Header controls are uniform**: the switch, LIVE/OPEN badges, Slots' clock
  and Wheel's SOUND/THEMES are all 36px, 12px pixel type, 3px marble/ink
  border + 3px shadow. Wheel's disabled buttons are 60% opacity (was 40%).
- **Removed unused code** (no references anywhere, profile repo included):
  `isValidWager`, `expectedRtp`, `SLOT_SPIN_ID_MAX_LENGTH`, `betDef`,
  `PROFILE_ASSETS`, `createLaunchCodeRef`, `HACKER_MAPS`, four unused nav icons.
  Backend overlay functions were not touched (never delete live functions).
- Inspect without signing in: `npm run dev`, then `/preview-fullscreen.html?game=slots|wheel|poker`.

## Game sound effects (2026-11-15, local)

- `src/games/sound.ts`: shared Web Audio engine (`ChipTune`) + one arcade-wide
  game-sound switch (localStorage `arcade-game-sound`), separate from the site music.
  `<SoundSwitch>` (React) / the same markup in Slots puts SOUND ON | OFF in every header.
- Slots (`olympus-slots/sound.ts`): wager blip, lever, reel ticks, reel stops, win/jackpot/push/loss, error.
- Wheel (`wheel-of-the-fates/sound.ts`): its old sounds, now on the shared engine;
  its own `sound` setting is gone (uses the shared switch).
- Poker (`poker/sound.ts` + pure `poker/cues.ts`): own actions on click; deal, board,
  others' bets/folds, your turn, win/lose, seated, cash-out from view changes. Tests in
  `tests/unit/game-sound.test.ts`.

## Game names (2026-11-15, local; user decision)

Display names only; game keys, routes and folders are unchanged (the server uses the keys):
Olympus Slots → **Reels of Tartarus**, Wheel of the Fates → **Wheel of Doom**,
Olympus Poker → **Hades' Hold'em** (registry, in-game titles/taglines,
`shared/arcade/rules.ts`). The server's game list shows the new names only after
the next `npm run convex:push-dev`; the site uses the registry names already.

## Merge of Olympus 21 + PvP cleanup (2026-11-15)

- Merged `origin/main` (PR #4, Olympus 21 = `pvp-blackjack`): conflicts in README and
  `shared/arcade/rules.ts` resolved (new game names kept, plus "Olympus 21").
- Mock/offline leftovers removed: contract doc's mock adapter + LAN sandbox sections,
  QR-pairing CSS, the "BOT" seat label and dead `NO_BOTS` copy, poker's "Shades take
  empty seats" queue text (poker seats humans only). The engine's bots stay: they only
  drive the engine's seeded simulation tests; no live table seats one.
- Olympus 21 now has the shared SOUND ON | OFF switch + its own 8-bit sounds
  (`olympus-21/sound.ts`), full screen, and the uniform 36px header controls.
  Preview: `/preview-fullscreen.html?game=o21`.
- Backend (`arcade/olympus21`): `backend:test` 72 pass; `backend:check` 202 live
  functions kept, 10 new.
- **Pushed 2026-11-15 00:06** with `npm run convex:push-dev` after a backup
  (`backups/peccary-20261115-0005.zip`): 212 functions live (was 202), 10 added
  (`arcade/olympus21`), none lost; new indexes on `o21LiveTables`, `o21Queue`, `o21Seats`.
- **Next:** an admin switches `pvp-blackjack` on in the arcade settings, then try
  two signed-in, checked-in accounts in two browsers.

## Olympus 21 PvP switched on (2026-11-15)

- `pvp-blackjack` had **no row** in `arcadeGames` on peccary, so the server treated it
  as off ("paused" on the site). Switched on with
  `convex run arcade/admin:updateArcadeGameInternal '{"key":"pvp-blackjack","enabled":true}'`;
  `getMyTable` now reports `status: "live"`.
- New backend test plays full PvP rounds through the real functions (seat, bets,
  turns with play/draw, settle, zero-sum chips, out-of-turn refused, PLAY AGAIN,
  cash-out): `backend:test` 73 pass.
- Still to do by hand: two accepted, checked-in accounts in two browsers.

## Olympus 21 compact layout + the broke cat (2026-11-15, local)

- Olympus 21 table layout fits one screen: hand, bets and last rounds in a side
  column; ~540–655px tall at the arcade's width (was 1,170–1,300). Phones unchanged.
  Preview real engine phases: `/preview-fullscreen.html?game=o21&state=wagering|turns|settled`.
- **Broke cat** (`src/arcade/brokeCat.ts`, `src/components/BrokeCatPopup.tsx`): when the
  arcade wallet drops to 0 in Slots or Wheel (not table games: a buy-in can empty the
  wallet on purpose), an original pixel cat laughs with a synthesized laugh track
  (game SOUND switch applies), once per drop, after the spin's reveal. "Deposit more
  points" goes to the Wallet; Esc / "I'm not mad" closes. Optional own meme files:
  set `BROKE_MEME` paths (files in `public/`, ones you have the rights to). Preview:
  `?game=broke`.
