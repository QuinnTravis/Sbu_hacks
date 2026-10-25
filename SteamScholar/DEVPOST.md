# SteamScholar

**Tagline:** Your lecture notes become a steam-train study game you can play by sight or entirely by ear.

## Inspiration

Re-reading notes feels like studying but doesn't stick nearly as well as testing yourself. Retrieval practice ("the testing effect") is one of the most reliable findings in learning science. Producing an answer from memory, not just recognizing it, strengthens it further. Yet most study tools stop at flashcards and multiple choice, and almost all of them assume you can see the screen. We wanted active recall that feels like play, works on your own material, and can be played with your eyes closed. The hackathon's Steel and Steam theme gave us the metaphor: knowledge as boiler pressure.

## What it does

- **Your notes in.** Drop a PDF or TXT, or paste notes. Gemini writes 24 questions only from your material, each tagged with the page it came from.
- **Three kinds of questions:** multiple choice, true/false, and short answers in your own words, typed or spoken.
- **Drive the train.** Correct answers build boiler pressure, and pressure drives the 3D locomotive's speed (wheels, pistons and smoke all respond). Streaks build bigger bursts, and difficulty adapts as pressure rises.
- **Maintenance Stop, not failure.** A miss shows the right answer, why, the page in your notes, and the *likely mix-up* behind your choice (e.g. "Confusing structural equivalence with nominal equivalence"). The missed question comes back 3-4 questions later.
- **Graded in your own words.** Gemini grades free responses against your notes, accepting paraphrases and speech-recognition slips, gives partial credit, and tells you in one sentence what you got or missed.
- **Eyes-free mode.** Everything is read aloud: questions, options, explanations, stations, the final report. You answer by voice ("two", "option B", "true", or the answer itself), and say "continue", "depart" or "repeat". Speed is audible because the chug's pitch rises with the train.
- **Station Report.** A railway-ticket summary with accuracy per concept, Revisit tags, every missed question with its answer and source page, and the mix-ups to fix. It's printable.
- **Learning across journeys.** Ride again and your unresolved misses from last time come back first, tagged "From last journey". The report then shows progress: "+50 vs last journey", per-concept arrows, and how many old misses you fixed.

## How we built it

- **Frontend:** React 18, Vite, TypeScript, Tailwind and Zustand. The 3D world is a procedural low-poly Three.js scene with real slider-crank piston kinematics, driven by the game store every frame. Howler handles audio and Framer Motion the UI motion.
- **AI:** Gemini Flash-Lite through the REST API with native JSON schema output, validated with zod. Post-generation guardrails drop malformed, duplicate or off-concept questions, null out page citations that don't exist, and shuffle options to remove position bias. Free responses are graded by a second Gemini call. Misconceptions for every wrong option are fetched by a third call, in the background, so deck generation stays fast.
- **Voice:** the Web Speech API for recognition, with a custom intent matcher that handles homophones ("to" for two, "for" for four), negation ("not true") and fuzzy option matching by word-overlap F1. ElevenLabs provides the narration (cached on disk) with an automatic browser-voice fallback, plus all the game's sound effects.
- **PDF pipeline:** per-page text extraction for citations, repair of words that slide decks split apart, and removal of repeated headers and footers.

## Challenges we ran into

- **Speed vs. quality.** The default Flash model is now a thinking model: 79 s per deck. We benchmarked alternatives and moved to Flash-Lite at about 10-15 s with no quality loss in a claim-by-claim review. Asking for misconceptions in the same call slowed it to 30 s and dropped questions, so we split it into a background call.
- **Real slide decks are messy.** Our first lecture PDF came through as "PYTHON(RUNTIMECRASH)", with a copyright footer on every page. We added gap-based word spacing and repeated-line stripping.
- **Voice in the real world.** Recognizers hear "to" for two and "for" for four; "repeat" must re-read the question, not the last error prompt; and browser speech sometimes never says it has finished. Each needed a specific fix, and the matcher has its own test suite.
- **Accessible on purpose.** The theme's amber focus ring was nearly invisible on cream cards (1.8:1), so we framed it with dark halos (7.6:1). We audited every text color pair against WCAG AA.

## Accomplishments that we're proud of

- A complete game you can play without looking at the screen: from question to explanation to station to final report, by voice alone.
- Free-response grading that is genuinely fair, e.g. "That describes a stack instead of a collision, which happens when two different keys map to the same index."
- A demo that can't strand us: the sample deck, sounds and fonts are bundled, and every network call has a fallback.

## What we learned

Fast models plus strict validation beat slow models plus hope. Accessibility constraints made the game design better for everyone: making state audible forced us to make it clear. And real user material breaks assumptions fast, so test with your own notes early.

## What's next

- Full spaced-repetition scheduling across days (today we re-ask last journey's misses first).
- Shared class decks and a teacher view of the class's common misconceptions.
- Streamed narration for longer explanations, and more voices and languages.

## Built with

React, TypeScript, Vite, Tailwind CSS, Zustand, Three.js, Framer Motion, Howler.js, Node.js, Express, zod, pdf-parse, Google Gemini API, ElevenLabs (text to speech, sound effects), Web Speech API.
