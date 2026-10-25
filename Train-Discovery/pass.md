# Train Discovery — engineering handoff

## Designer note — short phone (2026-10-24)

The map frame flexes in the ride column, with an 180px floor. On a short phone that keeps the OpenFreeMap credit and the tip of the wedge above the tab bar. Streets, the blue dot, and the simulated replay label are unchanged.

## Designer note — streets and list rows (2026-10-24)

The ride map drew a canvas-colored frame because the MapLibre container was height 0. react-map-gl sets an inline relative position and `height: 100%`, which does not resolve in the flex frame, and `overflow: hidden` clipped the canvas, the streets, and the dot. The container is now absolutely inset in the map frame, so the streets, the `#0071f2` dot, and the facing cone paint in the ride column. Attribution stays in the quiet band under the map and is not hidden with `display: none`. Replay stays labeled simulated.

List rows no longer show photographs. Pointing rows, the ride queue, and saved discoveries are the place name and distance, with the existing index or chevron. A saved row omits distance when there is no position. The discovery card still has its photo.

## Designer note — ride map instrument (2026-10-24)

The ride map is a quiet Waymo instrument in the ride column. Ground is canvas `#eaedf3`; roads and buildings are paper `#fefeff`; casings are line `#cdd1db`; parks and woods are cool gray; water is gray-blue. Place labels are ink and road labels are muted. The branch line uses that route’s color, with a paper casing. A 1px steel `#8e98a8` hairline frames the map. The rider is a small `#0071f2` dot with a white ring. The facing wedge is translucent `#0071f2`. Brass is off this surface. Attribution sits in a quiet band under the map and still reads the OpenFreeMap / OpenMapTiles / OpenStreetMap credit. It does not cover the dot, wedge, audio bar, candidate sheet, or tab bar. With no heading, the dot stays and the wedge is absent. Replay stays labeled simulated.

## Latest cycle — saved discoveries (2026-10-24)

A rider can save a discovery on this device so it remains after the ride ends, including a Gemini-checked story already on that place. The library is separate from the ride queue (`train-discovery:saved:v1`). There is no account, server write, or location history. Saving stores id, name, coordinates, category, source, tags, evidence, and the story fields already present. Photo bytes, Google photo URLs, and audio URLs are omitted. The same site (existing 180 m name rule) is one entry. Discarding a queued card does not unsave. Ending a ride clears only the ride key.

Save on the discovery card toggles the library. The audio-bar Save writes the same library and still enqueues into the current ride when a position exists, so the card can appear. `rememberNarration` copies that story onto the saved entry when the place is already saved and does not generate another story. Catalog refresh keeps the richer checked story and its passages on the queue, the live place list, and the library.

With no ride, Discoveries on the route screen opens the library. During a ride, My discoveries has This ride and Saved. An empty library says “Nothing saved yet.” A storage failure keeps the in-memory list and shows the existing storage notice. Opening a saved card shows the cached story and sources. The no-ride view does not offer Play, so display does not call `/api/audio`. The card still requests `/api/photos/:id` for the existing photo area.

Verified: `npx vitest run tests/saved.test.ts` (8 passed: save, unsave, same-site dedupe, story merge, ride clear after queue discard, thinner catalog refresh, photo/audio URL omission, storage failure and unreadable data). `npx tsc --noEmit` passed. The UI was not exercised in a browser.

Designer surfaces to unclutter, using the current button patterns only:
- Discovery card footer (`.card-footer`): Previous, count, Next, and Save now share one row.
- Audio guide bar (`.audio-controls`): the existing Save icon stays in the dense now-playing row. It now means kept after the ride.
- My discoveries heading (`.queue-heading`): “This ride” and “Saved” sit with the title and count.
- Route-screen Discoveries (`.home-discoveries`, `.home-discoveries-card`, `.home-discoveries.is-filled`): the empty card and the saved card list need to be readable above the home nav. `.is-filled { display: block }` only lets the card scroll; it is not a layout.

The ride-map cycle below was left as found.

