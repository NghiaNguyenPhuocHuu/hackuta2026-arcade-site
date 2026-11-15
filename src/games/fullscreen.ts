/**
 * Browser full screen for a game, shared by every game in the arcade.
 *
 * A game hands its own root element to `createFullscreenControl`; the control
 * knows whether the browser can go full screen, tracks the full screen state
 * (Esc, the browser's own exit, another element taking over), and keeps the
 * game's root class in step. Games draw the switch: `mountFullscreenSwitch`
 * for a plain-DOM game, `<FullscreenSwitch>` for a React one.
 *
 * Phones never get the switch: they have no browser chrome worth hiding and
 * the on-screen keyboard/notch behaviour is worse in full screen.
 */

/** Laptop/desktop browsers only: a real pointer, hover, and room for the wide layout. */
export const LAPTOP_MEDIA_QUERY = "(hover: hover) and (pointer: fine) and (min-width: 1024px)";

export type FullscreenState = {
  /** The browser can put an element full screen at all. */
  supported: boolean;
  /** This device gets the switch: supported, and a laptop/desktop-sized browser. */
  offered: boolean;
  /** The game is the full screen element right now. */
  active: boolean;
};

export type FullscreenControl = {
  /** The same object until something changes, so React can compare it by identity. */
  getState(): FullscreenState;
  /** Called on full screen changes and when the device stops/starts matching the query. */
  subscribe(listener: () => void): () => void;
  enter(): void;
  exit(): void;
  toggle(): void;
  dispose(): void;
};

export type FullscreenOptions = {
  /** Class kept on the game root while it is the full screen element. */
  className?: string;
};

/** Before an element exists: no switch, nothing full screen. */
export const NO_FULLSCREEN_STATE: FullscreenState = { supported: false, offered: false, active: false };

function laptopQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(LAPTOP_MEDIA_QUERY) : null;
}

function canGoFullscreen(target: HTMLElement): boolean {
  return typeof target.requestFullscreen === "function" && document.fullscreenEnabled !== false;
}

/**
 * Watches `target` as a full screen candidate. Browsers may refuse a request
 * (no user gesture, permissions policy): the game simply stays as it is.
 */
export function createFullscreenControl(target: HTMLElement, options: FullscreenOptions = {}): FullscreenControl {
  const className = options.className ?? "is-fullscreen";
  const listeners = new Set<() => void>();
  const query = laptopQuery();
  let state: FullscreenState = NO_FULLSCREEN_STATE;
  let disposed = false;

  function read(): FullscreenState {
    const fullscreenElement = document.fullscreenElement;
    // Another element (a video, another game) took the screen: this game is not in full screen.
    const active = fullscreenElement !== null && fullscreenElement === target;
    return {
      supported: canGoFullscreen(target),
      offered: canGoFullscreen(target) && Boolean(query?.matches),
      active,
    };
  }

  function same(a: FullscreenState, b: FullscreenState) {
    return a.supported === b.supported && a.offered === b.offered && a.active === b.active;
  }

  function sync() {
    if (disposed) return;
    const next = read();
    target.classList.toggle(className, next.active);
    if (same(next, state)) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function onFullscreenChange() {
    sync();
  }

  state = read();
  target.classList.toggle(className, state.active);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("fullscreenerror", onFullscreenChange);
  if (query && typeof query.addEventListener === "function") query.addEventListener("change", sync);

  function enter() {
    if (disposed || read().active) return;
    // Browsers can refuse (no user gesture, permissions policy); the game just stays as it is.
    target.requestFullscreen?.().catch((error: unknown) => console.warn("[fullscreen] request refused", error));
  }

  function exit() {
    if (disposed || document.fullscreenElement === null) return;
    document.exitFullscreen?.().catch((error: unknown) => console.warn("[fullscreen] exit refused", error));
  }

  function toggle() {
    if (read().active) exit();
    else enter();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("fullscreenerror", onFullscreenChange);
    if (query && typeof query.removeEventListener === "function") query.removeEventListener("change", sync);
    target.classList.remove(className);
    // Leaving the game in full screen would hide the arcade around it.
    if (document.fullscreenElement === target) document.exitFullscreen?.()?.catch(() => {});
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter,
    exit,
    toggle,
    dispose,
  };
}
