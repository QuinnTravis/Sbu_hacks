import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ACHIEVEMENTS } from '../lib/progression';
import { COSMETICS } from '../data/catalog';
import { dateKey } from '../lib/date';
import { engineCondition, type EngineCondition } from '../lib/metrics';
import { computeProgress, type Progress } from '../lib/progression';
import { loadState, saveState } from '../lib/storage';
import type { AppState, IndicatorId } from '../types';
import { isDemoDay, reducer, type Action } from './reducer';

export interface Toast {
  id: number;
  kind: 'xp' | 'achievement' | 'level' | 'unlock' | 'info' | 'warn';
  title: string;
  body?: string;
}

export type PulseKind = IndicatorId | 'repair' | 'vent' | 'custom';

interface Store {
  state: AppState;
  today: string;
  progress: Progress;
  condition: EngineCondition;
  reducedMotion: boolean;
  toasts: Toast[];
  pulse: { kind: PulseKind; n: number } | null;
  act: (a: Action, opts?: { pulse?: PulseKind; label?: string; silent?: boolean }) => void;
  notify: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

const init = () => {
  const res = loadState();
  // First launch: seed sample history so the engine has something to show. It is labelled and removable.
  let state = res.state;
  if (res.firstLaunch && !state.seeded) state = reducer(state, { type: 'loadDemo', today: dateKey() });
  return { state, notice: res.notice, firstLaunch: res.firstLaunch };
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(init);
  const [state, rawDispatch] = useReducer(reducer, boot.state);
  const [today, setToday] = useState(dateKey);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pulse, setPulse] = useState<Store['pulse']>(null);
  const [systemReduced, setSystemReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  const toastId = useRef(1);
  const lastLabel = useRef<string | null>(null);
  const silentNext = useRef(true);

  // keep "today" fresh if the app stays open past midnight
  useEffect(() => {
    const t = window.setInterval(() => setToday(dateKey()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setSystemReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const notify = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === 'xp' ? 2600 : 5200);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  // persist (lightly debounced)
  const saveWarned = useRef(false);
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (!saveState(state) && !saveWarned.current) {
        saveWarned.current = true;
        notify({ kind: 'warn', title: 'Couldn’t save', body: 'Browser storage is unavailable, so changes will last only for this visit.' });
      }
    }, 150);
    return () => window.clearTimeout(h);
  }, [state, notify]);

  const noticeShown = useRef(false);
  useEffect(() => {
    if (noticeShown.current) return;
    noticeShown.current = true;
    if (boot.notice) notify({ kind: 'warn', title: 'Storage notice', body: boot.notice });
  }, [boot.notice, notify]);

  const progress = useMemo(() => computeProgress(state, today), [state, today]);
  const condition = useMemo(() => engineCondition(state, today), [state, today]);

  // Diff progression between renders to announce XP, levels, achievements and unlocks.
  const prev = useRef<Progress | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = progress;
    if (!p || silentNext.current) {
      silentNext.current = false;
      return;
    }
    const gained = progress.xp - p.xp;
    if (gained > 0) notify({ kind: 'xp', title: `+${gained} XP`, body: lastLabel.current ?? undefined });
    if (progress.level > p.level) notify({ kind: 'level', title: `Level ${progress.level}: ${progress.title}`, body: 'The engine has been upgraded. New finishes may be waiting in the Workshop.' });
    for (const id of progress.earned) {
      if (!p.earned.has(id)) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) notify({ kind: 'achievement', title: `Commendation: ${a.name}`, body: a.description });
      }
    }
    for (const id of progress.unlocked) {
      if (!p.unlocked.has(id)) {
        const c = COSMETICS.find((x) => x.id === id);
        if (c) notify({ kind: 'unlock', title: `Unlocked: ${c.name}`, body: 'Fit it in the Workshop.' });
      }
    }
  }, [progress, notify]);

  const pulseN = useRef(0);
  const act = useCallback<Store['act']>(
    (a, opts) => {
      if (opts?.silent || a.type === 'loadDemo' || a.type === 'clearDemo' || a.type === 'reset') silentNext.current = true;
      lastLabel.current = opts?.label ?? null;
      const dayActions: Action['type'][] = ['water', 'sleep', 'move', 'meal', 'breath', 'toggleCustom', 'journal'];
      if (dayActions.includes(a.type) && 'date' in a && isDemoDay(state, a.date)) {
        notify({ kind: 'info', title: 'Sample readings cleared for today', body: 'From here on, today’s engine runs only on your own entries.' });
      }
      rawDispatch(a);
      if (opts?.pulse) setPulse({ kind: opts.pulse, n: ++pulseN.current });
    },
    [state, notify],
  );

  const reducedMotion = state.settings.motion === 'reduced' || (state.settings.motion === 'system' && systemReduced);

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [reducedMotion]);

  const value: Store = { state, today, progress, condition, reducedMotion, toasts, pulse, act, notify, dismiss };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
