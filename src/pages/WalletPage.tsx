import { useState, useSyncExternalStore } from "react";
import { useOutletContext } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { ConfirmTransferDialog, TRANSFER_ERROR_TEXT } from "../components/ConfirmTransferDialog";
import { formatClock, type ArcadeSession } from "../arcade/useArcadeSession";
import { getMockWallet, mockTransfer, subscribeMockWallet } from "../arcade/mockWallet";
import { usePointsHold } from "../arcade/pointsReveal";
import type { ArcadeTransfer } from "../convex/arcadeApi";
import { MAX_TRANSFER, checkDeposit, checkWithdraw, type TransferKind } from "../../shared/arcade/rules";

const PRESETS = [25, 50, 100] as const;

const newTransferId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** "" → null, "12" → 12, anything else → NaN (shown as invalid). */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Moves points between the hacker's HackUTA profile and their arcade balance.
 * Every move is confirmed in a modal first and listed in the log below.
 * Mock data until the site reads Convex (arcade/transfers).
 */
export default function WalletPage() {
  const session = useOutletContext<ArcadeSession>();
  const wallet = useSyncExternalStore(subscribeMockWallet, getMockWallet);
  const hold = usePointsHold();
  const player = session.player;
  const profilePoints = player?.points ?? 0;
  const arcadePoints = player?.arcadePoints ?? 0;
  const arcadeOpen = session.status === "on";

  const [depositText, setDepositText] = useState("");
  const [withdrawText, setWithdrawText] = useState("");
  const [request, setRequest] = useState<{ kind: TransferKind; amount: number; transferId: string } | null>(null);
  const [announce, setAnnounce] = useState("");

  const depositAmount = parseAmount(depositText);
  const withdrawAmount = parseAmount(withdrawText);
  const depositProblem = depositAmount === null ? null : checkDeposit(depositAmount, profilePoints);
  const withdrawProblem = withdrawAmount === null ? null : checkWithdraw(withdrawAmount, arcadePoints);
  // A spin is still being revealed: its result isn't in the shown balance yet.
  const busy = hold !== null;

  const ask = (kind: TransferKind, amount: number | null) => {
    if (amount === null || busy) return;
    setRequest({ kind, amount, transferId: newTransferId() });
  };

  const finish = (done: ArcadeTransfer | null) => {
    setRequest(null);
    if (!done) return;
    if (done.kind === "deposit") setDepositText("");
    else setWithdrawText("");
    setAnnounce(
      `${done.kind === "deposit" ? "Deposited" : "Withdrew"} ${fmt(done.amount)} points. Profile ${fmt(done.profileAfter)}, arcade ${fmt(done.arcadeAfter)}.`,
    );
  };

  return (
    <section className="arcade-wallet" aria-labelledby="arcade-wallet-title">
      <PageHeader
        id="arcade-wallet-title"
        title="Wallet"
        description="Move points between your HackUTA profile and the arcade. The games only use your arcade points, and you can take them back whenever you like."
      />

      <div className="participant-portal__inner arcade-wallet__inner">
        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>

        <div className="arcade-wallet__balances">
          <div className="participant-dashboard__panel arcade-wallet__balance">
            <span className="arcade-wallet__balance-label">Profile points</span>
            <strong className="arcade-wallet__balance-value">{fmt(profilePoints)}</strong>
            <span className="arcade-wallet__balance-note">On your HackUTA profile, for the shop and the leaderboard.</span>
          </div>
          <div className="participant-dashboard__panel arcade-wallet__balance arcade-wallet__balance--arcade">
            <span className="arcade-wallet__balance-label">Arcade points</span>
            <strong className="arcade-wallet__balance-value">{fmt(arcadePoints)}</strong>
            <span className="arcade-wallet__balance-note">What the games bet. Winnings land here.</span>
          </div>
        </div>

        {busy ? (
          <div className="participant-dashboard__notice" role="status">
            <p className="participant-dashboard__notice-copy">Finish your spin first. Deposits and withdrawals open again as soon as the result is shown.</p>
          </div>
        ) : null}

        <div className="arcade-wallet__forms">
          <form
            className="participant-dashboard__panel arcade-wallet__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!depositProblem) ask("deposit", depositAmount);
            }}
          >
            <h2 className="participant-dashboard__panel-title">Deposit</h2>
            <p className="participant-dashboard__panel-copy">Profile points → arcade points. Up to {MAX_TRANSFER} at a time.</p>
            <div className="arcade-wallet__presets" role="group" aria-label="Quick amounts">
              {PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={`arcade-wallet__preset${depositAmount === amount ? " is-active" : ""}`}
                  onClick={() => setDepositText(String(amount))}
                  disabled={!arcadeOpen || busy || amount > profilePoints}
                >
                  {amount}
                </button>
              ))}
            </div>
            <label className="arcade-wallet__label" htmlFor="arcade-deposit-amount">
              Amount
            </label>
            <input
              id="arcade-deposit-amount"
              className="arcade-wallet__input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 50"
              value={depositText}
              onChange={(event) => setDepositText(event.target.value)}
              disabled={!arcadeOpen || busy}
              aria-invalid={depositProblem ? true : undefined}
              aria-describedby="arcade-deposit-help"
            />
            <p id="arcade-deposit-help" className={`arcade-wallet__help${depositProblem ? " is-error" : ""}`}>
              {!arcadeOpen ? TRANSFER_ERROR_TEXT.ARCADE_CLOSED : depositProblem ? TRANSFER_ERROR_TEXT[depositProblem] : `You have ${fmt(profilePoints)} profile points.`}
            </p>
            <button type="submit" className="participant-dashboard__cta participant-dashboard__cta--block" disabled={!arcadeOpen || busy || depositAmount === null || depositProblem !== null}>
              Deposit{depositAmount && !depositProblem ? ` ${fmt(depositAmount)}` : ""}
            </button>
          </form>

          <form
            className="participant-dashboard__panel arcade-wallet__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!withdrawProblem) ask("withdraw", withdrawAmount);
            }}
          >
            <h2 className="participant-dashboard__panel-title">Withdraw</h2>
            <p className="participant-dashboard__panel-copy">Arcade points → profile points. Works even after the arcade closes.</p>
            <div className="arcade-wallet__presets">
              <button
                type="button"
                className="arcade-wallet__preset"
                onClick={() => setWithdrawText(String(Math.min(arcadePoints, MAX_TRANSFER)))}
                disabled={busy || arcadePoints === 0}
              >
                {arcadePoints > MAX_TRANSFER ? `Withdraw ${MAX_TRANSFER}` : "Withdraw all"}
              </button>
            </div>
            <label className="arcade-wallet__label" htmlFor="arcade-withdraw-amount">
              Amount
            </label>
            <input
              id="arcade-withdraw-amount"
              className="arcade-wallet__input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 50"
              value={withdrawText}
              onChange={(event) => setWithdrawText(event.target.value)}
              disabled={busy}
              aria-invalid={withdrawProblem ? true : undefined}
              aria-describedby="arcade-withdraw-help"
            />
            <p id="arcade-withdraw-help" className={`arcade-wallet__help${withdrawProblem ? " is-error" : ""}`}>
              {withdrawProblem ? TRANSFER_ERROR_TEXT[withdrawProblem] : `You have ${fmt(arcadePoints)} arcade points.`}
            </p>
            <button type="submit" className="participant-dashboard__cta participant-dashboard__cta--block" disabled={busy || withdrawAmount === null || withdrawProblem !== null}>
              Withdraw{withdrawAmount && !withdrawProblem ? ` ${fmt(withdrawAmount)}` : ""}
            </button>
          </form>
        </div>

        <section className="participant-dashboard__section arcade-wallet__log" aria-labelledby="arcade-wallet-log-title">
          <h2 id="arcade-wallet-log-title" className="participant-dashboard__section-title">
            Transfer log
          </h2>
          {wallet.transfers.length === 0 ? (
            <p className="participant-dashboard__panel-copy">No transfers yet. Deposit some points to start playing.</p>
          ) : (
            <div className="arcade-wallet__table-wrap">
              <table className="arcade-wallet__table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="is-num">Amount</th>
                    <th scope="col" className="is-num">Profile</th>
                    <th scope="col" className="is-num">Arcade</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.transfers.map((t) => (
                    <tr key={t.transferId}>
                      <td>{formatClock(t.createdAt)}</td>
                      <td>
                        <span className={`arcade-wallet__kind arcade-wallet__kind--${t.kind}`}>{t.kind === "deposit" ? "Deposit" : "Withdraw"}</span>
                      </td>
                      <td className="is-num">{fmt(t.amount)}</td>
                      <td className="is-num">
                        {fmt(t.profileBefore)} → {fmt(t.profileAfter)}
                      </td>
                      <td className="is-num">
                        {fmt(t.arcadeBefore)} → {fmt(t.arcadeAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmTransferDialog
        request={request}
        profilePoints={profilePoints}
        arcadePoints={arcadePoints}
        onConfirm={() => mockTransfer(request!.kind, request!.amount, request!.transferId, { arcadeOpen })}
        onClose={finish}
      />
    </section>
  );
}
