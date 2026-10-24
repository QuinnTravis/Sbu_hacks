import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { FINISHES, GAUGE_STYLES, INDICATORS } from '../../data/catalog';
import type { EngineCondition } from '../../lib/metrics';
import type { PulseKind } from '../../state/store';
import type { Equipped, IndicatorId } from '../../types';
import { Dial, gearPath, Rivets } from './parts';

/*
  The engine is drawn as a general-arrangement drawing (viewBox units ≈ px at desktop width).
  Only parts that would really move are animated: the crank train, the gears and belt,
  the flyball governor, the pressure needle, and steam — which is released once per
  exhaust stroke, so a still engine makes no steam at all.
*/

const FW = { x: 830, y: 360, r: 88 }; // flywheel
const CRANK = 32;
const ROD = 120;
const PISTON_OFFSET = 100;
const GA = { x: 640, y: 205 };
const GB = { x: 690, y: 156 };
const GOV = { x: 230, top: 146, arm: 50 };
const STACK = { x: 447, y: 54 };
const VALVE = { x: 340, y: 124 };
const TOWER = { x1: 100, x2: 160, top: 180, bottom: 430 };
const GROUND = 486;
const LINE = 1.1; // outline weight for every part

export const PART_NAMES: Record<IndicatorId, string> = {
  rest: 'Governor',
  cooling: 'Coolant tower',
  motion: 'Flywheel',
  fuel: 'Firebox',
  equilibrium: 'Pressure dial',
};
export const REFS: Record<IndicatorId, string> = { rest: 'A', cooling: 'B', motion: 'C', fuel: 'D', equilibrium: 'E' };

// callout geometry: anchor on the part → elbow → ring; text to the right unless `end`
const CALLOUTS: Record<IndicatorId, { anchor: [number, number]; elbow?: [number, number]; ring: [number, number]; end?: boolean }> = {
  rest: { anchor: [230, 134], elbow: [252, 110], ring: [252, 80], end: true },
  cooling: { anchor: [130, 484], ring: [130, 510] },
  motion: { anchor: [874, 284], ring: [898, 238], end: true },
  fuel: { anchor: [424, 440], elbow: [530, 448], ring: [560, 448] },
  equilibrium: { anchor: [433, 217], elbow: [510, 130], ring: [536, 118] },
};

interface Particle {
  x: number; y: number; vx: number; vy: number; age: number; life: number; r0: number; r1: number; alive: boolean;
}

export interface EngineProps {
  condition: EngineCondition;
  equipped: Equipped;
  reducedMotion: boolean;
  pulse?: { kind: PulseKind; n: number } | null;
  selected?: IndicatorId | null;
  onSelect?: (id: IndicatorId) => void;
  /** short reading shown in each callout; omit for an unlabelled drawing */
  labels?: Record<IndicatorId, string>;
  compact?: boolean;
}

function eqNeedleFrac(c: EngineCondition): number {
  if (c.ignored.equilibrium) return 0.45;
  if (c.stress === null) return c.logged.equilibrium ? 0.4 : 0.16;
  return Math.max(0.05, Math.min(0.95, 0.28 + (c.stress - 1) * 0.14 - (c.values.equilibrium > 0.6 ? 0.04 : 0)));
}

