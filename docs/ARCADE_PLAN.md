# HackUTA Arcade: plan

The arcade is a standalone website that hosts the HackUTA points games
(Olympus Slots first, PvP Blackjack next). Hackers reach it from a small
**Arcade** button on their profile, which opens it in a new tab, already
signed in. Admins turn the whole site, or one game, on and off.

This repo replaces the prototype repo `hackuta-2026-gambling-mini_game`,
which stays as the Olympus Slots prototype and is not developed further.

## Decisions made

| Topic | Decision |
| --- | --- |
| Where it lives | This repo, `hackuta2026-arcade-site`, next to `hackuta-2026-profile` and `hackuta-2026-admin` in the same parent folder. |
| Backend | The **same Convex deployment** as profile. Points stay on `checkedIn.points`, so hackers have one balance everywhere. Sandbox: `brazen-peccary-506` only. |
| Sign-in | **One-click hand-off, no second login.** See below. |
| Admin controls | A site switch (`off` / `scheduled` / `on`) **plus** a per-game switch. |
| Security | Every rule is enforced in Convex functions. Showing or hiding the button or the site is cosmetic. |

## System

```
 Profile portal                              Arcade site (this repo)
 ┌──────────────────────────┐               ┌───────────────────────────────────┐
 │ Dashboard                │  new tab      │ Hub: list of open games           │
 │  [Arcade] button ────────┼──────────────►│  ├─ Olympus Slots                 │
 │  (shown only when open)  │  + launch     │  ├─ PvP Blackjack (next)          │
 └────────────┬─────────────┘    code       │  └─ ...                           │
              │                             │ "Closed" screen when switched off │
              ▼                             └──────────────┬────────────────────┘
        ┌──────────────── same Convex deployment ──────────▼───────┐
        │ arcadeSettings + arcadeGames · game functions · points   │
        └──────────────────────────────▲───────────────────────────┘
                                       │
                         Admin portal: "Arcade" tab
```

### One-click sign-in (launch code)

Convex Auth keeps sessions per website, so a profile session does not carry
over. The hand-off:

1. Hacker clicks **Arcade** on profile.
2. Profile calls `arcade/launch:createLaunchCode` (authenticated mutation).
   The server makes a random code (32 bytes), stores only its SHA-256 hash with
   the user id, a 60-second expiry and a used flag. Rate-limited per user.
3. Profile opens `https://<arcade>/launch#code=<code>` with `noopener`. The code
   is in the `#` fragment, so it never reaches server or proxy logs.
4. The arcade's `/launch` page removes the fragment from the address bar and calls
   `signIn("arcade-launch", { code })`. A custom `ConvexCredentials` provider
   hashes the code, checks it is unexpired and unused, marks it used, and returns
   the user id. Convex Auth then issues the arcade's own session.
5. The hacker lands on the hub.

Opening the arcade without a session, or after it expires, shows
"Open the arcade from your HackUTA profile" with a link back to profile.

The provider must be registered in profile's `convex/auth.ts`, so that file joins
the edited base files tracked in `backend/BASE.json`.

### Admin switches (server)

- **`arcadeSettings`** (one record): `status` = `off` | `scheduled` | `on`,
  `opensAt` and `closesAt` for `scheduled`, `updatedBy`, `updatedAt`.
- **`arcadeGames`** (one record per game): `key`, `name`, `enabled`, `order`.
- One shared check, `requireGameOpen(ctx, gameKey)`, runs in **every** game
  mutation. It verifies the site is open by the server clock and the game is
  enabled, and that the player is a signed-in, accepted, checked-in hacker.
- Every change is written to `staffConfigLogs` with new `arcade_*` actions.
- Live subscriptions flip open tabs to the closed screen as soon as an admin
  switches off; in-flight spins are rejected by the server.
- `slotWindows` (from the prototype) gets folded into the site schedule so
  admins schedule play in one place.

### Profile button

Profile subscribes to `arcade/launch:getLauncherState` and shows the button only
when the arcade is scheduled (teaser) or on. That is the same pattern the
prototype's Gamble tab used. If the query errors, the button stays hidden.

## Steps

| # | Step | Done when | Status |
| --- | --- | --- | --- |
| 0 | **Repo setup:** Vite + React + TS, Convex client, safety check, tests, Olympus Slots copied in (mock points) | `npm test`, `npm run build`, `npm run backend:test` pass | **Done** |
| 1 | **Backend:** `arcadeSettings`, `arcadeGames`, `requireGameOpen`, launch codes + `arcade-launch` provider, admin functions, audit actions, convex-test tests | `npm run backend:test` passes | Next |
| 2 | **Site shell:** routes (`/`, `/launch`, `/play/:game`), Convex Auth client, signed-out and closed screens, live hub | Sign-in works from the local dev launcher | |
| 3 | **Olympus Slots on the arcade:** mount from the registry with the Convex adapter; move its schedule from `slotWindows` to the arcade switches | Playable end to end locally | |
| 4 | **Local dev pages** in `dev/`: fake profile Arcade button + admin switch panel | Whole flow works on one machine | |
| 5 | **Push to the sandbox** (`brazen-peccary-506`) | Works against the sandbox | Blocked: Convex access |
| 6 | **Real repos:** profile gets only the button and the launch-code call; admin gets the Arcade tab | PRs merged: admin first, then profile | |
| 7 | **Deploy** the arcade as a static site; add its address to the allowed origins | Live, switched off until an admin turns it on | |
| 8 | **PvP Blackjack** as the second game | | |

## Open items

- **Convex access:** the current Convex CLI login has no access to
  `brazen-peccary-506` ("You don't have access to the selected project").
  Needs an invite to the owning team, or logging in with the account that has
  access (`npx convex logout && npx convex login`). Blocks step 5 only.
- **Domain and host** for the arcade (for example a `hackuta.org` subdomain).
  Needed for step 7 and the allowed-origins list.
- **Olympus Slots in profile:** the prototype prepared a full Gamble page for
  profile. Decide whether to drop it (arcade only) or keep both for a while.
