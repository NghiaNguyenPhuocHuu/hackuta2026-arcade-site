import { Logo } from "./brand/Logo";
import { LogoMark } from "./brand/LogoMark";
import { LANDING_URL } from "../constants/site";

/**
 * Sidebar brand, same markup as profile's ParticipantBrand plus an "Arcade" tag.
 * Desktop: full logo + wordmark. Mobile (≤900px): the mark only (portal.css).
 */
export function ArcadeBrand() {
  return (
    <a href={LANDING_URL} className="participant-brand arcade-brand" aria-label="HackUTA home">
      <Logo className="participant-brand__logo arcade-brand__logo" variant="light" layout="header" decorative priority />
      <span className="participant-brand__wordmark" aria-hidden="true">
        HackUTA
      </span>
      <LogoMark className="participant-brand__static" />
      <span className="arcade-brand__tag">Arcade</span>
    </a>
  );
}
