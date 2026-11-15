# HackUTA Arcade

The website for the HackUTA points games: **Olympus Slots**, **Wheel of the
Fates**, **Olympus Poker** and **Olympus 21**. Hackers sign in with their
HackUTA email and password, **deposit** points from their profile into an
arcade balance on the **Wallet** page, play, and **withdraw** what's left back
to their profile. Admins switch the site, or a single game, on and off.

The design, decisions and step plan are in [docs/ARCADE_PLAN.md](docs/ARCADE_PLAN.md).

## Setup

Clone this repo next to the profile repo (the backend scripts use it):

```text
Codespace/
├── hackuta2026-arcade-site/   ← this repo
├── hackuta-2026-profile/
└── hackuta-2026-admin/
```

```bash
npm install
cp .env.example .env.local   # points at the sandbox, brazen-peccary-506
npm run dev                  # http://127.0.0.1:5573
```

The site talks to the real backend on the sandbox (there is no mock mode). To
play, sign in with a HackUTA account on that sandbox that is **accepted and
checked in**, and the arcade and each game must be switched on:

```bash
cd build/peccary   # after npm run backend:assemble
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run arcade/admin:updateArcadeSettingsInternal '{"mode": "on"}'
CONVEX_DEPLOYMENT=dev:brazen-peccary-506 npx convex run arcade/admin:updateArcadeGameInternal '{"key": "wheel-of-the-fates", "enabled": true}'
```

The look (colors, fonts, logo, icons, layout) is taken from the HackUTA participant portal in `hackuta-2026-profile`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site locally |
| `npm test` | Run the site's tests |
| `npm run typecheck` / `npm run build` | Typecheck / production build |
| `npm run backend:test` | Build the backend with test stubs and run its tests |
| `npm run backend:assemble` | Build the backend for a push |
| `npm run backend:check` | Read-only: check a push would not delete any live function |
| `npm run convex:push-dev` | Assemble, check, push to the sandbox, check again (back up first: `npx convex export`) |

Pushing the backend to the sandbox: see [backend/README.md](backend/README.md).
`npm run convex:push` is disabled on purpose; never push from the repo root.