function seeded(n: number) {
  let s = n;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PULSE_TO: Partial<Record<PulseKind, IndicatorId>> = {
  cooling: 'cooling', repair: 'rest', rest: 'rest', motion: 'motion', fuel: 'fuel', vent: 'equilibrium', equilibrium: 'equilibrium',
};

export default function Engine({ condition, equipped, reducedMotion, pulse, selected, onSelect, labels, compact }: EngineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `${uid}-${s}`;
  const finish = FINISHES[equipped.finish] ?? FINISHES.iron;
  const gauge = GAUGE_STYLES[equipped.gauge] ?? GAUGE_STYLES.standard;
  const steamKind = equipped.steam;
  const v = condition.values;

  const live = useRef({ condition, steamKind, pulse: null as null | { kind: PulseKind; t0: number } });
  live.current.condition = condition;
  live.current.steamKind = steamKind;
  useEffect(() => {
    if (pulse) live.current.pulse = { kind: pulse.kind, t0: performance.now() };
  }, [pulse]);

  const spokes = useRef<SVGGElement>(null);
  const crankPin = useRef<SVGCircleElement>(null);
  const conRod = useRef<SVGLineElement>(null);
  const crosshead = useRef<SVGGElement>(null);
  const pistonRod = useRef<SVGLineElement>(null);
  const pistonHead = useRef<SVGRectElement>(null);
  const gearA = useRef<SVGGElement>(null);
  const gearB = useRef<SVGGElement>(null);
  const belt = useRef<SVGGElement>(null);
  const mainNeedle = useRef<SVGGElement>(null);
  const steamG = useRef<SVGGElement>(null);
  const ventG = useRef<SVGGElement>(null);
  const emberG = useRef<SVGGElement>(null);
  const govEls = useRef<{ balls: (SVGCircleElement | null)[]; arms: (SVGLineElement | null)[]; links: (SVGLineElement | null)[]; sleeve: SVGRectElement | null }>({
    balls: [null, null], arms: [null, null], links: [null, null], sleeve: null,
  });

  const STEAM_N = 14;
  const VENT_N = 12;
  const EMBER_N = 12;
  const restAngle = (38 * Math.PI) / 180;

  useEffect(() => {
    const place = (theta: number, govPhase: number, rest: number) => {
      const deg = (theta * 180) / Math.PI;
      spokes.current?.setAttribute('transform', `rotate(${deg.toFixed(2)} ${FW.x} ${FW.y})`);
      const px = FW.x + CRANK * Math.cos(theta);
      const py = FW.y + CRANK * Math.sin(theta);
      crankPin.current?.setAttribute('cx', px.toFixed(2));
      crankPin.current?.setAttribute('cy', py.toFixed(2));
      const xh = px - Math.sqrt(ROD * ROD - (py - FW.y) ** 2);
      conRod.current?.setAttribute('x1', xh.toFixed(2));
      conRod.current?.setAttribute('x2', px.toFixed(2));
      conRod.current?.setAttribute('y2', py.toFixed(2));
      crosshead.current?.setAttribute('transform', `translate(${xh.toFixed(2)} 0)`);
      pistonRod.current?.setAttribute('x2', xh.toFixed(2));
      pistonRod.current?.setAttribute('x1', (xh - PISTON_OFFSET).toFixed(2));
      pistonHead.current?.setAttribute('x', (xh - PISTON_OFFSET - 7).toFixed(2));
      gearA.current?.setAttribute('transform', `translate(${GA.x} ${GA.y}) rotate(${deg.toFixed(2)})`);
      gearB.current?.setAttribute('transform', `translate(${GB.x} ${GB.y}) rotate(${((-deg * 14) / 9 + 10).toFixed(2)})`);
      belt.current?.style.setProperty('stroke-dashoffset', String((-theta * 22) % 24));
      const alpha = ((10 + rest * 32) * Math.PI) / 180;
      const reach = Math.sin(alpha) * GOV.arm;
      const drop = Math.cos(alpha) * GOV.arm;
      const el = govEls.current;
      for (let i = 0; i < 2; i++) {
        const ph = govPhase + i * Math.PI;
        const bx = GOV.x + reach * Math.cos(ph);
        const depth = Math.sin(ph);
        const by = GOV.top + drop;
        const sy = GOV.top + drop * 1.55;
        el.balls[i]?.setAttribute('cx', bx.toFixed(2));
        el.balls[i]?.setAttribute('cy', by.toFixed(2));
        el.balls[i]?.setAttribute('r', (8 + depth * 1.4).toFixed(2));
        el.arms[i]?.setAttribute('x2', bx.toFixed(2));
        el.arms[i]?.setAttribute('y2', by.toFixed(2));
        el.links[i]?.setAttribute('x1', bx.toFixed(2));
        el.links[i]?.setAttribute('y1', by.toFixed(2));
        el.links[i]?.setAttribute('y2', sy.toFixed(2));
        el.sleeve?.setAttribute('y', (sy - 4).toFixed(2));
      }
    };

    const c0 = live.current.condition;
    if (reducedMotion) {
      place(restAngle, 0.6, c0.values.rest);
      return;
    }

    const mk = (n: number): Particle[] => Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r0: 0, r1: 0, alive: false }));
    const steam = mk(STEAM_N);
    const vent = mk(VENT_N);
    const embers = mk(EMBER_N);
    const steamEls = Array.from(steamG.current?.children ?? []) as SVGCircleElement[];
    const ventEls = Array.from(ventG.current?.children ?? []) as SVGCircleElement[];
    const emberEls = Array.from(emberG.current?.children ?? []) as SVGCircleElement[];
    const spawn = (pool: Particle[], init: (p: Particle) => void) => {
      const p = pool.find((q) => !q.alive);
      if (!p) return;
      p.alive = true;
      p.age = 0;
      init(p);
    };
    const step = (pool: Particle[], els: SVGCircleElement[], dt: number, drag: number, alpha: (k: number) => number, grow: boolean) => {
      pool.forEach((p, i) => {
        const e = els[i];
        if (!e) return;
        if (!p.alive) return e.setAttribute('opacity', '0');
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          return e.setAttribute('opacity', '0');
        }
        const k = p.age / p.life;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * drag;
        p.vy *= 1 - dt * drag * 0.6;
        e.setAttribute('cx', p.x.toFixed(1));
        e.setAttribute('cy', p.y.toFixed(1));
        e.setAttribute('r', (grow ? p.r0 + (p.r1 - p.r0) * Math.sqrt(k) : p.r0).toFixed(1));
        e.setAttribute('opacity', alpha(k).toFixed(3));
      });
    };

    let theta = restAngle;
    let govPhase = 0;
    let speed = 0;
    let lastHalf = Math.floor(theta / Math.PI);
    let ventTimer = 0;
    let lastPulse: number | null = null;
    let last = performance.now();
    let raf = 0;
    let visible = document.visibilityState !== 'hidden';

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = live.current.condition;
      const pl = live.current.pulse;
      const since = pl ? (now - pl.t0) / 1000 : 99;

      // crank train: target speed from Motion, eased like a heavy flywheel
      const m = c.values.motion;
      let target = m < 0.02 ? 0 : 0.15 + m * 1.05;
      if (pl?.kind === 'motion' && since < 2.5) target += 0.8 * (1 - since / 2.5);
      speed += (target - speed) * Math.min(1, dt * 0.9);
      if (speed < 0.003 && target === 0) speed = 0;
      theta += speed * Math.PI * 2 * dt;
      govPhase += (0.15 + c.values.rest * 0.9) * Math.PI * 2 * dt;
      place(theta, govPhase, c.values.rest);

      // exhaust: one puff per half revolution
      const half = Math.floor(theta / Math.PI);
      if (half !== lastHalf) {
        lastHalf = half;
        const kind = live.current.steamKind;
        spawn(steam, (p) => {
          p.x = STACK.x;
          p.y = STACK.y;
          p.vx = -4 - Math.random() * 6;
          p.vy = -(48 + speed * 26);
          p.life = 1.9;
          p.r0 = 5;
          p.r1 = kind === 'aether' ? 30 : 22;
        });
        if (kind === 'embers')
          for (let i = 0; i < 2; i++)
            spawn(embers, (p) => {
              p.x = STACK.x + (Math.random() - 0.5) * 8;
              p.y = STACK.y;
              p.vx = (Math.random() - 0.5) * 24;
              p.vy = -(70 + Math.random() * 40);
              p.life = 1 + Math.random() * 0.5;
              p.r0 = 1.4 + Math.random();
            });
      }
      const puffAlpha = 0.25 + c.overall * 0.35;
      step(steam, steamEls, dt, 0.5, (k) => (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * puffAlpha, true);
      step(embers, emberEls, dt, 0.2, (k) => 1 - k, false);

      // needle: steady when calm, a slight tremor under high stress
      const base = eqNeedleFrac(c);
      const tremor = c.stress !== null && c.stress >= 4 ? (c.stress - 3) * 0.008 : 0;
      const settle = pl && (pl.kind === 'equilibrium' || pl.kind === 'vent') && since < 1.6 ? -0.1 * Math.sin((since / 1.6) * Math.PI) : 0;
      const f = base + settle + tremor * Math.sin(now / 70);
      mainNeedle.current?.setAttribute('transform', `rotate(${(-130 + 260 * Math.max(0, Math.min(1, f))).toFixed(2)} 400 247)`);

      // safety valve: a release after a breathing break, short lifts under high stress
      if (pl && (pl.kind === 'vent' || pl.kind === 'equilibrium') && lastPulse !== pl.t0) {
        lastPulse = pl.t0;
        for (let i = 0; i < VENT_N; i++)
          spawn(vent, (p) => {
            p.x = VALVE.x;
            p.y = VALVE.y;
            p.vx = -18 - Math.random() * 50;
            p.vy = -36 - Math.random() * 60;
            p.life = 1.2 + Math.random() * 0.8;
            p.r0 = 3;
            p.r1 = 14 + Math.random() * 12;
          });
      }
      ventTimer += dt;
      if (c.stress !== null && c.stress >= 4 && ventTimer > 3.2) {
        ventTimer = 0;
        for (let i = 0; i < 2; i++)
          spawn(vent, (p) => {
            p.x = VALVE.x;
            p.y = VALVE.y;
            p.vx = -10 - Math.random() * 18;
            p.vy = -28 - Math.random() * 22;
            p.life = 0.8;
            p.r0 = 2;
            p.r1 = 9;
          });
      }
      step(vent, ventEls, dt, 1.1, (k) => (1 - k) * 0.6, true);
    };

    const onVis = () => {
      visible = document.visibilityState !== 'hidden';
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, reducedMotion ? condition.values.rest : -1]);

  useEffect(() => {
    if (!reducedMotion) return;
    mainNeedle.current?.setAttribute('transform', `rotate(${-130 + 260 * eqNeedleFrac(condition)} 400 247)`);
  }, [reducedMotion, condition]);

  const rust = useMemo(() => {
    const rnd = seeded(42);
    const out: { x: number; y: number; rx: number; ry: number; o: number; area: number }[] = [];
    const areas = [
      { x: 296, y: 300, w: 60, h: 140 },
      { x: 450, y: 200, w: 54, h: 90 },
      { x: 548, y: 334, w: 60, h: 50 },
      { x: 300, y: 165, w: 40, h: 26 },
    ];
    areas.forEach((a, ai) => {
      for (let i = 0; i < 8; i++) out.push({ x: a.x + rnd() * a.w, y: a.y + rnd() * a.h, rx: 2 + rnd() * 6, ry: 1.5 + rnd() * 4, o: 0.4 + rnd() * 0.5, area: ai });
    });
    return out;
  }, []);

  const restLogged = condition.logged.rest || condition.ignored.rest;
  const rustOpacity = condition.ignored.rest ? 0 : restLogged ? Math.max(0, 0.75 - v.rest) * 0.9 : 0.4;
  const coolLevel = TOWER.bottom - (TOWER.bottom - TOWER.top) * Math.max(0.02, Math.min(1, v.cooling));
  const fireOpacity = 0.1 + v.fuel * 0.9;
  const innerOpacity = 0.12 + condition.overall * 0.75;
  const flashFor = pulse ? PULSE_TO[pulse.kind] : undefined;
  const interactive = !compact && !!onSelect;

  const callout = (sid: IndicatorId) => {
    if (!labels || compact) return null;
    const c = CALLOUTS[sid];
    const [ax, ay] = c.anchor;
    const [rx, ry] = c.ring;
    const pts = [c.anchor, ...(c.elbow ? [c.elbow] : []), c.ring];
    // stop the leader at the ring's edge
    const [px, py] = pts[pts.length - 2];
    const d = Math.hypot(rx - px, ry - py) || 1;
    const ex = rx - ((rx - px) / d) * 10;
    const ey = ry - ((ry - py) / d) * 10;
    const path = `M${ax},${ay} ${pts.slice(1, -1).map(([x, y]) => `L${x},${y}`).join(' ')} L${ex.toFixed(1)},${ey.toFixed(1)}`;
    const tx = c.end ? rx - 16 : rx + 16;
    return (
      <g className={`anno${flashFor === sid ? ' flash' : ''}`} key={flashFor === sid ? `f${pulse?.n}` : 'a'}>
        <path d={path} className="leader" />
        <circle cx={ax} cy={ay} r={2.2} className="leader-dot" />
        <g className="anno-mark">
          <circle cx={rx} cy={ry} r={10} className="anno-ring" />
          <text x={rx} y={ry + 4} textAnchor="middle" className="anno-ref">
            {REFS[sid]}
          </text>
        </g>
        <g className="anno-text">
          <text x={tx} y={ry - 2} textAnchor={c.end ? 'end' : 'start'} className="anno-name">
            {PART_NAMES[sid]}
          </text>
          <text x={tx} y={ry + 13} textAnchor={c.end ? 'end' : 'start'} className="anno-val">
            {labels[sid]}
          </text>
        </g>
      </g>
    );
  };

  const sys = (sid: IndicatorId, children: ReactNode, hits: [number, number, number, number][]) => {
    if (!interactive) return <g>{children}</g>;
    const info = INDICATORS[sid];
    return (
      <g
        className={`sys${selected === sid ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected === sid}
        aria-label={`${REFS[sid]}, ${PART_NAMES[sid]}: ${info.name}${labels ? `, ${labels[sid]}` : ''}`}
        onClick={() => onSelect!(sid)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect!(sid);
          }
        }}
      >
        {hits.map(([x, y, w, h], i) => (
          <rect key={i} className="sys-hit" x={x} y={y} width={w} height={h} />
        ))}
        {children}
        {callout(sid)}
      </g>
    );
  };

  const steamColor = steamKind === 'aether' ? '#cfe6ea' : '#e7e1d3';
  const pipeGrad = `url(#${id('pipe')})`;
  const pipeGradV = `url(#${id('pipeV')})`;
  const metal = `url(#${id('metal')})`;
  const metalV = `url(#${id('metalV')})`;
  const ol = { stroke: finish.lo, strokeWidth: LINE } as const;
  const beltN = { x: 13.9, y: -17.05 };

  return (
    <svg
      viewBox={compact ? '50 20 890 480' : '40 26 900 504'}
      className="engine-svg"
      role={interactive ? 'group' : 'img'}
      aria-label={`Engine drawing, ${condition.label.toLowerCase()}.`}
    >
      <defs>
        <linearGradient id={id('metal')} x1="0" x2="1">
          <stop offset="0" stopColor={finish.lo} />
          <stop offset="0.24" stopColor={finish.mid} />
          <stop offset="0.42" stopColor={finish.hi} />
          <stop offset="0.62" stopColor={finish.mid} />
          <stop offset="1" stopColor={finish.lo} />
        </linearGradient>
        <linearGradient id={id('metalV')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={finish.hi} />
          <stop offset="0.5" stopColor={finish.mid} />
          <stop offset="1" stopColor={finish.lo} />
        </linearGradient>
        <linearGradient id={id('pipe')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={finish.pipe[0]} />
          <stop offset="0.5" stopColor={finish.pipe[1]} />
          <stop offset="1" stopColor={finish.pipe[2]} />
        </linearGradient>
        <linearGradient id={id('pipeV')} x1="0" x2="1">
          <stop offset="0" stopColor={finish.pipe[2]} />
          <stop offset="0.45" stopColor={finish.pipe[0]} />
          <stop offset="1" stopColor={finish.pipe[2]} />
        </linearGradient>
        <radialGradient id={id('bezel')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={finish.hi} />
          <stop offset="0.6" stopColor={finish.edge} />
          <stop offset="1" stopColor={finish.lo} />
        </radialGradient>
        <radialGradient id={id('faceShade')} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0.72" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
        <radialGradient id={id('fire')} cx="0.5" cy="0.62" r="0.55">
          <stop offset="0" stopColor="#f6d79a" />
          <stop offset="0.35" stopColor="#d98a3a" />
          <stop offset="0.8" stopColor="#8a3a17" />
          <stop offset="1" stopColor="#3a1608" />
        </radialGradient>
        <radialGradient id={id('inner')} cx="0.5" cy="0.9" r="0.95">
          <stop offset="0" stopColor="#e7b46a" />
          <stop offset="0.5" stopColor="#a5592a" />
          <stop offset="1" stopColor="#2a1208" />
        </radialGradient>
        <linearGradient id={id('coolant')} x1="0" x2="1">
          <stop offset="0" stopColor="#2c4a48" />
          <stop offset="0.45" stopColor="#6c9690" />
          <stop offset="1" stopColor="#2c4a48" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.2" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.34" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={id('glint')} x1="0" x2="1">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff6dc" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </linearGradient>
        <pattern id={id('hatch')} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(228,217,196,0.16)" strokeWidth="1" />
        </pattern>
        <clipPath id={id('boilerClip')}>
          <path d="M290,470 L290,195 Q290,140 400,138 Q510,140 510,195 L510,470 Z" />
        </clipPath>
        <clipPath id={id('towerClip')}>
          <rect x={TOWER.x1} y={TOWER.top} width={TOWER.x2 - TOWER.x1} height={TOWER.bottom - TOWER.top} rx={5} />
        </clipPath>
        <clipPath id={id('slotClip')}>
          <rect x={556} y={350} width={94} height={20} rx={2} />
        </clipPath>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={steamKind === 'aether' ? 3.5 : 2.2} />
        </filter>
      </defs>

      {/* drafting conventions: centre lines on the boiler and crank axes, hatched ground */}
      {!compact && (
        <g aria-hidden="true">
          <line x1={400} y1={40} x2={400} y2={500} className="cl" />
          <line x1={520} y1={FW.y} x2={935} y2={FW.y} className="cl" />
          <line x1={FW.x} y1={250} x2={FW.x} y2={470} className="cl" />
          <rect x={64} y={GROUND} width={872} height={12} fill={`url(#${id('hatch')})`} />
        </g>
      )}
      <line x1={64} y1={GROUND} x2={936} y2={GROUND} stroke="rgba(228,217,196,0.35)" strokeWidth={1} />

      {/* stack */}
      <g>
        <rect x={432} y={60} width={30} height={92} fill={pipeGradV} {...ol} />
        <rect x={426} y={52} width={42} height={11} rx={1.5} fill={metalV} {...ol} />
        <rect x={429} y={98} width={36} height={6} fill={finish.band} {...ol} />
      </g>

      {/* B · cooling */}
      {sys(
        'cooling',
        <g>
          <rect x={160} y={446} width={132} height={16} fill={pipeGrad} {...ol} />
          <rect x={204} y={442} width={10} height={24} rx={1.5} fill={metalV} {...ol} />
          <rect x={262} y={442} width={10} height={24} rx={1.5} fill={metalV} {...ol} />
          <path d="M92,182 L92,166 Q130,142 168,166 L168,182 Z" fill={metalV} {...ol} />
          <rect x={92} y={428} width={76} height={42} rx={2} fill={metal} {...ol} />
          <Rivets x1={98} x2={162} y={174} gap={16} r={1.8} fill={finish.rivet} />
          <Rivets x1={98} x2={162} y={438} gap={16} r={1.8} fill={finish.rivet} />
          <rect x={TOWER.x1} y={TOWER.top} width={60} height={250} rx={5} fill="#141a19" stroke={finish.edge} strokeWidth={LINE} />
          <g clipPath={`url(#${id('towerClip')})`}>
            <rect x={TOWER.x1} y={coolLevel} width={60} height={TOWER.bottom - coolLevel + 4} fill={`url(#${id('coolant')})`} className="coolant" />
            <ellipse cx={130} cy={coolLevel} rx={30} ry={2.5} fill="#9cc2bb" opacity={0.45} className="coolant-surface" />
          </g>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={TOWER.x2 - 12} x2={TOWER.x2} y1={TOWER.bottom - 250 * f} y2={TOWER.bottom - 250 * f} stroke={finish.edge} strokeWidth={1} />
              <text x={TOWER.x2 + 6} y={TOWER.bottom - 250 * f + 3} className="tick-text">
                {f * 100}%
              </text>
            </g>
          ))}
          <rect x={TOWER.x1} y={TOWER.top} width={60} height={250} rx={5} fill={`url(#${id('glass')})`} />
          <rect x={88} y={250} width={84} height={7} rx={1.5} fill={metalV} {...ol} />
          <rect x={88} y={350} width={84} height={7} rx={1.5} fill={metalV} {...ol} />
          <rect x={108} y={470} width={44} height={16} fill={metal} {...ol} />
        </g>,
        [[74, 140, 132, 346], [108, 494, 170, 34]],
      )}

      {/* A · rest */}
      {sys(
        'rest',
        <g>
          <rect x={220} y={262} width={20} height={208} fill={metal} {...ol} />
          <rect x={210} y={244} width={40} height={22} rx={2} fill={metalV} {...ol} />
          <rect x={206} y={466} width={48} height={20} rx={1.5} fill={metal} {...ol} />
          <line x1={GOV.x} y1={GOV.top - 12} x2={GOV.x} y2={246} stroke={finish.edge} strokeWidth={3.5} />
          <circle cx={GOV.x} cy={GOV.top - 14} r={5.5} fill={metalV} {...ol} />
          {[0, 1].map((i) => (
            <g key={i}>
              <line ref={(el) => (govEls.current.arms[i] = el)} x1={GOV.x} y1={GOV.top} x2={GOV.x + 20} y2={GOV.top + 40} stroke={finish.edge} strokeWidth={2.2} />
              <line ref={(el) => (govEls.current.links[i] = el)} x1={GOV.x + 20} y1={GOV.top + 40} x2={GOV.x} y2={GOV.top + 70} stroke={finish.mid} strokeWidth={1.6} />
            </g>
          ))}
          <rect ref={(el) => (govEls.current.sleeve = el)} x={GOV.x - 7} y={GOV.top + 66} width={14} height={8} rx={1.5} fill={metalV} {...ol} />
          {[0, 1].map((i) => (
            <circle key={i} ref={(el) => (govEls.current.balls[i] = el)} cx={GOV.x + 20} cy={GOV.top + 40} r={8} fill={`url(#${id('bezel')})`} {...ol} />
          ))}
        </g>,
        [[196, 120, 24, 366], [150, 62, 126, 58]],
      )}

      {/* D · fuel: the boiler body, firebox and sight glass */}
      {sys(
        'fuel',
        <g>
          <path d="M290,470 L290,195 Q290,140 400,138 Q510,140 510,195 L510,470 Z" fill={metal} {...ol} />
          {[192, 296, 392].map((y) => (
            <g key={y}>
              <rect x={286} y={y} width={228} height={11} rx={1.5} fill={finish.band} {...ol} />
              <Rivets x1={296} x2={504} y={y + 5.5} gap={16} r={1.8} fill={finish.rivet} />
            </g>
          ))}
          <rect x={338} y={312} width={124} height={72} rx={8} fill="#120a06" stroke={finish.edge} strokeWidth={2.5} />
          <rect x={340} y={314} width={120} height={68} rx={7} fill={`url(#${id('inner')})`} opacity={innerOpacity} className="inner-light" />
          <rect x={340} y={314} width={120} height={68} rx={7} fill={`url(#${id('glass')})`} />
          {[350, 450].map((x) => [322, 374].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.8} fill={finish.rivet} />))}
          <circle cx={400} cy={432} r={25} fill={`url(#${id('fire')})`} opacity={fireOpacity} className="fire" />
          <circle cx={400} cy={432} r={25} fill="none" stroke={finish.edge} strokeWidth={4.5} />
          {[-12, -4, 4, 12].map((dx) => (
            <line key={dx} x1={400 + dx} y1={410} x2={400 + dx} y2={454} stroke={finish.lo} strokeWidth={3} />
          ))}
          <circle cx={427} cy={432} r={3.5} fill={finish.rivet} />
          <rect x={333} y={128} width={14} height={22} fill={pipeGradV} {...ol} />
          <rect x={329} y={124} width={22} height={6} rx={1.5} fill={metalV} {...ol} />
          <line x1={340} y1={127} x2={302} y2={118} stroke={finish.edge} strokeWidth={2.6} />
          <circle cx={302} cy={118} r={5.5} fill={metalV} {...ol} />
          <rect x={280} y={468} width={240} height={18} rx={1.5} fill={metal} {...ol} />
          <rect x={340} y={471} width={120} height={12} rx={1} fill="#16130f" stroke={finish.edge} strokeWidth={0.7} />
          <text x={400} y={480} textAnchor="middle" className="plate-text" fill={finish.edge}>
            HUMAN ENGINE · MK I
          </text>
          <g clipPath={`url(#${id('boilerClip')})`} opacity={rustOpacity} className="rust">
            {rust.filter((s) => s.area !== 2).map((s, i) => (
              <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill={i % 3 ? '#6f3818' : '#552a12'} opacity={s.o} />
            ))}
          </g>
        </g>,
        [[278, 136, 244, 350], [544, 428, 160, 42]],
      )}

      {/* E · equilibrium: main pressure dial */}
      {sys(
        'equilibrium',
        <g>
          <Dial
            cx={400}
            cy={247}
            r={44}
            frac={eqNeedleFrac(condition)}
            style={gauge}
            bezel={finish.edge}
            idPrefix={uid}
            needleRef={mainNeedle}
            label="PRESSURE"
            zones={[
              { from: 0, to: 0.22, color: '#6f7a80' },
              { from: 0.25, to: 0.64, color: '#7d8f55' },
              { from: 0.72, to: 1, color: '#a3473a' },
            ]}
          />
          <circle cx={466} cy={214} r={5} fill={v.equilibrium > 0.55 ? '#93a86b' : v.equilibrium > 0.35 ? '#c3904e' : '#6e5248'} />
          <circle cx={466} cy={214} r={8} fill="none" stroke={finish.edge} strokeWidth={1.3} />
        </g>,
        [[350, 196, 128, 104], [522, 100, 150, 40]],
      )}

      {/* C · motion: steam line, cylinder, crosshead, flywheel, gears */}
      {sys(
        'motion',
        <g>
          <rect x={508} y={350} width={36} height={20} fill={pipeGrad} {...ol} />
          <rect x={516} y={346} width={8} height={28} rx={1.5} fill={metalV} {...ol} />
          <line x1={520} y1={346} x2={520} y2={334} stroke={finish.edge} strokeWidth={2.5} />
          <circle cx={520} cy={326} r={9} fill="none" stroke={finish.edge} strokeWidth={2.5} />
          <line x1={511} y1={326} x2={529} y2={326} stroke={finish.edge} strokeWidth={1.3} />
          <line x1={520} y1={317} x2={520} y2={335} stroke={finish.edge} strokeWidth={1.3} />

          <g ref={belt} style={{ strokeDasharray: '14 10' }}>
            <line x1={FW.x + beltN.x} y1={FW.y + beltN.y} x2={GA.x + beltN.x} y2={GA.y + beltN.y} stroke="#2e2419" strokeWidth={4.5} />
            <line x1={FW.x - beltN.x} y1={FW.y - beltN.y} x2={GA.x - beltN.x} y2={GA.y - beltN.y} stroke="#2e2419" strokeWidth={4.5} />
          </g>
          <rect x={634} y={205} width={12} height={121} fill={metal} {...ol} />
          <g ref={gearB} transform={`translate(${GB.x} ${GB.y})`}>
            <path d={gearPath(9, 31, 24, 6)} fill={metalV} {...ol} fillRule="evenodd" />
            <circle r={13} fill="none" stroke={finish.lo} strokeWidth={1} opacity={0.6} />
          </g>
          <g ref={gearA} transform={`translate(${GA.x} ${GA.y})`}>
            <path d={gearPath(14, 46, 39, 0)} fill={metalV} {...ol} />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <circle key={a} cx={24 * Math.cos((a * Math.PI) / 180)} cy={24 * Math.sin((a * Math.PI) / 180)} r={5.5} fill="#15110d" />
            ))}
            <circle r={22} fill="none" stroke={finish.edge} strokeWidth={2.5} />
            <circle r={6} fill={finish.rivet} {...ol} />
          </g>

          <rect x={540} y={326} width={124} height={68} rx={6} fill={metalV} {...ol} />
          {[552, 584, 616, 648].map((x) => (
            <rect key={x} x={x} y={322} width={6} height={76} rx={1.5} fill={finish.band} {...ol} />
          ))}
          <rect x={556} y={350} width={94} height={20} rx={2} fill="#0d0a07" {...ol} />
          <g clipPath={`url(#${id('slotClip')})`}>
            <rect ref={pistonHead} x={600} y={351} width={14} height={18} rx={1.5} fill={finish.edge} />
          </g>
          <g opacity={rustOpacity} className="rust">
            {rust.filter((s) => s.area === 2).map((s, i) => (
              <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx * 0.8} ry={s.ry * 0.7} fill="#6d3313" opacity={s.o} />
            ))}
          </g>
          <rect x={664} y={344} width={100} height={4} fill={finish.mid} {...ol} />
          <rect x={664} y={372} width={100} height={4} fill={finish.mid} {...ol} />
          <line ref={pistonRod} x1={600} y1={360} x2={700} y2={360} stroke={finish.hi} strokeWidth={4.5} strokeLinecap="round" />
          <g ref={crosshead}>
            <rect x={-10} y={347} width={20} height={26} rx={2} fill={metalV} {...ol} />
          </g>

          <path d={`M${FW.x - 54},${GROUND} L${FW.x - 8},${FW.y} L${FW.x + 8},${FW.y} L${FW.x + 54},${GROUND} Z`} fill={metal} {...ol} />
          <circle cx={FW.x} cy={FW.y} r={FW.r - 7} fill="none" stroke={finish.lo} strokeWidth={17} />
          <circle cx={FW.x} cy={FW.y} r={FW.r - 7} fill="none" stroke={`url(#${id('bezel')})`} strokeWidth={14} />
          <g ref={spokes}>
            {[0, 60, 120, 180, 240, 300].map((a) => {
              const r = (a * Math.PI) / 180;
              const p = (rad: number, off: number) => `${(FW.x + rad * Math.cos(r + off)).toFixed(1)},${(FW.y + rad * Math.sin(r + off)).toFixed(1)}`;
              return <path key={a} d={`M${p(14, -0.25)} L${p(FW.r - 14, -0.05)} L${p(FW.r - 14, 0.05)} L${p(14, 0.25)} Z`} fill={finish.mid} {...ol} />;
            })}
            <line x1={FW.x} y1={FW.y} x2={FW.x + CRANK} y2={FW.y} stroke={finish.edge} strokeWidth={9} strokeLinecap="round" />
            {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
              <circle key={a} cx={FW.x + (FW.r - 7) * Math.cos((a * Math.PI) / 180)} cy={FW.y + (FW.r - 7) * Math.sin((a * Math.PI) / 180)} r={1.8} fill={finish.rivet} />
            ))}
          </g>
          <circle cx={FW.x} cy={FW.y} r={16} fill={`url(#${id('bezel')})`} {...ol} />
          <circle cx={FW.x} cy={FW.y} r={22} fill="none" stroke="#2e2419" strokeWidth={4} />
          <line ref={conRod} x1={710} y1={360} x2={FW.x + CRANK} y2={FW.y} stroke={finish.hi} strokeWidth={5.5} strokeLinecap="round" />
          <circle ref={crankPin} cx={FW.x + CRANK} cy={FW.y} r={5.5} fill={finish.rivet} {...ol} />
        </g>,
        [[524, 140, 412, 260], [740, 400, 196, 86]],
      )}

      {/* steam — exhaust puffs, valve lifts, optional embers */}
      <g ref={steamG} filter={`url(#${id('soft')})`} pointerEvents="none">
        {Array.from({ length: STEAM_N }, (_, i) => (
          <circle key={i} r={0} fill={steamColor} opacity={0} />
        ))}
      </g>
      <g ref={ventG} filter={`url(#${id('soft')})`} pointerEvents="none">
        {Array.from({ length: VENT_N }, (_, i) => (
          <circle key={i} r={0} fill="#ece7dc" opacity={0} />
        ))}
      </g>
      <g ref={emberG} pointerEvents="none">
        {Array.from({ length: EMBER_N }, (_, i) => (
          <circle key={i} r={0} fill={i % 2 ? '#e7a248' : '#d06a2a'} opacity={0} />
        ))}
      </g>
      {reducedMotion && v.motion > 0.02 && (
        <g filter={`url(#${id('soft')})`} pointerEvents="none" opacity={0.3 + condition.overall * 0.3}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={STACK.x - i * 5} cy={STACK.y - 10 - i * 16} r={6 + i * 5} fill={steamColor} opacity={0.7 - i * 0.15} />
          ))}
          {steamKind === 'embers' && <circle cx={STACK.x + 4} cy={STACK.y - 20} r={1.6} fill="#e7a248" />}
        </g>
      )}

      {/* one quiet acknowledgement of logged rest: a polish pass over the boiler */}
      {pulse && !compact && !reducedMotion && (pulse.kind === 'repair' || pulse.kind === 'rest') && (
        <g key={pulse.n} clipPath={`url(#${id('boilerClip')})`} pointerEvents="none">
          <rect x={150} y={130} width={110} height={360} fill={`url(#${id('glint')})`} className="fx-glint" />
        </g>
      )}
    </svg>
  );
}
