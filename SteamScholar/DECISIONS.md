# SteamScholar decisions log

Decisions made where the build spec (`steamscholar-design-doc.md`) was silent or had to bend to the real code.

## Phase 0: prototype audit

Source audited: `steamscholar_3d_industrial_railway_game.tsx` (2,403 lines, single file, last touched in commit `556e905`).

| Question | Finding |
|---|---|
| 3D library | **Plain Three.js** (`import * as THREE from 'three'`), built imperatively inside one `useEffect` in a React component. Not React Three Fiber. |
| How the train moves | **Treadmill.** The locomotive group sits at the origin; sleepers and scenery scroll toward +Z by `worldSpeed * dt` and wrap around. There is no spline. "Route progress" was a fake mileage counter (`distanceTraveledMiles`). |
| Speed variable | `telemetryRef.current.speedMph`, lerped toward `targetSpeedMph` at `dt * 1.8`. `worldSpeed = speedMph * 0.36` units/s. |
| Stations | 6 named `CHECKPOINTS` by mileage (HUD only). One 3D station mesh (platform, brick building, canopy, lamps) scrolled past on a 185-unit loop. There was no stopping logic. |
| Wheels / pistons / smoke | All already animated and proportional to speed: spoked driving wheels with quartered crank pins, exact slider-crank kinematics for crossheads and rods, small bogie/tender wheels, continuous chimney smoke scaled by speed and pressure, and lateral cylinder steam on `burstTimer`. |
| Camera | `PerspectiveCamera(50)` with 4 modes (chase, piston, cabin, orbit with mouse drag) and a small procedural sway. |
| Audio | Procedural Web Audio synth (`SteamAudioEngine`), not sample-based. |
| UI | Lucide icons, Tailwind-style classes, built-in steam-history question bank, custom-question modal, SVG brass telemetry cluster. |

### How the integration contract (spec section 4) is adapted

- **Keep plain Three.js, wrapped in a React component** (`client/src/scene/TrainScene.tsx`). The spec allows this, and porting about 1,000 lines of scene construction to R3F would be a rebuild. R3F and drei are not installed.
- The scene reads `useGameStore.getState()` inside its `requestAnimationFrame` loop (no React re-renders per frame) and writes `actualSpeed` back at about 10 Hz.
- **Speed mapping:** store speed 0-100 maps to `worldSpeed = speed * 0.2` world units/s. The actual speed lerps toward `targetSpeed` at 0.04 per 60 Hz frame (made frame-rate independent).
- **Station stops on a treadmill:** the station mesh is hidden while cruising. When `stopAtNextStation` turns true, the scene places the station ahead at braking distance (`v²/2a + 12` units, a = 5 u/s²) and caps speed at `sqrt(2·a·d)` so the train comes to rest with the platform beside the locomotive, then calls `onStationArrived(stationIndex)`. On departure the station scrolls away and is hidden again.
- The station is **mirrored to the left side of the track** because the chase camera sits on the right (x = 5.4) and would end up inside the station building. Telegraph poles (left side) are hidden while they overlap the platform.
- **Camera:** only the chase camera is kept. The camera-mode switcher and orbit drag are cut, since they are not in the spec and the HUD covers the scene corners.
- `effects.ts` exposes `triggerSteamBurst()`, `triggerSputter()` and `triggerShake()`; the scene registers handlers on mount.
- Removed from the prototype: the built-in question bank, custom-question modal, checkpoint mileage, telemetry cluster, and the Web Audio synth (replaced by Howler per spec). The original file is deleted from the tree. It lives on in git history at `556e905`.

## Build decisions

