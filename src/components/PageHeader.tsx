import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/** Same frieze header as profile's ParticipantPageHeader (pillars art, meander border). */
export function PageHeader({
  id,
  title,
  description,
  actions,
  eyebrow,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small line above the title (e.g. "Back to the lobby" link). */
  eyebrow?: ReactNode;
}) {
  return (
    <div className="participant-frieze">
      <img
        className="participant-frieze__art"
        src="/images/art/pillars.webp"
        alt=""
        aria-hidden="true"
        width={281}
        height={480}
        decoding="async"
      />
      <header className="participant-page-header">
        <div className="participant-page-header__copy">
          {eyebrow ? <div className="arcade-eyebrow">{eyebrow}</div> : null}
          <h1 id={id} className="participant-page-title">
            {title}
          </h1>
          {description ? <div className="participant-page-header__description">{description}</div> : null}
        </div>
        {actions ? <div className="participant-page-header__actions">{actions}</div> : null}
      </header>
      <span aria-hidden="true" className="participant-meander participant-meander--flip" />
    </div>
  );
}

/** Shown where games are played while the arcade balance is 0: points have to be deposited first. */
export function DepositPrompt() {
  return (
    <div className="participant-dashboard__notice arcade-deposit-prompt" role="status">
      <p className="participant-dashboard__notice-copy">
        Your arcade balance is empty. Deposit points from your profile to play.
      </p>
      <Link to="/wallet" className="participant-dashboard__cta">
        Deposit points
      </Link>
    </div>
  );
}

/** The points pill from profile's home header. */
export function PointsPill({ points }: { points: number }) {
  return (
    <span className="participant-home__points" aria-label={`Your points balance: ${points} Points`}>
      {points.toLocaleString("en-US")} Points
    </span>
  );
}
