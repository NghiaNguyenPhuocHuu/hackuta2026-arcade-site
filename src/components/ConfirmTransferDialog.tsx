import { useEffect, useRef, useState } from "react";
import { balancesAfter, type TransferErrorCode, type TransferKind } from "../../shared/arcade/rules";
import type { ArcadeTransfer, TransferResponse } from "../convex/arcadeApi";

/** What each refusal means for the hacker, and what to do about it. */
export const TRANSFER_ERROR_TEXT: Readonly<Record<TransferErrorCode, string>> = {
  NOT_SIGNED_IN: "You're signed out. Open the arcade from your HackUTA profile and try again.",
  NOT_PARTICIPANT: "This account isn't a HackUTA participant, so it has no points to move.",
  NOT_ELIGIBLE: "Only accepted hackers can move points into the arcade.",
  NOT_CHECKED_IN: "Check in at the event first. Your points arrive with your badge.",
  ARCADE_CLOSED: "Deposits open when the arcade does. You can still withdraw any time.",
  INVALID_TRANSFER_ID: "Something went wrong with this request. Close this and try again.",
  INVALID_AMOUNT: "Enter a whole number of points, from 1 to 500.",
  INSUFFICIENT_POINTS: "You don't have that many profile points.",
  INSUFFICIENT_ARCADE_POINTS: "You don't have that many arcade points.",
};

type Props = {
  /** The transfer to confirm, or null when the dialog is closed. */
  request: { kind: TransferKind; amount: number } | null;
  profilePoints: number;
  arcadePoints: number;
  /** Runs the transfer. Called once per confirm; the dialog shows the pending state meanwhile. */
  onConfirm: () => Promise<TransferResponse>;
  /** Closes the dialog: with the finished transfer, or null when cancelled. */
  onClose: (done: ArcadeTransfer | null) => void;
};

/**
 * "Deposit 50 points?" with both balances before and after. A native modal
 * <dialog>: focus stays inside, Esc cancels (except while the request runs),
 * and the page behind can't be clicked.
 */
export function ConfirmTransferDialog({ request, profilePoints, arcadePoints, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setError(null);
      setPending(false);
      dialog.showModal();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  if (!request) return <dialog ref={ref} className="arcade-confirm-dialog" aria-labelledby="arcade-confirm-title" />;

  const deposit = request.kind === "deposit";
  const after = balancesAfter(request.kind, request.amount, profilePoints, arcadePoints);
  const verb = deposit ? "Deposit" : "Withdraw";

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    let result: TransferResponse;
    try {
      result = await onConfirm();
    } catch {
      setPending(false);
      setError("The request didn't go through. Check your connection and try again.");
      return;
    }
    setPending(false);
    if (result.status === "ok") onClose(result.transfer);
    else setError(TRANSFER_ERROR_TEXT[result.code] ?? "That didn't work. Try again.");
  };

  return (
    <dialog
      ref={ref}
      className="arcade-confirm-dialog"
      aria-labelledby="arcade-confirm-title"
      aria-describedby="arcade-confirm-copy"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose(null);
      }}
    >
      <h2 id="arcade-confirm-title" className="arcade-confirm-dialog__title">
        {verb} {request.amount.toLocaleString("en-US")} points?
      </h2>
      <p id="arcade-confirm-copy" className="arcade-confirm-dialog__copy">
        {deposit
          ? "These points leave your HackUTA profile and go into your arcade balance, where the games can use them."
          : "These points leave your arcade balance and go back onto your HackUTA profile."}
      </p>
      <dl className="arcade-confirm-dialog__balances">
        <div>
          <dt>Profile points</dt>
          <dd>
            {profilePoints.toLocaleString("en-US")} <span aria-hidden="true">→</span>
            <span className="visually-hidden"> becomes </span> <strong>{after.profile.toLocaleString("en-US")}</strong>
          </dd>
        </div>
        <div>
          <dt>Arcade points</dt>
          <dd>
            {arcadePoints.toLocaleString("en-US")} <span aria-hidden="true">→</span>
            <span className="visually-hidden"> becomes </span> <strong>{after.arcade.toLocaleString("en-US")}</strong>
          </dd>
        </div>
      </dl>
      {error ? (
        <p className="arcade-confirm-dialog__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="arcade-confirm-dialog__actions">
        <button type="button" className="arcade-confirm-dialog__cancel" onClick={() => onClose(null)} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="participant-dashboard__cta" onClick={confirm} disabled={pending} autoFocus>
          {pending ? (deposit ? "Depositing…" : "Withdrawing…") : `${verb} ${request.amount.toLocaleString("en-US")}`}
        </button>
      </div>
    </dialog>
  );
}
