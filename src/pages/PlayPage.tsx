import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { PageHeader, PointsPill } from "../components/PageHeader";
import { BackIcon } from "../components/brand/ArcadeIcons";
import { formatClock, type ArcadeSession } from "../arcade/useArcadeSession";
import { findGame, type GameEntry } from "../games/registry";
import { mockWalletPort } from "../arcade/mockWallet";
import { useRevealWait, useSecondsLeft } from "../arcade/pointsReveal";

export default function PlayPage() {
  const session = useOutletContext<ArcadeSession>();
  const { gameKey } = useParams();
  const game = findGame(gameKey);

  const back = (
    <Link to="/" className="arcade-back">
      <BackIcon className="arcade-back__icon" />
      Lobby
    </Link>
  );

  if (!game) {
    return (
      <section aria-labelledby="arcade-play-title">
        <PageHeader id="arcade-play-title" eyebrow={back} title="Lost in the labyrinth" description="That game isn't in the arcade. Find your way back to the lobby." />
      </section>
    );
  }

  const serverEnabled = session.games.find((g) => g.key === game.key)?.enabled ?? false;
  const reason = !game.load
    ? { title: `${game.name} is on its way`, copy: "This trial is still being forged. Return during the event." }
    : !serverEnabled
      ? { title: `${game.name} is paused`, copy: "Organizers have paused this trial for now. Choose another from the lobby." }
      : session.status !== "on"
        ? {
            title: "The gates are still sealed",
            copy: session.opensAt ? `Games open at ${formatClock(session.opensAt)}.` : "Games open when organizers start the arcade.",
          }
        : null;

  return (
    <section key={game.key} className="arcade-play" aria-labelledby="arcade-play-title">
      <PageHeader
        id="arcade-play-title"
        eyebrow={back}
        title={game.name}
        description={game.tagline}
        actions={session.player ? <PointsPill points={session.player.points} /> : null}
      />
      {reason ? (
        <div className="participant-dashboard__notice arcade-play__notice" role="status">
          <h2 className="participant-dashboard__panel-title">{reason.title}</h2>
          <p className="participant-dashboard__notice-copy">{reason.copy}</p>
          <Link to="/" className="participant-dashboard__cta">
            Back to the lobby
          </Link>
        </div>
      ) : (
        <RevealGate game={game} player={session.player} />
      )}
    </section>
  );
}

/**
 * A spin from another game (or this one, left mid-spin) is still being
 * revealed: wait for it before mounting, so this game can't show its result
 * early. Only a few seconds; the game opens by itself.
 */
function RevealGate({ game, player }: { game: GameEntry; player: ArcadeSession["player"] }) {
  const waiting = useRevealWait();
  const seconds = useSecondsLeft(waiting ? waiting.until : null);
  if (!waiting) return <GameStage game={game} player={player} />;
  const from = findGame(waiting.game);
  return (
    <div className="arcade-stage">
      <p className="arcade-stage__loading" role="status">
        The Fates are still deciding your {from && from.key !== game.key ? `${from.shortName.toLowerCase()} ` : ""}spin… {game.name} opens in {seconds}s.
      </p>
    </div>
  );
}

/** Lazy-loads the game and mounts it. Mock points until step 3 swaps in the Convex adapter. */
function GameStage({ game, player }: { game: GameEntry; player: ArcadeSession["player"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!game.load) return;
    let unmount: (() => void) | undefined;
    let cancelled = false;
    setReady(false);
    setError(null);
    game
      .load()
      .then((module) => {
        if (cancelled || !ref.current) return;
        // The visit's shared mock wallet: balance and history survive leaving the
        // game, and the lobby's points pill follows.
        unmount = module.mountMock(ref.current, mockWalletPort(game.key), {
          player: player ? { displayName: player.displayName } : undefined,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("The game couldn't load. Check your connection and refresh.");
      });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [game, player?.displayName]);

  return (
    <div className="arcade-stage">
      {!ready && !error ? (
        <p className="arcade-stage__loading" role="status">
          Summoning {game.name}…
        </p>
      ) : null}
      {error ? (
        <p className="participant-dashboard__notice arcade-stage__error" role="alert">
          {error}
        </p>
      ) : null}
      <div ref={ref} className={`arcade-stage__mount${ready ? " arcade-stage__mount--ready" : ""}`} />
    </div>
  );
}
