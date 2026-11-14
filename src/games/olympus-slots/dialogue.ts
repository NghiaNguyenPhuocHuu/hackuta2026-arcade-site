/**
 * Techno's lines for the dialog box: the first-visit tutorial, result quips,
 * and state messages. Pure module (no DOM). All copy is static; only
 * numbers are substituted into it.
 */
import type { HackerMood } from "./hacker";
import { symbolLabel } from "./symbols";
import type { GameStatus } from "./types";

export const TUTORIAL_STORAGE_KEY = "olympus-techno-tutorial";

export type DialogTone = "gold" | "green" | "cyan" | "coral" | "marble";
export type TutorialTarget = "reels" | "balance" | "wager" | "payouts" | "spin";
export type TutorialStep = { readonly title: string; readonly line: string; readonly target: TutorialTarget | null; readonly mood: HackerMood };
export type Dialogue = { title: string; line: string; tone: DialogTone; mood: HackerMood; sr?: string };

export const TUTORIAL_STEPS: readonly TutorialStep[] = Object.freeze(
  ([
    { title: "PSST. OVER HERE.", line: "Name’s Techno. I hacked this temple’s slot machine. Want the quick tour?", target: null, mood: "smug" },
    { title: "THE REELS", line: "Four reels, seven gods and one wandering hero. Every spin, the Fates pick who lands on each reel.", target: "reels", mood: "idle" },
    { title: "YOUR POINTS", line: "This is your balance. Every spin costs your wager, paid up front.", target: "balance", mood: "idle" },
    { title: "THE WAGER", line: "Bet 5, 10, 25 or 50. Bigger bet, bigger payout. Bigger pain.", target: "wager", mood: "smug" },
    { title: "THE ODDS", line: "Zeus × 4 pays 5×. Three of a kind, 2×. Two pairs gets your bet back. Anything else, the gods keep it.", target: "payouts", mood: "idle" },
    { title: "YOUR MOVE", line: "Hit SPIN. I’ll be right here, watching what the Fates decide.", target: "spin", mood: "cheer" },
  ] satisfies TutorialStep[]).map((step) => Object.freeze(step)),
);

const QUIPS = Object.freeze({
  big: ["+{n} pts. I did NOT rig that. ...Probably.", "+{n} pts. Zeus just wired you his paycheck.", "+{n} pts. Screenshot it. Nobody will believe you."],
  win: ["+{n} pts. The firewall never saw you coming.", "+{n} pts. Clean exploit. I’m proud of you.", "+{n} pts. Keep that streak compiling."],
  push: ["Your {w} pts come back. Net zero, like my sleep schedule.", "Your {w} pts come back. The gods just shrugged.", "Your {w} pts come back. A draw. Run it again."],
  lose: ["−{w} pts. Ouch. Even I can’t patch that.", "−{w} pts. The Fates have tight security.", "−{w} pts. Shake it off. Fresh RNG next spin."],
});
const COMEBACK = "+{n} pts. Comeback! Told you the code was clean.";
const STREAK = "−{w} pts. That’s {k} in a row. Maybe drop the wager?";

/** The landed spin, as the dialogue needs it. */
export type ResultContext = {
  outcome: string;
  net: number;
  wager: number;
  reels: string[];
  quipIndex: number;
  lossStreak: number;
  prevLosses: number;
  sr?: string;
};

export type DialogueContext = {
  status?: GameStatus;
  spinning?: boolean;
  tutorialStep?: number | null;
  shortOfPoints?: boolean;
  balance?: number;
  result?: ResultContext | null;
  opensAt?: number | null;
};

/** Count leading losses in a newest-first history of `{ net }`. */
export function lossRun(history: ReadonlyArray<{ net: number }>): number {
  let k = 0;
  while (k < history.length && (history[k]?.net ?? 0) < 0) k++;
  return k;
}

function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function fill(template: string, result: ResultContext): string {
  return template
    .split("{n}").join(String(int(result.net)))
    .split("{w}").join(String(int(result.wager)))
    .split("{k}").join(String(int(result.lossStreak)));
}

function pick(list: readonly string[], result: ResultContext): string {
  const i = int(result.quipIndex);
  return fill(list[((i % list.length) + list.length) % list.length] ?? "", result);
}

function majority(reels: readonly string[]): string {
  const counts = new Map<string, number>();
  let best = reels[0] ?? "";
  for (const g of reels) {
    const count = (counts.get(g) ?? 0) + 1;
    counts.set(g, count);
    if (count > (counts.get(best) ?? 0)) best = g;
  }
  return best;
}

/** Local clock time for the teaser line, e.g. "7:00 PM". Null when unknown. */
export function formatOpensAt(opensAt: unknown): string | null {
  if (typeof opensAt !== "number" || !Number.isFinite(opensAt)) return null;
  return new Date(opensAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Pick Techno's current line. */
export function dialogueFor(ctx: DialogueContext = {}): Dialogue {
  const { status = "live", spinning = false, tutorialStep = -1, shortOfPoints = false, balance = 0, result = null, opensAt = null } = ctx;

  if (status === "teaser") {
    const when = formatOpensAt(opensAt);
    const line = when
      ? `Temple’s locked until ${when}. I’m working on a way in.`
      : "Temple’s locked until it opens. I’m working on a way in.";
    return { title: "THE GODS ARE RESTING", line, tone: "gold", mood: "smug" };
  }
  if (spinning) {
    return { title: "THE REELS TURN...", line: "Come on, come on... reading the reels.", tone: "cyan", mood: "focus" };
  }
  if (status === "closed") {
    return { title: "THE TEMPLE IS CLOSED", line: "Game over. I’m logging off. GG, mortal.", tone: "gold", mood: "sad" };
  }
  const step = typeof tutorialStep === "number" && Number.isInteger(tutorialStep) && tutorialStep >= 0 ? TUTORIAL_STEPS[tutorialStep] : undefined;
  if (step) {
    return { title: step.title, line: step.line, tone: "cyan", mood: step.mood };
  }
  if (shortOfPoints) {
    return {
      title: "NOT ENOUGH POINTS",
      line: int(balance) < 10 ? "You’re tapped out. The gods win this round." : "That wager’s too rich. Drop it to keep spinning.",
      tone: "coral",
      mood: "sad",
    };
  }
  if (!result) {
    return { title: "READY, MORTAL?", line: "Pick a wager and press SPIN. I’ll be watching.", tone: "cyan", mood: "idle" };
  }

  const comeback = int(result.prevLosses) >= 2;
  switch (result.outcome) {
    case "big":
      return { title: "JACKPOT! ZEUS × 4", line: comeback ? fill(COMEBACK, result) : pick(QUIPS.big, result), tone: "gold", mood: "cheer" };
    case "win": {
      const god = result.reels.length ? symbolLabel(majority(result.reels)) : "GODS";
      return {
        title: `THREE ${god.toUpperCase()}!`,
        line: comeback ? fill(COMEBACK, result) : pick(QUIPS.win, result),
        tone: "green",
        mood: comeback ? "cheer" : "smug",
      };
    }
    case "push":
      return { title: "TWO PAIRS: A DRAW", line: pick(QUIPS.push, result), tone: "marble", mood: "idle" };
    default:
      if (int(result.lossStreak) >= 3) {
        return { title: "THE FATES SAY NO", line: fill(STREAK, result), tone: "coral", mood: "shock" };
      }
      return { title: "THE FATES SAY NO", line: pick(QUIPS.lose, result), tone: "coral", mood: "sad" };
  }
}
