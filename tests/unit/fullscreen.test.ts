import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFullscreenControl, LAPTOP_MEDIA_QUERY } from "../../src/games/fullscreen";

type Listener = () => void;

type FakeClassList = {
  toggle(name: string, force?: boolean): boolean;
  remove(name: string): void;
  contains(name: string): boolean;
};

type FakeElement = {
  classes: Set<string>;
  classList: FakeClassList;
  requests: number;
  requestFullscreen(): Promise<void>;
};

class FakeDocument {
  fullscreenElement: FakeElement | null = null;
  fullscreenEnabled = true;
  exits = 0;
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  /** What the browser does when the full screen element changes. */
  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  exitFullscreen(): Promise<void> {
    this.exits += 1;
    this.fullscreenElement = null;
    this.emit("fullscreenchange");
    return Promise.resolve();
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function fakeElement(owner: FakeDocument): FakeElement {
  const classes = new Set<string>();
  const element: FakeElement = {
    classes,
    requests: 0,
    classList: {
      toggle(name, force) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    requestFullscreen() {
      element.requests += 1;
      owner.fullscreenElement = element;
      owner.emit("fullscreenchange");
      return Promise.resolve();
    },
  };
  return element;
}

let doc: FakeDocument;
let laptop = true;

beforeEach(() => {
  doc = new FakeDocument();
  laptop = true;
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    matchMedia(query: string) {
      if (query !== LAPTOP_MEDIA_QUERY) throw new Error(`unexpected query: ${query}`);
      return { matches: laptop, addEventListener() {}, removeEventListener() {} };
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(className = "is-fullscreen") {
  const element = fakeElement(doc);
  const control = createFullscreenControl(element as unknown as HTMLElement, { className });
  return { element, control, className };
}

describe("createFullscreenControl", () => {
  it("offers the switch on a laptop browser and hides it elsewhere", () => {
    const laptopGame = mount();
    expect(laptopGame.control.getState()).toEqual({ supported: true, offered: true, active: false });

    laptop = false;
    const phoneGame = mount();
    expect(phoneGame.control.getState()).toEqual({ supported: true, offered: false, active: false });
  });

  it("is not supported without the Fullscreen API", () => {
    // A browser with no requestFullscreen, or one where full screen is turned off.
    doc.fullscreenEnabled = false;
    const element = {
      classList: { toggle: () => false, remove() {}, contains: () => false },
    };
    const control = createFullscreenControl(element as unknown as HTMLElement);

    expect(control.getState()).toEqual({ supported: false, offered: false, active: false });

    // Asking anyway is a quiet no-op, not a crash.
    control.enter();
    control.exit();
    expect(control.getState().active).toBe(false);
    control.dispose();
  });

  it("enters full screen, marks the game root and tells subscribers", () => {
    const { element, control, className } = mount();
    const seen: boolean[] = [];
    control.subscribe(() => seen.push(control.getState().active));

    control.enter();

    expect(element.requests).toBe(1);
    expect(control.getState().active).toBe(true);
    expect(element.classes.has(className)).toBe(true);
    expect(seen).toEqual([true]);
  });

  it("follows the browser's own full screen changes (Esc)", () => {
    const { element, control, className } = mount();
    control.enter();
    expect(element.classes.has(className)).toBe(true);

    // Esc: the browser drops the full screen element and fires the event itself.
    doc.fullscreenElement = null;
    doc.emit("fullscreenchange");

    expect(control.getState().active).toBe(false);
    expect(element.classes.has(className)).toBe(false);
  });

  it("toggles out and never asks twice", () => {
    const { element, control } = mount();
    control.toggle();
    expect(element.requests).toBe(1);

    control.toggle();
    expect(doc.exits).toBe(1);
    expect(control.getState().active).toBe(false);

    // Already out of full screen: nothing to exit.
    control.exit();
    expect(doc.exits).toBe(1);
  });

  it("is not the full screen game when something else took the screen", () => {
    const { control } = mount();
    doc.fullscreenElement = fakeElement(doc);
    doc.emit("fullscreenchange");
    expect(control.getState().active).toBe(false);
  });

  it("cleans up on dispose", () => {
    const { element, control, className } = mount();
    control.enter();
    const notified = vi.fn();
    control.subscribe(notified);

    control.dispose();

    expect(doc.fullscreenElement).toBeNull();
    expect(element.classes.has(className)).toBe(false);
    expect(doc.listenerCount("fullscreenchange")).toBe(0);
    expect(doc.listenerCount("fullscreenerror")).toBe(0);

    // Nothing fires after dispose, and a second dispose is a no-op.
    doc.emit("fullscreenchange");
    control.dispose();
    expect(notified).not.toHaveBeenCalled();
  });
});
