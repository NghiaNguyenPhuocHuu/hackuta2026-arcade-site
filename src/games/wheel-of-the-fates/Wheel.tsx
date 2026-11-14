import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { POCKET_COUNT, WHEEL_ORDER, pocketColor } from "../../../shared/roulette/rules";

/**
 * The wheel. It only shows a result: `land(pocket)` slows the wheel and the
 * ball so they stop together with the ball in the pocket the server picked.
 *
 * Both slow down on an ease-out-cubic curve over the same time T, starting at
 * their current speeds (no jump). The ball ends in the pocket when
 *   (wheelSpeed + ballSpeed)·T/3 ≡ ball − wheel − pocketAngle  (mod 360°),
 * so T is the shortest such time above a minimum (see `landingTime`).
 */

export type WheelHandle = {
  /** Start spinning (wheel clockwise, ball the other way along the rim). */
  start(): void;
  /** Slow down and stop with the ball in `pocket`; null stops without a result. Resolves when still. */
  land(pocket: number | null): Promise<void>;
};

const STEP = 360 / POCKET_COUNT;
const R_RIM_OUT = 98;
const R_TRACK = 92;
const R_POCKET_OUT = 86;
const R_POCKET_IN = 62;
const R_NUMBER = 77;
const R_BALL_REST = 67.5;

type Pace = { wheel: number; ball: number; accel: number; minSpinMs: number; minLand: number };
// Normal: about 1.4 s at full speed, then 5.2–6.9 s slowing down. Fast mode is for quick players.
const NORMAL: Pace = { wheel: 150, ball: 480, accel: 0.6, minSpinMs: 1400, minLand: 5.2 };
const FAST: Pace = { wheel: 220, ball: 700, accel: 0.2, minSpinMs: 300, minLand: 1.2 };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Angle (clockwise from top) of a pocket on the wheel itself. */
export function pocketAngle(pocket: number): number {
  return WHEEL_ORDER.indexOf(pocket) * STEP;
}

/** Landing time T ≥ minimum for which ball and pocket meet (see file comment). */
export function landingTime(wheelAngle: number, ballAngle: number, wheelSpeed: number, ballSpeed: number, pocket: number, minimum: number) {
  const sum = wheelSpeed + ballSpeed;
  const gap = mod(ballAngle - wheelAngle - pocketAngle(pocket), 360);
  let t = (3 * gap) / sum;
  while (t < minimum) t += (3 * 360) / sum;
  return t;
}

