# SteamScholar: Build Spec for Claude Code

**Project:** SteamScholar, an educational railway game for SBU Hacks "Steel and Steam" (UI/UX track)
**Developer:** one person, about 9 hours of build time. Build the smallest version that demos beautifully, then polish.
**Rule for Claude Code:** work in the phase order in section 14. Finish each phase's checklist before starting the next. Do not add features not listed here. When a decision is unspecified, pick the simplest option and note it in `DECISIONS.md`.

---

## 0. First step: audit the existing prototype

A prototype already exists: a train moving station to station in a 3D environment. Before writing any new code:

1. Read the project and report: 3D library (expected: React Three Fiber; if plain Three.js, wrap it in a React component), how the train moves (spline/path progress vs. position updates), any existing speed variable, number of stations, whether wheels/pistons/smoke are already animated, and the camera setup.
2. Write findings to `DECISIONS.md`.
3. Adapt the integration contract in section 4 to the real code. Reuse the prototype's scene; do not rebuild it.

---

## 1. Product summary

Users upload lecture notes, a PDF, or pasted text. The app uses an LLM (Google Gemini, free tier) to generate questions from that material. The player answers questions to drive a steam locomotive through a low-poly 3D world across 3 stations. Correct answers build boiler pressure and speed. Wrong answers slow the train and open a "Maintenance Stop" panel that explains the right answer and cites the source page. A "Station Report" at the end shows accuracy per concept and what to revisit.

**Pitch line:** "Active recall feels like play. Keep the steam up by knowing your stuff."

---

## 2. Scope

**In scope (v1)**
- Depot screen (upload PDF / TXT / pasted text, plus "Try a sample deck")
- Loading screen (themed boiler-warming animation)
- Gameplay HUD: 3D scene, pressure gauge, speedometer, station progress track, question card
- Maintenance Stop explanation panel
- Station arrival interstitial (brief per-station stats)
- Station Report (end of run)
- Settings drawer: sound on/off, reduce motion
- Keyboard play (keys 1-4 for MCQ, T/F for true/false)
- Sound and steam feedback
- Local-storage persistence of the last report and settings
- Cached sample deck as the demo fallback

**Out of scope (do not build)**
Accounts or login, multiplayer, route-map hub screen, track switches, cargo/mastery system, overheating mechanic, day/night cycle, ambient music, onboarding tour, train-pass screen wipe, question types beyond MCQ and true/false, mobile polish (the question UI must be usable on mobile, not beautiful).

**Stretch (only if all phases are done)**: speed lines, train-pass wipe, onboarding tour.

---

