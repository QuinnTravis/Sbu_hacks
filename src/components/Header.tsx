import { BookOpen, Cog, ListChecks, Wrench } from 'lucide-react';
import { dayPart, formatLong } from '../lib/date';
import { useStore } from '../state/store';
import { Emblem } from './ui';

export type Route = 'engine' | 'habits' | 'journal' | 'workshop';

const NAV: { id: Route; label: string; icon: typeof Cog }[] = [
  { id: 'engine', label: 'Engine Room', icon: Cog },
  { id: 'habits', label: 'Habits', icon: ListChecks },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'workshop', label: 'Workshop', icon: Wrench },
];

function greeting(state: string, todayActive: boolean): string {
  const part = dayPart();
  const opener = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Burning the midnight oil' }[part];
  if (!todayActive) return `${opener}. The engine is ready whenever you are.`;
  const tails: Record<string, string> = {
    cold: 'the first coals are in.',
    idle: 'the engine is ticking over nicely.',
    steady: 'everything is running steady.',
    full: 'you have her at full steam.',
  };
  return `${opener}, engineer. ${tails[state].charAt(0).toUpperCase()}${tails[state].slice(1)}`;
}

export default function Header({ route }: { route: Route }) {
  const { condition, progress } = useStore();
  return (
    <header>
      <div className="masthead">
        <a className="brand" href="#/engine" aria-label="Human Engine, go to the Engine Room">
          <Emblem className="brand-mark" />
          <div>
            <div className="wordmark">
              Human <em>Engine</em>
            </div>
            <div className="brand-sub">Daily habits · Steam &amp; steel</div>
          </div>
        </a>
        <div className="greeting">
          <div className="date">{formatLong()}</div>
          <div className="hello">{greeting(condition.state, progress.streak.todayActive)}</div>
        </div>
        <div className="status-chip" data-state={condition.state} title="Engine operating state, based on what you’ve logged today" aria-label={`Operating state: ${condition.label}`}>
          <span className="lamp" aria-hidden="true" />
          <span className="label">{condition.label}</span>
          <span className="pct">{Math.round(condition.overall * 100)}%</span>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} aria-current={route === n.id ? 'page' : undefined}>
            <n.icon aria-hidden="true" />
            {n.label}
          </a>
        ))}
      </nav>
      <div className="nav-rule" />
    </header>
  );
}
