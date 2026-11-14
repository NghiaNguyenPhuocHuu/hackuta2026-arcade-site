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
    { title: "HALT, MORTAL.", line: "Name’s Techno. I broke into this cursed temple’s machine. Want to learn its secrets?", target: null, mood: "smug" },
    { title: "THE REELS", line: "Four reels, seven gods and one doomed hero. Each spin, the Fates choose who rises on every reel.", target: "reels", mood: "idle" },
    { title: "YOUR TREASURE", line: "Your balance. Every spin demands your wager as tribute, paid up front.", target: "balance", mood: "idle" },
    { title: "THE TRIBUTE", line: "Offer 5, 10, 25 or 50. Bigger tribute, bigger glory. Bigger fall.", target: "wager", mood: "smug" },
    { title: "THE ODDS", line: "Zeus × 4 pays 5×. Three of a kind, 2×. Two pairs returns your tribute. Anything else, the gods devour it.", target: "payouts", mood: "idle" },
    { title: "FACE YOUR FATE", line: "Hit SPIN, hero. I’ll be right here, watching what the Fates decide.", target: "spin", mood: "cheer" },
  ] satisfies TutorialStep[]).map((step) => Object.freeze(step)),
);

const QUIPS = Object.freeze({
  big: ["+{n} pts. Zeus hurls his thunder in YOUR favor.", "+{n} pts. Olympus trembles. They’ll sing of this spin.", "+{n} pts. Even Hades looked up from the Underworld."],
  win: ["+{n} pts. You stormed the gates and walked out rich.", "+{n} pts. A hero’s haul. The gods take notice.", "+{n} pts. Your legend grows. Keep climbing."],
  push: ["Your {w} pts return. The Fates hold their blades... for now.", "Your {w} pts return. The gods spare you, this once.", "Your {w} pts return. A stalemate with the immortals."],
  lose: ["−{w} pts. Swallowed whole by the Underworld.", "−{w} pts. Cerberus feasts tonight.", "−{w} pts. The Fates cut that thread. Rise again."],
});
const COMEBACK = "+{n} pts. Back from the Underworld! Heroes never stay down.";
const STREAK = "−{w} pts. {k} in a row. Tartarus is calling. Lower your tribute?";

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
      ? `The temple stays sealed until ${when}. Something stirs behind the doors.`
      : "The temple stays sealed until it opens. Something stirs behind the doors.";
    return { title: "THE GATES ARE SEALED", line, tone: "gold", mood: "smug" };
  }
  if (spinning) {
    return { title: "THE FATES ARE SPINNING...", line: "Steady, hero... the threads are being woven.", tone: "cyan", mood: "focus" };
  }
  if (status === "closed") {
    return { title: "THE TEMPLE IS SEALED", line: "The torches die out. I vanish into the dark. GG, mortal.", tone: "gold", mood: "sad" };
  }
  const step = typeof tutorialStep === "number" && Number.isInteger(tutorialStep) && tutorialStep >= 0 ? TUTORIAL_STEPS[tutorialStep] : undefined;
  if (step) {
    return { title: step.title, line: step.line, tone: "cyan", mood: step.mood };
  }
  if (shortOfPoints) {
    return {
      title: "NOT ENOUGH POINTS",
      line: int(balance) < 10 ? "Your coffers are empty. The gods have claimed this round." : "The gods refuse a tribute you can’t pay. Lower your wager.",
      tone: "coral",
      mood: "sad",
    };
  }
  if (!result) {
    return { title: "READY, HERO?", line: "Choose your tribute and press SPIN. The gods are watching.", tone: "cyan", mood: "idle" };
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
        return { title: "DOOMED BY THE FATES", line: fill(STREAK, result), tone: "coral", mood: "shock" };
      }
      return { title: "DOOMED BY THE FATES", line: pick(QUIPS.lose, result), tone: "coral", mood: "sad" };
  }
}
