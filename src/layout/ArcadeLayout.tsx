import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ArcadeBrand } from "../components/ArcadeBrand";
import { ExternalIcon, NavTempleIcon } from "../components/brand/ArcadeIcons";
import { NavSignOutIcon } from "../components/brand/NavIcons";
import { initials, type ArcadeSession } from "../arcade/useArcadeSession";
import { PROFILE_URL } from "../constants/site";
import { GAMES } from "../games/registry";

/**
 * The portal shell from profile (ParticipantPortalLayout): sidebar with brand,
 * nav and account; main column. Same classes, so it looks and collapses the same.
 */
export function ArcadeLayout({ session }: { session: ArcadeSession }) {
  const player = session.player;

  return (
    <div className="participant-dashboard">
      <aside className="participant-dashboard__sidebar" aria-label="Arcade navigation">
        <div className="participant-dashboard__sidebar-head">
          <ArcadeBrand />
        </div>
        <nav className="participant-dashboard__nav">
          <NavItem to="/" end label="Lobby" icon={NavTempleIcon} />
          {GAMES.map((game) => (
            <NavItem
              key={game.key}
              to={`/play/${game.key}`}
              label={game.name}
              shortLabel={game.name.split(" ").at(-1)}
              icon={game.icon}
              soon={!game.load}
            />
          ))}
          <a className="participant-dashboard__nav-item arcade-nav__profile" href={PROFILE_URL}>
            <ExternalIcon className="participant-dashboard__nav-icon" />
            <span className="participant-dashboard__nav-label--full">Back to profile</span>
            <span className="participant-dashboard__nav-label--short">Profile</span>
          </a>
        </nav>
        {player ? (
          <div className="participant-dashboard__account">
            <div className="participant-avatar participant-avatar--sidebar" role="img" aria-label={`${player.displayName} avatar`}>
              {initials(player.displayName)}
            </div>
            <div className="participant-dashboard__account-text">
              <p className="participant-dashboard__account-name" title={player.displayName}>
                {player.displayName}
              </p>
              {player.email ? (
                <p className="participant-dashboard__account-email" title={player.email}>
                  {player.email}
                </p>
              ) : null}
            </div>
            {/* Signs out of the arcade only; the profile session is separate. Wired up in step 2. */}
            <button type="button" className="participant-dashboard__sign-out" aria-label="Leave the arcade" title="Leave the arcade">
              <NavSignOutIcon />
            </button>
          </div>
        ) : null}
      </aside>

      <main className="participant-dashboard__main" id="arcade-content" tabIndex={-1}>
        <Outlet context={session} />
      </main>
    </div>
  );
}

function NavItem({
  to,
  end = false,
  label,
  shortLabel,
  icon: Icon,
  soon = false,
}: {
  to: string;
  end?: boolean;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{ className?: string }>;
  soon?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `participant-dashboard__nav-item${isActive ? " participant-dashboard__nav-item--active" : ""}${soon ? " arcade-nav__item--soon" : ""}`
      }
    >
      <Icon className="participant-dashboard__nav-icon" />
      {shortLabel ? (
        <>
          <span className="participant-dashboard__nav-label--full">{label}</span>
          <span className="participant-dashboard__nav-label--short">{shortLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
      {soon ? <span className="arcade-nav__soon">Soon</span> : null}
    </NavLink>
  );
}
