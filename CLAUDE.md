# HackUTA Arcade site

Standalone site for the HackUTA points games. Read these first:
- `docs/HANDOFF.md`: where the work stands, open items waiting on the user, and
  the detailed next step. Update it at the end of each working session.
- `docs/ARCADE_PLAN.md`: the design, the decisions already made, the step plan.
  Don't re-open decisions recorded there without the user.

## Safety rules (non-negotiable)

- Convex work targets **only** the sandbox `dev:brazen-peccary-506`.
  Never `standing-manatee-425` or production.
- **Never push from the repo root.** A Convex push replaces every function on a
  deployment and this repo holds only the game's part of the backend.
  Push only from the assembled `build/peccary`, following `backend/README.md`,
  and only with the user's go-ahead.
- **Never delete a table or function** on the deployment. Schema changes are
  additive. Run `npm run backend:check` before any push.
- Never run `npx convex dev` without `--once` in `build/peccary`, and never to
  "select a different project".
- Secrets never go in `VITE_*` variables or in git.

## Theme

The arcade must look like the HackUTA participant portal (profile repo). Use the
tokens in `src/styles/theme.css` (ink, night, clay, sand, light, ocean, mist;
Barlow Semi Condensed body, CS Gelios display) and reuse profile's class names
from `portal.css` before writing new styles. Don't introduce new colors or fonts.
The games themselves (e.g. Olympus Slots' pixel-art look) keep their own style.

## Layout

| Path | What |
| --- | --- |
| `src/` | The arcade site (Vite + React + TS + react-router). `src/games/registry.ts` lists games; each game is lazy-loaded. |
| `src/styles/` | `theme.css` = HackUTA tokens, fonts, base (from profile's index.css). `portal.css` = profile's participant-dashboard.css **copied verbatim, don't edit**. `arcade.css` = arcade-only styles. |
| `src/components/brand/` | Logo, LogoMark and nav icons copied from profile; `ArcadeIcons.tsx` adds arcade icons in the same style. |
| `src/layout/`, `src/pages/` | Portal-style shell (sidebar + main) and the Lobby, Play and full-page status screens. |
| `src/arcade/useArcadeSession.ts` | What the UI reads from the server. **Mock data until step 1**; preview screens with `?preview=off|scheduled|signed-out|loading`. |
| `public/` | Fonts, logos, favicons and art copied from profile's `public/`. |
| `src/games/olympus-slots/` | Olympus Slots: `mountMinigame(el, { adapter })` returns `unmount()`. Mock and Convex adapters. |
| `src/convex/` | Convex client and function references used by the site. |
| `shared/` | Pure rules used by both the site and the backend (one copy). |
| `backend/overlay/` | The games' Convex files, laid over the pinned profile backend. |
| `backend/BASE.json` | Pinned profile commit and the hashes of the profile files the overlay edits. |
| `scripts/` | Target guard, backend assemble, function-loss check, backend tests, auth key setup. |
| `tests/` | Site tests (vitest). Backend tests live in `backend/overlay/tests/`. |
| `dev/` | Local-only helpers (fake profile button, admin panel). Not deployed. |

The backend scripts expect `../hackuta-2026-profile` (cloned next to this repo).

## Commands

```bash
npm run dev               # site at http://127.0.0.1:5473
npm test                  # site tests
npm run typecheck
npm run build
npm run backend:test      # assemble build/peccary with stubs + run backend tests
npm run backend:assemble  # fresh build for a push (no stubs)
npm run backend:check     # read-only: would a push lose any live function?
```

`backend:test` leaves offline stubs in the build: always re-run
`backend:assemble` before pushing.
