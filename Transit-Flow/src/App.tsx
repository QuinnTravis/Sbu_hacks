import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type InsightsFocus, type Settings, type StationFocus, type Tab } from './app/settings';
import { Icon } from './ui/kit';
import { detectEvents } from './engine/events';
import { PlanPage } from './plan/PlanPage';
import { StationsPage } from './stations/StationsPage';
import { InsightsPage } from './insights/InsightsPage';

const TABS: { id: Tab; label: string; icon: (s?: number) => React.ReactNode }[] = [
  { id: 'plan', label: 'Plan', icon: Icon.plan },
  { id: 'stations', label: 'Stations', icon: Icon.station },
  { id: 'insights', label: 'Insights', icon: Icon.insights },
];

function initialTab(): Tab {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  return h === 'stations' || h === 'insights' ? h : 'plan';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stationFocus, setStationFocus] = useState<StationFocus | null>(null);
  const [insightsFocus, setInsightsFocus] = useState<InsightsFocus | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectEvents()
      .then((d) => !cancelled && setSettings((s) => ({ ...s, detected: { kind: 'ok', ...d } })))
      .catch((e: Error) => !cancelled && setSettings((s) => ({ ...s, detected: { kind: 'error', message: e.message } })));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    try {
      history.replaceState(null, '', `#${tab}`);
    } catch {
      /* ignore: sandboxed frames may refuse */
    }
    window.scrollTo?.(0, 0);
  }, [tab]);

  const openStation = (f: StationFocus) => {
    setStationFocus(f);
    setTab('stations');
  };
  const openInsights = (f: InsightsFocus) => {
    setInsightsFocus(f);
    setTab('insights');
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="logo" title="TransitFlow">{Icon.logo(28)}</div>
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.icon(20)}
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <span className="prov" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Demo data</span>
      </nav>
      <main className="main">
        {tab === 'plan' && (
          <PlanPage settings={settings} setSettings={setSettings} onOpenStation={openStation} onOpenInsights={openInsights} />
        )}
        {tab === 'stations' && <StationsPage settings={settings} setSettings={setSettings} focus={stationFocus} />}
        {tab === 'insights' && <InsightsPage settings={settings} focus={insightsFocus} onOpenStation={openStation} />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.icon(20)}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
