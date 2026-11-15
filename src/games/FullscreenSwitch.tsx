import type { FullscreenControl, FullscreenState } from "./fullscreen";
import type { GameFullscreen } from "./useGameFullscreen";
// React games get the switch's styles wherever they mount it (site or dev preview).
import "./fullscreen.css";

/** Pixel-art "expand" corners, drawn on the 7×7 grid the games' icons use. */
const FULLSCREEN_ICON_PATH = "M0 0h3v1H1v2H0zM4 0h3v3H6V1H4zM0 4h1v2h2v1H0zM6 4h1v3H4V6h2z";

/**
 * NORMAL | FULL SCREEN switch for a game header. It hides itself on phones
 * and in browsers without the Fullscreen API, and stays visible while the
 * game is full screen so the player can always come back.
 */
export function FullscreenSwitch({ control, state }: GameFullscreen) {
  const { offered, active } = state;
  if (!control || (!offered && !active)) return null;
  return (
    <div className="fullscreen-switch" role="group" aria-label="Display size">
      <button
        type="button"
        className="fullscreen-switch__option"
        aria-pressed={!active}
        onClick={() => control.exit()}
      >
        NORMAL
      </button>
      <button
        type="button"
        className="fullscreen-switch__option"
        aria-pressed={active}
        onClick={() => control.enter()}
      >
        <svg className="fullscreen-switch__icon" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
          <path d={FULLSCREEN_ICON_PATH} />
        </svg>
        FULL SCREEN
      </button>
    </div>
  );
}

export type { FullscreenControl, FullscreenState };
