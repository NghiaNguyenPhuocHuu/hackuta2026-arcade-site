import { useEffect, useRef, useState } from "react";
import { Logo } from "../components/brand/Logo";
import { formatClock, useNow, type ArcadeSession } from "../arcade/useArcadeSession";
import { clockParts, sealPercent, teaserLine, teaserPhase, type TeaserPhase } from "../arcade/teaser";
import { hackerFrame, HACKER_FRAME_MS } from "../games/olympus-slots/hacker";
import { GAMES } from "../games/registry";

const DOOR_MS = 900;
const SEAL_SEGMENTS = 20;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Types `text` out two characters every 30 ms (all at once with reduced motion). */
function useTyped(text: string, reduce: boolean): string {
  const [shown, setShown] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const id = window.setInterval(() => {
      setShown((n) => {
        const next = Math.min(text.length, n + 2);
        if (next >= text.length) window.clearInterval(id);
        return next;
      });
    }, 30);
    return () => window.clearInterval(id);
  }, [text, reduce]);
  return text.slice(0, shown);
}

/** Techno, the arcade's host, animated (blinks, bobs, talks while typing). */
function Techno({ mood, talking, still }: { mood: string; talking: boolean; still: boolean }) {
  const [frame, setFrame] = useState(1);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), HACKER_FRAME_MS);
    return () => window.clearInterval(id);
  }, [still]);
  const f = hackerFrame(mood, { frame, talking, still });
  return (
    <div
      className="arcade-teaser__techno"
      style={{ transform: `translate(${f.dx * 4}px, ${f.dy * 4}px)` }}
      // Static SVG built from the sprite tables in hacker.ts, never user input.
      dangerouslySetInnerHTML={{ __html: f.svg }}
    />
  );
}

/**
 * Full-page teaser while the arcade is scheduled: a countdown to opensAt, a
 * temple seal that drains over the last hour, and Techno's running commentary.
 * At zero the temple doors close over the card and swing open on "Enter".
 */
