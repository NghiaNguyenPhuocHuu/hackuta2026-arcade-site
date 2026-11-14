import { Link, useOutletContext } from "react-router-dom";
import { PageHeader, PointsPill } from "../components/PageHeader";
import { ClockIcon } from "../components/brand/ArcadeIcons";
import { formatClock, formatCountdown, useNow, type ArcadeSession } from "../arcade/useArcadeSession";
import { GAMES, type GameEntry } from "../games/registry";

export default function LobbyPage() {
  const session = useOutletContext<ArcadeSession>();
  const firstName = session.player?.displayName.split(" ")[0] ?? "hacker";

  return (
    <section className="arcade-lobby" aria-labelledby="arcade-lobby-title">
      <PageHeader
        id="arcade-lobby-title"
        title={`Welcome to the Arcade, ${firstName}`}
        description="Play with the points you've earned at HackUTA. Every win and loss counts toward your real balance."
        actions={session.player ? <PointsPill points={session.player.points} /> : null}
      />

      <div className="participant-portal__inner arcade-lobby__inner">
        <StatusBanner session={session} />

        <section className="arcade-section" aria-labelledby="arcade-games-title">
          <div className="arcade-section__head">
            <h2 id="arcade-games-title" className="participant-dashboard__section-title">
              Games
            </h2>
          </div>
          <ul className="arcade-game-grid">
            {GAMES.map((game) => (
              <li key={game.key}>
                <GameCard game={game} session={session} />
              </li>
            ))}
          </ul>
        </section>

        <section className="participant-dashboard__section participant-dashboard__section--links arcade-rules" aria-labelledby="arcade-rules-title">
          <h2 id="arcade-rules-title" className="participant-dashboard__section-title">
            House rules
          </h2>
          <ul className="arcade-rules__list">
            <li>
              <strong>Real points.</strong> Wagers come out of your HackUTA points balance and winnings go back in.
            </li>
            <li>
              <strong>Open hours only.</strong> Games run while organizers have the arcade open. Spins in progress finish when it closes.
            </li>
            <li>
              <strong>Checked-in hackers.</strong> You need to be accepted and checked in to play.
            </li>
            <li>
              <strong>Fair outcomes.</strong> Every result is decided on the server, never in your browser.
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function StatusBanner({ session }: { session: ArcadeSession }) {
  const now = useNow();

  if (session.status === "scheduled" && session.opensAt) {
    return (
      <div className="arcade-status arcade-status--scheduled" role="status">
        <ClockIcon className="arcade-status__icon" />
        <div>
          <p className="arcade-status__title">Opens at {formatClock(session.opensAt)}</p>
          <p className="arcade-status__copy">Doors open in {formatCountdown(session.opensAt - now)}. Take a look around until then.</p>
        </div>
        <span className="participant-dashboard__badge participant-dashboard__badge--waitlisted">Scheduled</span>
      </div>
    );
  }

  return (
    <div className="arcade-status arcade-status--open" role="status">
      <span className="arcade-status__pulse" aria-hidden="true" />
      <div>
        <p className="arcade-status__title">The arcade is open</p>
        {session.closesAt ? (
          <p className="arcade-status__copy">
            Closes at {formatClock(session.closesAt)} · {formatCountdown(session.closesAt - now)} left
          </p>
        ) : (
          <p className="arcade-status__copy">Pick a game below to start playing.</p>
        )}
      </div>
      <span className="participant-dashboard__badge participant-dashboard__badge--accepted">Open</span>
    </div>
  );
}

function GameCard({ game, session }: { game: GameEntry; session: ArcadeSession }) {
  const Icon = game.icon;
  const serverEnabled = session.games.find((g) => g.key === game.key)?.enabled ?? false;
  const built = game.load !== null;
  const playable = built && serverEnabled && session.status === "on";

  let badge: { label: string; tone: string } | null = null;
  if (!built) badge = { label: "Coming soon", tone: "neutral" };
  else if (!serverEnabled) badge = { label: "Paused", tone: "rejected" };
  else if (session.status === "scheduled") badge = { label: "Opens soon", tone: "waitlisted" };

  return (
    <article className={`arcade-game-card${playable ? "" : " arcade-game-card--locked"}`}>
      <div className="arcade-game-card__art" aria-hidden="true">
        <Icon className="arcade-game-card__icon" />
      </div>
      <div className="arcade-game-card__body">
        <div className="arcade-game-card__head">
          <h3 className="participant-dashboard__panel-title">{game.name}</h3>
          {badge ? <span className={`participant-dashboard__badge participant-dashboard__badge--${badge.tone}`}>{badge.label}</span> : null}
        </div>
        <p className="participant-dashboard__panel-copy">{game.tagline}</p>
        <ul className="arcade-game-card__facts" aria-label="Game details">
          {game.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {playable ? (
          <Link to={`/play/${game.key}`} className="participant-dashboard__cta arcade-game-card__cta">
            Play {game.name}
          </Link>
        ) : (
          <button type="button" className="participant-dashboard__cta arcade-game-card__cta" disabled>
            {!built
              ? "In the works"
              : serverEnabled && session.status === "scheduled" && session.opensAt
                ? `Opens at ${formatClock(session.opensAt)}`
                : "Not available right now"}
          </button>
        )}
      </div>
    </article>
  );
}
