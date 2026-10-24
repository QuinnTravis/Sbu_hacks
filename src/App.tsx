import { useEffect, useState } from 'react';
import Header, { type Route } from './components/Header';
import { Toasts } from './components/ui';
import EngineRoom from './pages/EngineRoom';
import Habits from './pages/Habits';
import Journal from './pages/Journal';
import Workshop from './pages/Workshop';

const ROUTES: Route[] = ['engine', 'habits', 'journal', 'workshop'];
const TITLES: Record<Route, string> = { engine: 'Engine Room', habits: 'Habits', journal: 'Journal', workshop: 'Workshop' };

function routeFromHash(): Route | null {
  const m = window.location.hash.match(/^#\/(\w+)/);
  return m && (ROUTES as string[]).includes(m[1]) ? (m[1] as Route) : null;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash() ?? 'engine');

  useEffect(() => {
    const on = () => {
      const r = routeFromHash();
      if (r) {
        setRoute(r);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    document.title = `${TITLES[route]} · Human Engine`;
  }, [route]);

  return (
    <div className="shell">
      <a href="#main" className="sr-only" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <Header route={route} />
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        {route === 'engine' && <EngineRoom />}
        {route === 'habits' && <Habits />}
        {route === 'journal' && <Journal />}
        {route === 'workshop' && <Workshop />}
      </main>
      <footer className="footer">
        <p>
          Human Engine is a playful habit companion, not a medical device. The engine is an imaginative picture of what you choose to log; it doesn’t measure hydration, sleep quality, stress or any other part of your body, and it doesn’t offer diagnosis or treatment.
          Default targets are general starting points; adjust or ignore them.
        </p>
        <p>Stored only in this browser.</p>
      </footer>
      <Toasts />
    </div>
  );
}
