import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "react-router-dom";
import { Logo } from "../components/brand/Logo";
import { ExternalIcon } from "../components/brand/ArcadeIcons";
import { PROFILE_URL } from "../constants/site";
import type { ArcadePlayErrorCode } from "../../shared/arcade/rules";

export type StatusKind = "loading" | "signed-out" | "off" | "not-ready";

/** Why a signed-in account can't play yet, in the hacker's terms. */
const PROBLEM_TEXT: Partial<Record<ArcadePlayErrorCode, string>> = {
  NOT_PARTICIPANT: "This account isn't registered as a HackUTA participant. Sign in with the email you applied with.",
  NOT_ELIGIBLE: "The arcade is for accepted hackers. Your application isn't accepted.",
  NOT_CHECKED_IN: "Check in at the HackUTA desk first. Your points arrive with your badge.",
};

/**
 * Full-page screens shown instead of the arcade: loading, signed out (with
 * the HackUTA email + password form), switched off, and a signed-in account
 * that can't play yet. Uses profile's sign-in card on clay with the temple
 * drawing behind it.
 */
export function StatusScreen({
  kind,
  problem,
  arcadePoints = 0,
}: {
  kind: StatusKind;
  /** For "not-ready": why the account can't play. */
  problem?: ArcadePlayErrorCode | null;
  /** For "off": arcade points still in the wallet (they can always be withdrawn). */
  arcadePoints?: number;
}) {
  const copy = {
    loading: { title: "Opening the gates…", body: null },
    "signed-out": { title: "Enter the Arcade", body: "Sign in with your HackUTA email and password, the same ones you use on your participant profile." },
    off: {
      title: "The gates are sealed",
      body: "Organizers open the arcade at set times during the event. Watch your dashboard for the Arcade button to return.",
    },
    "not-ready": {
      title: "Not yet, mortal",
      body: (problem && PROBLEM_TEXT[problem]) ?? "This account can't play in the arcade yet.",
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
        {kind === "loading" ? <span className="arcade-screen__spinner" aria-hidden="true" /> : null}
        {kind === "signed-out" ? <SignInForm /> : null}
        {kind === "off" && arcadePoints > 0 ? (
          <Link className="sign-in-btn arcade-screen__cta" to="/wallet">
            Withdraw your {arcadePoints.toLocaleString("en-US")} arcade points
          </Link>
        ) : null}
        {kind === "off" || kind === "not-ready" ? (
          <a className={kind === "off" && arcadePoints > 0 ? "arcade-screen__link" : "sign-in-btn arcade-screen__cta"} href={PROFILE_URL}>
            Go to my profile
            <ExternalIcon className="arcade-screen__cta-icon" />
          </a>
        ) : null}
        {kind === "not-ready" ? <SignOutLink /> : null}
      </div>
    </div>
  );
}

function SignOutLink() {
  const { signOut } = useAuthActions();
  return (
    <button type="button" className="arcade-screen__link" onClick={() => void signOut()}>
      Sign in with a different account
    </button>
  );
}

/**
 * The profile's existing email + password sign-in, sign-in only: accounts are
 * created and passwords reset on the participant profile, not here.
 */
function SignInForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signIn("password", { email: email.trim(), password, flow: "signIn" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        /rate|too many|attempts/i.test(message)
          ? "Too many tries. Wait a few minutes, then try again."
          : "That email and password don't match a HackUTA account. Forgot it? Reset it on your profile.",
      );
      setPending(false);
    }
  };

  return (
    <form className="arcade-sign-in" onSubmit={submit} noValidate>
      <label className="arcade-sign-in__label" htmlFor="arcade-email">
        Email
      </label>
      <input
        id="arcade-email"
        className="arcade-sign-in__input"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />
      <label className="arcade-sign-in__label" htmlFor="arcade-password">
        Password
      </label>
      <input
        id="arcade-password"
        className="arcade-sign-in__input"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
      />
      {error ? (
        <p className="arcade-sign-in__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="sign-in-btn arcade-screen__cta" disabled={pending || !email.trim() || !password}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
