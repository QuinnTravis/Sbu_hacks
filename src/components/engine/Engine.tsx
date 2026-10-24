import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { FINISHES, GAUGE_STYLES, INDICATORS } from '../../data/catalog';
import type { EngineCondition } from '../../lib/metrics';
import type { PulseKind } from '../../state/store';
import type { Equipped, IndicatorId } from '../../types';
import { Dial, gearPath, Rivets } from './parts';

// ─── Geometry (viewBox 960 × 600) ───────────────────────────────────────────
const FW = { x: 830, y: 360, r: 88 }; // flywheel
const CRANK = 32;
const ROD = 120;
const PISTON_OFFSET = 100;
const GA = { x: 640, y: 205 }; // gear A
const GB = { x: 690, y: 156 }; // gear B
const GOV = { x: 230, top: 146, arm: 50 };
const STACK = { x: 447, y: 56 };
const VALVE = { x: 340, y: 124 };
const TOWER = { x1: 100, x2: 160, top: 180, bottom: 430 };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r0: number;
  r1: number;
  alive: boolean;
}

export interface EngineProps {
  condition: EngineCondition;
  equipped: Equipped;
  reducedMotion: boolean;
  pulse?: { kind: PulseKind; n: number } | null;
  selected?: IndicatorId | null;
  onSelect?: (id: IndicatorId) => void;
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

export default function Engine({ condition, equipped, reducedMotion, pulse, selected, onSelect, compact }: EngineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `${uid}-${s}`;
  const finish = FINISHES[equipped.finish] ?? FINISHES.iron;
  const gauge = GAUGE_STYLES[equipped.gauge] ?? GAUGE_STYLES.standard;
  const steamKind = equipped.steam;
  const v = condition.values;

  // live values for the animation loop
  const live = useRef({ condition, steamKind, pulse: null as null | { kind: PulseKind; t0: number } });
  live.current.condition = condition;
  live.current.steamKind = steamKind;

  useEffect(() => {
    if (pulse) live.current.pulse = { kind: pulse.kind, t0: performance.now() };
  }, [pulse]);

  // element refs
  const spokes = useRef<SVGGElement>(null);
  const crankPin = useRef<SVGCircleElement>(null);
  const conRod = useRef<SVGLineElement>(null);
  const crosshead = useRef<SVGGElement>(null);
  const pistonRod = useRef<SVGLineElement>(null);
  const pistonHead = useRef<SVGRectElement>(null);
  const gearA = useRef<SVGGElement>(null);
  const gearB = useRef<SVGGElement>(null);
  const belt = useRef<SVGGElement>(null);
  const gov = useRef<SVGGElement>(null);
  const mainNeedle = useRef<SVGGElement>(null);
  const fire = useRef<SVGGElement>(null);
  const windowGlow = useRef<SVGRectElement>(null);
  const steamG = useRef<SVGGElement>(null);
  const ventG = useRef<SVGGElement>(null);
  const emberG = useRef<SVGGElement>(null);

  const STEAM_N = compact ? 14 : 24;
  const VENT_N = 14;
  const EMBER_N = 14;

  const fwAngleStatic = 38;

  // ─── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const placeMechanism = (theta: number, govPhase: number, rest: number) => {
      const deg = (theta * 180) / Math.PI;
      spokes.current?.setAttribute('transform', `rotate(${deg} ${FW.x} ${FW.y})`);
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
      gearA.current?.setAttribute('transform', `translate(${GA.x} ${GA.y}) rotate(${deg})`);
      gearB.current?.setAttribute('transform', `translate(${GB.x} ${GB.y}) rotate(${(-deg * 14) / 9 + 10})`);
      belt.current?.style.setProperty('stroke-dashoffset', String((-theta * 22) % 24));
      // flyball governor
      const g = govPhase;
      const alpha = ((10 + rest * 32) * Math.PI) / 180;
      const reach = Math.sin(alpha) * GOV.arm;
      const drop = Math.cos(alpha) * GOV.arm;
      const el = govEls.current;
      if (el) {
        for (let i = 0; i < 2; i++) {
          const ph = g + i * Math.PI;
          const bx = GOV.x + reach * Math.cos(ph);
          const depth = Math.sin(ph);
          const by = GOV.top + drop;
          el.balls[i]?.setAttribute('cx', bx.toFixed(2));
          el.balls[i]?.setAttribute('cy', by.toFixed(2));
          el.balls[i]?.setAttribute('r', (8 + depth * 1.6).toFixed(2));
          el.arms[i]?.setAttribute('x2', bx.toFixed(2));
          el.arms[i]?.setAttribute('y2', by.toFixed(2));
          const sy = GOV.top + drop * 1.55;
          el.links[i]?.setAttribute('x1', bx.toFixed(2));
          el.links[i]?.setAttribute('y1', by.toFixed(2));
          el.links[i]?.setAttribute('y2', sy.toFixed(2));
          el.sleeve?.setAttribute('y', (sy - 4).toFixed(2));
          // draw the ball behind the spindle when it swings away
          el.balls[i]?.setAttribute('opacity', depth < -0.2 ? '0.82' : '1');
        }
      }
    };

