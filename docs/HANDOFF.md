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

## Next step: 1, the backend

From `docs/ARCADE_PLAN.md`. All files go in `backend/overlay/` (laid over the
pinned profile backend by `scripts/assemble-backend.mjs`); tests in
`backend/overlay/tests/integration/`, run with `npm run backend:test`.

- Tables `arcadeSettings` (status `off|scheduled|on`, `opensAt`, `closesAt`,
  `updatedBy`, `updatedAt`) and `arcadeGames` (`key`, `name`, `enabled`,
  `order`). Additive schema edits only (`backend/overlay/convex/schema.ts`).
- `requireGameOpen(ctx, gameKey)` used by every game mutation (site open by
  server clock, game enabled, signed-in accepted checked-in hacker). Move the
  existing slot window check in `slotSpin.ts` onto it and fold `slotWindows`
  into the arcade schedule.
- Launch codes: `createLaunchCode` mutation (32 random bytes, store SHA-256
  hash, 60 s expiry, single use, rate-limited) and a `ConvexCredentials`
  provider `arcade-launch` registered in profile's `convex/auth.ts`. That makes
  `convex/auth.ts` a new edited base file: copy it into the overlay and add its
  hash to `backend/BASE.json` `modified`.
- Admin functions + `*Internal` CLI versions, audit to `staffConfigLogs` with
  new `arcade_*` actions (see how `slotWindows.ts` and `fields.ts` do it).
- A query for the site (`getArcadeSession`) and one for profile's button
  (`getLauncherState`).

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
