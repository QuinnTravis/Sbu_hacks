import { formatLong } from '../lib/date';
import { hasDemo } from '../data/demo';
import { useStore } from '../state/store';
import { Emblem } from './ui';

export type Route = 'engine' | 'habits' | 'journal' | 'workshop';

const NAV: { id: Route; label: string }[] = [
  { id: 'engine', label: 'Engine Room' },
  { id: 'habits', label: 'Habits' },
  { id: 'journal', label: 'Journal' },
  { id: 'workshop', label: 'Workshop' },
];

export default function Header({ route }: { route: Route }) {
  const { state, condition, act, notify } = useStore();
  const demo = hasDemo(state);
  return (
    <header>
      <div className="masthead">
        <a className="brand" href="#/engine" aria-label="Human Engine, Engine Room">
          <Emblem className="brand-mark" />
          <span className="wordmark">
            Human Engine<small>a workshop for daily habits</small>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id}`} aria-current={route === n.id ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="double-rule" />
      <div className="dateline">
        <span>{formatLong()}</span>
        <span className="state">
          Engine <b>{condition.label.toLowerCase()}</b>, <span className="num">{Math.round(condition.overall * 100)}%</span> output
        </span>
        <span className="spacer" />
        {demo && (
          <span>
            <span className="sample">sample</span> entries are mixed in for illustration ·{' '}
            <button
              className="linkish"
              onClick={() => {
                act({ type: 'clearDemo' });
                notify({ kind: 'info', title: 'Sample entries removed', body: 'Only your own records remain.' });
              }}
            >
              remove them
            </button>
          </span>
        )}
      </div>
    </header>
  );
}
