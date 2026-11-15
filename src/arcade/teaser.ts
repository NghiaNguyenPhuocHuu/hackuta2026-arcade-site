/**
 * Pure rules for the "scheduled" teaser screen: which phase the countdown is
 * in, how much of the temple seal is left, the clock digits, and Techno's line
 * for each phase. No DOM, so it's unit-tested in tests/unit/teaser.test.ts.
 */
import type { HackerMood } from "../games/olympus-slots/hacker";

const MIN = 60_000;

/** The seal drains over the final hour before the gates open. */
export const SEAL_SPAN_MS = 60 * MIN;

export type TeaserPhase = "far" | "warm" | "hot" | "final" | "open";

/** far > 1 h · warm ≤ 1 h · hot ≤ 10 min · final ≤ 10 s · open at zero. */
export function teaserPhase(remainingMs: number): TeaserPhase {
  if (remainingMs <= 0) return "open";
  if (remainingMs <= 10_000) return "final";
  if (remainingMs <= 10 * MIN) return "hot";
  if (remainingMs <= 60 * MIN) return "warm";
  return "far";
}

/** Whole percent of the seal left: 100 until the last hour, 0 at opening. */
export function sealPercent(remainingMs: number): number {
  return Math.max(0, Math.min(100, Math.round((remainingMs / SEAL_SPAN_MS) * 100)));
}

/** Zero-padded HH, MM, SS (seconds rounded up, hours capped at 99). */
export function clockParts(remainingMs: number): [string, string, string] {
  const s = Math.max(0, Math.ceil(remainingMs / 1000));
  return [
    String(Math.min(99, Math.floor(s / 3600))).padStart(2, "0"),
    String(Math.floor(s / 60) % 60).padStart(2, "0"),
    String(s % 60).padStart(2, "0"),
  ];
}

export type TeaserLine = { title: string; line: string; mood: HackerMood };

const LINES: Record<TeaserPhase, TeaserLine> = {
  far: { title: "The gods are resting", line: "The arcade's sealed till {at}. Go stack points at workshops. I'll keep picking the lock.", mood: "smug" },
  warm: { title: "The seal is cracking", line: "The temple's stirring. Under an hour now. Don't wander off.", mood: "focus" },
  hot: { title: "Almost through", line: "Seal's down to {seal}%. Pick your first game so you're ready.", mood: "focus" },
  final: { title: "Here it comes!", line: "Ten seconds! Hands off the keyboard... no wait, hands ON the keyboard!", mood: "shock" },
  open: { title: "We're in!", line: "Gates are open, mortal. Fortune favours the fast. Go!", mood: "cheer" },
};

/** Techno's line for a phase, with the opening time and seal filled in. */
export function teaserLine(phase: TeaserPhase, { at, seal }: { at: string; seal: number }): TeaserLine {
  const l = LINES[phase];
  return { ...l, line: l.line.replace("{at}", at).replace("{seal}", String(seal)) };
}
