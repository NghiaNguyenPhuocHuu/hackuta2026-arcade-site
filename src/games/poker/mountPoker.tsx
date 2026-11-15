import { createRoot, type Root } from "react-dom/client";
import { PokerApp } from "./PokerTable";
import pokerCss from "./poker.css?inline";
import { getMockWallet, creditMockPoints, spendMockPoints } from "../../arcade/mockWallet";
import { getPokerPlayerId } from "./matchmaking";

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

export type MountPokerOptions = {
  player?: { id?: string; displayName: string };
  adapter?: unknown;
  tutorial?: unknown;
};

export function mountPoker(el: HTMLElement, options: MountPokerOptions = {}): () => void {
  if (!(el instanceof HTMLElement)) throw new TypeError("mountPoker: a host element is required");
  if (mounted.has(el)) throw new Error("mountPoker: this element already has a mounted game");
  mounted.add(el);
  acquireStylesheet();

  const player = {
    id: options.player?.id ?? getPokerPlayerId(),
    name: options.player?.displayName ?? "Hacker",
  };
  const wallet = {
    getBalance: () => getMockWallet().balance,
    spend: spendMockPoints,
    credit: creditMockPoints,
  };

  const root: Root = createRoot(el);
  root.render(<PokerApp player={player} wallet={wallet} />);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
    mounted.delete(el);
    releaseStylesheet();
  };
}
