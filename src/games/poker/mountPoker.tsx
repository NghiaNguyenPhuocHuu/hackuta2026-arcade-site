import { createRoot, type Root } from "react-dom/client";
import { PokerApp } from "./PokerTable";
import pokerCss from "./poker.css?inline";

const mounted = new WeakSet<HTMLElement>();
let stylesheetRefs = 0;
let stylesheetEl: HTMLStyleElement | null = null;

function acquireStylesheet() {
  stylesheetRefs += 1;
  if (stylesheetRefs === 1) {
    stylesheetEl = document.createElement("style");
    stylesheetEl.dataset.pokerStylesheet = "";
    stylesheetEl.textContent = pokerCss;
    document.head.appendChild(stylesheetEl);
  }
}

function releaseStylesheet() {
  stylesheetRefs = Math.max(0, stylesheetRefs - 1);
  if (stylesheetRefs === 0 && stylesheetEl) {
    stylesheetEl.remove();
    stylesheetEl = null;
  }
}

/**
 * Mounts the poker app. It plays as the signed-in hacker through the shared
 * Convex client; the buy-in comes from their arcade wallet on the server.
 */
export function mountPoker(el: HTMLElement): () => void {
  if (!(el instanceof HTMLElement)) throw new TypeError("mountPoker: a host element is required");
  if (mounted.has(el)) throw new Error("mountPoker: this element already has a mounted game");
  mounted.add(el);
  acquireStylesheet();

  const root: Root = createRoot(el);
  root.render(<PokerApp />);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    // The arcade unmounts games while React renders the next page; unmounting
    // this root synchronously then is an error, so wait for that render to end.
    queueMicrotask(() => {
      root.unmount();
      mounted.delete(el);
      releaseStylesheet();
    });
  };
}