const polar = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`;
};

function wedgePath(index: number) {
  const a0 = index * STEP - STEP / 2;
  const a1 = index * STEP + STEP / 2;
  return `M${polar(R_POCKET_OUT, a0)}A${R_POCKET_OUT} ${R_POCKET_OUT} 0 0 1 ${polar(R_POCKET_OUT, a1)}L${polar(R_POCKET_IN, a1)}A${R_POCKET_IN} ${R_POCKET_IN} 0 0 0 ${polar(R_POCKET_IN, a0)}Z`;
}

type Props = {
  fast: boolean;
  reducedMotion: boolean;
  /** Pocket to glow (after a landing) and to rest the ball in on first render. */
  hit: number | null;
  /** The ball passed a pocket divider; strength 0–1 (louder once it drops into the pockets). */
  onTick?: (strength: number) => void;
};

export const Wheel = forwardRef<WheelHandle, Props>(function Wheel({ fast, reducedMotion, hit, onTick }, ref) {
  const wheelEl = useRef<SVGGElement>(null);
  const ballEl = useRef<SVGCircleElement>(null);
  const pace = fast ? FAST : NORMAL;
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const motionRef = useRef(reducedMotion);
  motionRef.current = reducedMotion;
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  const sim = useRef({
    wheel: 0,
    ball: 0,
    radius: R_BALL_REST,
    vWheel: 0,
    vBall: 0,
    mode: "idle" as "idle" | "spin" | "land",
    startedAt: 0,
    last: 0,
    landing: null as null | { t0: number; T: number; w0: number; b0: number; dw: number; db: number; r0: number; drop: boolean; done: () => void },
    raf: 0,
    ballVisible: hit !== null,
    lastPocket: 0,
    lastTickAt: 0,
  });

  const draw = () => {
    const s = sim.current;
    wheelEl.current?.setAttribute("transform", `rotate(${s.wheel.toFixed(3)})`);
    if (ballEl.current) {
      ballEl.current.setAttribute("transform", `rotate(${s.ball.toFixed(3)}) translate(0 ${(-s.radius).toFixed(3)})`);
      ballEl.current.style.opacity = s.ballVisible ? "1" : "0";
    }
  };

  // Rest the ball in the last pocket on first render.
  useEffect(() => {
    const s = sim.current;
    if (hit !== null && s.mode === "idle") {
      s.ball = pocketAngle(hit) + s.wheel;
      s.radius = R_BALL_REST;
      s.ballVisible = true;
    }
    draw();
    return () => cancelAnimationFrame(sim.current.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = (now: number) => {
    const s = sim.current;
    const p = paceRef.current;
    const dt = Math.min(0.05, Math.max(0, (now - s.last) / 1000));
    s.last = now;
    if (s.mode === "spin") {
      s.vWheel = Math.min(p.wheel, s.vWheel + (p.wheel * dt) / p.accel);
      s.vBall = Math.min(p.ball, s.vBall + (p.ball * dt) / p.accel);
      s.wheel += s.vWheel * dt;
      s.ball -= s.vBall * dt;
      // The ball rises from its pocket onto the rim as the spin starts.
      s.radius = Math.min(R_TRACK, s.radius + 60 * dt);
    } else if (s.mode === "land" && s.landing) {
      const l = s.landing;
      const u = Math.min(1, (now - l.t0) / 1000 / l.T);
      const e = 1 - (1 - u) ** 3;
      s.wheel = l.w0 + l.dw * e;
      s.ball = l.b0 - l.db * e;
      if (l.drop && u > 0.55) {
        const k = (u - 0.55) / 0.45;
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        s.radius = l.r0 + (R_BALL_REST - l.r0) * ease;
      }
      if (u >= 1) {
        s.mode = "idle";
        s.vWheel = 0;
        s.vBall = 0;
        s.wheel = mod(s.wheel, 360);
        s.ball = mod(s.ball, 360);
        s.landing = null;
        draw();
        l.done();
        return;
      }
    }
    // A tick each time the ball passes a pocket divider (at most ~22 a second).
    const crossed = Math.floor((s.ball - s.wheel) / STEP);
    if (crossed !== s.lastPocket) {
      s.lastPocket = crossed;
      if (now - s.lastTickAt > 45) {
        s.lastTickAt = now;
        tickRef.current?.(s.radius < R_TRACK - 4 ? 1 : 0.3);
      }
    }
    draw();
    if (s.mode !== "idle") s.raf = requestAnimationFrame(frame);
  };

  useImperativeHandle(ref, () => ({
    start() {
      const s = sim.current;
      cancelAnimationFrame(s.raf);
      s.ballVisible = true;
      if (motionRef.current) {
        s.mode = "idle";
        draw();
        return;
      }
      s.mode = "spin";
      s.startedAt = performance.now();
      s.last = s.startedAt;
      s.raf = requestAnimationFrame(frame);
    },
    land(pocket) {
      const s = sim.current;
      return new Promise<void>((resolve) => {
        if (motionRef.current || (s.mode !== "spin" && s.mode !== "land")) {
          // Reduced motion (or not spinning): show the result at once.
          cancelAnimationFrame(s.raf);
          s.mode = "idle";
          if (pocket !== null) {
            s.ball = pocketAngle(pocket) + s.wheel;
            s.radius = R_BALL_REST;
            s.ballVisible = true;
          }
          draw();
          resolve();
          return;
        }
        const begin = () => {
          const p = paceRef.current;
          const now = performance.now();
          const vw = Math.max(s.vWheel, 1);
          const vb = Math.max(s.vBall, 1);
          const T = pocket === null ? p.minLand * 0.6 : landingTime(s.wheel, s.ball, vw, vb, pocket, p.minLand);
          s.landing = {
            t0: now,
            T,
            w0: s.wheel,
            b0: s.ball,
            dw: (vw * T) / 3,
            db: (vb * T) / 3,
            r0: s.radius,
            drop: pocket !== null,
            done: resolve,
          };
          s.mode = "land";
        };
        const wait = paceRef.current.minSpinMs - (performance.now() - s.startedAt);
        if (wait > 0) setTimeout(begin, wait);
        else begin();
      });
    },
  }));

  const wedges = useMemo(
    () =>
      WHEEL_ORDER.map((pocket, index) => {
        const angle = index * STEP;
        return (
          <g key={pocket}>
            <path d={wedgePath(index)} className={`wof-wedge wof-wedge--${pocketColor(pocket)}${hit === pocket ? " is-hit" : ""}`} />
            <text className="wof-wedge__num" transform={`rotate(${angle}) translate(0 ${-R_NUMBER})`} textAnchor="middle" dominantBaseline="central">
              {pocket}
            </text>
          </g>
        );
      }),
    [hit],
  );

  return (
    <svg className="wof-wheel" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
      <circle r={R_RIM_OUT} className="wof-wheel__rim" />
      <circle r={R_TRACK + 3} className="wof-wheel__track" />
      <g ref={wheelEl}>
        <circle r={R_POCKET_OUT + 1} className="wof-wheel__divider" />
        {wedges}
        <circle r={R_POCKET_IN} className="wof-wheel__cone" />
        {[0, 45, 90, 135].map((a) => (
          <path key={a} d={`M${polar(16, a)}L${polar(56, a)}M${polar(16, a + 180)}L${polar(56, a + 180)}`} className="wof-wheel__spoke" />
        ))}
        <circle r={22} className="wof-wheel__ring" />
        <circle r={14} className="wof-wheel__hub" />
        <path d="M0 -8L2.4 -2.4L8 0L2.4 2.4L0 8L-2.4 2.4L-8 0L-2.4 -2.4Z" className="wof-wheel__star" />
      </g>
      <circle ref={ballEl} r={4.2} className="wof-wheel__ball" />
    </svg>
  );
});