    const c0 = live.current.condition;
    if (reducedMotion) {
      placeMechanism((fwAngleStatic * Math.PI) / 180, 0.6, c0.values.rest);
      return;
    }

    const steam: Particle[] = Array.from({ length: STEAM_N }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r0: 0, r1: 0, alive: false }));
    const vent: Particle[] = Array.from({ length: VENT_N }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r0: 0, r1: 0, alive: false }));
    const embers: Particle[] = Array.from({ length: EMBER_N }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r0: 0, r1: 0, alive: false }));
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

    let theta = (fwAngleStatic * Math.PI) / 180;
    let govPhase = 0;
    let speed = 0; // eased revolutions / second
    let steamAcc = 0;
    let emberAcc = 0;
    let ventTimer = 0;
    let lastPulse: number | null = null;
    let last = performance.now();
    let raf = 0;
    let visible = true;

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

      // speed eases toward the target
      const m = c.values.motion;
      let target = m < 0.02 ? 0 : 0.18 + m * 1.25;
      if (pl?.kind === 'motion' && since < 2.2) target += 1.1 * (1 - since / 2.2);
      speed += (target - speed) * Math.min(1, dt * 1.6);
      theta += speed * Math.PI * 2 * dt;
      const restV = c.values.rest;
      govPhase += (0.2 + restV * 1.1) * Math.PI * 2 * dt;
      placeMechanism(theta, govPhase, restV);

      // main pressure needle: stress makes it twitchy
      const base = eqNeedleFrac(c);
      const jitterAmp = c.stress === null ? 0.004 : 0.004 + Math.max(0, c.stress - 2) * 0.012;
      const settle = pl && (pl.kind === 'equilibrium' || pl.kind === 'vent') && since < 1.6 ? -0.12 * Math.sin((since / 1.6) * Math.PI) : 0;
      const f = base + settle + jitterAmp * (Math.sin(now / 90) * 0.6 + Math.sin(now / 37) * 0.4);
      mainNeedle.current?.setAttribute('transform', `rotate(${-130 + 260 * Math.max(0, Math.min(1, f))} 400 247)`);

      // firelight flicker
      const fuel = c.values.fuel;
      const flare = pl?.kind === 'fuel' && since < 1.8 ? 0.6 * (1 - since / 1.8) : 0;
      const flick = 0.82 + 0.18 * (Math.sin(now / 73) * 0.5 + Math.sin(now / 191) * 0.5);
      fire.current?.setAttribute('opacity', Math.min(1, (0.12 + fuel * 0.88) * flick + flare).toFixed(3));
      windowGlow.current?.setAttribute('opacity', Math.min(1, (0.15 + c.overall * 0.8) * (0.9 + 0.1 * flick) + flare * 0.5).toFixed(3));

      // stack steam
      const kind = live.current.steamKind;
      const rate = 1 + c.overall * 9;
      steamAcc += dt * rate;
      while (steamAcc > 1) {
        steamAcc -= 1;
        spawn(steam, (p) => {
          p.x = STACK.x + (Math.random() - 0.5) * 10;
          p.y = STACK.y;
          p.vx = 6 + Math.random() * 14;
          p.vy = -(32 + Math.random() * 26) * (0.7 + c.overall * 0.6);
          p.life = 2.4 + Math.random() * 1.4;
          p.r0 = kind === 'aether' ? 7 : 5;
          p.r1 = (kind === 'aether' ? 30 : 22) + Math.random() * 10;
        });
      }
      const steamOpacity = 0.28 + c.overall * 0.42;
      steam.forEach((p, i) => {
        const el = steamEls[i];
        if (!el) return;
        if (!p.alive) {
          el.setAttribute('opacity', '0');
          return;
        }
        p.age += dt;
        if (p.age >= p.life || p.y < -40) {
          p.alive = false;
          el.setAttribute('opacity', '0');
          return;
        }
        const k = p.age / p.life;
        p.x += p.vx * dt + Math.sin((p.age + i) * 2.1) * 0.3;
        p.y += p.vy * dt;
        p.vy *= 1 - dt * 0.25;
        const a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * steamOpacity;
        el.setAttribute('cx', p.x.toFixed(1));
        el.setAttribute('cy', p.y.toFixed(1));
        el.setAttribute('r', (p.r0 + (p.r1 - p.r0) * k).toFixed(1));
        el.setAttribute('opacity', a.toFixed(3));
      });

      // embers
      if (kind === 'embers') {
        emberAcc += dt * (1.5 + c.overall * 4);
        while (emberAcc > 1) {
          emberAcc -= 1;
          spawn(embers, (p) => {
            p.x = STACK.x + (Math.random() - 0.5) * 12;
            p.y = STACK.y + 4;
            p.vx = (Math.random() - 0.3) * 30;
            p.vy = -(60 + Math.random() * 50);
            p.life = 1 + Math.random() * 1.2;
            p.r0 = 1.4 + Math.random() * 1.4;
          });
        }
      }
      embers.forEach((p, i) => {
        const el = emberEls[i];
        if (!el) return;
        if (!p.alive || kind !== 'embers') {
          p.alive = false;
          el.setAttribute('opacity', '0');
          return;
        }
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          el.setAttribute('opacity', '0');
          return;
        }
        p.x += p.vx * dt + Math.sin(p.age * 9 + i) * 0.6;
        p.y += p.vy * dt;
        el.setAttribute('cx', p.x.toFixed(1));
        el.setAttribute('cy', p.y.toFixed(1));
        el.setAttribute('r', p.r0.toFixed(1));
        el.setAttribute('opacity', (1 - p.age / p.life).toFixed(3));
      });

      // safety valve: a satisfying burst after a breathing break; small puffs under high stress
      if (pl && (pl.kind === 'vent' || pl.kind === 'equilibrium') && lastPulse !== pl.t0) {
        lastPulse = pl.t0;
        for (let i = 0; i < VENT_N; i++)
          spawn(vent, (p) => {
            p.x = VALVE.x;
            p.y = VALVE.y;
            p.vx = -20 - Math.random() * 60;
            p.vy = -40 - Math.random() * 70;
            p.life = 1.1 + Math.random() * 0.9;
            p.r0 = 3;
            p.r1 = 16 + Math.random() * 14;
          });
      }
      ventTimer += dt;
      if (c.stress !== null && c.stress >= 4 && ventTimer > 2.8) {
        ventTimer = 0;
        for (let i = 0; i < 3; i++)
          spawn(vent, (p) => {
            p.x = VALVE.x;
            p.y = VALVE.y;
            p.vx = -10 - Math.random() * 25;
            p.vy = -30 - Math.random() * 30;
            p.life = 0.8 + Math.random() * 0.5;
            p.r0 = 2;
            p.r1 = 9 + Math.random() * 6;
          });
      }
      vent.forEach((p, i) => {
        const el = ventEls[i];
        if (!el) return;
        if (!p.alive) {
          el.setAttribute('opacity', '0');
          return;
        }
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          el.setAttribute('opacity', '0');
          return;
        }
        const k = p.age / p.life;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 1.2;
        p.vy *= 1 - dt * 0.8;
        el.setAttribute('cx', p.x.toFixed(1));
        el.setAttribute('cy', p.y.toFixed(1));
        el.setAttribute('r', (p.r0 + (p.r1 - p.r0) * k).toFixed(1));
        el.setAttribute('opacity', ((1 - k) * 0.7).toFixed(3));
      });
    };

    const onVis = () => {
      visible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reducedMotion, STEAM_N, reducedMotion ? condition.values.rest : -1]);

  // static placement when reduced motion (and re-place when values change)
  useEffect(() => {
    if (!reducedMotion) return;
    const f = eqNeedleFrac(condition);
    mainNeedle.current?.setAttribute('transform', `rotate(${-130 + 260 * f} 400 247)`);
    fire.current?.setAttribute('opacity', String(0.12 + condition.values.fuel * 0.88));
    windowGlow.current?.setAttribute('opacity', String(0.15 + condition.overall * 0.8));
  }, [reducedMotion, condition]);

  const govEls = useRef<{ balls: (SVGCircleElement | null)[]; arms: (SVGLineElement | null)[]; links: (SVGLineElement | null)[]; sleeve: SVGRectElement | null }>({
    balls: [null, null],
    arms: [null, null],
    links: [null, null],
    sleeve: null,
  });

  // rust speckles, deterministic
  const rust = useMemo(() => {
    const rnd = seeded(42);
    const spots: { x: number; y: number; rx: number; ry: number; o: number }[] = [];
    const areas = [
      { x: 296, y: 300, w: 60, h: 140 },
      { x: 450, y: 196, w: 54, h: 90 },
      { x: 548, y: 334, w: 60, h: 50 },
      { x: 104, y: 440, w: 56, h: 26 },
      { x: 300, y: 160, w: 40, h: 30 },
    ];
    for (const a of areas)
      for (let i = 0; i < 9; i++)
        spots.push({ x: a.x + rnd() * a.w, y: a.y + rnd() * a.h, rx: 2 + rnd() * 7, ry: 1.5 + rnd() * 5, o: 0.4 + rnd() * 0.6 });
    return spots;
  }, []);

  const restLogged = condition.logged.rest || condition.ignored.rest;
  const rustOpacity = condition.ignored.rest ? 0 : restLogged ? Math.max(0, 0.75 - v.rest) * 0.9 : 0.42;
  const coolLevel = TOWER.bottom - (TOWER.bottom - TOWER.top) * Math.max(0.02, Math.min(1, v.cooling));
  const coolGlow = 0.15 + v.cooling * 0.85;

  const sys = (sid: IndicatorId, children: ReactNode, halo: { x: number; y: number; w: number; h: number }) => {
    if (compact || !onSelect) return <g className="sys-static">{children}</g>;
    const info = INDICATORS[sid];
    return (
      <g
        className={`sys${selected === sid ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected === sid}
        aria-label={`${info.system}: ${info.name}. Show details`}
        onClick={() => onSelect(sid)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(sid);
          }
        }}
      >
        <rect className="sys-hit" x={halo.x} y={halo.y} width={halo.w} height={halo.h} rx={14} />
        {children}
        <rect className="sys-halo" x={halo.x} y={halo.y} width={halo.w} height={halo.h} rx={14} />
      </g>
    );
  };

  const steamColor = steamKind === 'aether' ? '#cdeff5' : '#ece6da';
  const pipeGrad = `url(#${id('pipe')})`;
  const pipeGradV = `url(#${id('pipeV')})`;
  const metal = `url(#${id('metal')})`;
  const metalV = `url(#${id('metalV')})`;

  const beltN = { x: 13.9, y: -17.05 };

  return (
    <svg
      viewBox={compact ? "50 20 890 480" : "50 24 880 572"}
      className={`engine-svg${compact ? ' compact' : ''}`}
      role="img"
      aria-label={`Human Engine, ${condition.label}. Rest ${pct(v.rest)}, cooling ${pct(v.cooling)}, motion ${pct(v.motion)}, fuel ${pct(v.fuel)}, equilibrium ${pct(v.equilibrium)}.`}
    >
      <defs>
        <linearGradient id={id('metal')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={finish.lo} />
          <stop offset="0.22" stopColor={finish.mid} />
          <stop offset="0.42" stopColor={finish.hi} />
          <stop offset="0.6" stopColor={finish.mid} />
          <stop offset="1" stopColor={finish.lo} />
        </linearGradient>
        <linearGradient id={id('metalV')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={finish.hi} />
          <stop offset="0.45" stopColor={finish.mid} />
          <stop offset="1" stopColor={finish.lo} />
        </linearGradient>
        <linearGradient id={id('pipe')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={finish.pipe[0]} />
          <stop offset="0.5" stopColor={finish.pipe[1]} />
          <stop offset="1" stopColor={finish.pipe[2]} />
        </linearGradient>
        <linearGradient id={id('pipeV')} x1="0" x2="1" y1="0" y2="0">
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
          <stop offset="0.7" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
        <radialGradient id={id('fire')} cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset="0.3" stopColor="#ffb23e" />
          <stop offset="0.7" stopColor="#d8531a" />
          <stop offset="1" stopColor="#5a1606" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('inner')} cx="0.5" cy="0.85" r="0.9">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.45" stopColor="#e88a2e" />
          <stop offset="1" stopColor="#3a1406" />
        </radialGradient>
        <linearGradient id={id('coolant')} x1="0" x2="1">
          <stop offset="0" stopColor="#1d5a5c" />
          <stop offset="0.45" stopColor="#5fc0bb" />
          <stop offset="1" stopColor="#1d5a5c" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="0.2" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.08)" />
        </linearGradient>
        <linearGradient id={id('glint')} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,250,230,0)" />
          <stop offset="0.5" stopColor="rgba(255,250,230,0.55)" />
          <stop offset="1" stopColor="rgba(255,250,230,0)" />
        </linearGradient>
        <radialGradient id={id('vignette')} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor="rgba(232,163,61,0.10)" />
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
        <pattern id={id('grid')} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="rgba(201,154,75,0.07)" strokeWidth="1" />
        </pattern>
        <clipPath id={id('boilerClip')}>
          <path d="M290,470 L290,195 Q290,140 400,138 Q510,140 510,195 L510,470 Z" />
        </clipPath>
        <clipPath id={id('towerClip')}>
          <rect x={TOWER.x1} y={TOWER.top} width={TOWER.x2 - TOWER.x1} height={TOWER.bottom - TOWER.top} rx={6} />
        </clipPath>
        <clipPath id={id('slotClip')}>
          <rect x={556} y={350} width={94} height={20} rx={3} />
        </clipPath>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={steamKind === 'aether' ? 4 : 2.5} />
        </filter>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* backdrop */}
      <rect width="960" height="600" fill={`url(#${id('grid')})`} />
      <rect width="960" height="600" fill={`url(#${id('vignette')})`} />
      {!compact && (
        <g className="blueprint" opacity="0.5">
          <circle cx={FW.x} cy={FW.y} r={118} fill="none" stroke="rgba(201,154,75,0.16)" strokeDasharray="2 6" />
          <line x1={60} y1={482} x2={900} y2={482} stroke="rgba(201,154,75,0.2)" />
          <text x={914} y={86} className="bp-text" textAnchor="end">FIG. 1 — HUMAN ENGINE, GENERAL ARRANGEMENT</text>
          <text x={914} y={100} className="bp-text" textAnchor="end">SCALE: ONE PERSON</text>
        </g>
      )}
      <ellipse cx={480} cy={486} rx={430} ry={14} fill="rgba(0,0,0,0.45)" />

      {/* ── STACK (behind boiler) ── */}
      <g>
        <rect x={432} y={62} width={30} height={90} fill={pipeGradV} />
        <rect x={426} y={54} width={42} height={12} rx={2} fill={metalV} stroke={finish.lo} />
        <rect x={429} y={96} width={36} height={6} fill={finish.band} opacity={0.8} />
      </g>

      {/* ── COOLING: tower + coolant line ── */}
      {sys(
        'cooling',
        <g>
          {/* coolant pipe into boiler */}
          <rect x={160} y={446} width={132} height={16} fill={pipeGrad} />
          <rect x={160} y={451} width={132} height={6} className="flow-line" fill="none" stroke="#7fe0d6" strokeWidth={2} strokeDasharray="6 10" opacity={coolGlow * 0.9} />
          <rect x={204} y={442} width={10} height={24} rx={2} fill={metalV} />
          <rect x={262} y={442} width={10} height={24} rx={2} fill={metalV} />
          {/* tower caps */}
          <path d={`M92,182 L92,166 Q130,140 168,166 L168,182 Z`} fill={metalV} stroke={finish.lo} />
          <rect x={92} y={428} width={76} height={42} rx={3} fill={metal} stroke={finish.lo} />
          <Rivets x1={98} x2={162} y={174} gap={16} fill={finish.rivet} />
          <Rivets x1={98} x2={162} y={438} gap={16} fill={finish.rivet} />
          {/* glass */}
          <rect x={TOWER.x1} y={TOWER.top} width={60} height={250} rx={6} fill="rgba(10,20,22,0.85)" stroke={finish.edge} strokeWidth={1.2} />
          <g clipPath={`url(#${id('towerClip')})`}>
            <rect x={TOWER.x1} y={coolLevel} width={60} height={TOWER.bottom - coolLevel + 4} fill={`url(#${id('coolant')})`} opacity={0.35 + 0.65 * coolGlow} className="coolant" />
            <ellipse cx={130} cy={coolLevel} rx={30} ry={3} fill="#a6efe6" opacity={0.5 * coolGlow} className="coolant-surface" />
            {v.cooling > 0.04 &&
              [0, 1, 2, 3, 4].map((i) => (
                <circle key={i} className={`bubble b${i}`} cx={108 + i * 11} cy={TOWER.bottom - 6} r={1.6 + (i % 2)} fill="#d9fbf6" opacity={0.6} style={{ ['--rise' as string]: `${-(TOWER.bottom - coolLevel - 10)}px` }} />
              ))}
          </g>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={TOWER.x2 - 12} x2={TOWER.x2} y1={TOWER.bottom - 250 * f} y2={TOWER.bottom - 250 * f} stroke={finish.edge} strokeWidth={1} opacity={0.8} />
              <text x={TOWER.x2 + 6} y={TOWER.bottom - 250 * f + 3} className="tick-text">{f * 100}</text>
            </g>
          ))}
          <rect x={TOWER.x1} y={TOWER.top} width={60} height={250} rx={6} fill={`url(#${id('glass')})`} />
          {/* brackets */}
          <rect x={88} y={250} width={84} height={7} rx={2} fill={metalV} />
          <rect x={88} y={350} width={84} height={7} rx={2} fill={metalV} />
          <rect x={108} y={484 - 14} width={44} height={14} fill={metal} />
        </g>,
        { x: 74, y: 134, w: 230, h: 346 },
      )}

      {/* ── REST: flyball governor ── */}
      {sys(
        'rest',
        <g>
          <rect x={220} y={262} width={20} height={208} fill={metal} stroke={finish.lo} />
          <rect x={210} y={244} width={40} height={22} rx={3} fill={metalV} stroke={finish.lo} />
          <rect x={206} y={462} width={48} height={18} rx={2} fill={metal} />
          <Rivets x1={214} x2={246} y={255} gap={16} fill={finish.rivet} />
          <line x1={GOV.x} y1={GOV.top - 12} x2={GOV.x} y2={246} stroke={finish.edge} strokeWidth={4} />
          <circle cx={GOV.x} cy={GOV.top - 14} r={6} fill={metalV} stroke={finish.lo} />
          <g ref={gov}>
            {[0, 1].map((i) => (
              <g key={i}>
                <line ref={(el) => (govEls.current.arms[i] = el)} x1={GOV.x} y1={GOV.top} x2={GOV.x + 20} y2={GOV.top + 40} stroke={finish.edge} strokeWidth={2.4} />
                <line ref={(el) => (govEls.current.links[i] = el)} x1={GOV.x + 20} y1={GOV.top + 40} x2={GOV.x} y2={GOV.top + 70} stroke={finish.mid} strokeWidth={1.8} />
              </g>
            ))}
            <rect ref={(el) => (govEls.current.sleeve = el)} x={GOV.x - 7} y={GOV.top + 66} width={14} height={8} rx={2} fill={metalV} />
            {[0, 1].map((i) => (
              <circle key={i} ref={(el) => (govEls.current.balls[i] = el)} cx={GOV.x + 20} cy={GOV.top + 40} r={8} fill={`url(#${id('bezel')})`} stroke={finish.lo} strokeWidth={0.8} />
            ))}
          </g>
        </g>,
        { x: 190, y: 112, w: 82, h: 368 },
      )}

      {/* ── FUEL: boiler body, firebox & internal light ── */}
      {sys(
        'fuel',
        <g>
          <path d="M290,470 L290,195 Q290,140 400,138 Q510,140 510,195 L510,470 Z" fill={metal} stroke={finish.lo} strokeWidth={1.5} />
          {/* boiler bands */}
          {[192, 296, 392].map((y) => (
            <g key={y}>
              <rect x={286} y={y} width={228} height={11} rx={2} fill={finish.band} stroke={finish.lo} strokeWidth={0.8} />
              <Rivets x1={296} x2={504} y={y + 5.5} gap={16} r={2} fill={finish.rivet} />
            </g>
          ))}
          {/* glass window with internal light */}
          <rect x={338} y={312} width={124} height={72} rx={12} fill="#120805" stroke={finish.edge} strokeWidth={3} />
          <rect ref={windowGlow} x={340} y={314} width={120} height={68} rx={10} fill={`url(#${id('inner')})`} opacity={0.5} />
          <g className="convection" opacity={0.35 + condition.overall * 0.5}>
            <path d="M352,378 C362,360 346,348 358,330" stroke="#ffe3a6" strokeWidth={1.4} fill="none" />
            <path d="M392,378 C402,356 384,346 398,326" stroke="#ffe3a6" strokeWidth={1.2} fill="none" />
            <path d="M432,378 C440,360 426,350 440,332" stroke="#ffe3a6" strokeWidth={1.4} fill="none" />
          </g>
          <rect x={340} y={314} width={120} height={68} rx={10} fill={`url(#${id('glass')})`} />
          {[350, 450].map((x) => [322, 374].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.4} fill={finish.rivet} />))}
          {/* firebox door */}
          <g ref={fire} opacity={0.5}>
            <circle cx={400} cy={432} r={34} fill={`url(#${id('fire')})`} filter={`url(#${id('glow')})`} />
          </g>
          <circle cx={400} cy={432} r={25} fill="none" stroke={finish.edge} strokeWidth={5} />
          {[-12, -4, 4, 12].map((dx) => (
            <line key={dx} x1={400 + dx} y1={410} x2={400 + dx} y2={454} stroke={finish.lo} strokeWidth={3} opacity={0.85} />
          ))}
          <circle cx={427} cy={432} r={4} fill={finish.rivet} />
          {/* safety valve */}
          <rect x={333} y={128} width={14} height={22} fill={pipeGradV} />
          <rect x={329} y={124} width={22} height={6} rx={2} fill={metalV} />
          <line x1={340} y1={127} x2={302} y2={118} stroke={finish.edge} strokeWidth={3} />
          <circle cx={302} cy={118} r={6} fill={metalV} stroke={finish.lo} />
          {/* plinth & nameplate */}
          <rect x={280} y={466} width={240} height={18} rx={2} fill={metal} stroke={finish.lo} />
          <rect x={340} y={469} width={120} height={12} rx={2} fill="#1a1512" stroke={finish.edge} strokeWidth={0.8} />
          <text x={400} y={478} textAnchor="middle" className="plate-text" fill={finish.edge}>
            HUMAN ENGINE · MK I
          </text>
          {/* rust (unrepaired wear) */}
          <g clipPath={`url(#${id('boilerClip')})`} opacity={rustOpacity} className="rust">
            {rust.slice(0, 27).map((s, i) => (
              <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill={i % 3 ? '#7a3a17' : '#5b2a10'} opacity={s.o} />
            ))}
          </g>
        </g>,
        { x: 278, y: 120, w: 244, h: 368 },
      )}

      {/* ── EQUILIBRIUM: main pressure regulator gauge ── */}
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
              { from: 0, to: 0.22, color: '#6d7a86' },
              { from: 0.25, to: 0.64, color: '#7f9a4e' },
              { from: 0.72, to: 1, color: '#b8432f' },
            ]}
          />
          <circle cx={466} cy={214} r={6} fill={condition.values.equilibrium > 0.55 ? '#9fd27a' : condition.values.equilibrium > 0.35 ? '#e8a33d' : '#8a5a4a'} className="pilot" />
          <circle cx={466} cy={214} r={9} fill="none" stroke={finish.edge} strokeWidth={1.5} />
        </g>,
        { x: 342, y: 192, w: 136, h: 108 },
      )}

      {/* ── MOTION: steam line, cylinder, crosshead, flywheel, gears ── */}
      {sys(
        'motion',
        <g>
          {/* steam line boiler → cylinder */}
          <rect x={508} y={350} width={36} height={20} fill={pipeGrad} />
          <rect x={516} y={346} width={8} height={28} rx={2} fill={metalV} />
          <line x1={520} y1={346} x2={520} y2={330} stroke={finish.edge} strokeWidth={3} />
          <circle cx={520} cy={326} r={10} fill="none" stroke={finish.edge} strokeWidth={3} />
          <line x1={510} y1={326} x2={530} y2={326} stroke={finish.edge} strokeWidth={1.5} />
          <line x1={520} y1={316} x2={520} y2={336} stroke={finish.edge} strokeWidth={1.5} />

          {/* belt (behind) */}
          <g ref={belt} className="belt" style={{ strokeDasharray: '14 10' }}>
            <line x1={FW.x + beltN.x} y1={FW.y + beltN.y} x2={GA.x + beltN.x} y2={GA.y + beltN.y} stroke="#2b1d12" strokeWidth={5} />
            <line x1={FW.x - beltN.x} y1={FW.y - beltN.y} x2={GA.x - beltN.x} y2={GA.y - beltN.y} stroke="#2b1d12" strokeWidth={5} />
          </g>
          {/* gear bracket */}
          <rect x={634} y={205} width={12} height={128} fill={metal} />
          {/* gears */}
          <g ref={gearB} transform={`translate(${GB.x} ${GB.y})`}>
            <path d={gearPath(9, 31, 24, 6)} fill={metalV} stroke={finish.lo} strokeWidth={1} fillRule="evenodd" />
            <circle r={13} fill="none" stroke={finish.lo} strokeWidth={1} opacity={0.6} />
          </g>
          <g ref={gearA} transform={`translate(${GA.x} ${GA.y})`}>
            <path d={gearPath(14, 46, 39, 0)} fill={metalV} stroke={finish.lo} strokeWidth={1} />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <circle key={a} cx={24 * Math.cos((a * Math.PI) / 180)} cy={24 * Math.sin((a * Math.PI) / 180)} r={6} fill="#14100d" opacity={0.8} />
            ))}
            <circle r={22} fill="none" stroke={finish.edge} strokeWidth={3} />
            <circle r={7} fill={finish.rivet} />
          </g>

          {/* cylinder */}
          <rect x={540} y={326} width={124} height={68} rx={8} fill={metalV} stroke={finish.lo} strokeWidth={1.2} />
          {[552, 584, 616, 648].map((x) => (
            <rect key={x} x={x} y={322} width={6} height={76} rx={2} fill={finish.band} stroke={finish.lo} strokeWidth={0.6} />
          ))}
          <rect x={556} y={350} width={94} height={20} rx={3} fill="#0d0907" stroke={finish.lo} />
          <g clipPath={`url(#${id('slotClip')})`}>
            <rect ref={pistonHead} x={600} y={351} width={14} height={18} rx={2} fill={finish.edge} />
          </g>
          {/* guides */}
          <rect x={664} y={344} width={100} height={4} fill={finish.mid} />
          <rect x={664} y={372} width={100} height={4} fill={finish.mid} />
          <line ref={pistonRod} x1={600} y1={360} x2={700} y2={360} stroke={finish.hi} strokeWidth={5} strokeLinecap="round" />
          <g ref={crosshead}>
            <rect x={-10} y={347} width={20} height={26} rx={3} fill={metalV} stroke={finish.lo} />
          </g>

          {/* flywheel stand */}
          <path d={`M${FW.x - 54},482 L${FW.x - 8},${FW.y} L${FW.x + 8},${FW.y} L${FW.x + 54},482 Z`} fill={metal} stroke={finish.lo} />
          {/* flywheel */}
          <circle cx={FW.x} cy={FW.y} r={FW.r} fill="none" stroke={finish.lo} strokeWidth={18} opacity={0.6} />
          <circle cx={FW.x} cy={FW.y} r={FW.r - 7} fill="none" stroke={`url(#${id('bezel')})`} strokeWidth={16} />
          <g ref={spokes}>
            {[0, 60, 120, 180, 240, 300].map((a) => {
              const r = (a * Math.PI) / 180;
              return (
                <path
                  key={a}
                  d={`M${FW.x + 14 * Math.cos(r - 0.25)},${FW.y + 14 * Math.sin(r - 0.25)} L${FW.x + (FW.r - 14) * Math.cos(r - 0.05)},${FW.y + (FW.r - 14) * Math.sin(r - 0.05)} L${FW.x + (FW.r - 14) * Math.cos(r + 0.05)},${FW.y + (FW.r - 14) * Math.sin(r + 0.05)} L${FW.x + 14 * Math.cos(r + 0.25)},${FW.y + 14 * Math.sin(r + 0.25)} Z`}
                  fill={finish.mid}
                  stroke={finish.lo}
                  strokeWidth={0.8}
                />
              );
            })}
            <line x1={FW.x} y1={FW.y} x2={FW.x + CRANK} y2={FW.y} stroke={finish.edge} strokeWidth={10} strokeLinecap="round" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
              <circle key={a} cx={FW.x + (FW.r - 7) * Math.cos((a * Math.PI) / 180)} cy={FW.y + (FW.r - 7) * Math.sin((a * Math.PI) / 180)} r={2} fill={finish.rivet} />
            ))}
          </g>
          <circle cx={FW.x} cy={FW.y} r={16} fill={`url(#${id('bezel')})`} stroke={finish.lo} />
          <circle cx={FW.x} cy={FW.y} r={22} fill="none" stroke="#2b1d12" strokeWidth={4} opacity={0.8} />
          <line ref={conRod} x1={710} y1={360} x2={FW.x + CRANK} y2={FW.y} stroke={finish.hi} strokeWidth={6} strokeLinecap="round" />
          <circle ref={crankPin} cx={FW.x + CRANK} cy={FW.y} r={6} fill={finish.rivet} stroke={finish.lo} />
          {/* cylinder rust */}
          <g opacity={rustOpacity}>
            {rust.slice(18, 27).map((s, i) => (
              <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx * 0.8} ry={s.ry * 0.7} fill="#6d3313" opacity={s.o} />
            ))}
          </g>
        </g>,
        { x: 504, y: 100, w: 426, h: 384 },
      )}

      {/* ── steam particles ── */}
      <g ref={steamG} filter={`url(#${id('soft')})`} pointerEvents="none">
        {Array.from({ length: STEAM_N }, (_, i) => (
          <circle key={i} r={0} fill={steamColor} opacity={0} />
        ))}
      </g>
      <g ref={ventG} filter={`url(#${id('soft')})`} pointerEvents="none">
        {Array.from({ length: VENT_N }, (_, i) => (
          <circle key={i} r={0} fill="#f3eee4" opacity={0} />
        ))}
      </g>
      <g ref={emberG} pointerEvents="none">
        {Array.from({ length: EMBER_N }, (_, i) => (
          <circle key={i} r={0} fill={i % 2 ? '#ffb347' : '#ff7a2a'} opacity={0} />
        ))}
      </g>
      {reducedMotion && (
        <g filter={`url(#${id('soft')})`} pointerEvents="none" opacity={0.25 + condition.overall * 0.5}>
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={STACK.x + i * 9} cy={STACK.y - 8 - i * 14} r={6 + i * 4} fill={steamColor} opacity={0.7 - i * 0.1} />
          ))}
          {steamKind === 'embers' && [0, 1, 2].map((i) => <circle key={`e${i}`} cx={STACK.x - 6 + i * 8} cy={STACK.y - 14 - i * 12} r={1.8} fill="#ffb347" />)}
        </g>
      )}

      {/* ── one-shot effects for logged actions ── */}
      {pulse && !compact && <Effect key={pulse.n} kind={pulse.kind} glint={id('glint')} clip={id('boilerClip')} reduced={reducedMotion} />}

      {/* ── instrument rail ── */}
      {!compact && (
        <g className="rail">
          <rect x={70} y={498} width={820} height={92} rx={10} fill="#16110d" stroke={finish.edge} strokeWidth={1.2} />
          <rect x={76} y={504} width={808} height={80} rx={7} fill="none" stroke="rgba(255,255,255,0.04)" />
          <Rivets x1={84} x2={876} y={510} gap={44} r={2} fill={finish.rivet} />
          {(['rest', 'cooling', 'motion', 'fuel', 'equilibrium'] as IndicatorId[]).map((k, i) => {
            const cx = 190 + i * 145;
            return (
              <g key={k}>
                <Dial cx={cx} cy={540} r={22} frac={v[k]} style={gauge} bezel={finish.edge} idPrefix={uid} dim={condition.ignored[k]} />
                <text x={cx} y={580} textAnchor="middle" className="rail-label">
                  {INDICATORS[k].name.toUpperCase()}
                  {condition.ignored[k] ? ' · OFF' : ''}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

function Effect({ kind, glint, clip, reduced }: { kind: PulseKind; glint: string; clip: string; reduced: boolean }) {
  switch (kind) {
    case 'cooling':
      return (
        <g className="fx fx-ring" pointerEvents="none">
          <rect x={96} y={176} width={68} height={258} rx={8} fill="none" stroke="#8ff0e4" strokeWidth={3} />
          {!reduced && <circle cx={130} cy={300} r={20} fill="none" stroke="#8ff0e4" strokeWidth={2} className="fx-wave" />}
        </g>
      );
    case 'rest':
    case 'repair': {
      const sparks = [
        [300, 250],
        [500, 220],
        [560, 340],
        [230, 200],
        [330, 420],
      ];
      return (
        <g className="fx fx-repair" pointerEvents="none">
          <g clipPath={`url(#${clip})`}>
            <rect x={150} y={130} width={120} height={360} fill={`url(#${glint})`} className={reduced ? '' : 'fx-glint'} opacity={reduced ? 0.4 : 1} />
          </g>
          {!reduced &&
            sparks.map(([x, y], i) => (
              <g key={i} className="fx-spark" style={{ animationDelay: `${i * 0.12}s` }} transform={`translate(${x} ${y})`}>
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                  <line key={a} x1={0} y1={0} x2={10 * Math.cos((a * Math.PI) / 180)} y2={10 * Math.sin((a * Math.PI) / 180)} stroke="#ffe8a3" strokeWidth={1.6} strokeLinecap="round" />
                ))}
              </g>
            ))}
        </g>
      );
    }
    case 'fuel':
      return (
        <g className="fx fx-ring" pointerEvents="none">
          <circle cx={400} cy={432} r={40} fill="none" stroke="#ffb347" strokeWidth={3} />
        </g>
      );
    case 'motion':
      return (
        <g className="fx fx-ring" pointerEvents="none">
          <circle cx={830} cy={360} r={98} fill="none" stroke="#e8a33d" strokeWidth={3} />
        </g>
      );
    case 'equilibrium':
    case 'vent':
      return (
        <g className="fx fx-ring" pointerEvents="none">
          <circle cx={400} cy={247} r={56} fill="none" stroke="#c9e6a0" strokeWidth={3} />
        </g>
      );
    default:
      return (
        <g className="fx fx-ring" pointerEvents="none">
          <rect x={286} y={136} width={228} height={346} rx={18} fill="none" stroke="#e8a33d" strokeWidth={2} />
        </g>
      );
  }
}

const pct = (n: number) => `${Math.round(n * 100)} percent`;
