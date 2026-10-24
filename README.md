# Human Engine

A health and wellness habit tracker shown as a living Victorian steam engine. Everything runs locally: React + TypeScript + Vite, SVG/CSS animation, localStorage persistence. No accounts, APIs or keys.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build -> dist/
npm run build:single # one self-contained HTML file -> dist-single/index.html
```

## Structure

```
src/
  types.ts                 domain types
  data/catalog.ts          default targets, indicators, cosmetics (finishes, gauges, steam)
  data/demo.ts             labelled sample data (demo: true)
  lib/storage.ts           load/save + sanitisers for malformed saves
  lib/metrics.ts           indicator readings & engine condition
  lib/progression.ts       XP rules, levels, streaks, achievements, unlocks (pure functions)
  lib/report.ts            daily engine report generator
  state/reducer.ts         all state changes
  state/store.tsx          provider: persistence, toasts, pulses, reduced motion
  components/engine/       the animated SVG engine
  components/              header, checklist, breathing modal, shared UI
  pages/                   Engine Room, Habits, Journal, Workshop
```

## Design notes

- XP is computed from what's logged, with per-day caps, so repeat clicking can't farm it and undo removes XP.
- Missed days cost nothing. A welcome-back bonus and the "Back at the Throttle" achievement reward recovery.
- Today's sample readings are a visual preview only: they earn no XP and are cleared on your first real entry.
- Indicators can be switched off. Ignored indicators idle neutrally and never drag the engine down.
- The engine is a metaphor for self-reported habits, not a physiological measurement.