Reviewer risks: audio-bar Save still enqueues when GPS is present, and a place already in the queue but not the library still shows that Save control. Ending a ride and discarding a card must leave `train-discovery:saved:v1` intact. Reopening a saved place with no ride must not call Gemini or `/api/audio`; the photo request can still fail offline while the story stays visible. A richer catalog story may replace a thinner saved one. Same-site saves do not create a second entry. Quota failure is in-memory only. These checks do not prove a physical phone, lock-screen playback, or live Gemini. Browser coverage for the journey Save specs was not run here.

Next best action: end a ride after saving a narrated place, reopen Discoveries offline, and confirm the checked story and sources render without a new `/api/audio` request.

## Latest cycle — ride map replaces the compass dial (2026-10-24)

The ride instrument is a map centered on the rider (real GPS or the labeled simulated replay position). A `#0071f2` dot with a white ring marks that position. When heading is known, a translucent `#0071f2` wedge uses the same **1200 m** radius and **±22°** half-angle as `isPointedAt` (`POINTING_RADIUS_M`, `POINTING_HALF_ANGLE_DEG` in `src/lib/geo.ts`). Heading null shows the dot and no cone. The camera stays on the rider; pan and zoom gestures are off. Places stay on the candidate sheet. Replay remains labeled simulated. A heading that is not from the phone is labeled “Simulated heading,” not “Phone direction.” The branch diagram in `src/components/network.tsx` is unchanged. The saved-discovery library was left as found.

Library: MapLibre GL JS draws the cone and the branch line on a local style with no tile source. OpenFreeMap was removed because its OpenStreetMap credit cannot be dropped while those tiles are shown.

Rejected: Google Maps (API key, and the user forbade it), Mapbox GL JS (token and Mapbox tiles; the user forbade it), and Leaflet (raster tiles, no Positron paint overrides of the kind requested).

Verified: `npm test -- tests/geo.test.ts` (6 passed, including the cone at 1200 m and ±22° along headings 20° and 350°; a place inside the wedge is inside the cone polygon; a place outside the angle or past 1200 m is not). `npx tsc --noEmit` passed. Turbopack does not emit MapLibre’s relative worker, so `/maplibre-worker` serves `maplibre-gl-worker.mjs`. A phone-width and a 660px-capped desktop ride showed the canvas, the blue dot, expanded attribution “OpenFreeMap © OpenMapTiles Data from OpenStreetMap”, “Simulated heading” with “Simulated location & heading”, no compass dial, and no overlap of the map with the audio bar, candidate sheet, or tab bar. Positron style and vector tiles returned 200.

Designer surfaces: the ride map frame (`.ride-map` inside `.compass-stage`, capped with the dial’s old footprint so it does not cover the audio bar, candidate sheet, or tab bar), the expanded attribution control on a phone-width map, the rider dot and cone so the canvas does not look like a default OSM embed, and overflow at 320px and short landscape. Steel ticks and the brass needle are no longer on this surface. Do not restyle `network.tsx` or the saved-discovery library as part of this map.

Reviewer risks: Positron tiles and `/maplibre-worker` need network and are not in the service-worker cache, so an offline ride can show a gray frame; a missing WebGL context falls back to that frame. A flat simulated phone showed the dot, “Compass waiting”, and “Simulated train · joystick”, not “Phone direction”. A short drag left the dot in place. These checks do not prove a physical compass or a long offline ride.

Next best action: on a phone over HTTPS, confirm tiles, attribution, and that dragging the map does not leave the rider.

## Designer note — pointing chooser (2026-10-24)

The pointing sheet is a compact chooser: thumbnail, place name, and distance. The sourced description stays on the discovery card Summary after the rider taps a row. “No sourced summary yet.” is not in the sheet. Rows scroll inside the band above the tab bar when the dial cannot shrink further. The card footer follows the summary instead of covering it. Replay stays labeled simulated. Steel `#8e98a8` remains the dial ticks; brass `#8f6b3d` remains the compass needle.

Updated 2026-10-24. This file captures the product decisions, research, current implementation, and remaining work for the next model. Read `AGENTS.md` first; it requires consulting the installed Next.js guides under `node_modules/next/dist/docs/` before changing code. Keep UI copy minimal and omit subtitles that restate visible controls.

