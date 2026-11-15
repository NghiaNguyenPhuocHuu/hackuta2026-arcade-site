/**
 * Techno's lines for Olympus 21. Pure module (no DOM). All copy is static;
 * only names and numbers are substituted. Variants are picked from stable
 * inputs (round number, move seq) so a line never flickers between renders.
 */

const COLOR_WORD = { R: "red", B: "blue", G: "green", Y: "yellow" };
const COLOR_GOD = { R: "Ares", B: "Poseidon", G: "Athena", Y: "Zeus" };

/** Move kinds that get their own reaction line (shown for a few seconds). */
export const EVENT_KINDS = new Set(["skip", "reverse", "plus2", "wild", "bust", "win", "timeout"]);
export const EVENT_MS = 3200;

/** Said when my turn starts while the tutorial is open (the tutorial closes itself). */
export const TUTORIAL_OVER_LINE = Object.freeze({ title: "YOUR TURN!", line: "Your turn! Tutorial's over. HOW TO PLAY brings it back anytime.", mood: "shock", tone: "green" });

function names(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l.join("");
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

/**
 * PLAY AGAIN chatter for the result screen (v2 tables). null when it doesn't apply
 * (old adapters, spectators, or a closed table), so the plain result line shows.
 */
export function againLine(view, { canReady = true } = {}) {
  const me = view?.me;
  if (!canReady || !me || typeof me.ready !== "boolean" || view.status !== "settled") return null;
  const others = (view.seats ?? []).filter((s) => !s.isMe && typeof s.ready === "boolean");
  const inNames = others.filter((s) => s.ready).map((s) => s.name);
  const waiting = others.filter((s) => !s.ready).map((s) => s.name);
  if (me.ready) {
    if (!waiting.length) return { title: "EVERYONE'S IN", line: "All hands ready. Shuffling the next round…", mood: "cheer", tone: "green" };
    return { title: "YOU'RE IN", line: `Waiting on ${names(waiting)}. The ring decides the rest.`, mood: "smug", tone: "green" };
  }
  if (inNames.length) return { title: "PLAY AGAIN?", line: `${names(inNames)} ${inNames.length === 1 ? "is" : "are"} in. You?`, mood: "smug", tone: "gold" };
  return null;
}

function pick(list, n) {
  const i = Math.abs(Math.trunc(Number(n) || 0));
  return list[i % list.length];
}

function cap(name) {
  return String(name ?? "").toUpperCase();
}

/**
 * React to a move. `mySeat` lets Techno talk to you directly.
 * @returns {{ title, line, mood, tone } | null}
 */
export function eventLine(move, mySeat) {
  if (!move || !EVENT_KINDS.has(move.kind)) return null;
  const me = move.seat === mySeat;
  const who = me ? "You" : move.name;
  switch (move.kind) {
    case "skip":
      return { title: "NOBODY!", line: pick(["The Cyclops asks who moved. Nobody. Next player is skipped.", "Skip! Polyphemus blocks the door for one turn."], move.seq), mood: "smug", tone: "gold" };
    case "reverse":
      return { title: "CHARYBDIS!", line: pick(["The whirlpool spins the table. Play order flips.", "Reverse! Everything swirls the other way now."], move.seq), mood: "shock", tone: "cyan" };
    case "plus2":
      return { title: "SIRENS!", line: pick(["The song pulls two cards into the next hand, and they lose their turn.", "Plus two. Someone listened to the Sirens."], move.seq), mood: "smug", tone: "coral" };
    case "wild": {
      const c = move.color;
      const tail = c ? `Next up must match ${COLOR_WORD[c]}, ${COLOR_GOD[c]}'s color.` : "A new color rules the table.";
      return { title: "ODYSSEUS!", line: `${who} played the wanderer. ${tail}`, mood: "cheer", tone: "gold" };
    }
    case "bust":
      return me
        ? { title: "BUSTED", line: pick(["Past 21. You're out this round. The count drops back to 0.", "Too much. Shake it off; next round is fresh."], move.seq), mood: "sad", tone: "coral" }
        : { title: `${cap(move.name)} BUST!`, line: pick([`${move.name} pushed it past 21. Count back to 0.`, `${move.name} flew too close to the sun. Count resets to 0.`], move.seq), mood: "shock", tone: "coral" };
    case "win":
      return me
        ? { title: "YOU HIT 21!", line: pick(["Exactly twenty-one. The gods applaud.", "Twenty-one on the nose. I did NOT rig that."], move.seq), mood: "cheer", tone: "green" }
        : { title: `${cap(move.name)} HIT 21`, line: `${move.name} landed it exactly. Next round, it's your turn to steal the show.`, mood: "shock", tone: "gold" };
    case "timeout":
      return me
        ? { title: "TOO SLOW", line: "Clock ran out, so I played for you. Lowest card that fit.", mood: "smug", tone: "coral" }
        : { title: "TIMEOUT", line: `${move.name} froze. The Fates played for them.`, mood: "idle", tone: "marble" };
    default:
      return null;
  }
}

/**
 * Steady-state line for the current view.
 * @param {{ view: object|null, screen: string, remainingMs: number|null, joining?: boolean }} ctx
 * @returns {{ title, line, mood, tone }}
 */
export function stateLine({ view, screen, remainingMs = null, canReady = true }) {
  if (!view) return { title: "CONNECTING", line: "Patching into the table. One moment…", mood: "focus", tone: "cyan" };
  const me = view.me;
  const round = view.roundNo || 0;
  const count = view.count ?? 0;
  const turn = view.seats?.find((s) => s.seat === view.turnSeat);

  switch (screen) {
    case "lobby":
      return { title: "TAKE A SEAT", line: "Play a card, add it to the count. Land exactly on 21 and you take the pot. Go over and you're out.", mood: "smug", tone: "gold" };
    case "closed":
      return { title: "TABLE CLOSED", line: "This table is done for now. Thanks for playing.", mood: "idle", tone: "marble" };
    case "waiting": {
      const n = view.seats.length;
      return n < 2
        ? { title: "WAITING FOR PLAYERS", line: "Need at least one more player. Bots can fill the seats if you want company.", mood: "idle", tone: "cyan" }
        : { title: "SEATS LOCKING", line: "Enough players. Seats lock in a moment, then bets open.", mood: "focus", tone: "cyan" };
    }
    case "bet":
      return me?.picked
        ? { title: "BET PLACED", line: `You're in for ${me.wager}. You can change it until the ring runs out.`, mood: "smug", tone: "gold" }
        : { title: "PLACE YOUR BET", line: "You can win from each player up to what you bet. Don't pick and you get the table average.", mood: "focus", tone: "gold" };
    case "sitout":
      if (me && me.lostThisWindow >= me.lossCap) return { title: "LOSS CAP", line: "You've hit the loss cap for this window. Take a breather; the table will be here.", mood: "sad", tone: "coral" };
      return { title: "SITTING OUT", line: "Not enough points for the minimum bet this round. Watch and learn.", mood: "idle", tone: "marble" };
    case "countdown":
      return { title: "SHUFFLING", line: pick(["Bets are locked. Five cards each, coming up.", "Bets in. The Fates are shuffling the deck."], round), mood: "focus", tone: "cyan" };
    case "nextround": {
      const mine = view.seats?.find((s) => s.isMe);
      return mine?.state === "sitting_out"
        ? { title: "YOU'RE IN NEXT ROUND", line: "Noted. Watch this one; you're dealt in when the next bet window opens.", mood: "smug", tone: "green" }
        : { title: "NEXT ROUND", line: "You sat down mid-round. You're dealt in when the next bet window opens.", mood: "idle", tone: "cyan" };
    }
    case "dealin":
      return canReady
        ? { title: "SITTING THIS ONE OUT", line: "You're watching this round. Tap DEAL ME IN and you're in the next one.", mood: "idle", tone: "cyan" }
        : { title: "SITTING THIS ONE OUT", line: "You're watching this round. You'll be dealt in at the next one.", mood: "idle", tone: "cyan" };
    case "paused":
      return canReady
        ? { title: "TABLE PAUSED", line: "Tap PLAY AGAIN to start the next round. Two ready players get it going.", mood: "focus", tone: "cyan" }
        : { title: "TABLE PAUSED", line: "Waiting for players to start the next round.", mood: "idle", tone: "cyan" };
    case "turn":
    case "wild":
    case "draw": {
      if (remainingMs != null && remainingMs <= 5000 && remainingMs > 0) return { title: "5 SECONDS!", line: "Play something or I play for you.", mood: "shock", tone: "coral" };
      if (screen === "draw") return { title: "NOTHING FITS", line: "No card matches. Draw one; it ends your turn.", mood: "idle", tone: "cyan" };
      if (screen === "wild") return { title: "PICK A COLOR", line: "Odysseus adds 0. The next player must match the color you choose.", mood: "smug", tone: "gold" };
      const win = me?.hand?.some((h) => h.after === "win");
      if (win) return { title: "YOUR TURN", line: "I see a card that makes exactly 21. Just saying.", mood: "cheer", tone: "green" };
      if (count >= 15) return { title: "CLOSE TO 21", line: `${count} on the board. ${21 - count} wins it; anything more busts you.`, mood: "shock", tone: "gold" };
      return { title: "YOUR TURN", line: pick(["Tap a card to see what it does, then hit PLAY.", "Your move. Lit cards match; grey ones don't."], round + count), mood: "focus", tone: "green" };
    }
    case "watch": {
      const mine = view.seats?.find((s) => s.isMe);
      if (mine?.state === "bust") return { title: "OUT THIS ROUND", line: "You busted, but your bet still rides on who's left. Watch the rest.", mood: "sad", tone: "coral" };
      if (mine?.state === "folded") return { title: "YOU LEFT", line: "You folded this round. Your bet stays in the pot.", mood: "sad", tone: "marble" };
      const name = turn?.name ?? "Someone";
      if (count >= 15) return { title: `${cap(name)}'S TURN`, line: `${count} on the board. ${name} needs a ${21 - count} or it's a bust risk.`, mood: "focus", tone: "cyan" };
      return { title: `${cap(name)}'S TURN`, line: pick(["Plan ahead: the count may change before you play.", `Count is ${count}. Think about what you'll need.`], round + count), mood: "idle", tone: "cyan" };
    }
    case "result": {
      const again = againLine(view, { canReady });
      if (again) return again;
      const r = view.result;
      if (!r) return { title: "ROUND OVER", line: "Tallying the pots…", mood: "focus", tone: "cyan" };
      const mine = me ? r.winners.includes(me.seat) : false;
      const delta = me ? r.deltas[me.seat] ?? 0 : 0;
      if (r.reason === "cap") return { title: "SPLIT", line: "Sixty cards and no 21. Everyone still standing splits the pot.", mood: "idle", tone: "marble" };
      if (r.reason === "closed") return { title: "TABLE CLOSED", line: "The table closed mid-round. Players still in split the pot.", mood: "idle", tone: "marble" };
      if (mine && r.reason === "21") return { title: "YOU HIT 21!", line: `+${delta}. Exactly twenty-one. The gods applaud.`, mood: "cheer", tone: "green" };
      if (mine) return { title: "LAST ONE STANDING", line: `+${delta}. Everyone else busted. Survival pays.`, mood: "cheer", tone: "green" };
      if (me && me.lostThisWindow >= me.lossCap) return { title: "LOSS CAP", line: "That's the loss cap for this window. You'll be unseated after this round. Come back later.", mood: "sad", tone: "coral" };
      const v2 = canReady && typeof me?.ready === "boolean";
      if (v2) return { title: "ROUND OVER", line: delta < 0 ? `${delta} this round. Again? The gods are watching.` : "Not your round. Again? The gods are watching.", mood: "sad", tone: "coral" };
      return { title: "ROUND OVER", line: delta < 0 ? `${delta} this round. Fresh deck next time.` : "Not your round. Bets reopen shortly.", mood: "sad", tone: "coral" };
    }
    default:
      return { title: "OLYMPUS 21", line: "Land the count on 21. Not 22.", mood: "idle", tone: "gold" };
  }
}
