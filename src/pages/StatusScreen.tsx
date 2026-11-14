import { Logo } from "../components/brand/Logo";
import { ExternalIcon } from "../components/brand/ArcadeIcons";
import { PROFILE_URL } from "../constants/site";

/**
 * Full-page screens shown instead of the arcade: loading, signed out (opened
 * without a launch from profile, or the session expired) and switched off.
 * Uses profile's sign-in card on clay with the temple drawing behind it.
 */
export function StatusScreen({ kind }: { kind: "loading" | "signed-out" | "off" }) {
  const copy = {
    loading: { title: "Opening the gates…", body: null, cta: false },
    "signed-out": {
      title: "Enter through your profile",
      body: "The way in is the Arcade button on your HackUTA participant dashboard. You'll be signed in automatically.",
      cta: true,
    },
    off: {
      title: "The gates are sealed",
      body: "Organizers open the arcade at set times during the event. Watch your dashboard for the Arcade button to return.",
      cta: true,
    },
  }[kind];

  return (
    <div className="arcade-screen">
      <img className="arcade-screen__temple" src="/images/art/temple-clear.webp" alt="" aria-hidden="true" width={1800} height={1229} decoding="async" />
      <div className="sign-in-card arcade-screen__card" role={kind === "loading" ? "status" : undefined}>
        <Logo className="sign-in-card__logo arcade-screen__logo" variant="light" layout="header" priority />
        <div className="sign-in-card__heading">
          <p className="arcade-screen__kicker">HackUTA Arcade</p>
          <h1 className="sign-in-card__title">{copy.title}</h1>
          {copy.body ? <p className="sign-in-card__subtitle">{copy.body}</p> : null}
        </div>
        {copy.cta ? (
          <a className="sign-in-btn arcade-screen__cta" href={PROFILE_URL}>
            Go to my profile
            <ExternalIcon className="arcade-screen__cta-icon" />
          </a>
        ) : (
          <span className="arcade-screen__spinner" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