For user-authorized autonomous hackathon improvement sessions, use `REFINEMENT.md`. It defines feature/UI autonomy, the current product commitments, prioritization, repeated implementation and verification, a focused demo standard, and handoff requirements. The latest narration contract below takes precedence over older audio descriptions in this handoff.

## Designer note — audio next line (2026-10-24)

On the phone and at the 660px ride, the audio line keeps the word Next intact. The upcoming place name may ellipsize. “King Manor Museum queued” and Play now stay on that line, above the tab bar.

## Designer note — point, choose, hear (2026-10-24)

On a phone and at the 660px ride, the compass, nearby line, and discovery card sit in the space above the tab bar. Aiming lists up to four single-line rows — name, distance, chevron — including “Nothing in this direction.” The guide keeps the current story beside pause, skip, and stop. A selection made while something else plays stays visible as “queued,” with a short Next line and Play now. A delayed story says building for a heritage place, landmark or station when that is the category, and place otherwise. Replay stays labeled simulated.

## Designer note — idle aim (2026-10-24)

On Jamaica replay, simulated aim with no sourced target is a settled compass: steel ticks, an aged-brass needle, and “Simulated aim” without the upright-phone line. Discover says “No sourced place in range.” The queue names “Loading places…”, that empty aim, or “Places didn’t load,” and a failed catalog keeps Retry on a paper alert above the tab bar. Nearby says “Places unavailable.” The developer panel’s Detection line uses that catalog reason instead of a sensor or tilt pause. Replay stays labeled simulated.

## Latest cycle — point, choose, then hear (2026-10-24)

Pointing no longer saves a place after it stays inside the cone. A compact sheet lists up to four places in the current heading, ranked by angular alignment and then distance. Rows stay put while the sheet is touched or focused. Tapping one opens its photo and story, saves it, and schedules narration. Skipping narration does not discard it. Jamaica replay still aims the simulated phone at the next undiscovered sourced place, skips same-name duplicates and unsupported infrastructure, and does not auto-save. Loading, empty, and failed catalogs stay explicit. Simulation stays labeled “Simulated aim” / “Replay”.

Audio is one queue on the existing George voice. The current clip finishes before a selected story. **Play now** and an explicit replay interrupt. Selected stories are prepared first and play before automatic nearby narration. A selection within 45 seconds opens with “You just pointed at [name].”; a later one opens with “That [building, landmark, station, or place] you pointed at earlier, [name].” Nearby narration uses the place name. Replay uses “Once more, [name].” A POI clip still needs a sourced fact or story; otherwise the discovery stays saved and the player says a sourced story is not available yet. Station lines stay exactly “Station approaching: [name].”, can insert at a sentence boundary on device speech, and are dropped when stale or farther than 1.2 km. The guide stays quiet when nothing is queued. The breath between stories is 900 ms. `AUDIO_REVISION` is `journey-story-4`.

Verified: `npm test` (48 unit tests, including candidate ranking, stable rows, selected-only persistence, narration order, preparation priority, Play now, deduplication, timely versus delayed introductions, stale station discard, and unavailable-story recovery) and `npx playwright test tests/e2e/replay-discovery.spec.ts tests/e2e/audio.spec.ts tests/e2e/dev-panel.spec.ts tests/e2e/journey.spec.ts` (32 passed, 2 skipped, desktop and mobile). `npm run build` typechecked. The simulated ride showed Jamaica and King Manor, saved only the selected place, showed a queued confirmation while the station clip was the only playback, and kept the discovery after Skip. Providers were mocked.

Limitations: these checks do not prove a physical compass, GPS, lock-screen playback, or live ElevenLabs. A single cloud MP3 cannot yield at an interior sentence; a station that becomes due during that clip waits until it ends and is dropped if no longer timely. A delayed intro says building, landmark, or station when that matches the category, and place otherwise. `enqueue` still dedupes by id only, so an audio-bar save can keep a second node for the same name. A pause during the 350 ms device-speech sentence gap can drop the rest of that story.

Next best action: on a physical phone over HTTPS, point toward two real nearby places, select one while a station announcement is playing, and confirm Play now, skip, and lock-screen controls against a cached George clip.

