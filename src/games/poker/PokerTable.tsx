import { useEffect, useMemo, useState } from "react";
import {
  POKER_ACTION_TIMEOUT_MS,
  POKER_BIG_BLIND,
  POKER_BUY_IN,
  POKER_SMALL_BLIND,
  type Card,
  type PokerAction,
  type PublicSeat,
  type PublicTable,
} from "../../../shared/poker";
import { convexClient } from "../../convex/client";
import { createLivePokerClient } from "./liveMatchmaking";
import { type PokerView } from "./matchmaking";
import { PlayingCard } from "./PlayingCard";

const STARS = (() => {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 40 }, () => ({
    x: (rnd() * 99).toFixed(2),
    y: (rnd() * 99).toFixed(2),
    big: rnd() > 0.8,
    gold: rnd() > 0.7,
  }));
})();

function formatPts(n: number) {
  return n.toLocaleString("en-US");
}

function useShotClock(deadlineAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadlineAt]);
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

function streetLabel(street: PublicTable["street"]) {
  if (street === "preflop") return "PREFLOP";
  if (street === "flop") return "FLOP";
  if (street === "turn") return "TURN";
  if (street === "river") return "RIVER";
  return "SHOWDOWN";
}

function SeatView({
  seat,
  slot,
  secondsLeft,
}: {
  seat: PublicSeat;
  slot: string;
  secondsLeft: number | null;
}) {
  const hole =
    seat.hole === null ? [null, null] : seat.hole.length ? seat.hole : [];
  const urgent = secondsLeft !== null && secondsLeft <= 5;
  return (
    <div
      className={`poker-seat poker-seat--${slot}${seat.isToAct ? " poker-seat--to-act" : ""}${seat.folded ? " poker-seat--folded" : ""}`}
    >
      <div className="poker-hole">
        {hole.length === 0 ? (
          <>
            <div className="poker-card poker-empty" />
            <div className="poker-card poker-empty" />
          </>
        ) : (
          hole.map((card, index) => (
            <PlayingCard
              key={index}
              card={card ?? undefined}
              hidden={!card}
              size={slot === "you" ? "md" : "sm"}
            />
          ))
        )}
      </div>
      <div className="poker-seat__meta">
        <span className="poker-seat__name">{seat.name}</span>
        <span className="poker-seat__chips">{formatPts(seat.chips)} pts</span>
        {!seat.isBot && !seat.folded && !seat.allIn ? (
          <span
            className={`poker-clock${seat.isToAct ? " poker-clock--live" : ""}${urgent ? " poker-clock--urgent" : ""}`}
          >
            {seat.isToAct && secondsLeft !== null
              ? `${secondsLeft}s`
              : `${POKER_ACTION_TIMEOUT_MS / 1000}s`}
          </span>
        ) : null}
        <div className="poker-seat__tags">
          {seat.isDealer ? (
            <span className="poker-tag poker-tag--dealer">D</span>
          ) : null}
          {seat.isBot ? (
            <span className="poker-tag poker-tag--bot">SHADE</span>
          ) : null}
          {seat.allIn ? <span className="poker-tag">ALL-IN</span> : null}
          {seat.folded ? <span className="poker-tag">FOLD</span> : null}
          {seat.streetBet > 0 && !seat.folded ? (
            <span className="poker-tag">{seat.streetBet}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Who won the hand, shown on the felt at showdown: name ("You" for the
 * viewer), the amount, the winning hand and its two cards. A split pot lists
 * every share; a hand won because everyone else folded says so. It closes on
 * a tap, and by itself when the next hand is dealt.
 */
function WinnerPopup({ table, youId }: { table: PublicTable; youId: string }) {
  const [dismissedHand, setDismissedHand] = useState<number | null>(null);
  if (table.street !== "showdown" || table.winners.length === 0 || dismissedHand === table.handNumber) return null;
  const seatOf = (id: string) => table.seats.find((seat) => seat.id === id);
  // One player can be paid more than once in a hand (main pot plus side pot or an
  // odd leftover chip): add their shares up, so a split means different players.
  const winners: typeof table.winners = [];
  for (const row of table.winners) {
    const same = winners.find((w) => w.playerId === row.playerId);
    if (same) same.amount += row.amount;
    else winners.push({ ...row, hand: row.hand ?? undefined });
  }
  for (const row of table.winners) {
    const merged = winners.find((w) => w.playerId === row.playerId)!;
    if (!merged.hand && row.hand) merged.hand = row.hand;
  }
  const youWon = winners.some((row) => row.playerId === youId);
  const split = winners.length > 1;
  const title = split ? "SPLIT POT" : youWon ? "YOU WIN!" : `${(seatOf(winners[0]!.playerId)?.name ?? "A player").toUpperCase()} WINS`;
  const announce = winners
    .map((row) => `${row.playerId === youId ? "You" : seatOf(row.playerId)?.name ?? "A player"} won ${formatPts(row.amount)} points${row.hand ? ` with ${row.hand.label}` : ""}.`)
    .join(" ");
  return (
    <div className="poker-winner" role="status" aria-live="polite" aria-label={announce}>
      <button type="button" className={`poker-winner__card${youWon ? " poker-winner__card--you" : ""}`} onClick={() => setDismissedHand(table.handNumber)}>
        <span className="poker-winner__crown" aria-hidden="true">♛</span>
        <span className="poker-winner__title">{title}</span>
        {winners.map((row) => {
          const seat = seatOf(row.playerId);
          const name = row.playerId === youId ? "You" : seat?.name ?? "A player";
          return (
            <span key={row.playerId} className="poker-winner__row">
              {split ? <span className="poker-winner__name">{name}</span> : null}
              <span className="poker-winner__amount">+{formatPts(row.amount)} pts</span>
              <span className="poker-winner__hand">{row.hand ? row.hand.label : "Everyone else folded"}</span>
              {row.hand && seat?.hole?.length ? (
                <span className="poker-winner__cards" aria-hidden="true">
                  {seat.hole.map((card, index) => (
                    <PlayingCard key={`${card.rank}${card.suit}${index}`} card={card} />
                  ))}
                </span>
              ) : null}
            </span>
          );
        })}
        <span className="poker-winner__hint">TAP TO CLOSE · NEXT HAND SOON</span>
      </button>
    </div>
  );
}

function TableFelt({
  table,
  youId,
  secondsLeft,
}: {
  table: PublicTable;
  youId: string;
  secondsLeft: number | null;
}) {
  const you = table.seats.find((seat) => seat.id === youId);
  const others = table.seats.filter((seat) => seat.id !== youId);
  const board: Array<Card | null> = [...table.community];
  while (board.length < 5) board.push(null);
  return (
    <div className="poker-felt">
      <div className="poker-opponents">
        {others.map((seat) => (
          <SeatView
            key={seat.id}
            seat={seat}
            slot="opp"
            secondsLeft={seat.isToAct ? secondsLeft : null}
          />
        ))}
      </div>
      <div className="poker-felt__pot">
        <p className="poker-street">
          {streetLabel(table.street)} · HAND {table.handNumber}
        </p>
        <div className="poker-board">
          {board.map((card, index) =>
            card ? (
              <PlayingCard
                key={`${card.rank}${card.suit}${index}`}
                card={card}
              />
            ) : (
              <div
                key={`slot-${index}`}
                className="poker-card poker-empty poker-board__slot"
              />
            ),
          )}
        </div>
        <div className="poker-pot">
          <span className="minigame__coin" aria-hidden="true" />
          POT {formatPts(table.pot)}
        </div>
      </div>
      {you ? (
        <SeatView
          seat={you}
          slot="you"
          secondsLeft={you.isToAct ? secondsLeft : null}
        />
      ) : null}
      <WinnerPopup table={table} youId={youId} />
    </div>
  );
}

function ActionPanel({
  table,
  onAct,
  secondsLeft,
}: {
  table: PublicTable;
  onAct: (action: PokerAction) => void;
  secondsLeft: number | null;
}) {
  const you = table.you;
  const legal = you?.legal ?? [];
  const [raiseTo, setRaiseTo] = useState(you?.minRaiseTo ?? 0);

  useEffect(() => {
    setRaiseTo(you?.minRaiseTo ?? 0);
  }, [you?.minRaiseTo, table.handNumber, table.street]);

  if (!you) {
    return <p className="minigame__dialog-line">Watching this table.</p>;
  }

  const can = (type: PokerAction["type"]) => legal.includes(type);
  const yourTurn = table.seats.some(
    (seat) => seat.id === you.id && seat.isToAct,
  );

  return (
    <>
      {yourTurn && secondsLeft !== null ? (
        <p
          className={`poker-turn-clock${secondsLeft <= 5 ? " poker-turn-clock--urgent" : ""}`}
        >
          ACT · {secondsLeft}s OR SIT OUT
        </p>
      ) : null}
      <div className="poker-actions">
        <button
          type="button"
          className="minigame__wager"
          disabled={!yourTurn || !can("fold")}
          onClick={() => onAct({ type: "fold" })}
        >
          FOLD
        </button>
        {can("check") || you.callAmount <= 0 ? (
          <button
            type="button"
            className="minigame__spin"
            disabled={!yourTurn || !can("check")}
            onClick={() => onAct({ type: "check" })}
          >
            CHECK
          </button>
        ) : (
          <button
            type="button"
            className="minigame__spin"
            disabled={!yourTurn || !can("call")}
            onClick={() => onAct({ type: "call" })}
          >
            CALL {you.callAmount}
          </button>
        )}
      </div>
      <div className="poker-raise minigame__box">
        <p className="minigame__box-label">RAISE TO</p>
        <div className="minigame__wager-list">
          {[10, 25, 50].map((step) => (
            <button
              key={step}
              type="button"
              className="minigame__wager"
              disabled={!yourTurn || !can("raise")}
              onClick={() =>
                setRaiseTo((n) =>
                  Math.min(
                    you.chips +
                      (table.seats.find((s) => s.id === you.id)?.streetBet ??
                        0),
                    Math.max(you.minRaiseTo, n + step),
                  ),
                )
              }
            >
              +{step}
            </button>
          ))}
          <button
            type="button"
            className="minigame__wager"
            disabled={!yourTurn || !can("all_in")}
            onClick={() => onAct({ type: "all_in" })}
          >
            ALL-IN
          </button>
        </div>
        <button
          type="button"
          className="minigame__spin"
          disabled={!yourTurn || !can("raise")}
          onClick={() => onAct({ type: "raise", to: raiseTo })}
        >
          RAISE {raiseTo}
        </button>
      </div>
    </>
  );
}

/** The poker app for the signed-in hacker. The table, chips and buy-in all live on the server. */
export function PokerApp() {
  const client = useMemo(() => {
    if (!convexClient) {
      throw new Error("Poker requires a live Convex connection");
    }
    return createLivePokerClient({ convex: convexClient });
  }, []);
  const [view, setView] = useState<PokerView>(() => client.getView());

  useEffect(() => {
    const stop = client.subscribe(setView);
    setView(client.getView());
    return () => {
      stop();
      client.dispose();
    };
  }, [client]);

  const stars = STARS.map((star) => (
    <span
      key={`${star.x}-${star.y}`}
      className={`minigame__star${star.big ? " minigame__star--big" : ""}${star.gold ? " minigame__star--gold" : ""}`}
      style={{ left: `${star.x}%`, top: `${star.y}%` }}
    />
  ));

  const secondsLeft = useShotClock(view.table?.actionDeadlineAt ?? null);
  const yourTurn = Boolean(
    view.table?.seats.some((seat) => seat.id === view.youId && seat.isToAct),
  );
  const canAfford = view.balance >= view.buyIn;
  const waiting = view.queue.length;
  const dialogTitle =
    view.phase === "queued"
      ? "MATCHING"
      : view.phase === "table"
        ? "LIVE TABLE"
        : view.phase === "result"
          ? "CASHED OUT"
          : "OLYMPUS POKER";
  const dialogLine =
    view.error ??
    (yourTurn && secondsLeft !== null
      ? `Your move. ${secondsLeft}s or you're stood up.`
      : null) ??
    view.table?.log ??
    (view.phase === "queued"
      ? waiting <= 1
        ? "Seeking other heroes across the event. Shades take empty seats if none arrive."
        : `${waiting} heroes waiting. The Fates will seat you shortly.`
      : view.phase === "result"
        ? `${view.result?.reason} Returned ${formatPts(view.result?.returned ?? 0)} pts.`
        : `Texas Hold'em. Buy-in ${POKER_BUY_IN}. Blinds ${POKER_SMALL_BLIND}/${POKER_BIG_BLIND}. ${POKER_ACTION_TIMEOUT_MS / 1000}s a turn.`);

  return (
    <div className="minigame minigame--poker">
      <div className="minigame__stars" aria-hidden="true">
        {stars}
      </div>
      <header className="minigame__header">
        <div className="minigame__brand">
          <div className="minigame__brand-copy">
            <h1 className="minigame__title">OLYMPUS POKER</h1>
            <p className="minigame__tagline">
              A real 52-card deck. Live seats. Fixed 100-point buy-in.
            </p>
          </div>
        </div>
        <div className="minigame__status">
          <span
            className={`minigame__badge minigame__badge--${view.phase === "table" ? "live" : view.phase === "queued" ? "soon" : "closed"}`}
          >
            <span className="minigame__badge-dot" aria-hidden="true" />
            <span>
              {view.phase === "table"
                ? "LIVE"
                : view.phase === "queued"
                  ? "QUEUE"
                  : "OPEN"}
            </span>
          </span>
        </div>
      </header>

      <div className="minigame__layout">
        <section className="minigame__machine" aria-label="Poker table">
          <div className="minigame__temple">
            <span
              className="minigame__roof minigame__roof--1"
              aria-hidden="true"
            />
            <span
              className="minigame__roof minigame__roof--2"
              aria-hidden="true"
            />
            <span
              className="minigame__roof minigame__roof--3"
              aria-hidden="true"
            />
            <div className="minigame__frieze" aria-hidden="true">
              {view.phase === "table" ? "WINNER TAKES THE POT" : "ANTE UP"}
            </div>
            <div className="minigame__bay">
              <span className="minigame__column" aria-hidden="true" />
              <div className="minigame__reels-wrap">
                {view.table ? (
                  <TableFelt
                    table={view.table}
                    youId={view.youId}
                    secondsLeft={secondsLeft}
                  />
                ) : (
                  <div className="poker-queue">
                    <p className="poker-queue__title">
                      {view.phase === "queued"
                        ? "SEEKING HEROES"
                        : "EMPTY TABLE"}
                    </p>
                    <p className="poker-queue__copy">
                      {view.phase === "queued"
                        ? "You are auto-seated as soon as a table fills."
                        : "Put in 100 points. The Fates seat you with whoever else is waiting — any laptop at the event."}
                    </p>
                    {view.queue.length > 0 ? (
                      <ul className="poker-queue__list">
                        {view.queue.map((entry) => (
                          <li key={entry.id} className="minigame__chip">
                            {entry.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
              <span className="minigame__column" aria-hidden="true" />
            </div>
            <span
              className="minigame__step minigame__step--1"
              aria-hidden="true"
            />
            <span
              className="minigame__step minigame__step--2"
              aria-hidden="true"
            />
          </div>

          <div className="minigame__dialog minigame__dialog--techno">
            <span className="minigame__nametag" aria-hidden="true">
              THE FATES
            </span>
            <div className="minigame__dialog-body">
              <p className="minigame__dialog-title minigame__dialog-title--gold">
                {dialogTitle}
              </p>
              <p className="minigame__dialog-line">{dialogLine}</p>
            </div>
          </div>
        </section>

        <aside className="minigame__panel" aria-label="Controls">
          <div className="minigame__box">
            <p className="minigame__box-label">
              {view.table ? "STACK" : "BALANCE"}
            </p>
            <p className="minigame__balance">
              <span className="minigame__coin" aria-hidden="true" />
              <span className="minigame__balance-value">
                {formatPts(view.table?.you?.chips ?? view.balance)}
              </span>
              <span className="minigame__balance-unit">pts</span>
            </p>
          </div>

          {view.phase === "lobby" || view.phase === "result" ? (
            <button
              type="button"
              className="minigame__spin"
              disabled={!canAfford}
              onClick={() => client.findTable()}
            >
              TAKE A SEAT
            </button>
          ) : null}

          {view.phase === "queued" ? (
            <button
              type="button"
              className="minigame__wager"
              onClick={() => client.cancelQueue()}
            >
              LEAVE QUEUE
            </button>
          ) : null}

          {view.table ? (
            <ActionPanel
              table={view.table}
              onAct={(action) => client.act(action)}
              secondsLeft={secondsLeft}
            />
          ) : null}

          {view.phase === "table" ? (
            <button
              type="button"
              className="minigame__wager"
              onClick={() => client.leaveTable()}
            >
              STAND UP
            </button>
          ) : null}

          <div className="minigame__box">
            <p className="minigame__box-label">HOUSE</p>
            <dl className="minigame__payouts">
              <div>
                <dt>Buy-in</dt>
                <dd className="minigame__mult minigame__mult--gold">
                  {POKER_BUY_IN}
                </dd>
              </div>
              <div>
                <dt>Blinds</dt>
                <dd className="minigame__mult">
                  {POKER_SMALL_BLIND}/{POKER_BIG_BLIND}
                </dd>
              </div>
              <div>
                <dt>Turn clock</dt>
                <dd className="minigame__mult minigame__mult--gold">
                  {POKER_ACTION_TIMEOUT_MS / 1000}s
                </dd>
              </div>
              <div>
                <dt>Seats</dt>
                <dd className="minigame__mult">2–4</dd>
              </div>
              <div>
                <dt>Deck</dt>
                <dd className="minigame__mult minigame__mult--win">52</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
