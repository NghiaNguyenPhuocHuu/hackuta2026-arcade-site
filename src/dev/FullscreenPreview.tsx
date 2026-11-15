/**
 * Dev-only harness: mounts each arcade game on its own with a stub adapter so
 * the full screen switch can be inspected without signing in. Loaded only by
 * preview-fullscreen.html; not part of the site build.
 */
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ROULETTE_LIMITS } from "../../shared/roulette/rules";
import { LAPTOP_MEDIA_QUERY } from "../games/fullscreen";
import { PokerApp } from "../games/poker/PokerTable";
import type { O21ConvexAdapter } from "../games/olympus-21/adapters/convexAdapter.js";
import { mountOlympus21 } from "../games/olympus-21/mountOlympus21.js";
import { mountMinigame } from "../games/olympus-slots/mountMinigame";
import { previewTableView, type PreviewPhase } from "./o21PreviewTable";
import type { GameState, MinigameAdapter } from "../games/olympus-slots/types";
import { RouletteGame } from "../games/wheel-of-the-fates/RouletteGame";
import type { RouletteAdapter, RouletteState } from "../games/wheel-of-the-fates/types";
import "../games/poker/poker.css";
import "../games/wheel-of-the-fates/roulette.css";

// The preview browser window is phone-sized; report a laptop so the full screen
// switch is visible for inspection.
const realMatchMedia = window.matchMedia.bind(window);
window.matchMedia = ((query: string) =>
  query === LAPTOP_MEDIA_QUERY
    ? ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList)
    : realMatchMedia(query)) as typeof window.matchMedia;

const SLOT_STATE: GameState = {
  status: "live",
  balance: 500,
  wagers: [5, 10, 25, 50],
  opensAt: null,
  closesAt: null,
  recentSpins: [],
};

function slotsAdapter(): MinigameAdapter {
  return {
    getState: () => SLOT_STATE,
    subscribe: () => () => {},
    spin: () => Promise.resolve({ status: "error" }),
    dispose: () => {},
  };
}

const ROULETTE_STATE: RouletteState = {
  status: "live",
  balance: 500,
  lossToday: 0,
  limits: ROULETTE_LIMITS,
  history: [],
};

function rouletteAdapter(): RouletteAdapter {
  return {
    getState: () => ROULETTE_STATE,
    subscribe: () => () => {},
    spin: () => Promise.resolve({ status: "error", code: "CLOSED" }),
    dispose: () => {},
  };
}

function SlotsPreview() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountMinigame(ref.current, {
      adapter: slotsAdapter(),
      tutorial: "off",
      points: { hold() {}, release() {} },
    });
  }, []);
  return <div ref={ref} />;
}

/** ?game=o21&state=wagering|turns|settled shows a real engine table; no state shows the lobby. */
function o21Adapter(): O21ConvexAdapter {
  const ok = () => Promise.resolve({ ok: false, code: "PREVIEW" });
  const params = new URLSearchParams(window.location.search);
  const phase = params.get("state") as PreviewPhase | null;
  const view = phase ? previewTableView(phase, Number(params.get("players") ?? 3)) : null;
  return {
    getState: () => view,
    getStatus: () => ({
      status: "live",
      window: null,
      player: { signedIn: true, eligible: true, checkedIn: true, name: "Preview", balance: 500 },
      buyIn: 50,
      queue: null,
      leaving: false,
      result: null,
      unavailable: false,
    }),
    subscribe: () => () => {},
    join: ok,
    cancelQueue: ok,
    leave: ok,
    placeWager: ok,
    play: ok,
    draw: ok,
    ready: ok,
    serverOffset: () => 0,
    serverNow: () => Date.now(),
    dispose: () => {},
  };
}

function O21Preview() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountOlympus21(ref.current, { adapter: o21Adapter(), view: "auto" });
  }, []);
  return <div ref={ref} />;
}

const PANES: Record<string, () => React.ReactElement> = {
  slots: () => <SlotsPreview />,
  wheel: () => <RouletteGame adapter={rouletteAdapter()} />,
  poker: () => <PokerApp />,
  o21: () => <O21Preview />,
};

function App() {
  const pane = PANES[new URLSearchParams(window.location.search).get("game") ?? "slots"] ?? PANES.slots!;
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {Object.keys(PANES).map((key) => (
          <a key={key} href={`?game=${key}`} style={{ color: "#ffd23f", fontFamily: "monospace" }}>
            {key}
          </a>
        ))}
      </nav>
      {pane()}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
