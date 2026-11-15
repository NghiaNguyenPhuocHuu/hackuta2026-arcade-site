import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointsRevealPort } from "../types";
import { checkBets, pocketColor, winningBetIds, type PlacedBet } from "../../../shared/roulette/rules";
import { hackerFrame } from "../olympus-slots/hacker";
import { Board, Chip, type Orientation } from "./Board";
import { CLOSED, INTRO, SPINNING, errorLine, pocketName, resultLine, type Line } from "./dialogue";
import { omenFor, type Omen } from "./omens";
import { Sfx } from "./sound";
import { TABLE_CLOTHS, WHEEL_SKINS, loadSettings, saveSettings, type RouletteSettings } from "./themes";
import type { RouletteAdapter, RouletteSpin, RouletteState } from "./types";
import { Wheel, maxRevealMs, type WheelHandle } from "./Wheel";

type Bets = Readonly<Record<string, number>>;

const toList = (bets: Bets): PlacedBet[] => Object.entries(bets).map(([betId, amount]) => ({ betId, amount }));
const fromList = (bets: readonly PlacedBet[]): Bets => Object.fromEntries(bets.map((b) => [b.betId, b.amount]));
const newSpinId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `spin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function usePrefersReducedMotion() {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  return useSyncExternalStore(
    (cb) => {
      query?.addEventListener("change", cb);
      return () => query?.removeEventListener("change", cb);
    },
    () => query?.matches ?? false,
  );
}

/** "tall" table layout when the game is narrower than this. */
const TALL_BELOW = 640;

/** No arcade around it (tests, previews): nothing to hold. */
const NO_REVEAL: PointsRevealPort = { hold() {}, release() {} };
/** Until the server answers, hold for at most this long (a stuck request shouldn't hide points forever). */
const ANSWER_WAIT_MS = 15_000;

export function RouletteGame({ adapter, points = NO_REVEAL }: { adapter: RouletteAdapter; points?: PointsRevealPort }) {
  const live = useSyncExternalStore(adapter.subscribe, adapter.getState);
  const reducedMotion = usePrefersReducedMotion();
  const [settings, setSettings] = useState<RouletteSettings>(loadSettings);
  const [chip, setChip] = useState(live.limits.chips[1] ?? live.limits.chips[0]!);
  const [bets, setBets] = useState<Bets>({});
  const [undo, setUndo] = useState<Bets[]>([]);
  const [lastBets, setLastBets] = useState<Bets | null>(() => (live.history[0] ? fromList(live.history[0].bets) : null));
  const [spinning, setSpinning] = useState(false);
  /** The state shown while the wheel turns, so the new balance isn't revealed early. */
  const [frozen, setFrozen] = useState<RouletteState | null>(null);
  const [result, setResult] = useState<RouletteSpin | null>(null);
  const [line, setLine] = useState<Line>(live.status === "live" ? INTRO : CLOSED);
  const [announce, setAnnounce] = useState("");
  const [themesOpen, setThemesOpen] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("wide");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  /** The god or demon on screen after a spin. */
  const [omen, setOmen] = useState<(Omen & { id: number }) | null>(null);
  const [, setTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const wheelBoxRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<WheelHandle>(null);
  const mounted = useRef(true);
  const sfxRef = useRef<Sfx | null>(null);
  if (!sfxRef.current) sfxRef.current = new Sfx();
  const sfx = sfxRef.current;
  sfx.enabled = settings.sound;
  useEffect(
    () => () => {
      mounted.current = false;
      sfxRef.current?.dispose();
    },
    [],
  );

  // The god or demon leaves after a few seconds.
  useEffect(() => {
    if (!omen) return;
    const id = window.setTimeout(() => setOmen((current) => (current?.id === omen.id ? null : current)), omen.big ? 4200 : 3400);
    return () => window.clearTimeout(id);
  }, [omen]);

  // Table layout follows the game's own width (it lives inside the arcade page).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const apply = () => setOrientation(el.clientWidth < TALL_BELOW ? "tall" : "wide");
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => saveSettings(settings), [settings]);

  // Re-render when the cooldown ends so SPIN comes back.
  useEffect(() => {
    const wait = cooldownUntil - Date.now();
    if (wait <= 0) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), wait + 20);
    return () => window.clearTimeout(id);
  }, [cooldownUntil]);

  useEffect(() => {
    if (live.status !== "live" && !spinning) setLine(CLOSED);
  }, [live.status, spinning]);

  const shown = frozen ?? live;
  const list = useMemo(() => toList(bets), [bets]);
  const stake = list.reduce((s, b) => s + b.amount, 0);
  const check = useMemo(() => (list.length ? checkBets(list, { balance: live.balance, lossToday: live.lossToday }, live.limits) : null), [list, live]);
  const bestWin = check?.ok ? check.bestReturn : 0;
  const balance = spinning && frozen ? frozen.balance - stake : shown.balance;
  const winning = useMemo(() => new Set(result ? winningBetIds(result.bets, result.pocket) : []), [result]);
  const isLive = live.status === "live";
  const coolingDown = Date.now() < cooldownUntil;
  const limits = live.limits;
  const lossLeft = limits.dailyLossLimit > 0 ? Math.max(0, limits.dailyLossLimit - shown.lossToday) : null;

  /** Apply a new set of bets if the rules allow it; otherwise Techno explains why. */
  const tryBets = useCallback(
    (next: Bets) => {
      const nextList = toList(next);
      if (nextList.length) {
        const verdict = checkBets(nextList, { balance: live.balance, lossToday: live.lossToday }, live.limits);
        if (!verdict.ok) {
          setLine(errorLine(verdict.code, live.limits));
          sfx.error();
          return false;
        }
      }
      setOmen(null);
      setUndo((stack) => [...stack.slice(-49), bets]);
      setBets(next);
      setResult(null);
      return true;
    },
    [bets, live],
  );

  const place = (betId: string) => {
    if (spinning || !isLive) return;
    sfx.unlock();
    if (tryBets({ ...bets, [betId]: (bets[betId] ?? 0) + chip })) sfx.chip();
  };

  const onUndo = () => {
    const previous = undo.at(-1);
    if (!previous || spinning) return;
    setUndo((stack) => stack.slice(0, -1));
    setBets(previous);
    setResult(null);
  };
  const onClear = () => !spinning && list.length > 0 && tryBets({});
  const onRepeat = () => !spinning && lastBets && tryBets(lastBets);
  const onDouble = () => !spinning && list.length > 0 && tryBets(Object.fromEntries(list.map((b) => [b.betId, b.amount * 2])));

  const spin = async () => {
    if (spinning || !isLive) return;
    sfx.unlock();
    const verdict = checkBets(list, { balance: live.balance, lossToday: live.lossToday }, live.limits);
    if (!verdict.ok) {
      setLine(errorLine(verdict.code, live.limits));
      sfx.error();
      return;
    }
    setOmen(null);
    sfx.spinStart();
    setSpinning(true);
    setFrozen(live);
    // Keep the rest of the arcade on "stake taken" until the ball lands.
    points.hold(live.balance - verdict.stake, ANSWER_WAIT_MS);
    setResult(null);
    setLine(SPINNING);
    setAnnounce("The wheel is spinning.");
    setCooldownUntil(Date.now() + limits.cooldownMs);
    // On phones the table is below the wheel: bring the wheel into view.
    const box = wheelBoxRef.current?.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > window.innerHeight)) {
      wheelBoxRef.current?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    }
    wheelRef.current?.start();

    let outcome;
    try {
      outcome = await adapter.spin({ spinId: newSpinId(), bets: verdict.bets });
    } catch {
      outcome = { status: "error" as const, code: "ERROR" as const };
    }
    if (outcome.status === "error") {
      points.release();
      await wheelRef.current?.land(null);
      if (!mounted.current) return;
      setLine(errorLine(outcome.code, live.limits, outcome.retryAfterMs));
      sfx.error();
      setAnnounce("");
      setFrozen(null);
      setSpinning(false);
      return;
    }
    // The answer is in: hold only as long as the landing can take (also if the player leaves now).
    points.hold(live.balance - verdict.stake, reducedMotion ? 0 : maxRevealMs(settings.fast));
    await wheelRef.current?.land(outcome.spin.pocket);
    if (!mounted.current) return;
    points.release();
    sfx.clack();
    const said = resultLine(outcome.spin);
    const appears = omenFor(outcome.spin);
    setOmen({ ...appears, id: Date.now() });
    window.setTimeout(() => {
      if (appears.kind === "god") sfx.god(appears.big);
      else if (appears.kind === "demon") sfx.demon(appears.big);
      else sfx.even();
    }, 140);
    setResult(outcome.spin);
    setLastBets(fromList(outcome.spin.bets));
    setLine(said);
    const net = outcome.spin.net;
    setAnnounce(`${pocketName(outcome.spin.pocket)}. ${appears.name}: ${appears.quote} ${net > 0 ? `You won ${net} points.` : net < 0 ? `You lost ${-net} points.` : "Your stake comes back."}`);
    setFrozen(null);
    setSpinning(false);
  };

  const spinLabel = !isLive ? "SEALED" : spinning ? "SPINNING..." : coolingDown ? "SETTLING..." : "SPIN";
  const lastHit = result?.pocket ?? (spinning ? null : (shown.history[0]?.pocket ?? null));
  const portrait = useMemo(() => hackerFrame(line.mood, { still: true }).svg, [line.mood]);

  return (
    <div ref={rootRef} className={`wof wof--${orientation}`} data-wheel={settings.wheel} data-table={settings.table}>
      <div className="wof__stars" aria-hidden="true" />

      <header className="wof__header">
        <div>
          <h2 className="wof__title">WHEEL OF THE FATES</h2>
          <p className="wof__tagline">Clotho spins. Lachesis measures. Atropos cuts.</p>
        </div>
        <div className="wof__status">
          <button
            type="button"
            className="wof-btn wof-btn--ghost"
            aria-pressed={settings.sound}
            onClick={() => {
              const sound = !settings.sound;
              setSettings((s) => ({ ...s, sound }));
              sfx.enabled = sound;
              if (sound) {
                sfx.unlock();
                sfx.chip();
              }
            }}
          >
            {settings.sound ? "SOUND ON" : "SOUND OFF"}
          </button>
          <button
            type="button"
            className="wof-btn wof-btn--ghost"
            aria-expanded={themesOpen}
            aria-controls="wof-themes"
            onClick={() => setThemesOpen((open) => !open)}
          >
            THEMES
          </button>
          <span className={`wof__badge wof__badge--${isLive ? "live" : "closed"}`}>
            <span className="wof__badge-dot" aria-hidden="true" />
            {isLive ? "LIVE" : "SEALED"}
          </span>
        </div>
      </header>

      {themesOpen ? (
        <section id="wof-themes" className="wof-themes" aria-label="Themes">
          <ThemeGroup
            legend="Wheel"
            options={WHEEL_SKINS}
            value={settings.wheel}
            onChange={(wheel) => setSettings((s) => ({ ...s, wheel }))}
          />
          <ThemeGroup
            legend="Table"
            options={TABLE_CLOTHS}
            value={settings.table}
            onChange={(table) => setSettings((s) => ({ ...s, table }))}
          />
          <ThemeGroup
            legend="Spin"
            options={[
              { id: "normal", name: "Normal" },
              { id: "fast", name: "Fast" },
            ]}
            value={settings.fast ? "fast" : "normal"}
            onChange={(speed) => setSettings((s) => ({ ...s, fast: speed === "fast" }))}
          />
        </section>
      ) : null}

      <div className="wof__stage" ref={wheelBoxRef}>
        <div className="wof__wheel">
          <Wheel
            ref={wheelRef}
            fast={settings.fast}
            reducedMotion={reducedMotion}
            hit={spinning ? null : lastHit}
            onTick={(strength) => sfx.tick(strength)}
          />
          {omen ? <OmenPopup key={omen.id} omen={omen} onDismiss={() => setOmen(null)} /> : null}
        </div>
        <div className={`wof__readout${result ? ` wof__readout--${pocketColor(result.pocket)}` : ""}`} aria-hidden="true">
          {spinning ? (
            <span className="wof__readout-wait">THE FATES DECIDE...</span>
          ) : result ? (
            <>
              <span className="wof__readout-num">{result.pocket}</span>
              <span className="wof__readout-net">{result.net > 0 ? `+${result.net} pts` : result.net < 0 ? `${result.net} pts` : "Even"}</span>
            </>
          ) : (
            <span className="wof__readout-wait">LAY YOUR CHIPS</span>
          )}
        </div>
      </div>

      <div className="wof__dialog">
        <span className="wof__nametag" aria-hidden="true">
          TECHNO
        </span>
        <span className="wof__portrait" aria-hidden="true" dangerouslySetInnerHTML={{ __html: portrait }} />
        <div>
          <p className={`wof__dialog-title wof__dialog-title--${line.tone}`}>{line.title}</p>
          <p className="wof__dialog-line">{line.line}</p>
        </div>
      </div>
      <p className="wof__sr" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      <Board orientation={orientation} bets={bets} winning={winning} hit={spinning ? null : (result?.pocket ?? null)} disabled={spinning || !isLive} onPlace={place} />

      <section className="wof__history" aria-label="Last numbers">
        <p className="wof__label">LAST THREADS</p>
        {shown.history.length ? (
          <ol className="wof__history-list">
            {shown.history.map((s) => (
              <li key={s.spinId} className={`wof__history-item wof__history-item--${pocketColor(s.pocket)}`} title={pocketName(s.pocket)}>
                <span className="wof__sr">{pocketName(s.pocket)}</span>
                <span aria-hidden="true">{s.pocket}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wof__history-empty">No threads cut yet.</p>
        )}
      </section>

      <aside className="wof__panel" aria-label="Bets and spin">
        <dl className="wof__stats">
          <div>
            <dt>BALANCE</dt>
            <dd className="wof__balance">
              <span className="wof__coin" aria-hidden="true" />
              {balance}
            </dd>
          </div>
          <div>
            <dt>BET</dt>
            <dd>
              {stake}
              <small>/{limits.maxStakePerSpin}</small>
            </dd>
          </div>
          <div>
            <dt>BEST WIN</dt>
            <dd>{bestWin}</dd>
          </div>
        </dl>

        <div className="wof__controls">
          <div className="wof__chips" role="radiogroup" aria-label="Chip value">
            {limits.chips.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={chip === value}
                aria-label={`${value} point chip`}
                className={`wof-chip-btn${chip === value ? " is-active" : ""}`}
                onClick={() => setChip(value)}
              >
                <Chip amount={value} />
              </button>
            ))}
          </div>
          <div className="wof__actions">
            <ActionButton label="Undo" text="UNDO" icon="undo" onClick={onUndo} disabled={spinning || undo.length === 0} />
            <ActionButton label="Clear all bets" text="CLEAR" icon="clear" onClick={onClear} disabled={spinning || list.length === 0} />
            <ActionButton label="Repeat last bets" text="REPEAT" icon="repeat" onClick={onRepeat} disabled={spinning || !lastBets || list.length > 0} />
            <ActionButton label="Double all bets" text="×2" icon="double" onClick={onDouble} disabled={spinning || list.length === 0} />
          </div>
        </div>

        <button
          type="button"
          className="wof-spin"
          onClick={spin}
          disabled={!isLive || spinning || coolingDown || list.length === 0}
          aria-label={isLive && !spinning && list.length ? `Spin with ${stake} points bet` : spinLabel.toLowerCase()}
        >
          {spinLabel}
        </button>

        <p className="wof__limits">
          Max {limits.maxStakePerSpin} a spin · {limits.maxStraightStake} on one number · {limits.maxPayoutPerSpin} best win
          {lossLeft !== null ? ` · ${lossLeft} left before today's loss limit` : ""}
        </p>
      </aside>
    </div>
  );
}