- **Workspace layout:** `SteamScholar/` is the spec's `steamscholar/` root. npm workspaces (`client`, `server`) with one root `npm install` / `npm run dev`.
- **Gemini via plain `fetch`** to the REST API (spec allows it). This avoids an SDK dependency, gives direct access to HTTP status codes for the 429/503 retry, and uses `AbortController` for the timeout.
- **40 s generation budget** is a single deadline shared by the first attempt and the validation retry, so the server always answers before the client's 45 s timeout.
- **Shared types:** `server/src/lib/schema.ts` (zod) is the source of truth. `client/src/lib/types.ts` re-exports the inferred types with `export type`.
- **Option ids after shuffle:** MCQ options are shuffled server-side and re-labelled `a`-`d` by position, so key `1` always means the first button. True/false is normalised to `[True, False]` in that order (ids `true` / `false`) and is never shuffled.
- **Question ids** are re-assigned server-side (`q1`…`qN`) so they are always unique.
- **Requeue model:** the spec's `queue: Question[]` is stored as `queue: { question, dueSlot }[]` (pending requeues only). New questions are drawn from `pool` by adaptive difficulty. A requeued question is served once its slot comes up, and is never requeued twice.
- **Sample deck through the loading screen:** "Try a sample deck" still shows the boiler animation for a minimum of 2.5 s to match the scripted demo (spec 11.2 step 2). The fetch itself is instant. If `/api/sample` is unreachable, the client falls back to a bundled copy of the same JSON.
- **Sample deck was hand-authored** from `server/sample/sample-notes.txt`, because no `GEMINI_API_KEY` was available at build time. `npm run gen:sample -w server` regenerates it through the real pipeline once a key is set. Review the output by hand before committing.
- **Station banner pacing:** stations 1 and 2 wait for "Depart" (button, Enter or Space) so the presenter controls pacing. Station 3 shows its banner for 2.5 s and then opens the report automatically.
- **Audio placeholders are synthesized WAV files** (`client/scripts/make-placeholder-audio.mjs`) because no encoder was available to produce MP3. Swap in Pixabay/freesound files with the same base names and update the extensions in `audioManager.ts`.
- **Debug controls:** the Phase 2 "correct / wrong" debug buttons stay available behind `?debug=1` instead of being deleted.
- **Validation errors** (unsupported type, too large, no text, too short) return the player to the Depot with the inline message. Generation and network failures stay on the loading screen with Retry / Use sample deck.

## Tuning after the first browser runs

- **Camera** moved from the prototype's rear chase position (which mostly framed the tender's coal pile) to a three-quarter view beside the cab, `(7.0, 3.5, 5.4)` looking at `(-0.6, 2.0, -4.5)`. The boiler, spoked driving wheels and rods fill the frame, and the line ahead stays visible for station approaches.
- **Station stop point** is `z = -6`, so at a stand the platform, canopy and building sit ahead of the camera, alongside the locomotive.
- **Approach:** run-in of 35 units and a minimum approach speed of 12 units/s, giving about 5.5 s from "Approaching" to arrival.
- **Frame step cap** raised from the prototype's 0.05 s to 0.1 s. Below 20 fps the old cap made the world run in slow motion; on a slow laptop a station approach took twice as long.
- **Tailwind colors are hex values, not `var()`**, because Tailwind 3 cannot apply opacity modifiers (`bg-iron-950/85`) to `var()` colors. The same values remain as CSS variables in `tokens.css` for SVG and custom CSS.
- **Maintenance Stop layout** is a compact two-column card with "Back on track" in the header (after the explanation on mobile), so the whole panel fits the 45% bottom area at 1280x720.

## Small UI additions (labels for existing mechanics, not new features)

- A difficulty chip (Easy / Medium / Hard) on each question, which makes adaptive difficulty visible during the demo.
- A "Second look" chip on requeued questions.
- A keyboard reference list in the Settings drawer.

## Phase 6: contrast check

Ratios are computed with alpha blending for translucent tints (script: WCAG relative luminance). Text needs 4.5:1 and graphics need 3:1.

