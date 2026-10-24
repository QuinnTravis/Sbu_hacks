# Train Discovery — engineering handoff

Updated 2026-10-24. This file captures the product decisions, research, current implementation, and remaining work for the next model. Read `AGENTS.md` first; it requires consulting the installed Next.js guides under `node_modules/next/dist/docs/` before changing code. Keep UI copy minimal and omit subtitles that restate visible controls.

## Product goal and accepted scope

Train Discovery is a mobile-first Next.js PWA for LIRR riders. The active flow is:

1. Choose the LIRR branch the rider is on from routes near their location.
2. Start the ride.
3. Use train location plus the phone's absolute compass/gyroscope orientation to detect a nearby POI the rider points toward.
4. Add the POI to a queue. It stays there across movement, turning, and reload until the rider explicitly discards it.
5. Show a Google Places photo (with required attribution when available), concise historical context, and trustworthy sources.

All LIRR branches are in scope. No left/right selector. Camera recognition and accounts are out of scope. The adjacent `../sbuhacks-demo` was used for flow context only; do not treat its UI as a visual reference or modify it.

The user explicitly pinned the [Waymo iOS screens on Mobbin](https://mobbin.com/apps/waymo-ios-028a65c1-23a8-4fe1-bcf0-aab15ced5842/dc7cedc4-3442-452c-a4ac-e0181cdac9fd/screens) as the visual theme. Use cool-gray canvas, white sheets, near-black text, vivid blue actions, Google Sans, rounded pill controls, and minimal copy. Exact sampled colors and design notes are in `DESIGN.md` and `.impeccable/design.json`. Do not revive the rejected green UI or add Waymo branding.

## Current state

The app is implemented in this repository and builds/runs locally. The home screen was redesigned around the MTA route map: route paths can be tapped to select a branch and open the bottom route sheet; the location control requests GPS and filters the sheet to nearby routes. The sheet starts collapsed so the map leads; tap its handle to expand route search/list. Jamaica is the default demo context because ten LIRR routes are near it; it makes route selection and replay easy without location permissions. “Use Jamaica demo” restores that context. The route sheet has route search, nearby/all filtering, and Start ride.

A developer panel was added at the user's request to conveniently test train movement and sensors. Open it with the header sliders button, the backtick key, or `/?dev`. It supports a simulated train, play/pause, 0–240 km/h speed, reverse, route scrub/250m steps, reset to Jamaica, station jumps, auto-aim, a persistent joystick heading, tilt simulation, real phone compass with simulated train motion, and real GPS. Compact mode leaves the compass/feed visible. It uses the same POI detector and persistent queue as the real ride. See the detailed usage section in `README.md` and `src/components/dev-panel.tsx`.

The production build, ESLint, 12 unit tests, and 12 Playwright tests passed after the dev panel work (24 tests total). Offline checks were run against the live catalog. These checks do not validate physical device sensors or certify release readiness. If continuing in a fresh environment, run the commands in README; the previous local production server was at `http://localhost:3000` but may no longer be running.

## Stack and architecture

- Next.js 16.4.3, React 19.3, TypeScript; mobile-first PWA.
- Supabase Postgres/PostGIS for route and POI catalog. Public browser access is read-only; privileged publishing and photo quotas stay server-side.
- Official MTA GTFS static data for LIRR routes/stations/shapes; OpenStreetMap for nearby candidates; Wikipedia passages as freely accessible evidence where available.
- Gemini via LangChain for bounded claim generation and a separate verification pass. Content fails closed when source passages or verification are missing.
- Google Places API (New) for on-demand place photos and attribution. Photos are not persisted/cached.
- Location remains on device; browser downloads a branch package and computes proximity/bearing locally. No location history or passenger account.

Key files:

- `src/components/discovery-app.tsx`: route selection, ride lifecycle, detection, queue, navigation, and dev panel wiring.
- `src/components/dev-panel.tsx`: replay and orientation test controls.
- `src/components/compass.tsx`, `src/hooks/use-sensors.ts`, `src/lib/geo.ts`: heading, GPS, camera axis, geometry, detection.
- `src/components/place-card.tsx`, `src/lib/queue.ts`, `src/lib/storage.ts`: POI presentation and persistent queue.
- `src/lib/verification.ts`: LangChain claim/evidence pipeline and fail-closed checks.
- `src/app/api/`: journey catalog, nearby lookup, photo proxy/rate limits, health.
- `src/app/about/page.tsx`: privacy, sources/licenses, and terms.
- `public/sw.js`: app shell and branch-package offline caching; excludes photo/API caching.
- `public/data/lirr.json`, `public/data/belmont-osm.json`, `public/data/places.json`: checked-in route and candidate-place snapshots.
- `scripts/import-lirr.py`, `scripts/import-places.py`, `scripts/verify-content.ts`, `scripts/publish.ts`: refresh and publishing workflow.
- `supabase/migrations/`: four migrations currently present; README's “Five migrations” count is stale and should be corrected if editing that section.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`: product and visual constraints.

## Data-source findings

### Routes

MTA's official downloadable static GTFS is the route source and can be refreshed with `npm run data:routes`. The local snapshot covers 13 route/service records and 127 stops, including branch geometry. Jamaica's demo station is approximately `40.69960817, -73.80852987`. Ten route/service records lie within 3 km of it.

MTA's current GTFS does not provide scheduled trip geometry for Belmont Park, so the project supplements it with an attributed OSM spur in `public/data/belmont-osm.json`. That geometry must not be described as proof of current service. Greenport Service is represented as its own route/service entry; don't conflate it with a separate scheduled branch if MTA source records say otherwise.

### Free POI and evidence sources

OpenStreetMap/Overpass provides free candidate places and feature metadata. The importer queries a broad region, filters to a 1.2 km corridor around each route, and deduplicates. A second pass keeps places a rider might look up from the window: heritage buildings, museums, ruins and former railroad uses, named bridges, lighthouses, and natural places with a source. Plaques, artwork, radio masts, ordinary stations, and street bridges are dropped. Each route keeps its strongest 40. OSM tags are metadata, not proof of history. Nature (Wikipedia parks, preserves, named beaches) is included in the Overpass query and only appears after the next `npm run data:places` refresh.

Wikipedia passages are evidence candidates, not ground truth. Unsupported narratives remain unpublished. Wikimedia can throttle enrichment (429); importer caches queries, checkpoints successful batches, and defers throttled batches. Don't aggressively retry it. Evidence refresh is age-bounded; changed evidence invalidates an old verified story.

Current source coverage is uneven across branches. All 13 route records have nearby candidate places, but many POIs lack historical evidence and therefore have no generated story. Do not fill those gaps with invented copy. Additional free archives/Wikimedia sources could be added later with license tracking and passage provenance.

## Supabase and credentials

The user authorized a new Supabase project. It is `train-discovery`, ref `abwsqgpufuuxnzptikgk`, organization `zhwenpdrkgnraxyrxpiy`, region `us-east-1`; dashboard: https://supabase.com/dashboard/project/abwsqgpufuuxnzptikgk. The project has PostGIS in `extensions`, seeded public catalog, and four migrations applied. Do not expose or commit `.env.local`.

`NEXT_PUBLIC_SUPABASE_URL` and the publishable key are configured locally. A random `RATE_LIMIT_SECRET` was generated locally. Provider/server credentials were not supplied in the handoff and may still be blank: `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `SUPABASE_SECRET_KEY`. The user said they have Gemini and a free Google Places key and was told to configure them in `.env.local`; never ask them to paste secrets into chat. Check environment presence without printing secret values.

`.env.example` documents the expected variables. The Google key should be server-restricted, with Places API (New) enabled and cloud quotas/billing constraints understood. A free key does not guarantee photo requests have no cost. `TRUST_PROXY=true` is safe only when the hosting proxy overwrites forwarding headers.

Supabase catalog reads are public/read-only; nearby lookup is invoker-rights. `refresh_catalog` and photo-budget consumption require service role. Photo-budget storage lives in a private schema with no public policies. Limits: 30 lookups per hashed client per UTC hour and 300 globally per UTC day. Raw IPs are not stored in the application DB. Advisor INFO about RLS with no policies on the private budget table is intentional fail-closed behavior.

## Historical-content pipeline

`scripts/verify-content.ts` searches Wikipedia for up to two passages, then uses LangChain Gemini to write a short extractive summary. Each sentence must carry an exact quote. Quotes are checked deterministically, invalid sentences are dropped, and `gemini-2.5-flash-lite` judges the rest. Thinking is disabled (`thinkingBudget: 0`) because Gemini 2.5 Flash otherwise spends the structured-output budget on reasoning and returns no summary. Missing evidence, incomplete verdicts, and a summary with nothing left fail closed. Evidence is hashed; jobs checkpoint locally. Defaults are `gemini-2.5-flash` for the summary and `gemini-2.5-flash-lite` for verification. Use `--limit` for controlled batches. Only verified surviving sentences are published. This process validates attribution against supplied evidence; it does not prove that the underlying source itself is historically correct.

Refresh workflow:

```sh
npm run data:routes
npm run data:places
npm run content:verify -- --limit=20
npm run content:publish
```

Review sample output, sources, licensing, and cost/rate behavior before scaling up verification or publishing. No scheduled production refresh job is provisioned yet.

## Sensor, queue, and offline behavior

The real flow uses high-accuracy geolocation and absolute orientation. iOS `webkitCompassHeading` is handled; relative `alpha` alone is never treated as north. Rear-camera optical axis is calculated from device orientation. Heading and GPS have staleness/accuracy cutoffs; nearly flat phones, stale readings, hidden tabs, off-route location, and permission failures pause detection with recoverable UI. A user must point steadily for 900 ms, with at least 2.5 s between new additions. Orientation must be tested on actual hardware; train magnetic interference is a material risk.

Queue items are deduplicated and persist per ride in validated local storage. Turning away, moving, scrubbing the developer replay, or reload does not discard them. Dismissal is explicit. Ending a nonempty ride confirms before clearing. Live sensors require a fresh gesture after reload. Private browsing/site-data clearing can erase the queue.

PWA caches app shell/assets and branch package, network-first with offline fallback. Google images and other external/API responses are not persisted. Service worker is production-only; use trusted HTTPS for phone location/orientation access. Don't force-update a worker during an active ride.

## Developer panel details

- URL toggle: `/?dev`; sliders icon or backtick also opens/closes it.
- Sim train movement interpolates distance along the selected actual route shape; it clamps at endpoints and does not wrap/teleport.
- Heading modes: auto target a sourced POI, manual joystick, or physical phone compass. Physical compass can run alongside simulated train location.
- Joystick supports drag/touch, arrows in 5° steps, Home north, End 355°. Tilt 0° simulates a flat phone and pauses detection; 90° is upright.
- Nearby POIs display distance, true bearing, angular error, and an Aim action.
- Compact mode is intended for checking the app's radar/feed while manipulating a floating control.
- Replay controls are transient. Refresh returns simulated position near Jamaica while retaining a saved queue.

## Test and development commands

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
TEST_LIVE_DATABASE=1 npm run test:e2e -- --grep "reopen offline"
```

The live-database offline test requires the configured Supabase catalog. Unit tests cover geometry/camera axis, all-branch data coverage, queue persistence, verification guards, and replay interpolation. Browser tests cover responsive mobile/desktop flow, mocked sensors, permissions, persistence/dismissal/reload, panel controls, and optional offline reopen. Browser sensor mocks do not replace iOS Safari and Android Chrome physical-device testing.

## Remaining work before a real release

1. Confirm the needed provider keys are present locally; do not print them. Run the health endpoint and confirm real photo availability. Execute a small historical verification batch, review it, then publish selected verified content.
2. Test on physical iPhone Safari and Android Chrome over HTTPS: permissions, real absolute compass/gyroscope, landscape/portrait, stale readings, screen lock/resume, and magnetic interference aboard trains. Tune thresholds only from observed readings.
3. Review route and POI quality on every branch, especially at speed and urban density. Bearing/proximity is not line-of-sight detection; be transparent in UI. Camera recognition is not implemented.
4. Deploy with protected server keys, appropriate proxy handling, Places quotas, hosting-layer abuse/rate controls, and monitoring for `/api/health`, provider failures, and verified-story coverage.
5. Provision scheduled GTFS/OSM refresh, evidence refresh, verification, and reviewed publishing. No scheduler currently exists.
6. Correct the stale migration count in README when touching docs (there are four migration files in this checkout).

## Interaction and copy constraints

Keep UI minimal. Do not add helper text that merely explains visible controls, redundant subtitles, side-of-train selection, pretend live readings, unverified history presented as fact, fake photos, or claims that nearby automatically means visible. Keep simulation clearly labeled. Preserve clear attribution and distinguish sourced metadata from verified historical claims.
