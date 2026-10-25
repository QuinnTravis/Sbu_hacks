# Gaze

Gaze is a train-window companion. Point your phone at the landscape and it tells you what you're looking at. It follows the California Zephyr from Chicago to Emeryville (and the LIRR) on a full-screen map. Aim at a place to open its card, save it, or hear a short narrated story as you pass.

Built at SBU Hacks.

## Features

- **Point to discover.** Uses the compass and GPS to find places near the line in the direction you're aiming.
- **Stories you can trust.** Each place's story is checked on the fly: a sentence is kept only when at least two independent sites agree on it.
- **Audio guide.** ElevenLabs narration for stations, pointed places and nearby stories, with a device-voice fallback.
- **Ask about a place.** Ask a question by voice or text; answers come only from that place's sources.
- **Multilingual.** English, Spanish and Simplified Chinese.
- **Offline-ready PWA.** Downloaded routes keep working without a connection.
- **Replay mode.** Simulated rides for demos without being on a train.

## Run it

```bash
cd Train-Discovery
cp .env.example .env   # add your keys
npm ci
npm run dev
```

Open http://localhost:3000. Without API keys the map, route, replay and catalog still work. Keys enable stories, narration and photos:

| Variable | Used for |
|---|---|
| `GEMINI_API_KEY` | Writing stories and answers |
| `SERPER_API_KEY` | Search results for the two-site agreement check |
| `ELEVENLABS_API_KEY` | Narration voice |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Catalog and audio cache |

## Tech

Next.js 16, React 19, TypeScript, Gemini 2.5 Flash via LangChain, Serper, ElevenLabs, Supabase, MapLibre, Vitest and Playwright. Route data comes from Amtrak and LIRR GTFS, OpenStreetMap, Wikidata and Wikipedia.

## More

See [`Train-Discovery/README.md`](Train-Discovery/README.md) for setup details, data pipelines, verification and the developer panel, and [`Train-Discovery/DECISIONS.md`](Train-Discovery/DECISIONS.md) for architecture notes.
