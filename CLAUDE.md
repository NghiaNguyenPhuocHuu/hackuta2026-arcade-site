# HackUTA Arcade site

Standalone site for the HackUTA points games. Read `docs/ARCADE_PLAN.md` first:
it has the design, the decisions already made, the step plan and its status, and
the open items. Don't re-open decisions recorded there without the user.

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

## Layout

| Path | What |
| --- | --- |
| `src/` | The arcade site (Vite + React + TS). `src/games/registry.ts` lists games; each game is lazy-loaded. |
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
