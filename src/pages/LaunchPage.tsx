import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { readLaunchCode } from "../arcade/liveSession";
import { StatusScreen } from "./StatusScreen";

/**
 * `/launch#code=…`: the profile's Arcade button lands here. The code is read
 * once and wiped from the address bar before anything else, then traded for
 * the arcade's own session (`arcade-launch` provider). A code works once, for
 * 60 s, so a refresh or a shared link shows "that way in has closed".
 */

// Read at load, before React renders, so the fragment never lingers (and
// StrictMode's double effect can't read it twice: the code is single use).
let pendingCode: string | null = null;
let launch: Promise<boolean> | null = null;
if (window.location.pathname === "/launch") {
  pendingCode = readLaunchCode(window.location.hash);
  if (window.location.hash) history.replaceState(null, "", "/launch");
}

export function LaunchPage() {
  const { signIn } = useAuthActions();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!launch) {
      const code = pendingCode;
      pendingCode = null;
      launch = code
        ? signIn("arcade-launch", { code }).then(
            (result) => result.signingIn !== false,
            () => false,
          )
        : Promise.resolve(false);
    }
    let active = true;
    void launch.then((ok) => {
      if (!active) return;
      // A full load to the lobby: the session token is already saved.
      if (ok) window.location.replace("/");
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [signIn]);

  return <StatusScreen kind={failed ? "launch-failed" : "launching"} />;
}
