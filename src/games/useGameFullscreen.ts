import { useEffect, useState, type RefObject } from "react";
import { createFullscreenControl, NO_FULLSCREEN_STATE, type FullscreenControl, type FullscreenState } from "./fullscreen";

export type GameFullscreen = {
  /** Null until the game's root element is mounted; the switch renders nothing until then. */
  control: FullscreenControl | null;
  state: FullscreenState;
};

/**
 * Gives a React game the shared full screen control. The control needs the
 * real DOM node, so it is created after mount and disposed with the game;
 * `className` stays on the root while the game is the full screen element.
 */
export function useGameFullscreen(ref: RefObject<HTMLElement | null>, className: string): GameFullscreen {
  const [control, setControl] = useState<FullscreenControl | null>(null);
  const [state, setState] = useState<FullscreenState>(NO_FULLSCREEN_STATE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const next = createFullscreenControl(element, { className });
    setControl(next);
    setState(next.getState());
    const unsubscribe = next.subscribe(() => setState(next.getState()));
    return () => {
      unsubscribe();
      next.dispose();
      setControl(null);
      setState(NO_FULLSCREEN_STATE);
    };
  }, [ref, className]);

  return { control, state };
}