## 3. Tech stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **3D:** React Three Fiber + drei (reuse the prototype scene)
- **State:** Zustand
- **Audio:** Howler.js
- **Animation (UI):** Framer Motion (respect reduce-motion)
- **Backend:** Node + Express + TypeScript, `multer` (uploads), `pdf-parse` (per-page text extraction), `zod` (validation), `@google/genai` (Gemini SDK; a plain `fetch` call to the REST API is an acceptable alternative)
- **AI model:** Google Gemini via the Gemini API **free tier** (key from https://aistudio.google.com/apikey, no credit card). Use a **Flash** model, because Pro models are paid. Read the model ID from the `GEMINI_MODEL` env var rather than hardcoding it. Default to the `gemini-flash-latest` alias if it works; otherwise use the current Flash model ID listed in AI Studio. The key lives in `GEMINI_API_KEY` (server-side only, never exposed to the client).
- **Provider abstraction:** wrap the LLM call behind one function, `generateJson(systemPrompt, userContent): Promise<string>`, in `server/src/lib/llm.ts`, selected by `LLM_PROVIDER` (`gemini` by default). Implement only `gemini` now, but keep the interface so Groq (OpenAI-compatible endpoint) can be swapped in within minutes if Gemini rate-limits you mid-hackathon.
- **Dev:** one `npm run dev` script that starts both client and server (use `concurrently`); Vite proxies `/api` to the server

---

## 4. Integration contract with the 3D scene

The game logic never touches Three.js objects directly. The scene exposes and consumes this interface through the Zustand store (`useGameStore`):

**Game to scene (read by the scene every frame)**
- `targetSpeed: number` (0-100). The scene smoothly interpolates the train's actual speed toward this value (lerp factor about 0.04 per frame, tweak by feel). Map speed to along-track progress per frame.
- `stopAtNextStation: boolean`. When true, the train decelerates and stops at the next station.
- `reduceMotion: boolean`. Disable camera shake and cut particle density.

**Scene to game (calls into the store)**
- `onStationArrived(stationIndex: number)`
- `actualSpeed: number` (written each frame or throttled to about 10Hz, used by the speedometer and the chug audio pitch)

**Imperative effect triggers** (exported from a small `effects.ts` that the scene registers handlers into)
- `triggerSteamBurst()`: correct answer, a big puff from the stack and cylinders
- `triggerSputter()`: wrong answer, a few small irregular puffs and a brief slowdown
- Wheels and pistons must animate proportional to `actualSpeed`. If the prototype lacks this, add it. Smoke should emit continuously at a rate scaled by speed.

The run uses exactly 3 stations. If the prototype has more, use the first 3 as playable stops (name them in section 6.4). If it has fewer, add stops along the loop.

---

## 5. Design system

### 5.1 Mood
Warm Victorian brass and parchment, with iron-black UI chrome around the 3D scene and cream cards for readable learning content. Texture is subtle only: thin rivet borders and faint paper grain. Legibility of questions and explanations beats theme, always.

### 5.2 Color tokens (put these in `tailwind.config` and CSS variables)

| Token | Hex | Use |
|---|---|---|
| `iron-950` | `#14110F` | Page background |
| `iron-900` | `#1E1A17` | HUD chrome, panels |
| `iron-700` | `#3A332D` | Borders, dividers |
| `brass-500` | `#B08D57` | Frames, gauge rims, headings on dark |
| `brass-300` | `#D9BE8A` | Highlights, hover borders |
| `copper-500` | `#B8683A` | Secondary accent, "missed" state |
| `cream-100` | `#F6EEDC` | Question card background |
| `cream-300` | `#E8DBBE` | Card secondary surfaces |
| `ink-900` | `#2B2118` | Text on cream (contrast over 12:1) |
| `amber-500` | `#F2A33A` | The only interactive accent: focus rings, primary buttons, correct feedback |
| `verdigris-500` | `#4F9D8B` | Success checkmarks and correct-answer tint (paired with an icon) |

Text on dark must be `cream-100` or `brass-300`. Never use red. Incorrect states use `copper-500` plus an X icon and the label "Not quite."

### 5.3 Typography
- **Display:** `Rye` (Google Fonts) for the logo and screen titles only; fall back to `Alfa Slab One`. Never for paragraphs.
- **Body/UI:** `Inter` for questions, answers, explanations, buttons, and labels.
- Base question text 20-22px desktop, 18px mobile. Answer text 18px. Line-height 1.5.

### 5.4 Component states (every interactive element needs all of these)
default, hover, focus-visible (2px amber ring + 2px offset), active (pressed: translateY(2px), shadow reduced, like a lever), disabled, and for answer buttons additionally: selected, correct (verdigris tint + check icon + "Correct" label), incorrect (copper tint + X icon + "Not quite" label). Color is never the only signal.

### 5.5 Shared components to build
`Button` (primary amber, secondary brass-outline), `Panel` (iron with rivet border), `Card` (cream with paper grain), `Gauge` (analog dial, SVG), `ProgressTrack` (SVG), `AnswerButton`, `Modal/Drawer`, `Toggle`, `Toast`.

---

## 6. Screens

### 6.1 Depot (upload), route `/`
- Title "SteamScholar" in Rye, tagline "Load your notes. Fire up the boiler."
- Large drag-and-drop zone styled as a loading dock: dashed brass border, crate icon, text "Drop your study materials here". Click to browse. Accepts `.pdf`, `.txt`, max 10 MB.
- Beneath it, a textarea toggle: "Or paste your notes".
- Secondary button: "Try a sample deck" (instant, uses the cached deck).
- Primary button "Fire up the boiler" is disabled until a file or at least 200 characters of text exist.
- A small one-line notice under the drop zone: "Free AI tier: don't upload anything private."
- Errors inline, in friendly language (see 12).
- 3D scene visible dimmed behind the panel if cheap to do; otherwise a static dark background.

### 6.2 Loading
- Boiler-warming animation: a pressure gauge needle slowly climbing plus rotating status text: "Shoveling coal...", "Reading your notes...", "Writing your exam questions...", "Checking the track...".
- Real progress is not available, so run a fake ease-out progress bar that holds at 90% until the API returns.
- If generation exceeds 45 seconds or fails, show the error state with "Retry" and "Use sample deck".

### 6.3 Gameplay HUD (the hero screen, design this one most carefully)

Layout, desktop (1280x720 baseline):
- **Top about 55%:** the 3D scene. Overlaid on it:
  - top-left: **Pressure gauge** (analog dial, 0-100, needle with slight overshoot and settle, zones: low/ok/high)
  - top-right: **Speedometer** readout (small dial or digital readout in brass) plus a sound toggle and settings icon
  - top-center: **Station progress track** (SVG: 3 station dots on a rail line, completed = lit amber, current = pulsing, plus a small train icon sliding between them by question progress)
  - small **streak badge** under the gauge ("Streak x4"), visible when streak is 2 or more
- **Bottom about 45%:** iron panel containing the **question card** (cream): concept tag (small caps label such as "BIG-O NOTATION"), question text, then 4 answer buttons in a 2x2 grid (stack on mobile) or 2 buttons for true/false. Show key hints "1-4" on the buttons.
- On mobile (under 768px): scene shrinks to about 35%, gauges collapse into one compact row, answers stack.

Interaction flow per question:
1. Question appears (fade/slide up 200ms).
2. Player picks an answer (click or key). Buttons lock.
3. **Correct:** the chosen button turns verdigris with a check, `triggerSteamBurst()`, whistle, needle jumps, speed increases. Auto-advance after about 1.2s.
4. **Wrong:** chosen button shows copper X, the correct one is revealed, `triggerSputter()`, speed dips, pressure drops. After 600ms the Maintenance Stop panel slides in (6.5).
5. After the 4th question of a station, set `stopAtNextStation`, show the station interstitial on arrival (6.4).

### 6.4 Station arrival interstitial
Stations (names): **1. Ashford Junction**, **2. Copperhill Pass**, **3. Ironbridge Terminal**.
When the train stops, show a slim brass "station sign" banner for about 2.5s: station name, "4 of 4 answered", accuracy for this leg, and a "Depart" button (also Enter/Space). On departing from stations 1 and 2, the game continues; on arrival at station 3 go to the Station Report.

### 6.5 Maintenance Stop panel
A cream card that slides up over the question card (the 3D scene stays visible above). Contents:
- Header: wrench icon + "Maintenance Stop"
- "The right answer": the correct option text
- "Why": the explanation (2-3 sentences)
- "From your notes": source label, e.g. "Page 4" (omit gracefully if page is null)
- Footer: a single primary button "Back on track" (Enter/Space). No red, no blame; tone is supportive.
- Missed question is requeued (see 7.4).

### 6.6 Station Report, route `/report`
Styled as a **railway ticket / timetable**:
- Title: "Journey Complete" plus deck title
- Big stats row: overall accuracy, best streak, total time, peak pressure
- **Concept breakdown:** list of concepts, each with a small horizontal bar (accuracy) plus an icon and numeric percentage (not color only). Weak concepts (under 70%) get a "Revisit" tag.
- "Revisit these" list: concepts plus the questions missed, each with the correct answer and source page.
- Buttons: "Ride again" (same deck, reshuffled), "New materials" (back to Depot), "Download report" (print stylesheet or simple `window.print()`).
- Persist the last report in localStorage.

### 6.7 Settings drawer
Toggles: Sound on/off (default on), Reduce motion (default follows `prefers-reduced-motion`). Persist to localStorage.

---

## 7. Game logic

### 7.1 Store shape (Zustand)
```ts
type Phase = 'depot' | 'loading' | 'playing' | 'maintenance' | 'station' | 'report';

interface GameState {
  phase: Phase;
  deck: Deck | null;
  queue: Question[];            // upcoming questions for the run
  current: Question | null;
  answered: AnswerRecord[];     // {questionId, concept, correct, ms, pressureAtAnswer}
  stationIndex: number;         // 0..2
  questionsThisStation: number; // 0..4
  pressure: number;             // 0..100
  streak: number;
  bestStreak: number;
  peakPressure: number;
  targetSpeed: number;          // 0..100, read by the scene
  actualSpeed: number;          // written by the scene
  stopAtNextStation: boolean;
  settings: { sound: boolean; reduceMotion: boolean };
  // actions
  startRun(deck: Deck): void;
  answer(optionId: string): void;
  dismissMaintenance(): void;
  departStation(): void;
}
```

### 7.2 Speed and pressure rules (tune by feel, keep constants in `gameConfig.ts`)
- Start: `pressure = 20`, `streak = 0`.
- `targetSpeed = clamp(15 + pressure * 0.75, 0, 100)` while playing. (Cruising at 15 minimum so the train is never dead.)
- **Correct:** `streak += 1`, `pressure += 12 + min(streak, 5) * 2` (and `+6` extra if difficulty is hard), cap 100.
- **Wrong:** `streak = 0`, `pressure = max(0, pressure - 30)`, and briefly force `targetSpeed = 8` for 1.5s, then resume the formula.
- Track `peakPressure`.
- No overheating mechanic in v1.

### 7.3 Adaptive difficulty
Pick the next question's difficulty from pressure: below 35 → `easy`, 35-69 → `medium`, 70+ → `hard`. If the pool for that difficulty is empty, fall back to the nearest available. Never repeat a question within a run unless it is a requeue.

### 7.4 Missed-question requeue
When a question is answered wrong, insert it back into the queue 3-4 questions later (once only, no infinite loops). Count the requeued appearance toward the station's 4 questions.

### 7.5 Run structure
3 stations x 4 questions = 12 question slots per run. The deck contains about 24 questions so there is variety by difficulty.

### 7.6 Station flow
After the 4th answer at a station (and after the Maintenance Stop is dismissed, if any): set `stopAtNextStation = true`. Scene calls `onStationArrived`. Phase becomes `station`. On `departStation()`: increment `stationIndex`, reset `questionsThisStation`, clear the stop flag, phase `playing`. After station index 2 arrival, go to `report`.

---

## 8. Backend and AI

### 8.1 Endpoints
- `POST /api/generate` (multipart: `file` OR JSON `{ text }`) → `Deck` JSON. Max 10 MB. Returns 400 with a friendly message if the extracted text is under 200 chars.
- `GET /api/sample` → the cached sample deck (read from `server/sample/sampleDeck.json`).
- `GET /api/health`

### 8.2 Text extraction
- PDF: extract **per page** so questions can cite page numbers. Build text as `[Page N]\n...` blocks.
- TXT/pasted: single block, page `null`.
- Truncate to about 30,000 characters; if over the limit, sample evenly across pages.

### 8.3 Deck and question schema (validate with zod, share types with the client)
```ts
interface Deck {
  id: string;
  title: string;            // inferred from the material
  concepts: string[];       // 5-8 concept names
  questions: Question[];    // 24 total
}

interface Question {
  id: string;
  type: 'mcq' | 'tf';
  difficulty: 'easy' | 'medium' | 'hard';
  concept: string;          // must be one of deck.concepts
  prompt: string;
  options: { id: string; text: string }[];   // mcq: 4 options (a-d); tf: 2 options (true/false)
  correctOptionId: string;
  explanation: string;      // 2-3 sentences, supportive tone
  source: { page: number | null; label: string };  // label e.g. "Page 4" or "Your notes"
}
```
Target mix: 24 questions = 8 easy, 10 medium, 6 hard; about 80% MCQ and 20% true/false; spread across concepts.

### 8.4 LLM prompt and call (server-side, Gemini)
**Call settings**
- Request JSON output natively: set `responseMimeType: "application/json"` and pass a `responseSchema` matching the `Deck` schema if the SDK supports it. Still validate with zod, because free-tier Flash models can drift.
- `temperature` about 0.7. One call generates the whole 24-question deck (do not call per question).
- **Rate limits:** free-tier limits are low and change without notice. On HTTP 429 or 503, wait 2s and retry once, then fail over to the friendly "The boiler stalled" error with the "Use sample deck" button. Never retry in a tight loop.
- **Privacy note:** free-tier Gemini requests may be used by Google to improve its models. Show a one-line notice on the Depot screen: "Free AI tier: don't upload anything private."

System prompt guidance:
- You are generating study questions strictly from the provided material. Use only facts present in it.
- Output **only** valid JSON matching the schema, no markdown fences.
- Randomize the position of correct answers; distractors must be plausible and not obviously wrong; avoid "all of the above".
- Explanations are 2-3 sentences, encouraging, and say why the right answer is right.
- `source.page` is the page marker the fact came from, or null.
- Vary question stems (definition, application, "which is NOT", scenario).
- Tag each question with a concept and a difficulty (easy = recall, medium = understanding/application, hard = multi-step or subtle distinction).

Validate with zod. On validation failure, retry once with the error message appended. On second failure, return 502 `{ error: "generation_failed" }`. Set a 40s timeout.

**Quality guardrails for a smaller free model**
- Post-validate: `concept` must be in `deck.concepts`, `correctOptionId` must match an option, MCQ has exactly 4 options and true/false exactly 2, and no duplicate prompts. Drop invalid questions rather than failing; require at least 15 valid questions with at least 3 per difficulty, otherwise treat it as a failure.
- If `source.page` is missing or not a page number present in the input, set it to `null`.
- Shuffle option order server-side after generation so the correct answer position is not biased.

### 8.5 Demo safety
`GET /api/sample` must work with no API key and no network, since the free tier is the most likely thing to fail during the demo. Pre-generate the sample deck once (run the generate route on the sample text below and commit the JSON to `server/sample/sampleDeck.json`), then review it by hand for accuracy.

---

## 9. Audio and feedback

Use Howler.js. Place files in `public/audio/` (free sounds from Pixabay or freesound.org; add placeholders first so the build works, then swap):
- `whistle.mp3`: correct answer and station arrival
- `chug-loop.mp3`: looping, with `rate` scaled from `actualSpeed` (0.8x to 1.6x) and volume from 0.15 to 0.5
- `ui-click.mp3`: button press
- `correct-chime.mp3`: soft chime layered under the whistle (optional)
- `sputter.mp3`: wrong answer

Audio starts only after the first user gesture (the "Fire up the boiler" click). Respect the sound toggle and persist it. No music.

**Motion feedback**
- Correct: steam burst, needle jump with overshoot, brief amber glow on the gauge rim.
- Wrong: small camera shake (about 200ms, amplitude small), sputter puffs, brief slowdown. All of it is disabled when `reduceMotion` is on (replace with a simple highlight).

---

## 10. Accessibility (state this in the pitch)

- Full keyboard play: 1-4 and T/F to answer, Enter/Space to continue, Esc to close the settings drawer.
- Visible focus rings on every interactive element.
- Correct/incorrect always communicated by icon + text label + color.
- WCAG AA contrast minimum on all text (cream/ink on cards, cream on iron).
- `prefers-reduced-motion` honored by default; user toggle available.
- Sound toggle; no information conveyed by audio alone.
- Semantic HTML: question in a `<fieldset>`/`role="radiogroup"`, answers as buttons with `aria-label`s, `aria-live="polite"` region announcing "Correct" or "Not quite, see the explanation".
- Gauges have text equivalents (`aria-label="Boiler pressure 62 percent"`).

---

## 11. Sample deck and demo

### 11.1 Sample material (default subject: "Data Structures Essentials")
Create `server/sample/sample-notes.txt` (about 1,200-1,800 words, organized with page markers) covering these concepts: **Big-O notation, Arrays and Dynamic Arrays, Linked Lists, Stacks and Queues, Hash Tables, Binary Search Trees**. Keep content accurate and textbook-standard. Generate `sampleDeck.json` from it as described in 8.5.

### 11.2 Scripted 90-second demo path
1. Depot: show the drop zone, click "Try a sample deck" (or drop a real PDF if the generation is fast).
2. Loading animation, about 3 seconds.
3. Answer 2 questions right (steam burst, gauge climbs, train speeds up, streak badge appears).
4. Answer 1 wrong on purpose: sputter, slowdown, Maintenance Stop panel with source page.
5. Arrive at station 1 (station sign), depart.
6. Skip ahead if needed (see the dev shortcut below) and finish at the Station Report: concept bars, "Revisit" tags.
7. Close with the accessibility toggles: show reduce-motion and keyboard play.

**Dev shortcut:** add a hidden `?demo=1` URL flag that sets stations to 2 questions each, so a full run takes under a minute.

---

## 12. Error states and microcopy

Tone: themed headings and buttons, plain language for instructions and explanations.

| Situation | Copy |
|---|---|
| Unsupported file type | "That cargo won't fit. Try a PDF or TXT file." |
| File too large | "That's a heavy load. Keep files under 10 MB." |
| PDF has no extractable text | "We couldn't read any text in this PDF (it may be scanned). Try pasting your notes instead." |
| Text too short | "Add a little more material so we can write good questions (200+ characters)." |
| Generation failed or timed out | "The boiler stalled. Retry, or ride on a sample deck." (buttons: Retry / Use sample deck) |
| Network error | "We lost the signal. Check your connection and retry." |

Buttons: "Fire up the boiler", "Back on track", "Depart", "Ride again", "New materials".

---

## 13. File structure
```
steamscholar/
  DECISIONS.md
  package.json
  client/
    src/
      main.tsx, App.tsx, routes
      store/gameStore.ts, gameConfig.ts
      scene/        (existing prototype, wrapped; effects.ts)
      screens/      Depot.tsx, Loading.tsx, Play.tsx, Report.tsx
      components/   Gauge.tsx, ProgressTrack.tsx, QuestionCard.tsx, AnswerButton.tsx,
                    MaintenancePanel.tsx, StationBanner.tsx, SettingsDrawer.tsx, ui/*
      audio/audioManager.ts
      lib/api.ts, types.ts, a11y.ts
      styles/tokens.css
    public/audio/
  server/
    src/index.ts, routes/generate.ts, lib/extract.ts, lib/prompt.ts, lib/llm.ts, lib/schema.ts
    sample/sample-notes.txt, sampleDeck.json
```

---

## 14. Build order with "done" checklists

**Phase 1: Backend and data (about 1.5h)**
- [ ] Express server with `/api/health`, `/api/sample`, `/api/generate`
- [ ] PDF per-page and TXT extraction working
- [ ] Gemini call (behind `lib/llm.ts`) returns schema-valid JSON (zod), with one validation retry and 429/503 handling
- [ ] Post-validation guardrails from 8.4 implemented
- [ ] `sampleDeck.json` generated, reviewed, and served with no API key

**Phase 2: Game state wired to the train (about 1.5h)**
- [ ] Prototype audited and `DECISIONS.md` written
- [ ] Zustand store with all rules from section 7
- [ ] Scene reads `targetSpeed`, honors `stopAtNextStation`, calls `onStationArrived`
- [ ] Temporary debug buttons (correct/wrong) show the train accelerating and slowing, and stopping at 3 stations

**Phase 3: HUD and question loop (about 1.5h)**
- [ ] Design tokens, fonts, base components
- [ ] Pressure gauge, speedometer, progress track overlays
- [ ] Question card with all answer-button states and keyboard control
- [ ] Adaptive difficulty and requeue working over a full 12-question run

**Phase 4: Depot, loading, report (about 1.5h)**
- [ ] Depot with drag-and-drop, paste, sample deck, validation, and error states
- [ ] Loading screen with timeout fallback
- [ ] Station Report ticket with concept bars and Revisit list
- [ ] Persistence of settings and last report

**Phase 5: Feedback and Maintenance Stop (about 1h)**
- [ ] Maintenance Stop panel with source citation
- [ ] Steam burst and sputter effects, wheel/piston animation tied to speed
- [ ] Audio manager with chug-loop pitch scaling and sound toggle

**Phase 6: Accessibility and polish (about 0.5h plus demo buffer of about 1.5h)**
- [ ] Reduce-motion and sound toggles, ARIA live region, focus order check
- [ ] Contrast check on all text pairs
- [ ] `?demo=1` shortcut
- [ ] Dry-run the full 90-second demo path twice with the cached deck, then once with a real PDF
- [ ] Fix only demo-blocking bugs in the final hour; no new features

---

## 15. Environment

`.env` (server): `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...` (free key from https://aistudio.google.com/apikey), `GEMINI_MODEL=gemini-flash-latest`, `PORT=8787`. Client has no secrets. Add `.env.example`. Document `npm install`, `npm run dev`, and `npm run build` in `README.md`.