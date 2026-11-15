import { useEffect, useRef, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArcadeBrand } from "../components/ArcadeBrand";
import { ExternalIcon, NavTempleIcon, NavWalletIcon } from "../components/brand/ArcadeIcons";
import { NavSignOutIcon } from "../components/brand/NavIcons";
import { initials, type ArcadeSession } from "../arcade/useArcadeSession";
import { PROFILE_URL } from "../constants/site";
import { GAMES } from "../games/registry";


/**
 * The portal shell from profile (ParticipantPortalLayout): sidebar with brand,
 * nav and account; main column. Same classes, so it looks and collapses the same.
 */
export function ArcadeLayout({ session }: { session: ArcadeSession }) {
  const { signOut } = useAuthActions();
  const player = session.player;
  // The whole arcade uses the night sky (blue, gold, pixel stars), not only the game pages.
  const night = true;
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Each page opens at the top. The main column is its own scroll area on
  // desktop and the window scrolls on phones, so reset both; otherwise the
  // lobby opened scrolled down after leaving a long game page.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    // Phones: the tab bar may scroll sideways; keep the current tab in view.
    const active = document.querySelector<HTMLElement>(".participant-dashboard__nav-item--active");
    const nav = active?.parentElement;
    if (active && nav && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);


  return (
    <div className={`participant-dashboard${night ? " arcade-theme--night" : ""}`}>
      <aside className="participant-dashboard__sidebar" aria-label="Arcade navigation">
        <div className="participant-dashboard__sidebar-head">
          <ArcadeBrand night={night} />
        </div>
        <nav className="participant-dashboard__nav">
          <NavItem to="/" end label="Lobby" icon={NavTempleIcon} />
          <NavItem to="/wallet" label="Wallet" icon={NavWalletIcon} />
          {GAMES.map((game) => (
            <NavItem
              key={game.key}
              to={`/play/${game.key}`}
              label={game.name}
              shortLabel={game.shortName}
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
            <button
              type="button"
              className="participant-dashboard__sign-out"
              aria-label="Sign out of the arcade"
              title="Sign out of the arcade"
              onClick={() => void signOut()}
            >
              <NavSignOutIcon />
            </button>
          </div>
        ) : null}
      </aside>

      <main ref={mainRef} className="participant-dashboard__main" id="arcade-content" tabIndex={-1}>
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
