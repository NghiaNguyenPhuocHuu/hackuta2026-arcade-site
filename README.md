# HackUTA Arcade

The website for the HackUTA points games. Hackers open it from the **Arcade**
button on their profile (new tab, already signed in). Admins switch the site,
or a single game, on and off. Games: **Olympus Slots** (PvP Blackjack next).

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
npm run dev                  # http://127.0.0.1:5473
```

Right now the games run on mock points; the real backend arrives in step 1 of the plan.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site locally |
| `npm test` | Run the site's tests |
| `npm run typecheck` / `npm run build` | Typecheck / production build |
| `npm run backend:test` | Build the backend with test stubs and run its tests |
| `npm run backend:assemble` | Build the backend for a push |
| `npm run backend:check` | Read-only: check a push would not delete any live function |

Pushing the backend to the sandbox: see [backend/README.md](backend/README.md).
`npm run convex:push` is disabled on purpose; never push from the repo root.
