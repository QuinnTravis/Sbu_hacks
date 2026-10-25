# SteamScholar

Upload lecture notes, a PDF, or pasted text. Gemini writes 24 questions from it, and you answer them to drive a steam locomotive through a low-poly 3D world across three stations. Correct answers build boiler pressure and speed. A miss opens a Maintenance Stop that explains the right answer and cites the page. A Station Report at the end shows accuracy per concept and what to revisit.

> Active recall feels like play. Keep the steam up by knowing your stuff.

## Setup

Requires Node 20+.

```bash
cd SteamScholar
npm install
cp server/.env.example server/.env   # then paste a free key from https://aistudio.google.com/apikey
npm run dev                          # client on http://localhost:5173, API on :8787
```

The sample deck ("Try a sample deck") works with no API key and no internet connection.

| Script | What it does |
|---|---|
| `npm run dev` | Vite client and Express API together (Vite proxies `/api`) |
| `npm run build` | Type-checks and builds the server (`server/dist`) and client (`client/dist`) |
| `npm start` | Serves the built API and client from one process on `PORT` (default 8787) |
| `npm run typecheck` | Type-checks both workspaces |
| `npm run gen:sample -w server` | Regenerates `server/sample/sampleDeck.json` from `sample-notes.txt` through Gemini (review the output by hand) |
| `npm run smoke -w server [-- path/to/notes.pdf]` | Pre-demo check: real generation on the sample notes or your file, prints timing and question mix |
| `npm run sfx -w client` | Generates 3 ElevenLabs takes of each sound into `client/public/sfx-candidates/` (about 3,000 credits); audition at `/sfx-candidates/index.html` |
| `npm run sfx -w client -- --use whistle=1,chug-loop=2` | Copies chosen takes into `client/public/audio/` |
| `npm run audio:placeholders -w client` | Offline fallback: synthesized WAV stand-ins (set `AUDIO_EXT = 'wav'` in `audioManager.ts`) |

### Environment (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | Only `gemini` is implemented; `server/src/lib/llm.ts` is the one place to add Groq |
| `GEMINI_API_KEY` | (none) | Free tier, server-side only, never sent to the client |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | About 10-15 s per deck. `gemini-flash-latest` is a thinking model and took 79 s, over the 40 s budget. Pro models are paid |
| `ELEVENLABS_API_KEY` | (none) | Only for `npm run sfx`; the game never calls ElevenLabs at runtime |
| `PORT` | `8787` | |

Put your own lecture notes for dry runs in `SteamScholar/test-notes/`; that folder is gitignored.

## Demo shortcuts

- `?demo=1`: two questions per station, so a full run takes under a minute.
- `?debug=1`: correct / wrong buttons over the scene, plus live target and actual speed.

## Controls and accessibility

- `1`-`4` answer multiple choice, `T` / `F` answer true or false, `Enter` / `Space` continue or depart, `Esc` closes settings.
- Correct and incorrect are always shown with an icon, a text label and color. Every text pair meets WCAG AA (see `DECISIONS.md`).
- Reduce motion follows `prefers-reduced-motion` by default and can be toggled. Sound can be muted. Both settings persist.
- A polite live region announces "Correct" or "Not quite, see the explanation". Gauges have text equivalents.

## Layout

```
client/   React 18 + Vite + Tailwind + Zustand + Three.js scene + Howler
  src/scene/        buildWorld.ts (prototype geometry), TrainScene.tsx (loop + store contract), effects.ts
  src/store/        gameStore.ts (rules from spec section 7), gameConfig.ts (all tuning constants)
  src/screens/      Depot, Loading, Play, Report
  src/components/   Gauge, ProgressTrack, QuestionCard, AnswerButton, MaintenancePanel, StationBanner, SettingsDrawer, ui/*
server/   Express + multer + pdf-parse + zod; Gemini over REST
  src/lib/          extract.ts, prompt.ts, llm.ts, schema.ts (zod schemas + guardrails)
  sample/           sample-notes.txt, sampleDeck.json
```

Design choices and deviations from the build spec are logged in [DECISIONS.md](DECISIONS.md).

## Credits

Sound effects generated with [ElevenLabs](https://elevenlabs.io). Fonts: Rye, Alfa Slab One and Inter (SIL Open Font License), bundled via Fontsource.
