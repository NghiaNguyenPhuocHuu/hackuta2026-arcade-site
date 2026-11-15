# Poker Gambling Setup Audit - HackUTA 2026 Arcade

## Executive Summary

**Status**: ⚠️ **INCOMPLETE** - Critical gambling logging infrastructure is missing

The poker system has basic multiplayer functionality but lacks comprehensive gambling logs needed to track all transactions during the event. While player point balances are tracked, there is **no dedicated transaction log** to record individual hands, bets, wins, and losses.

---

## Current Implementation

### ✅ What's Working

#### 1. Multiplayer Infrastructure
- **Matchmaking Queue**: `pokerQueue` table manages players waiting for tables
- **Table Management**: `pokerTables` table tracks active poker games
- **Seat Management**: `pokerSeats` table tracks individual players at tables
- **Player Identity**: `pokerPlayers` table with SHA-256 hashed tokens for security
- **Bot Support**: Automatic bot filling when not enough humans available

#### 2. Points System
- **Starting Balance**: 200 points per player (`POKER_STARTING_POINTS`)
- **Buy-in**: 100 points per table (`POKER_BUY_IN`)
- **Off-table Stack**: `pokerPlayers.points` tracks available points
- **Last Result**: Basic tracking of most recent cash-out:
  ```typescript
  lastResult: {
    returned: number,
    reason: string,
    at: number
  }
  ```

#### 3. Credit/Debit Functions
```typescript
async function creditPlayer(
  ctx: MutationCtx,
  playerId: Id<"pokerPlayers">,
  chips: number,
  reason: string
)
```
- Updates player balance when cashing out
- Records timestamp and reason
- **LIMITATION**: Only stores LAST transaction, not full history

#### 4. Game Logging
- **In-game Log**: `pokerTables.log` field tracks narrative of current hand
  - "Zeus posts 10, Athena posts 20"
  - "Hermes raises to 50"
  - "Apollo wins 200 with a Flush"
- **LIMITATION**: Overwritten each action, not persistent

---

## ❌ Missing Critical Components

### 1. Comprehensive Transaction Logs

**MISSING TABLE**: No `pokerTransactions` or `pokerHandHistory` table exists

What's needed:
```typescript
pokerHandHistory: defineTable({
  tableId: v.id("pokerTables"),
  handNumber: v.number(),
  playerId: v.id("pokerPlayers"),
  playerName: v.string(),
  
  // Transaction details
  eventType: v.union(
    v.literal("buy_in"),
    v.literal("bet"),
    v.literal("call"),
    v.literal("raise"),
    v.literal("fold"),
    v.literal("win"),
    v.literal("cash_out"),
    v.literal("timeout_forfeit")
  ),
  
  // Amounts
  amountBefore: v.number(),      // Chips before transaction
  amountChange: v.number(),       // + for wins, - for bets
  amountAfter: v.number(),        // Chips after transaction
  
  // Context
  street: v.string(),             // preflop, flop, turn, river, showdown
  potSize: v.number(),            // Total pot at time of action
  timestamp: v.number(),
  
  // Optional: Full hand details for wins
  winningHand: v.optional(v.object({
    cards: v.array(v.object({ rank: v.string(), suit: v.string() })),
    category: v.string(),
    label: v.string()
  }))
})
.index("by_player", ["playerId"])
.index("by_table", ["tableId"])
.index("by_timestamp", ["timestamp"])
.index("by_hand", ["tableId", "handNumber"])
```

### 2. Aggregate Logging

**MISSING TABLE**: No `pokerSessionSummary` for per-session tracking

What's needed:
```typescript
pokerSessionSummary: defineTable({
  playerId: v.id("pokerPlayers"),
  playerName: v.string(),
  
  // Session tracking
  sessionStart: v.number(),
  sessionEnd: v.optional(v.number()),
  
  // Statistics
  handsPlayed: v.number(),
  handsWon: v.number(),
  totalWagered: v.number(),
  totalWon: v.number(),
  netProfit: v.number(),          // totalWon - totalWagered
  
  // Starting/ending balances
  startingPoints: v.number(),
  endingPoints: v.optional(v.number()),
  
  // Tables played
  tablesJoined: v.array(v.id("pokerTables"))
})
.index("by_player", ["playerId"])
.index("by_session_start", ["sessionStart"])
```

### 3. Audit Trail Functions

Missing helper functions to record transactions:

```typescript
// Log every bet/raise/call
async function logTransaction(
  ctx: MutationCtx,
  playerId: Id<"pokerPlayers">,
  tableId: Id<"pokerTables">,
  eventType: string,
  amountChange: number,
  chipsBefore: number,
  context: { street: string; pot: number; handNumber: number }
)

// Log hand results
async function logHandResult(
  ctx: MutationCtx,
  tableId: Id<"pokerTables">,
  handNumber: number,
  winners: Array<{ playerId: string; amount: number; hand: any }>
)

// Generate audit report
export const getPlayerGamblingHistory = query({
  args: { playerId: v.id("pokerPlayers") },
  handler: async (ctx, { playerId }) => {
    // Return comprehensive transaction history
  }
})
```

---

## Implementation Gaps in Existing Code

### poker.ts Issues

1. **`creditPlayer` function** (line 280):
   - ✅ Updates balance
   - ❌ No transaction log created
   - ❌ Overwrites `lastResult` instead of appending

2. **`cashOutSeat` function** (line 296):
   - ✅ Returns chips to player
   - ❌ No record of cash-out transaction kept

3. **`applyAction` calls** (throughout):
   - ✅ Updates game state
   - ❌ No transaction log for bets/raises/calls
   - Only updates narrative `log` string