/** A god (win), demon (loss) or Odysseus (stake back) rising over the wheel. */
function OmenPopup({ omen, onDismiss }: { omen: Omen; onDismiss(): void }) {
  return (
    <div className={`wof-omen wof-omen--${omen.kind}${omen.big ? " wof-omen--big" : ""}`} aria-hidden="true" onClick={onDismiss}>
      <span className="wof-omen__aura" />
      <span className="wof-omen__sprite" dangerouslySetInnerHTML={{ __html: omen.svg }} />
      <span className="wof-omen__bubble">
        <span className="wof-omen__name">{omen.name.toUpperCase()}</span>
        <span className="wof-omen__quote">{omen.quote}</span>
      </span>
    </div>
  );
}

/** Icons for the phone bar, where the words don't fit. 24×24 strokes. */
const ICONS = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  clear: "M6 6l12 12M18 6 6 18",
  repeat: "M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
} as const;

function ActionButton({
  label,
  text,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  text: string;
  icon: keyof typeof ICONS | "double";
  onClick(): void;
  disabled: boolean;
}) {
  return (
    <button type="button" className="wof-btn wof-btn--action" onClick={onClick} disabled={disabled} aria-label={label}>
      <span className="wof-btn__text" aria-hidden="true">
        {text}
      </span>
      {icon === "double" ? (
        <span className="wof-btn__icon wof-btn__icon--text" aria-hidden="true">
          ×2
        </span>
      ) : (
        <svg className="wof-btn__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d={ICONS[icon]} stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      )}
    </button>
  );
}

function ThemeGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { id: T; name: string }[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="wof-themes__group">
      <legend>{legend}</legend>
      <div className="wof-themes__options">
        {options.map((option) => (
          <label key={option.id} className={`wof-themes__option${value === option.id ? " is-active" : ""}`}>
            <input type="radio" name={`wof-${legend}`} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            <span className={`wof-themes__swatch wof-themes__swatch--${option.id}`} aria-hidden="true" />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