## Product goal and accepted scope

Train Discovery is a mobile-first Next.js PWA for LIRR riders. The active flow is:

1. Choose the LIRR branch the rider is on from routes near their location.
2. Start the ride.
3. Use train location plus the phone's absolute compass/gyroscope orientation to list nearby places in the direction the rider points. Alignment is not visual identification.
4. The rider chooses one place. It stays in the queue across movement, turning, and reload until explicitly discarded. Skipping narration does not discard it.
5. Show a Google Places photo or a freely sourced Wikimedia Commons fallback with photographer/license attribution, concise historical context, and trustworthy sources.
6. Hear the selected story after the current clip, with station lines and nearby narration in the same queue. Nearby narration can still be saved from the audio controls.

All LIRR branches are in scope. No left/right selector. Camera recognition and accounts are out of scope. The adjacent `../sbuhacks-demo` was used for flow context only; do not treat its UI as a visual reference or modify it.

The user explicitly pinned the [Waymo iOS screens on Mobbin](https://mobbin.com/apps/waymo-ios-028a65c1-23a8-4fe1-bcf0-aab15ced5842/dc7cedc4-3442-452c-a4ac-e0181cdac9fd/screens) as the visual theme. Use cool-gray canvas, white sheets, near-black text, vivid blue actions, Google Sans, rounded pill controls, and minimal copy. Exact sampled colors and design notes are in `DESIGN.md` and `.impeccable/design.json`. Do not revive the rejected green UI or add Waymo branding.

## Current state

Latest narration contract: stations say “Station approaching: [name].” Station historical research is no longer part of playback. A selected POI opens with “You just pointed at [name].” within 45 seconds, or “That building you pointed at earlier, [name].” after that. Nearby narration uses the place name, and explicit replay uses “Once more, [name].” Each POI clip needs a sourced fact or story; identity-only POI clips are not played. The request context is `pointed`, `pointed-earlier`, `nearby`, or `replay`. Missing stories leave the discovery saved and show a brief notice. Audio revision `journey-story-4` invalidates older clips. These decisions supersede the station-history, identity-only fallback, and revision-3 descriptions below.

Audio upgrade (2026-10-24): `src/lib/audio-prompts.ts` contains the whimsical, evidence-bound story prompt and voice direction. `POST /api/audio` resolves actual place/station IDs server-side, runs the existing LangChain claim/quote/verdict pipeline for matched source passages when no published story exists, and synthesizes the approved transcript through ElevenLabs (George, Multilingual v2; configurable). Station source summaries require a geographic match to the MTA stop. If a POI has no sourced fact or story, nothing is spoken for it. On rejected generation, matched direct excerpts remain explicitly labeled. The shared private `journey-audio` bucket and service-only `audio_jobs`/`audio_budget` tables cache clips and lease generation, with a configurable default 9,000-character monthly application ceiling. Migration `20261024174514_journey_audio.sql` is applied to project `abwsqgpufuuxnzptikgk`.

`use-audio-guide.ts` now runs a single opt-in playback queue: the current clip finishes, then selected stories, then a timely station, then nearby narrated POIs. Station encounters still arm at 250 m or when a fresh GPS segment passes within 180 m. Selected places are prepared before nearby ones. It deduplicates by place and by fact per mounted ride, ignores stale GPS/replay jumps, drops stale or distant station announcements, leaves 900 ms between stories, supports Play now, pause/resume, skip, stop, replay, and Media Session controls, aborts late results, and falls back to device speech with a visible notice. `AudioGuideBar` includes expandable transcript and attribution. GPS remains local; only place/stop IDs go to the narration endpoint. Background GPS/lock-screen playback still require real device validation. Earlier native-only audio notes below are superseded by this section. Existing uncommitted photo/source-card work was preserved.

Audio validation completed: production build, ESLint, 36 unit checks, and 12 targeted desktop/mobile audio browser checks pass. The broader journey checks also passed after adapting the existing source-excerpt assertion to the current card. Live station and POI requests returned evidence-checked transcripts and playable MP3s; repeated station requests reused the same cached object. Transactional database assertions covered exclusive leases, character allowance exhaustion, token ownership, duplicate settlement/refund prevention, and ready-clip reuse; all test writes were rolled back. Public clients cannot read the audio cache table or invoke its generation RPC. Security advisors report only the intentional absence of public RLS policies on service-only tables. Mobile/desktop visual inspection found no horizontal overflow. The detector found no blocking design issues; existing type-ramp advisories from the stale design sidecar were left standing, with no new suppressions.

Provider setup: the user corrected the Supabase secret in the app `.env`; its older `.env.local` override was synchronized. ElevenLabs is configured in the app `.env.local`; speech permission works, voice-library browsing permission is absent and is not needed. No secrets were printed or committed. Station research now includes the matched Wikipedia article's History section, not just the introductory classification/ridership paragraph. Newly verified POI narration is merged back into the persistent discovery card with its supporting passages.

The app is implemented in this repository and builds/runs locally. The home screen was redesigned around the MTA route map: route paths can be tapped to select a branch and open the bottom route sheet; the location control requests GPS and filters the sheet to nearby routes. The sheet starts collapsed so the map leads; tap its handle to expand route search/list. Jamaica is the default demo context because ten LIRR routes are near it; it makes route selection and replay easy without location permissions. “Use Jamaica demo” restores that context. The route sheet has route search, nearby/all filtering, and Start ride.

A developer panel was added at the user's request to conveniently test train movement and sensors. Open it with the header sliders button, the backtick key, or `/?dev`. It supports a simulated train, play/pause, 0–240 km/h speed, reverse, route scrub/250m steps, reset to Jamaica, station jumps, auto-aim, a persistent joystick heading, tilt simulation, real phone compass with simulated train motion, and real GPS. Compact mode leaves the compass/feed visible. It uses the same POI detector and persistent queue as the real ride. See the detailed usage section in `README.md` and `src/components/dev-panel.tsx`.

The production build, ESLint, 18 unit tests, and 12 provider-independent Playwright cases passed after the audio tour work; the 2 optional live-database offline-reopen checks also pass. These checks do not validate physical device sensors or certify release readiness. If continuing in a fresh environment, run the commands in README; the previous local production server was at `http://localhost:3000` but may no longer be running.

## Stack and architecture

- Next.js 16.4.3, React 19.3, TypeScript; mobile-first PWA.
- Supabase Postgres/PostGIS for route and POI catalog. Public browser access is read-only; privileged publishing and photo quotas stay server-side.
- Official MTA GTFS static data for LIRR routes/stations/shapes; OpenStreetMap for nearby candidates; Wikipedia passages as freely accessible evidence where available.
- Gemini via LangChain for bounded claim generation and a separate verification pass. Content fails closed when source passages or verification are missing.
- Google Places API (New) for on-demand place photos and attribution. Wikipedia page summaries plus Commons imageinfo for free, fully credited fallback photographs. External image content is not persisted/cached.
- Location remains on device; browser downloads a branch package and computes proximity/bearing locally. No location history or passenger account.

Key files:

- `src/components/discovery-app.tsx`: route selection, ride lifecycle, detection, queue, navigation, and dev panel wiring.
- `src/components/dev-panel.tsx`: replay and orientation test controls.
- `src/components/compass.tsx`, `src/hooks/use-sensors.ts`, `src/lib/geo.ts`: heading, GPS, camera axis, geometry, detection.
- `src/components/place-card.tsx`, `src/lib/queue.ts`, `src/lib/storage.ts`: POI presentation and persistent queue.
- `src/hooks/use-audio-guide.ts`, `src/lib/narration.ts`, `src/components/audio-guide-bar.tsx`: opt-in browser narration of individually cited claims, playback controls, and saving narrated discoveries.
- `src/lib/verification.ts`: LangChain claim/evidence pipeline and fail-closed checks.
- `src/app/api/`: journey catalog, nearby lookup, photo proxy/rate limits, health.
- `src/app/about/page.tsx`: privacy, sources/licenses, and terms.
- `public/sw.js`: app shell and branch-package offline caching; excludes photo/API caching.
- `public/data/lirr.json`, `public/data/belmont-osm.json`, `public/data/places.json`: checked-in route and candidate-place snapshots.
- `scripts/import-lirr.py`, `scripts/import-places.py`, `scripts/verify-content.ts`, `scripts/publish.ts`: refresh and publishing workflow.
- `supabase/migrations/`: four migrations currently present.
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

`NEXT_PUBLIC_SUPABASE_URL` and the publishable key are configured locally. A random `RATE_LIMIT_SECRET` was generated locally. Provider/server credentials were not supplied in the handoff and may still be blank: `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `SUPABASE_SECRET_KEY`. The user said they have Gemini and a free Google Places key and was told to configure them in `.env.local`; never ask them to paste secrets into chat. Check environment presence without printing secret values. The Wikimedia photo fallback works without those paid-provider credentials as long as the public catalog is reachable.

`.env.example` documents the expected variables. The Google key should be server-restricted, with Places API (New) enabled and cloud quotas/billing constraints understood. A free key does not guarantee photo requests have no cost. `TRUST_PROXY=true` is safe only when the hosting proxy overwrites forwarding headers.

Supabase catalog reads are public/read-only; nearby lookup is invoker-rights. `refresh_catalog` and Google photo-budget consumption require service role. Photo-budget storage lives in a private schema with no public policies. Limits: 30 Google lookups per hashed client per UTC hour and 300 globally per UTC day. Raw IPs are not stored in the application DB. The Wikimedia fallback is free, uses a one-day upstream metadata revalidation cache, and requires actual Commons image author/license metadata. Advisor INFO about RLS with no policies on the private budget table is intentional fail-closed behavior.

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

The real flow uses high-accuracy geolocation and absolute orientation. iOS `webkitCompassHeading` is handled; relative `alpha` alone is never treated as north. Rear-camera optical axis is calculated from device orientation. Heading and GPS have staleness/accuracy cutoffs; nearly flat phones, stale readings, hidden tabs, off-route location, and permission failures pause detection with recoverable UI. Pointing lists candidates; a place is saved only when the rider chooses it. Orientation must be tested on actual hardware; train magnetic interference is a material risk.

Opt-in audio tour uses native browser `speechSynthesis`. Verified claims are checked against their cited passage again before narration. With no verified story, the app can read two sentences verbatim from a matched Wikipedia article; voice and player identify these as unverified **source excerpts**. An existing story with stale citations fails closed, and obviously unrelated source titles are rejected. It detects a fresh on-route position, prioritizes stored discoveries then nearby places within 1.1 km (verified stories first), and reads each at most once per session. Cards offer Play story or Listen to source; the compact player can pause, resume, skip, stop, or save the place currently being read. On-device voices and screen-lock/background playback require real mobile testing. At this snapshot only 1 of 138 places has published verified history, so additional verification is still a critical release task.

Queue items are deduplicated and persist per ride in validated local storage. Turning away, moving, scrubbing the developer replay, or reload does not discard them. Dismissal is explicit. Ending a nonempty ride confirms before clearing. Live sensors require a fresh gesture after reload. Private browsing/site-data clearing can erase the queue.

On the home screen, the Discoveries tab is available before a ride starts. With no ride, it opens a dedicated empty collection with a route-selection action. During a ride, Discoveries opens the current ride queue even when it has zero items. The home collection is currently an empty-state screen; discoveries remain scoped to the ride as described above.

PWA caches app shell/assets and branch package, network-first with offline fallback. Google and Wikimedia images and other external/API responses are not persisted in the service worker. Service worker is production-only; use trusted HTTPS for phone location/orientation access. Don't force-update a worker during an active ride.

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
6. Widen coverage of verified stories before the hackathon demo. Local provider keys for Gemini, Places, and the Supabase publishing role were absent when last checked; keep keys out of Git.

## Interaction and copy constraints

Keep UI minimal. Do not add helper text that merely explains visible controls, redundant subtitles, side-of-train selection, pretend live readings, unverified history presented as fact, fake photos, or claims that nearby automatically means visible. Keep simulation clearly labeled. Preserve clear attribution and distinguish sourced metadata from verified historical claims.
