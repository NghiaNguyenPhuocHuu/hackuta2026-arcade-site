import { useSyncExternalStore } from "react";
import { gameSoundEnabled, setGameSoundEnabled, SOUND_OFF_ICON_PATH, SOUND_ON_ICON_PATH, subscribeGameSound, type ChipTune } from "./sound";
// Same stylesheet as the full screen switch: every game header control lives there.
import "./fullscreen.css";

/** The arcade-wide game sound switch, live in React. */
export function useGameSound(): boolean {
  return useSyncExternalStore(subscribeGameSound, gameSoundEnabled, () => true);
}

/** SOUND ON | SOUND OFF for a game header. Switching on plays a short blip so the player hears it. */
export function SoundSwitch({ sfx }: { sfx: ChipTune }) {
  const on = useGameSound();
  return (
    <button
      type="button"
      className="sound-switch"
      aria-pressed={on}
      aria-label="Game sounds"
      onClick={() => {
        setGameSoundEnabled(!on);
        if (!on) {
          sfx.unlock();
          sfx.hello();
        }
      }}
    >
      <svg className="sound-switch__icon" viewBox="0 0 9 7" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <path d={on ? SOUND_ON_ICON_PATH : SOUND_OFF_ICON_PATH} />
      </svg>
      {on ? "SOUND ON" : "SOUND OFF"}
    </button>
  );
}
