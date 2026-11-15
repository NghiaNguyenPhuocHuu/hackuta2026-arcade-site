export type PokerMessage =
  | { type: "hello"; playerId: string; name: string; at: number }
  | { type: "join-queue"; playerId: string; name: string; at: number }
  | { type: "leave-queue"; playerId: string }
  | { type: "host"; hostId: string; at: number; queue: QueueEntry[]; tables: string[] }
  | { type: "table"; tableId: string; payload: unknown; viewerHint?: string }
  | { type: "action"; tableId: string; playerId: string; action: { type: string; to?: number } }
  | { type: "leave-table"; tableId: string; playerId: string }
  | { type: "kicked"; tableId: string; playerId: string; reason: string; chips: number }
  | { type: "goodbye"; playerId: string };

export type QueueEntry = { id: string; name: string; joinedAt: number };

const CHANNEL = "hackuta-arcade-poker";
const local = new Set<(message: PokerMessage) => void>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(CHANNEL);
  channel.addEventListener("message", (event: MessageEvent<PokerMessage>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) return;
    for (const listener of local) listener(message);
  });
  return channel;
}

export function publishPoker(message: PokerMessage): void {
  getChannel();
  for (const listener of [...local]) listener(message);
  try {
    channel?.postMessage(message);
  } catch {
    // Channel closed during teardown.
  }
}

export function subscribePoker(listener: (message: PokerMessage) => void): () => void {
  getChannel();
  local.add(listener);
  return () => {
    local.delete(listener);
  };
}