export function TeaserScreen({ session, onEnter }: { session: ArcadeSession; onEnter: () => void }) {
  const now = useNow(250);
  const reduce = prefersReducedMotion();
  const opensAt = session.opensAt ?? now;
  const remaining = opensAt - now;
  const phase = teaserPhase(remaining);

  // The phase on screen lags the clock by the door animation when the gates open.
  const [shownPhase, setShownPhase] = useState<TeaserPhase>(phase);
  const [doorsShut, setDoorsShut] = useState(false);
  const doorTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (phase === shownPhase || doorTimer.current !== undefined) return;
    if (phase !== "open" || reduce) {
      setShownPhase(phase);
      return;
    }
    setDoorsShut(true);
    doorTimer.current = window.setTimeout(() => {
      setShownPhase("open");
      setDoorsShut(false);
      doorTimer.current = undefined;
    }, DOOR_MS);
  }, [phase, shownPhase, reduce]);
  useEffect(() => () => window.clearTimeout(doorTimer.current), []);

  const at = formatClock(opensAt);
  const seal = sealPercent(remaining);
  // Freeze the seal % in the line when the phase starts, so it doesn't re-type every tick.
  const [line, setLine] = useState(() => teaserLine(shownPhase, { at, seal }));
  useEffect(() => {
    setLine(teaserLine(shownPhase, { at, seal }));
  }, [shownPhase, at]);
  const typed = useTyped(line.line, reduce);
  const typing = typed.length < line.line.length;

  const [hh, mm, ss] = clockParts(remaining);
  const lit = Math.ceil(seal / (100 / SEAL_SEGMENTS));
  const enabled = new Set(session.games.filter((g) => g.enabled).map((g) => g.key));
  const games = GAMES.filter((g) => g.load && enabled.has(g.key));
  const isOpen = shownPhase === "open";
  const badge = isOpen ? { label: "Open now", tone: "accepted" } : shownPhase === "final" ? { label: "Opening", tone: "waitlisted" } : { label: "Scheduled", tone: "waitlisted" };

  return (
    <div className="arcade-screen arcade-teaser" data-phase={shownPhase}>
      <img className="arcade-screen__temple" src="/images/art/temple-clear.webp" alt="" aria-hidden="true" width={1800} height={1229} decoding="async" />

      <section className="sign-in-card arcade-teaser__card" aria-labelledby="arcade-teaser-title">
        <div className="arcade-teaser__top">
          <div className="arcade-teaser__brand">
            <Logo className="arcade-teaser__logo" variant="light" layout="header" priority />
            <p className="arcade-screen__kicker arcade-teaser__kicker">HackUTA Arcade</p>
          </div>
          <span className={`participant-dashboard__badge participant-dashboard__badge--${badge.tone} arcade-teaser__badge`}>
            <i aria-hidden="true" />
            {badge.label}
          </span>
        </div>

        {isOpen ? (
          <div className="arcade-teaser__open">
            <h1 id="arcade-teaser-title" className="sign-in-card__title arcade-teaser__title">
              The arcade is open
            </h1>
            <button type="button" className="sign-in-btn arcade-teaser__cta" onClick={onEnter}>
              Enter the arcade
            </button>
          </div>
        ) : (
          <>
            <div className="sign-in-card__heading">
              <h1 id="arcade-teaser-title" className="sign-in-card__title arcade-teaser__title">
                The arcade opens in
              </h1>
              <p className="sign-in-card__subtitle">Gates open today at {at}</p>
            </div>

            <div className="arcade-teaser__clock" role="timer" aria-label={`Opens at ${at}`}>
              {[
                [hh, "Hours"],
                [mm, "Minutes"],
                [ss, "Seconds"],
              ].map(([value, label], i) => (
                <div className="arcade-teaser__unit" key={label}>
                  {i > 0 ? <span className="arcade-teaser__colon" aria-hidden="true">:</span> : null}
                  <div className="arcade-teaser__tile" aria-hidden="true">
                    {[...value!].map((ch, j) => (
                      <b key={`${j}-${ch}`} className="arcade-teaser__digit">
                        {ch}
                      </b>
                    ))}
                  </div>
                  <span className="arcade-teaser__label">{label}</span>
                </div>
              ))}
            </div>

            <div className="arcade-teaser__seal">
              <span>Temple seal</span>
              <div className="arcade-teaser__bar" aria-hidden="true">
                {Array.from({ length: SEAL_SEGMENTS }, (_, i) => (
                  <i key={i} className={i < lit ? "is-on" : undefined} />
                ))}
              </div>
              <b>{seal}%</b>
            </div>
          </>
        )}

        <div className={`arcade-teaser__host${typing ? "" : " is-done"}`}>
          <div className="arcade-teaser__portrait">
            <Techno mood={line.mood} talking={typing} still={reduce} />
            <span className="arcade-teaser__tag">Techno</span>
          </div>
          <div>
            <h2 className="arcade-teaser__host-title">{line.title}</h2>
            <p className="arcade-teaser__host-line" aria-hidden="true">
              {typed}
            </p>
          </div>
          <p className="arcade-teaser__sr" aria-live="polite">
            {`${line.title}. ${line.line}`}
          </p>
        </div>

        {games.length > 0 ? (
          <div className="arcade-teaser__games">
            <span>Tonight's games</span>
            <ul>
              {games.map((g) => (
                <li key={g.key}>
                  <g.icon className="arcade-teaser__game-icon" />
                  {g.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {session.player ? (
          <p className="arcade-teaser__points">
            <span>Your points</span> <b>{session.player.points}</b>
            <span className="arcade-teaser__points-tip">Earn more before the gates open: workshops, sponsor booths, check-in.</span>
          </p>
        ) : null}

        <div className={`arcade-teaser__doors${doorsShut ? " is-shut" : ""}`} aria-hidden="true">
          <i />
          <i />
        </div>
      </section>
    </div>
  );
}
