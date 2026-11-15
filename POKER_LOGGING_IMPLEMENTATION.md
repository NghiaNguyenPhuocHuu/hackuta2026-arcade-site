# Poker Gambling Logging - Implementation Guide

## Overview

This document explains how to integrate the new gambling transaction logging into the existing poker system.

## Files Created

1. **Schema Update**: `backend/overlay/convex/schema.ts`
   - Added `pokerTransactions` table
   - Added `pokerSessionStats` table

2. **Logging Utilities**: `backend/overlay/convex/arcade/pokerLogging.ts`
   - Helper functions for logging transactions
   - Session management
   - Balance verification

3. **Admin Queries**: `backend/overlay/convex/arcade/pokerAudit.ts`
   - Read-only audit queries
   - Event statistics
   - Anomaly detection
   - Data export

4. **Documentation**:
   - `POKER_GAMBLING_AUDIT.md` - Detailed audit findings
   - `POKER_LOGGING_IMPLEMENTATION.md` - This file

## Integration Steps

### Step 1: Update poker.ts Imports

Add these imports at the top of `backend/overlay/convex/arcade/poker.ts`:

```typescript
import {
  logPokerTransaction,
  getOrCreateSessionStats,
  updateSessionStats,
  finalizeSession,
} from "./pokerLogging";
```

### Step 2: Log Buy-Ins

Update the `joinQueue` mutation to log buy-ins. Find the section where points are deducted and add:

```typescript
// After: await ctx.db.patch(playerId, { points: player.points - POKER_BUY_IN, ... })

await logPokerTransaction(ctx, {
  playerId,
  playerName: player.displayName,
  isBot: false,
  tableId: "pending" as any, // Will be updated when table assigned
  handNumber: 0,
  eventType: "buy_in",
  chipsBefore: 0,
  chipsChange: -POKER_BUY_IN,
  chipsAfter: 0,
  street: "n/a",
  potSize: 0,
  reason: "Joined poker queue",
});

await getOrCreateSessionStats(ctx, playerId, player.displayName, player.points);
await updateSessionStats(ctx, playerId, { buyIn: POKER_BUY_IN });
```

### Step 3: Log Player Actions

Update the `playAction` mutation to log every bet, raise, call, and fold.

After `applyAction` but before `persistAndAdvance`, add:

```typescript
// Get the seat that just acted
const actingSeat = seats.find(s => s.playerId === playerId);
if (actingSeat) {
  const seatInState = state.seats[seats.indexOf(actingSeat)];
  const oldChips = loaded.state.seats[seats.indexOf(actingSeat)]!.chips;
  const newChips = seatInState!.chips;
  
  await logPokerTransaction(ctx, {
    playerId: actingSeat.playerId!,
    playerName: actingSeat.name,
    isBot: false,
    tableId,
    handNumber: state.handNumber,
    eventType: action.type,
    chipsBefore: oldChips,
    chipsChange: newChips - oldChips,
    chipsAfter: newChips,
    street: state.street,
    potSize: state.pot,
  });
  
  await updateSessionStats(ctx, actingSeat.playerId!, {
    handPlayed: true,
    handFolded: action.type === "fold",
    wentAllIn: action.type === "all_in",
    wagered: action.type === "fold" ? 0 : Math.abs(newChips - oldChips),
    currentPoints: (await ctx.db.get(actingSeat.playerId!))!.points,
  });
}
```

### Step 4: Log Wins

Update `creditPlayer` function to log wins:

```typescript
async function creditPlayer(
  ctx: MutationCtx,
  playerId: Id<"pokerPlayers">,
  chips: number,
  reason: string,
) {
  const player = await ctx.db.get(playerId);
  if (!player) return;
  const returned = Math.max(0, chips);
  
  // Log the transaction
  await logPokerTransaction(ctx, {
    playerId,
    playerName: player.displayName,
    isBot: false,
    tableId: "unknown" as any, // Should pass this in
    handNumber: 0, // Should pass this in
    eventType: reason.includes("win") || reason.includes("uncontested") 
      ? "win" 
      : "cash_out",
    chipsBefore: 0,
    chipsChange: returned,
    chipsAfter: returned,
    street: "showdown",
    potSize: returned,
    reason,
  });
  
  await ctx.db.patch(playerId, {
    points: player.points + returned,
    lastResult: { returned, reason, at: Date.now() },
    updatedAt: Date.now(),
  });
  
  // Update session stats
  if (returned > 0) {
    await updateSessionStats(ctx, playerId, {
      won: returned,
      cashOut: returned,
      potSize: returned,
      currentPoints: player.points + returned,
    });
  }
}
```

