import { Link, useOutletContext } from "react-router-dom";
import { ArcadeStatusBanner } from "../components/ArcadeStatusBanner";
import { DepositPrompt, PageHeader, PointsPill } from "../components/PageHeader";
import { formatClock, type ArcadeSession } from "../arcade/useArcadeSession";
import { GAMES, type GameEntry } from "../games/registry";

export default function LobbyPage() {
  const session = useOutletContext<ArcadeSession>();
  const firstName = session.player?.displayName.split(" ")[0] ?? "hacker";

  return (
    <section className="arcade-lobby" aria-labelledby="arcade-lobby-title">
      <PageHeader
        id="arcade-lobby-title"
        title={`Enter the Arcade, ${firstName}`}
        description="Wager the points you've earned at HackUTA. Every triumph and every fall lands on your real balance."
        actions={session.player ? <PointsPill points={session.player.arcadePoints} /> : null}
      />

      <div className="participant-portal__inner arcade-lobby__inner">
        <ArcadeStatusBanner session={session} />
        {session.player && session.player.arcadePoints === 0 ? <DepositPrompt /> : null}

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
            Laws of the temple
          </h2>
          <ul className="arcade-rules__list">
            <li>
              <strong>Real stakes.</strong> Deposit points from your HackUTA profile into the arcade. Games bet from your arcade points, and you can withdraw them back to your profile any time.
            </li>
            <li>
              <strong>Open hours only.</strong> Games run only while organizers hold the gates open. Trials already in progress can finish when they close; new wagers are refused.
            </li>
            <li>
              <strong>Checked-in hackers.</strong> Only accepted, checked-in hackers may enter the trials.
            </li>
            <li>
              <strong>Fair outcomes.</strong> The Fates decide every result on the server, never in your browser.
            </li>
          </ul>
        </section>
      </div>
    </section>
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
  else if (session.status === "off") badge = { label: "Closed", tone: "rejected" };

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
