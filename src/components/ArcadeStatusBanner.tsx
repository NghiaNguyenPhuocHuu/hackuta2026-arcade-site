import { ClockIcon } from "./brand/ArcadeIcons";
import { formatClock, formatCountdown, useNow, type ArcadeSession } from "../arcade/useArcadeSession";

/** Lobby / play banner for arcade open hours (server clock via session query). */
export function ArcadeStatusBanner({
  session,
  context = "lobby",
}: {
  session: ArcadeSession;
  /** Play pages get copy about finishing the current trial. */
  context?: "lobby" | "play";
}) {
  const now = useNow();

  if (session.status === "scheduled" && session.opensAt) {
    return (
      <div className="arcade-status arcade-status--scheduled" role="status">
        <ClockIcon className="arcade-status__icon" />
        <div>
          <p className="arcade-status__title">Opens at {formatClock(session.opensAt)}</p>
          <p className="arcade-status__copy">
            The gates open in {formatCountdown(session.opensAt - now)}. Scout the temple until then.
          </p>
        </div>
        <span className="participant-dashboard__badge participant-dashboard__badge--waitlisted">Scheduled</span>
      </div>
    );
  }

  if (session.status === "off") {
    return (
      <div className="arcade-status arcade-status--closed" role="status">
        <ClockIcon className="arcade-status__icon" />
        <div>
          <p className="arcade-status__title">The gates have closed</p>
          <p className="arcade-status__copy">
            {context === "play"
              ? "Finish your current trial — the server won't accept new wagers. Withdraw leftover arcade points on the Wallet when you're done."
              : "The arcade is closed for now. You can still withdraw arcade points on the Wallet."}
          </p>
        </div>
        <span className="participant-dashboard__badge participant-dashboard__badge--rejected">Closed</span>
      </div>
    );
  }

  return (
    <div className="arcade-status arcade-status--open" role="status">
      <span className="arcade-status__pulse" aria-hidden="true" />
      <div>
        <p className="arcade-status__title">The gates are open</p>
        {session.closesAt ? (
          <p className="arcade-status__copy">
            Closes at {formatClock(session.closesAt)} · {formatCountdown(session.closesAt - now)} left
          </p>
        ) : (
          <p className="arcade-status__copy">Choose your trial below, hero.</p>
        )}
      </div>
      <span className="participant-dashboard__badge participant-dashboard__badge--accepted">Open</span>
    </div>
  );
}