| Pair | Ratio | Needed | Result |
|---|---|---|---|
| Question/answer text: ink-900 on cream-100 | 13.64:1 | 4.5:1 | pass |
| Labels: ink-900/80 on cream-100 | 7.49:1 | 4.5:1 | pass |
| Detail text: ink-900/75 on cream-300/60 stat tile | 6.00:1 | 4.5:1 | pass |
| Answer hover: ink-900 on cream-300 | 11.48:1 | 4.5:1 | pass |
| Correct tint: ink-900 on verdigris-500/20 over cream-100 | 11.36:1 | 4.5:1 | pass |
| Not quite tint: ink-900 on copper-500/15 over cream-100 | 11.57:1 | 4.5:1 | pass |
| Primary button: ink-900 on amber-500 | 7.56:1 | 4.5:1 | pass |
| Concept tag: cream-100 on ink-900 | 13.64:1 | 4.5:1 | pass |
| Body on dark: cream-100 on iron-900 | 14.96:1 | 4.5:1 | pass |
| Body on page: cream-100 on iron-950 | 16.28:1 | 4.5:1 | pass |
| Secondary text: cream-300 on iron-900 | 12.60:1 | 4.5:1 | pass |
| Hints: brass-300 on iron-900 | 9.61:1 | 4.5:1 | pass |
| Hints: brass-300 on iron-950/50 drop zone | 10.02:1 | 4.5:1 | pass |
| Titles (large): brass-500 on iron-900 | 5.59:1 | 3:1 | pass |
| Depot error: cream-100 on copper-500/15 over iron-900 | 12.58:1 | 4.5:1 | pass |
| Streak badge: amber-500 on iron-950/85 | 8.93:1 | 4.5:1 | pass |
| Check icon (graphic): iron-950 on verdigris-500 | 5.85:1 | 3:1 | pass |
| X icon (graphic): iron-950 on copper-500 | 4.55:1 | 3:1 | pass |
| Report bar (graphic): verdigris-500 vs cream-300 track | 2.34:1 | 3:1 | below; mitigated: ink end-cap on the bar, and the % text and icon carry the value |
| Report bar (graphic): copper-500 vs cream-300 track | 3.01:1 | 3:1 | pass |
| Focus ring (graphic): amber-500 on iron-900 | 8.29:1 | 3:1 | pass |
| Focus ring (graphic): amber-500 on cream-100 | 1.80:1 | 3:1 | below alone; fixed: inside cream cards the ring is framed by ink-900 halos (amber vs ink 7.56:1) |

## Verification log

Checked in headless Chromium (SwiftShader, about 9 fps) against `npm run dev`:

- The full `?demo=1` path ran twice at 1280x720 with no console errors: Depot, sample deck, loading, correct (steam burst, gauge glow, streak), wrong (sputter, slowdown, Maintenance Stop with page citation), station stop and Depart, all three stations, then the Station Report.
- Mobile at 390x844: the scene shrinks to 35%, the gauges collapse into one row, and the answers stack.
- Keyboard-only run with `prefers-reduced-motion: reduce`: reduce motion defaults on; `1`-`4` and `T` answer; the live region announces results; Enter on "Back on track" and Space on "Depart" work; Esc closes Settings and returns focus to the opener.
- The report and settings survive a reload of `/report`.
- `npm run build` plus `npm start` serves the API, the client (SPA fallback) and the audio from one process.
- Server: `/api/health`, `/api/sample` and every error path (too short, unsupported type, over 10 MB, unreadable PDF, unknown route) return the section 12 copy. Real PDFs extract per page as `[Page N]` blocks. The guardrails drop invalid, duplicate and off-concept questions, null out-of-range pages, and shuffle options.

## Live AI (verified with a real key)

**Model: `gemini-flash-lite-latest`, not `gemini-flash-latest`.** The Flash alias now resolves to a thinking model. Benchmarked on the sample notes with the real prompt and schema:

| Model / config | Time | Valid after guardrails | Easy / medium / hard |
|---|---|---|---|
| `gemini-flash-latest`, default thinking | over 40 s (timed out) | n/a | n/a |
| `gemini-flash-latest`, `thinkingLevel: low` | 79 s | 24 / 24 | 8 / 10 / 6 |
| `gemini-flash-latest`, `thinkingLevel: minimal` | rejected (400, not supported) | n/a | n/a |
| `gemini-flash-lite-latest` | 9.5-15 s across 5 runs | 24 / 24 | 8 / 10 / 6 (one run 8 / 9 / 7) |

Flash-Lite is still a free Flash-family model, so it satisfies the spec. All 24 answers in a reviewed Flash-Lite deck were correct against the notes, with correct page citations.

**Question-type mix:** with "about 80% mcq" the model wrote 11 of 24 as true/false. The prompt now asks for exactly 19 mcq and 5 tf, and runs land at 18 / 6.

**Sample deck stays hand-authored.** The generated decks are accurate, but the hand-written one has more varied stems (a "which is NOT", a stack trace, a load-factor calculation) and stronger distractors, which demo better. `npm run gen:sample -w server` remains available.

UI round trip (paste notes, then a playable first question): 12.3 s.

## Sound effects (ElevenLabs)

The spec suggested Pixabay or freesound; ElevenLabs text-to-sound-effects was used instead because it can produce a seamless loop (`loop: true`) for the chug and lets the prompts match the theme. The sounds are generated once by `client/scripts/generate-sfx.mjs` and committed as MP3s. The game never calls the API, so the demo works offline and the key stays server-side. 15 takes cost about 3,000 credits (200 per generation; the free plan has 10,000 a month).

Takes were measured with Web Audio (duration, level, leading silence, clipping, loop seam) and picked as follows. All are easy to swap after listening.

| Sound | Take | Reason |
|---|---|---|
| chug-loop | 2 | Smallest loop-seam jump (0.001); first and last 20 ms within 2 dB. Take 3 differed by 5 dB and would pulse each loop. |
| whistle | 1 | No clipping (take 2 clipped 17 samples) |
| ui-click | 2 | Starts immediately (others had 11-12 ms of lead-in) |
| correct-chime | 2 | Moderate level, sits under the whistle |
| sputter | 2 | Good level, no clipping (take 3 clipped) |

Volumes were rebalanced because the whistle take is about 11 dB louder than the chug and sputter. The synthesized WAV generator is kept as an offline fallback.

## Offline demo safety

Fonts (Rye, Alfa Slab One, Inter) are bundled with Fontsource instead of loaded from Google Fonts, so the demo renders correctly with no network. With the sample deck and committed sounds, nothing in the demo path needs the internet.

## Dry run with real lecture notes

`test-notes/09-type-systems-part-1.pdf` (21 slides, gitignored) was run through the whole pipeline.

**Extractor fixes it surfaced** (they apply to any slide deck):
- Text runs on the same line were joined with no space ("PYTHON(RUNTIMECRASH)", "1.How"). A space is now inserted when the horizontal gap between runs exceeds 15% of the font size.
- A running footer ("Spring 2026 © 2026 Ritwik Banerjee" plus the slide number) was on every page. Lines that repeat on more than half the pages of a 4+ page document, ignoring digits, are now stripped.

**Prompt changes it surfaced:**
- Long hard-question options slowed generation (23-38 s) and crowded the 2x2 answer grid. Prompts are now capped at 35 words, options at 15 and explanations at 50. Generation dropped to 13-17 s across five runs.
- Weak "joke" distractors appeared ("When the computer shuts down"). The prompt now requires distractors built from other real terms in the material, and the next run's distractors were all genuine concepts (structural vs nominal, duck typing, narrowing vs widening).

**Accuracy:** a full 24-question deck was checked claim by claim against the slide text, including the Java cast runtime check, C/C++ as borderline weak (Note 1), "built-in types are not necessarily primitive", strict vs loose nominal equivalence, and `"5" - 3 → 2`. No errors were found.

**In the browser:** uploading the PDF through the Depot reached the first question in 17.9 s, and the Maintenance Stop cited "Page 7" correctly. There were no console errors.