### Step 5: Enhanced creditPlayer Signature

Update `creditPlayer` to accept table and hand context:

```typescript
async function creditPlayer(
  ctx: MutationCtx,
  playerId: Id<"pokerPlayers">,
  chips: number,
  reason: string,
  tableId: Id<"pokerTables">,
  handNumber: number,
  winningHand?: { category: string; label: string }
)
```

Then update all `creditPlayer` calls to pass these parameters.

### Step 6: Log Bot Actions

In the `playBot` mutation, after the bot action is applied, log it:

```typescript
const actor = loaded.state.seats[loaded.state.toAct];
if (actor?.isBot) {
  const botAction = chooseBotAction(loaded.state, actor.id, random01);
  const oldChips = actor.chips;
  const next = applyAction(loaded.state, actor.id, botAction);
  const newSeat = next.seats[loaded.state.toAct]!;
  
  // Log bot transaction
  await logPokerTransaction(ctx, {
    playerId: "bot" as any, // Special case for bots
    playerName: actor.name,
    isBot: true,
    tableId,
    handNumber: loaded.state.handNumber,
    eventType: botAction.type,
    chipsBefore: oldChips,
    chipsChange: newSeat.chips - oldChips,
    chipsAfter: newSeat.chips,
    street: loaded.state.street,
    potSize: loaded.state.pot,
  });
  
  await persistAndAdvance(ctx, loaded.table, loaded.seats, next);
}
```

### Step 7: Handle Table Endings

In `endTable` function, finalize all sessions:

```typescript
async function endTable(...) {
  for (let i = 0; i < seats.length; i += 1) {
    const doc = seats[i]!;
    if (doc.isBot || doc.sittingOut || !doc.playerId) continue;
    const chips = state.seats[i]?.chips ?? doc.chips;
    await ctx.db.patch(doc._id, { sittingOut: true, chips: 0 });
    await creditPlayer(ctx, doc.playerId, chips, reason, table._id, state.handNumber);
    
    // Finalize session
    await finalizeSession(ctx, doc.playerId);
  }
  // ... rest of endTable
}
```

### Step 8: Timeout Logging

In `kickIfIdle`, log the timeout forfeit:

```typescript
await logPokerTransaction(ctx, {
  playerId: playerDocId,
  playerName: actor.name,
  isBot: false,
  tableId,
  handNumber: loaded.state.handNumber,
  eventType: "timeout_forfeit",
  chipsBefore: actor.chips,
  chipsChange: -actor.chips,
  chipsAfter: 0,
  street: loaded.state.street,
  potSize: loaded.state.pot,
  reason: "Time's up. You were stood up.",
});
```

## Testing the Implementation

### 1. Schema Migration

Run the Convex schema push:

```bash
cd backend
npm run convex:push -- --debug
```

Verify tables are created:
- `pokerTransactions`
- `pokerSessionStats`

### 2. Integration Tests

Create a test file `backend/overlay/tests/integration/poker-logging.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";

describe("poker logging", () => {
  it("logs buy-in transactions", async () => {
    // Test buy-in creates transaction log
  });
  
  it("logs player actions", async () => {
    // Test bet/raise/fold creates logs
  });
  
  it("logs wins correctly", async () => {
    // Test showdown wins are logged
  });
  
  it("maintains session stats", async () => {
    // Test session stats update correctly
  });
  
  it("verifies balance integrity", async () => {
    // Test balance = starting + sum(transactions)
  });
});
```

### 3. Manual Testing

1. **Join Queue**: Verify `pokerTransactions` records buy-in
2. **Play Hand**: Verify each action (bet/raise/call/fold) creates transaction
3. **Win Hand**: Verify win transaction with correct amount
4. **Cash Out**: Verify cash-out transaction
5. **Check Stats**: Query `pokerSessionStats` to verify aggregates

### 4. Admin Queries

Test the audit queries:

```typescript
// In Convex dashboard or test script
import { api } from "./backend/_generated/api";

// Get player history
await api.arcade.pokerAudit.getPlayerHistory({ playerId: "..." });

// Get event stats
await api.arcade.pokerAudit.getPokerEventStats({});

// Verify balance
await api.arcade.pokerAudit.verifyBalance({ playerId: "..." });
```

## Monitoring During Event

### Real-Time Dashboard

Create an admin UI component that polls these queries:

1. **Live Stats** (refresh every 5 seconds):
   ```typescript
   const stats = useQuery(api.arcade.pokerAudit.getPokerEventStats, {});
   ```

2. **Active Sessions** (refresh every 10 seconds):
   ```typescript
   const sessions = useQuery(api.arcade.pokerAudit.getActiveSessions, {});
   ```

3. **Recent Transactions** (refresh every 5 seconds):
   ```typescript
   const recent = useQuery(api.arcade.pokerAudit.getRecentTransactions, { limit: 20 });
   ```

4. **Anomalies** (refresh every 30 seconds):
   ```typescript
   const anomalies = useQuery(api.arcade.pokerAudit.detectAnomalies, { thresholdHours: 1 });
   ```

### Alerts

Set up alerts for:
- Unusually high win rates (>70% over 20+ hands)
- Large profits (>500 points in a session)
- High transaction volume (>200 in an hour)
- Balance verification failures

## Post-Event Analysis

### Export Data

Use the export query to get all transaction data:

```typescript
const allData = await api.arcade.pokerAudit.exportTransactionData({
  startTime: eventStartTimestamp,
  endTime: eventEndTimestamp,
});

// Convert to CSV
const csv = convertToCSV(allData);
downloadFile(csv, "poker_transactions.csv");
```

### Generate Reports

1. **Player Leaderboard**: Top winners and losers
2. **Hand Statistics**: Average pot, hands per hour
3. **Bot Performance**: How often bots win
4. **Timeline**: Activity over time

### Audit Verification

Run balance verification for all players:

```typescript
const allPlayers = await db.query("pokerPlayers").collect();
for (const player of allPlayers) {
  const verification = await api.arcade.pokerAudit.verifyBalance({
    playerId: player._id
  });
  
  if (!verification.valid) {
    console.error(`Balance mismatch for ${player.displayName}:`, verification);
  }
}
```

## Performance Considerations

### Indexing

All necessary indexes are included in the schema:
- `by_player` - Fast player history lookup
- `by_table` - Fast table history lookup
- `by_timestamp` - Fast chronological queries
- `by_hand` - Fast hand reconstruction
- `by_player_timestamp` - Optimal for player activity feeds

### Query Limits

- Transaction history queries are limited to 100 by default
- Use pagination for larger datasets
- Recent transaction feed limited to 50 entries

### Storage

Estimated storage per transaction: ~500 bytes
Expected transactions during event:
- 50 players × 20 hands × 8 actions/hand = 8,000 transactions
- ~4 MB total storage (negligible)

## Troubleshooting

### Missing Transactions

If transactions are missing:
1. Check if the logging calls were added at all action points
2. Verify the mutation didn't throw an error
3. Check Convex logs for insertion failures

### Balance Mismatches

If `verifyBalance` shows mismatches:
1. Check if any `creditPlayer` calls bypassed logging
2. Look for floating-point rounding errors
3. Check for manual balance modifications

### Performance Issues

If queries are slow:
1. Verify indexes are being used (check Convex dashboard)
2. Reduce query limits
3. Add more specific indexes if needed

## Security Notes

1. **Admin Authentication**: Add proper admin checks to all audit queries
2. **Rate Limiting**: Consider rate limiting admin queries
3. **Data Privacy**: Transaction logs contain player activity - handle accordingly
4. **Immutability**: Never delete or modify transaction logs (insert-only)

## Future Enhancements

1. **Cryptographic Signatures**: Sign each transaction with timestamp
2. **Blockchain-style Linking**: Each transaction references previous for tamper detection
3. **Real-time Alerts**: WebSocket push for suspicious activity
4. **ML Anomaly Detection**: Learn normal patterns, flag deviations
5. **Player Statistics Dashboard**: Public leaderboard (opt-in)
