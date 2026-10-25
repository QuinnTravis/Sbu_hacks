# SteamScholar: 3-minute pitch and demo script

**One line:** SteamScholar turns your own lecture notes into a steam-train study game you can play by sight or entirely by ear.

## Before you go on stage

- [ ] Laptop on power, Chrome, sound on, volume about 60%.
- [ ] Settings, then **Test microphone**: say "two" and confirm it shows `Heard: "two"`. This also grants mic permission for the demo.
- [ ] `npm run smoke -w server` passes (Gemini key works, about 10-15 s).
- [ ] Open two tabs: `localhost:5173/?demo=1` (2 questions per station) and a backup tab already on a sample-deck run.
- [ ] Have a lecture PDF on the desktop (e.g. `test-notes/09-type-systems-part-1.pdf`). Better still: ask a judge for notes from their own course.
- [ ] Reduce motion **off**, eyes-free **off** (you'll switch it on live).
- [ ] Optional: play one journey on the sample deck beforehand and miss a couple, so the final report can show "+N vs last journey".
- [ ] Rehearse in the room: if it's loud, use hold-to-talk (`V`) instead of auto-listening.

## Script (about 3:00)

**0:00 - Hook (20 s)**
> "Re-reading your notes feels productive, but testing yourself is what makes things stick. That's one of the best-established results in learning science, the testing effect. Study tools mostly ignore it, and almost all of them assume you're looking at a screen."

**0:20 - Your notes in (20 s).** Drop the PDF onto the loading dock and click **Fire up the boiler**.
> "This is a real lecture deck. Gemini reads it page by page and writes 24 questions, only from facts in these slides, each tagged with the page it came from."
(About 12 s. Talk over the boiler gauge while it loads.)

**0:40 - Play (40 s)**
- Answer one right: *steam burst, whistle, the gauge needle jumps, the train speeds up.* "Correct answers build boiler pressure. Pressure is speed."
- Answer one wrong on purpose: *sputter, slowdown, Maintenance Stop.* Point at **From your notes: Page 7** and **Likely mix-up**.
> "No red, no blame. It tells you the right answer, why, which slide it's on, and the specific confusion that probably led you there."

**1:20 - Your own words (30 s).** On a short-answer question, press `V` and say a paraphrase out loud.
> "Recognizing an answer is easy; recalling it is what builds memory. So some questions have no options. You just say it, and Gemini grades it against your notes, with partial credit and one sentence on what you missed."

**1:50 - Eyes-free (40 s).** Open Settings and turn on **Eyes-free mode**. Turn the laptop away from yourself, or close your eyes.
> "Now I can't see the screen."
Let it read the question, answer by voice, and say "continue" after a miss.
> "Everything is spoken and everything answers to your voice. Even the speed is audible: the chug gets faster as you get answers right."

**2:30 - Station Report (15 s).** Show concept bars, **Revisit** tags, and **Your mix-up** lines. If you rehearsed a journey on this deck earlier, point at **"+N vs last journey"** and the per-concept arrows.
> "At the end you get a ticket, not a score. It shows which concepts to revisit and which mix-ups to fix. Ride again, and it starts with what you missed last time."

**2:45 - Close (15 s)**
> "Your notes in, active recall out, playable with your eyes closed. SteamScholar: keep the steam up by knowing your stuff."

## If something breaks

| Problem | Do this |
|---|---|
| Wi-Fi or Gemini is slow or down | Click **Try a sample deck**. It's built in and needs no network. Say: "Here's one we prepared earlier." |
| Upload takes more than about 20 s | Keep talking. After 45 s it offers **Use sample deck**. |
| Mic doesn't pick you up | Type the short answer, or use keys `1`-`4`. Say: "Voice works the same way; the room's a bit loud." |
| Narration voice sounds robotic | That's the browser fallback (the ElevenLabs key lacks Text to Speech). It still works; don't apologize. |
| Running long | Use the `?demo=1` tab: 2 questions per station. |

## Likely judge questions

**"How do you stop the AI making things up?"**
The prompt restricts Gemini to the provided material. Output is forced into a JSON schema and validated with zod. Guardrails drop any question whose answer doesn't match an option, whose concept isn't in the deck, or that duplicates another, and page citations that don't exist in the PDF are removed. We checked a full generated deck against the source slides claim by claim and found no errors.

**"How fast and how expensive is it?"**
About 10-15 s per deck on Gemini's free Flash-Lite tier. We benchmarked: the bigger Flash model took 79 s. Grading a spoken answer takes 1.5-3 s. Narration clips are cached on disk, so replays cost nothing.

**"What happens offline?"**
The sample deck, sounds and fonts are all bundled. If grading can't reach Gemini, a local word-overlap check takes over. If ElevenLabs fails, narration falls back to the browser's built-in voice.

**"Why a train?"**
The theme is Steel and Steam, and the metaphor carries the learning. Pressure is your current mastery, and it drives speed. Missing a question is a Maintenance Stop, not a failure. Because speed lives in the chug's pitch, the game state is audible, which is what makes eyes-free play possible.

**"Who is this for?"**
Anyone studying from their own notes, and especially blind and low-vision students. Most study games are hard or impossible to use without seeing the screen.

**"What would you build next?"**
Full spaced-repetition scheduling across days (today, Ride again re-asks last journey's misses first and shows your progress), shared class decks with a teacher view of common mix-ups, and longer narrated explanations.

## Accessibility checklist to mention

- Fully playable by keyboard (`1`-`4`, `T`/`F`, `Enter`, `V`, `R`, `Esc`) and fully playable by voice.
- Right and wrong always shown with icon, text label and color, never color alone; no red anywhere.
- Every text pair meets WCAG AA contrast (the table is in `DECISIONS.md`).
- Respects `prefers-reduced-motion`, with a toggle; screen-reader live announcements; gauges have text equivalents.
