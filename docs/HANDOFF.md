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
| Plan status | Step 0 done. Step 2's UI is done on mock data. **Step 1 (backend) is next.** |

### What's built

- **Site shell** in the participant portal's look: sidebar (brand + "Arcade"
  tag, Lobby / Olympus Slots / PvP Blackjack "Soon" / Back to profile, account
  footer), which becomes the portal's top tab bar at ≤900px.
- **Lobby** (`/`): frieze header + points pill, open/scheduled status banner
  with live countdown, game cards, "House rules" panel.
- **Play** (`/play/:gameKey`): header with back link; lazy-loads the game.
  Olympus Slots runs on its **mock adapter** (fake 200 points).
- **Full-page screens** for `off`, `signed-out`, `loading`: profile's sign-in
  card over the temple art, "Go to my profile" button.
- All server data comes from `src/arcade/useArcadeSession.ts`, which is a
  **mock**. Preview screens with `?preview=off|scheduled|signed-out|loading`.
  Step 1 replaces the mock with a Convex query; keep the `ArcadeSession` shape
  or update the pages with it.

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

## Arcade wallet: deposit and withdraw (2026-11-14, on `main`, not deployed)

- **Backend** (`backend/overlay/convex/arcade/`): `wallet.ts` (`arcadeWallets`),
  `transfers.ts` (`deposit`, `withdraw`, `getMyTransfers`, logged in
  `arcadeTransfers`), admin `listArcadeTransfers` with a per-wallet check.
  `applyPlay` uses the wallet only; `computeLedgerPoints` counts transfers.
  `npm run backend:test`: 49 pass.
- **Site:** the `/wallet` page (balances, deposit, withdraw, transfer log),
  `ConfirmTransferDialog` (native modal), the "Deposit points to play" prompt,
  the mock wallet with both balances (profile 200, arcade 0). `npm test`: 50 pass.
- **Not done:** wiring the site to Convex (step 2); deploying (the sandbox's
  function-loss issue still stands). Poker keeps its own chips.
- Known: kolorless's `convex/arcade/poker*.ts` fail the offline Convex
  typecheck (they import `_generated/dataModel`, which the stubs don't
  provide); the tests still pass. Dev server port is now **5573**.

## Open items (need the user)

1. **Convex access is blocked.** `npm run backend:check` fails with "You don't
   have access to the selected project". The user's Convex CLI account is not a
   member of the team that owns `dev:brazen-peccary-506` (a personal dev
   deployment of someone on that team). Fix: get invited, or
   `npx convex logout && npx convex login` with the right account. Only blocks
   step 5 (pushing to the sandbox); steps 1–4 can proceed. **Never** follow the
   CLI's hint to run `npx convex dev` to pick another project.
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

## Next step: 2, the site shell

- Wrap the app in `ConvexAuthProvider` (from `@convex-dev/auth/react`, add the
  dependency) instead of `ConvexProvider`.
- `/launch` page: read `#code=`, clear it from the address bar
  (`history.replaceState`), `signIn("arcade-launch", { code })`, go to `/`.
- `useArcadeSession`: `useQuery(getArcadeSessionRef, { nowBucket })` instead of
  the mock, bumping `nowBucket` at `arcade.nextChangeAt`; map `player.problem`
  to the status screens. Keep the mock behind `?preview=` (or a dev flag) so
  the site still runs without a backend.
- Backup sign-in form on the signed-out screen when `signIn.backupSignIn`.
- Sign-out button in the sidebar.
- Then step 3 (Olympus Slots on its Convex adapter) and the roulette backend
  on the same `beginPlay` / `applyPlay` path.

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
