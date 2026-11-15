import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getPointsHold, usePointsHold } from "../arcade/pointsReveal";
import { BROKE_MEME, brokeClip, gameKeyOf, laughTrack, pickRoast, shouldTaunt, type Roast } from "../arcade/brokeCat";

/**
 * A pixel cat laughing, two frames on a 16×14 grid. K ink outline, S fur,
 * L muzzle, P inner ear / tongue, N mouth, T tears, "." nothing.
 */
export const CAT_FRAMES: readonly (readonly string[])[] = [
  [
    "..KK........KK..",
    ".KSSK......KSSK.",
    ".KSPSK....KSPSK.",
    ".KSPSSKKKKSSPSK.",
    "KSSSSSSSSSSSSSSK",
    "KSSSKSSSSSSKSSSK",
    "KSSKSKSSSSKSKSSK",
    "KTSSSSSSSSSSSSTK",
    "KTSSSSLKKLSSSSTK",
    "KSSSSLNNNNLSSSSK",
    "KSSSSLNPPNLSSSSK",
    ".KSSSSLNNLSSSSK.",
    "..KSSSSSSSSSSK..",
    "...KKKKKKKKKK...",
  ],
  [
    "..KK........KK..",
    ".KSSK......KSSK.",
    ".KSPSK....KSPSK.",
    ".KSPSSKKKKSSPSK.",
    "KSSSSSSSSSSSSSSK",
    "KSSSKSSSSSSKSSSK",
    "KSSKSKSSSSKSKSSK",
    "KSSSSSSSSSSSSSSK",
    "KTSSSSLKKLSSSSTK",
    "KTSSSLNNNNLSSSTK",
    "KSSSLNNPPNNLSSSK",
    ".KSSSLNNNNLSSSK.",
    "..KSSSLLLLSSSK..",
    "...KKKKKKKKKK...",
  ],
];

function CatFrame({ rows, className }: { rows: readonly string[]; className: string }) {
  return (
    <g className={className}>
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) => (cell === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className={`broke-cat__px--${cell}`} />)),
      )}
    </g>
  );
}

/**
 * Laughs at the hacker when their arcade balance hits 0 in a solo game, once
 * per drop, after the game has revealed the result (never during a spin's
 * reveal hold, so it can't spoil it). DEPOSIT goes to the Wallet.
 */
export function BrokeCatPopup({ arcadePoints }: { arcadePoints: number | null }) {
  const { pathname } = useLocation();
  const hold = usePointsHold();
  const prev = useRef<number | null>(null);
  const [taunt, setTaunt] = useState<Roast | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  /** The browser refused autoplay with sound: the clip runs muted (the chiptune laughs) until tapped. */
  const [needsTap, setNeedsTap] = useState(false);
  /** The clip can't play here: the still image shows instead. */
  const [clipFailed, setClipFailed] = useState(false);

  useEffect(() => {
    // While a reveal is on, the visible balance is held: wait for the real one.
    if (arcadePoints === null || hold || getPointsHold()) return;
    if (shouldTaunt(prev.current, arcadePoints, gameKeyOf(pathname))) {
      setTaunt(pickRoast());
    }
    prev.current = arcadePoints;
  }, [arcadePoints, hold, pathname]);

  useEffect(() => {
    if (!taunt) return;
    closeRef.current?.focus();
    let audio: HTMLAudioElement | null = null;
    const video = brokeClip();
    const slot = slotRef.current;
    const onError = () => {
      setClipFailed(true);
      laughTrack().laugh();
    };
    if (video && slot && !video.error) {
      // Always with sound. If the browser still refuses, the clip runs muted
      // (tap it for sound) and the chiptune laugh plays, so the cat is heard.
      slot.prepend(video);
      video.addEventListener("error", onError);
      video.currentTime = 0;
      video.muted = false;
      video.volume = 0.8;
      setNeedsTap(false);
      setClipFailed(false);
      void video.play().catch(() => {
        video.muted = true;
        setNeedsTap(true);
        laughTrack().laugh();
        void video.play().catch(() => {});
      });
    } else if (BROKE_MEME.audio) {
      setClipFailed(Boolean(video));
      audio = new Audio(BROKE_MEME.audio);
      audio.volume = 0.8;
      void audio.play().catch(() => laughTrack().laugh());
    } else {
      setClipFailed(Boolean(video));
      laughTrack().laugh();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaunt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      audio?.pause();
      if (video) {
        video.removeEventListener("error", onError);
        video.pause();
        video.remove(); // kept for next time, preloaded
      }
    };
  }, [taunt]);

  if (!taunt) return null;
  return (
    <div className="broke-cat" role="presentation" onClick={() => setTaunt(null)}>
      <div
        className="broke-cat__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="broke-cat-title"
        aria-describedby="broke-cat-line"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="broke-cat__ha" aria-hidden="true">
          {"HA HA HA".split("").map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.06}s` }}>
              {ch}
            </span>
          ))}
        </p>
        {BROKE_MEME.video && !clipFailed ? (
          <div
            ref={slotRef}
            className="broke-cat__clip"
            role="button"
            tabIndex={needsTap ? 0 : -1}
            aria-label={needsTap ? "A cat laughing at you. Play with sound" : "A cat laughing at you"}
            onClick={() => {
              const video = brokeClip();
              if (!video) return;
              video.muted = false;
              setNeedsTap(false);
              void video.play().catch(() => {});
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") (event.currentTarget as HTMLDivElement).click();
            }}
          >
            {needsTap ? <span className="broke-cat__tap">TAP FOR SOUND</span> : null}
          </div>
        ) : BROKE_MEME.image ? (
          <img className="broke-cat__img" src={BROKE_MEME.image} alt="A cat laughing and pointing at you" />
        ) : (
          <svg className="broke-cat__cat" viewBox="0 0 16 14" shapeRendering="crispEdges" role="img" aria-label="A pixel cat laughing at you">
            <CatFrame rows={CAT_FRAMES[0]!} className="broke-cat__frame broke-cat__frame--a" />
            <CatFrame rows={CAT_FRAMES[1]!} className="broke-cat__frame broke-cat__frame--b" />
          </svg>
        )}
        <h2 id="broke-cat-title" className="broke-cat__title">
          {taunt.title}
        </h2>
        <p id="broke-cat-line" className="broke-cat__line">
          {taunt.line}
        </p>
        <div className="broke-cat__actions">
          <Link to="/wallet" className="participant-dashboard__cta broke-cat__deposit" onClick={() => setTaunt(null)}>
            Deposit & run it back
          </Link>
          <button ref={closeRef} type="button" className="broke-cat__close" onClick={() => setTaunt(null)}>
            {taunt.cope}
          </button>
        </div>
      </div>
    </div>
  );
}
