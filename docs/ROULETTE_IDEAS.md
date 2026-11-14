# Roulette game: ideas and features

> **Status (2026-11-14):** Phase 1 MVP is built and playable on mock points
> (`src/games/wheel-of-the-fates/`, rules in `shared/roulette/rules.ts`, tests
> in `tests/unit/roulette.test.ts`). It uses the choices ticked below: Wheel of
> the Fates, Fire/Night, single zero, Standard limits, 3 s cooldown, a 300-point
> daily loss limit (resets at midnight Arlington time), and wheel/table themes
> plus fast mode, free from the start. Still to do: the server functions and the
> Convex adapter (after plan steps 1–3), and phases 2–4.

A menu to pick from, not a final spec. Each section has a **recommended**
choice and alternatives. Tick the boxes (`[x]`) or add notes, and the result
becomes the spec for the build.

Working title: **Wheel of the Fates**. It sits next to Olympus Slots in the
arcade, uses the same HackUTA points, and follows the arcade rules in
`ARCADE_PLAN.md`: the server decides every result, admins can switch it off,
and only checked-in hackers can play.

---

## 1. Theme and story

The three Fates spin the thread of every hacker's luck: Clotho spins,
Lachesis measures, Atropos cuts. The wheel is their loom. Techno (the hacker
from Olympus Slots) has broken into this temple too and comments on the game.

| Element         | Idea                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Look            | Same night pixel-art style as Olympus Slots: starry sky, marble temple, gold and rust. Uses the arcade's night theme.  |
| The zero pocket | **Olympus** pocket in gold instead of green.                                                                           |
| Red / black     | Keep **red and black** so the bets are instantly familiar. Optional flavor names: _Fire_ and _Night_.                  |
| Ball            | A small glowing thread spark that circles and drops into a pocket.                                                     |
| Host            | Techno, with lines for bets placed, near misses, wins, losses and streaks, in the same dark heroic voice as the slots. |

- [v] Wheel of the Fates theme (recommended)
- [] Another Greek-myth theme: ________
- [v] Rename red/black to Fire/Night

---

## 2. Core rules

**Wheel:** single zero, pockets 0–36. The house edge is 1 in 37 (2.7%) on
every standard bet, which is the fairest option for players.

- [x] Single zero, 37 pockets (recommended)
- [ ] Double zero, 38 pockets (5.3% edge, not recommended)

**Bets** ("35:1" means you win 35× your stake and also get the stake back):

| Bet                       | Covers                 | Pays | MVP?  |
| ------------------------- | ---------------------- | ---- | ----- |
| Straight up               | 1 number               | 35:1 | Yes   |
| Split                     | 2 adjacent numbers     | 17:1 | Yes   |
| Street                    | Row of 3               | 11:1 | Yes   |
| Corner                    | Square of 4            | 8:1  | Yes   |
| Six line                  | 2 rows (6)             | 5:1  | Later |
| Dozen                     | 1–12, 13–24, 25–36     | 2:1  | Yes   |
| Column                    | 12 numbers in a column | 2:1  | Yes   |
| Red / Black               | 18 numbers             | 1:1  | Yes   |
| Odd / Even                | 18 numbers             | 1:1  | Yes   |
| Low (1–18) / High (19–36) | 18 numbers             | 1:1  | Yes   |

The zero loses every outside bet (red/black, dozens and so on). There are no
special zero rules in the MVP.

---

## 3. Points and limits