4. **Showdown processing**:
   - ✅ Calculates winners
   - ❌ No persistent record of who won what

---

## Compliance & Audit Requirements

For a gambling system, you need:

### 1. **Tamper-Proof Logging**
- Every bet, win, loss recorded with timestamp
- Immutable records (insert-only, never update/delete)
- Cryptographic integrity checks (optional but recommended)

### 2. **Reconciliation**
- Ability to reconstruct any player's balance from transaction history
- Point balance at any moment = starting balance + sum(transaction deltas)

### 3. **Audit Queries**
- "Show all hands player X participated in"
- "Show all transactions for table Y"
- "Calculate total points wagered during event"
- "Identify players with largest wins/losses"
- "Detect anomalies or suspicious activity"

### 4. **Dispute Resolution**
- Complete hand history with all actions
- Timestamp of every decision
- Ability to replay any hand

### 5. **Event-Wide Reports**
- Total points wagered across all games
- Most/least profitable players
- Number of hands played
- Average pot size
- Peak concurrent tables

---

## Recommended Implementation Plan

### Phase 1: Add Transaction Logging (Critical)

1. **Update schema.ts**:
   - Add `pokerHandHistory` table
   - Add indexes for efficient queries

2. **Update poker.ts**:
   - Modify `creditPlayer` to log transactions
   - Add `logTransaction` helper function
   - Call `logTransaction` after every `applyAction`
   - Log buy-ins when joining queue
   - Log cash-outs comprehensively

3. **Update `applyAction` wrapper**:
   ```typescript
   async function applyAndLog(
     ctx: MutationCtx,
     state: TableState,
     playerId: string,
     action: PokerAction
   ) {
     const seat = state.seats.find(s => s.id === playerId)!;
     const chipsBefore = seat.chips;
     const newState = applyAction(state, playerId, action);
     const chipsAfter = newState.seats.find(s => s.id === playerId)!.chips;
     
     await logTransaction(ctx, playerId, state.id, action.type, 
       chipsAfter - chipsBefore, chipsBefore, {
         street: state.street,
         pot: state.pot,
         handNumber: state.handNumber
       });
     
     return newState;
   }
   ```

### Phase 2: Add Aggregate Tracking

1. **Add `pokerSessionSummary` table**
2. **Track session start** when player first joins queue
3. **Update stats** after each hand
4. **Finalize session** when player leaves or event ends

### Phase 3: Add Query Functions

1. **Player History**:
   ```typescript
   export const getPlayerHistory = query({
     args: { playerId: v.id("pokerPlayers") },
     handler: async (ctx, { playerId }) => {
       return await ctx.db
         .query("pokerHandHistory")
         .withIndex("by_player", q => q.eq("playerId", playerId))
         .order("desc")
         .collect();
     }
   })
   ```

2. **Table History**:
   ```typescript
   export const getTableHistory = query({
     args: { tableId: v.id("pokerTables") },
     handler: async (ctx, { tableId }) => {
       return await ctx.db
         .query("pokerHandHistory")
         .withIndex("by_table", q => q.eq("tableId", tableId))
         .collect();
     }
   })
   ```

3. **Event-Wide Stats**:
   ```typescript
   export const getEventStats = query({
     handler: async (ctx) => {
       const allTransactions = await ctx.db
         .query("pokerHandHistory")
         .collect();
       
       return {
         totalHands: new Set(allTransactions.map(t => 
           `${t.tableId}-${t.handNumber}`)).size,
         totalWagered: allTransactions
           .filter(t => t.amountChange < 0)
           .reduce((sum, t) => sum + Math.abs(t.amountChange), 0),
         totalWon: allTransactions
           .filter(t => t.amountChange > 0)
           .reduce((sum, t) => sum + t.amountChange, 0),
         uniquePlayers: new Set(allTransactions.map(t => t.playerId)).size
       };
     }
   })
   ```

### Phase 4: Admin Dashboard

1. Create admin query functions in `backend/overlay/convex/admin/arcadeAudit.ts`
2. Add UI in admin portal for:
   - Real-time poker statistics
   - Player lookup and history
   - Suspicious activity alerts
   - Export transaction logs

---

## Testing Requirements

Before going live, verify:

1. ✅ Every bet/raise/call creates a transaction log entry
2. ✅ Every hand result creates win/loss log entries  
3. ✅ Player balance can be reconstructed from transaction history
4. ✅ No transactions are lost during crashes/timeouts
5. ✅ Query functions return accurate data
6. ✅ Audit reports match actual gameplay

---

## Estimated Implementation Time

- **Phase 1 (Critical)**: 6-8 hours
  - Schema updates: 1 hour
  - Transaction logging: 3-4 hours
  - Testing: 2-3 hours

- **Phase 2 (Important)**: 3-4 hours
- **Phase 3 (Important)**: 2-3 hours
- **Phase 4 (Nice-to-have)**: 4-6 hours

**Total**: 15-21 hours for complete implementation

---

## Risk Assessment

### Current Risks (Without Logging)

🔴 **HIGH**: No audit trail for disputes
🔴 **HIGH**: Cannot detect cheating or bugs
🔴 **HIGH**: Cannot verify point balances
🟡 **MEDIUM**: No event statistics available
🟡 **MEDIUM**: Difficult to debug issues post-event

### After Implementation

🟢 **LOW**: Complete audit capability
🟢 **LOW**: Full transaction transparency
🟢 **LOW**: Comprehensive debugging data

---

## Conclusion

The poker multiplayer infrastructure is **functional** but **not production-ready** for a gambling environment. The missing transaction logging is a **critical gap** that must be addressed before the event.

**Recommendation**: Implement Phase 1 (transaction logging) as **top priority** before allowing real gameplay.