Roulette can pay much more than the slots (35× on one number, against the
slots' best of 5×). If points buy things in the shop, limits keep one lucky
spin from breaking the economy.

**Recommended limit:** besides stake limits, the server works out what each
of the 37 pockets would pay for the whole set of bets, and rejects the spin if
any pocket would pay more than the **max payout per spin**. That one rule also
covers stacked bets, such as a number plus every split around it.

| Preset                     | Chips         | Max stake per spin | Max on one number | Max payout per spin |
| -------------------------- | ------------- | ------------------ | ----------------- | ------------------- |
| Careful                    | 5, 10         | 25                 | 5                 | 200                 |
| **Standard (recommended)** | 5, 10, 25     | 50                 | 10                | 500                 |
| High roller                | 5, 10, 25, 50 | 100                | 25                | 1,000               |

- [ ] Careful - [x] Standard - [ ] High roller - [ ] Custom: ________
- [x] Cooldown between spins: 3 s (slots use 2 s)
- [x] Optional **daily loss limit** per hacker (for example 300 points a day),
      set by admins. Protects hackers who get carried away.

---

## 4. Player features

### MVP

- **Chip tray:** pick a chip value, tap the table to place it. Tapping again
  adds another chip.
- **Bet controls:** Undo, Clear, Repeat last bet, Double.
- **Bet summary:** total stake, number of bets, and the best possible win.
- **Spin:** the wheel spins while the server decides, then slows to the
  server's pocket. The animation only shows the result; it never decides it.
- **Result:** the winning pocket glows, winning chips flash and pay out,
  losing chips are swept away, and Techno comments.
- **History strip:** the last 12 numbers with their colors.
- **Balance:** the live balance, shared with the lobby's points pill.
- **Phones:** the table turns vertical (12 rows × 3 columns), with the wheel
  above it and Spin and the chips in thumb reach.
- **Accessibility:** every bet spot is a real button with a spoken label
  ("Split 17 and 18, 10 points"), and results are announced. Reduced motion
  skips the long spin.

### Later

- **Racetrack:** an oval layout of the wheel order, for neighbor bets
  (a number plus the 2 on each side).
- **Sound:** wheel tick, ball drop, win chime. Muted by default.
- **Statistics panel:** the share of red/black, odd/even and dozens over the
  last 100 spins. Labelled as history only: past spins don't change the next one.
- **Bet hints:** hover or long-press a spot to see what it covers and pays.

---

## 5. Customization

### For players (looks only; never affects points)

| Feature       | Options                                                |
| ------------- | ------------------------------------------------------ |
| Wheel skin    | Marble temple (default), Bronze, Night sky, Underworld |
| Table cloth   | Midnight blue (default), Olympus gold, Deep sea, Ember |
| Chip style    | Classic colors, Pixel coins, Gemstones                 |
| Favorite bets | Save up to 3 bet layouts and replay one with a tap.    |
| Fast mode     | Shorter spin animation for quick players.              |

- [ ] Skins unlocked from the start (recommended for the MVP)
- [ ] Skins unlocked by achievements (see section 6)

Player choices are saved in the browser. To follow the hacker across devices,
they can move to the server later.

### For admins (set from the admin portal, checked by the server)

- Turn the game on or off (the arcade's per-game switch).
- Pick a limit preset or set custom limits (section 3).
- Turn off individual bet types (for example, straight-up during busy hours).
- Change chip values.
- Turn special events on and off (section 6).
- Set the daily loss limit.
- **Stats:** total wagered, total paid out, house net, spins per hour, biggest
  wins, and one hacker's recent spins (for support questions).

---

## 6. Special features (optional; pick any, all off by default)

No feature gives players the advantage: on average the house always keeps a
share, so points can't be farmed. Every feature is decided on the server and
shown to the hacker **before** they bet.

| Idea                          | How it works                                                                                                                                                                                                    | Edge                                 | Effort |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| **Prophecy** side bet         | Predict red or black for the next 3 spins in a row. Pays 7:1 if all three come true.                                                                                                                            | 7.9%                                 | Medium |
| **Olympus Mercy**             | When the ball lands on 0, red/black, odd/even and low/high bets give back half the stake instead of losing it all. Admins switch it on for "festival hours".                                                    | 1.35% on those bets (half the usual) | Small  |
| **Labours** (achievements)    | Cosmetic badges: win on every dozen, hit 0, win 3 in a row, play 50 spins. They can unlock skins. Points are never paid.                                                                                        | None                                 | Medium |
| **Fates' Hour**               | An event window where the Fates speak: special Techno and Fates dialogue, a gold wheel and a banner in the lobby. Purely cosmetic hype.                                                                         | None                                 | Small  |
| **Agora Table** (multiplayer) | One shared wheel for everyone online. Bets close on a 20-second countdown, everyone watches the same spin, and a round leaderboard shows the biggest winners. Reuses the live tables planned for PvP Blackjack. | Same                                 | Large  |

- [ ] Prophecy - [ ] Olympus Mercy - [ ] Labours - [ ] Fates' Hour - [ ] Agora Table

---

## 7. Fairness and safety (fixed, not optional)

- **The server decides everything:** the pocket, the payout and the new
  balance, inside one mutation. The browser only shows it.
- **Bet catalogue:** every legal bet has a fixed ID (`straight:17`,
  `split:17-18`, `red`, `dozen:2`…). The server accepts only IDs from the
  catalogue, so made-up bets such as a "split" of 3 and 30 are impossible.
- **No double charges:** each spin has an ID, and repeating it never charges
  twice (same as the slots).
- **Rules checked on every spin:** the arcade must be open, the game switched
  on, and the player an accepted, checked-in hacker (`requireGameOpen`).
- **Audit trail:** every spin is stored (bets, pocket, payout, balance before
  and after) and counted in the points ledger.
- **Rate limit:** a cooldown between spins and a cap on the number of bets in
  one spin.

---

## 8. How it's built (summary)

1. **Shared rules** (`shared/roulette/`): wheel order and colors, bet
   catalogue, payouts, limit and exposure checks. One copy for the site and
   the server, with full unit tests.
2. **Game UI** (`src/games/wheel-of-the-fates/`): `mount(el, { adapter })`,
   like Olympus Slots, with a mock adapter so it is fully playable before the
   backend exists. Arcade registry entry with `theme: 'night'`.
3. **Backend** (arcade server functions): `roulette:getMyTable` and
   `roulette:spin`, a `rouletteSpins` table, a ledger entry, and an
   `arcadeGames` record with the admin settings. Convex tests for limits,
   duplicate spins, closed games and forged bets.
4. **Admin tab:** limits, bet types, events and stats.

### Suggested phases

| Phase          | Contents                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| **1. MVP**     | Core rules, Standard limits, MVP player features, mock adapter, then real points. |
| 2. Polish      | Racetrack, sound, statistics panel, player skins, favorite bets.                  |
| 3. Events      | Your picks from section 6 (Fates' Hour and Labours are the cheapest).             |
| 4. Multiplayer | Agora Table, built with PvP Blackjack's live tables.                              |

---

## 9. Decisions needed

1. Theme and name: Wheel of the Fates, or something else?
2. Limit preset: Careful, Standard or High roller?
3. Daily loss limit: yes or no, and how much?
4. Which special features (section 6), if any, belong in which phase?
5. Player skins: free from the start, or unlocked by achievements?
6. Do roulette and the slots share one daily loss limit, or have one each?
