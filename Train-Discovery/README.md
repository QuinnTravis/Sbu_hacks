# Train Discovery

A Next.js 16 PWA for all LIRR branches. Choose a branch, start a ride, and point the back of your phone toward a nearby place. Chosen places stay in the ride queue until discarded. Saving a discovery keeps that place, including a checked story already on the card, on the device after the ride. An optional ElevenLabs audio companion narrates station encounters, pointed discoveries, and nearby stories throughout the ride, with source checks and transcripts. There is no left/right window selector and no camera recognition in this scope.

## Ride interface

The map fills the screen. Hold an aim briefly to reveal nearby places in a bottom sheet; selecting one expands its card over the map and adds it to This ride. Drag or use the handle to expand/collapse, and close the sheet without discarding the discovery. Save keeps it beyond the ride; Discard discovery removes it from the current queue. Reduced motion disables the spring animation.

## Run

Node.js 24 is recommended.

```sh
npm ci
npm run dev
```

The local Supabase connection is configured in `.env.local`. The project is `train-discovery` (`abwsqgpufuuxnzptikgk`, US East). The public catalog is already populated. Never commit `.env.local`.

## Configure providers

Copy `.env.example` to `.env.local` only when starting a fresh checkout; preserve any existing configuration.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public catalog read access.
- `SUPABASE_SECRET_KEY`: backend-only Supabase secret key, required for photo rate limiting and catalog publishing. Find it in the project API Keys settings. Never prefix this key with NEXT_PUBLIC.
- `GEMINI_API_KEY`: Google AI Studio key. The structured LangChain pipeline defaults to `gemini-2.5-flash` for the summary and `gemini-2.5-flash-lite` for the evidence check. Both model IDs are configurable. Thinking is disabled so the structured summary is not consumed by reasoning tokens.
- `SERPER_API_KEY`: Serper search key. Each story check runs one search per place and compares the results.
- `ELEVENLABS_API_KEY`: server-only speech generation key with Text to Speech permission. The default is George (`JBFqnCBsd6RMkjVDRZzb`) with Multilingual v2. Override `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL` to use another voice/model. Voice browsing permission is not required.
- `ELEVENLABS_MONTHLY_CHARACTER_LIMIT`: shared application ceiling for newly generated speech per UTC month (default 9,000 characters). Replays use the private Supabase audio cache. This cap is independent of your provider plan; the app reserves 1,200 characters per pending generation and refunds the unused portion on completion.
- `GOOGLE_PLACES_API_KEY`: server-restricted key with Places API (New) enabled. A key alone does not ensure photo requests are free. Set billing/quota restrictions in Google Cloud. The application does not scrape Google Images.
- `RATE_LIMIT_SECRET`: random secret of at least 32 characters. Already generated locally.
- `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`. Otherwise all photo users share one conservative hourly bucket.

Without paid provider keys the route selector, sensors, database lookups, queue, and replay work. Places with Wikipedia articles may show freely available Wikimedia Commons photographs with the photographer, source link, and license credited in the card’s photo-details viewer. Other photographs show an unavailable state; historical copy stays unpublished.

## Data and verification

```sh
npm run data:routes
npm run data:places
npm run content:verify -- --limit=20
npm run content:verify:place -- --id=osm-node-7087272768
npm run content:publish
```

Run these commands in order to refresh the catalog. Route imports download official MTA GTFS. OSM imports keep places within 1.2 km of a branch that a rider might look up from the window: heritage buildings, museums, ruins and former railroad uses, named bridges, lighthouses, and natural places that already have a Wikipedia page or a recorded name (beaches, preserves, parks). Plaques, artwork, radio masts, ordinary stations, and street bridges are left out. Each route keeps its strongest 40 places. A short-lived local OSM cache avoids repeating large queries; pass `--refresh` directly to the Python importer to bypass it. `python3 scripts/import-places.py --select-only` reapplies the filter without a new Overpass query. Wikimedia throttling leaves completed batches saved for a later enrichment run.

The catalog includes metadata-only places. Any place can be checked; coverage depends on what search returns. Missing historical narratives are not invented. Wikipedia and archive expansion can add evidence later. Imported OSM tags are displayed as source metadata, separate from generated history.

Verification is an agreement check. One Serper search (the quoted place name plus its Wikidata or Nominatim region) collects up to eight sources from distinct sites, alongside any stored evidence. Gemini 2.5 Flash writes a short summary, an optional fun fact, and narration from those sources. Each sentence is kept only when at least two sites contain its numbers, names, and most of its key words; when no summary sentence reaches two, the best single-site sentences are used. The place fails closed when nothing matches. Stories are checked on the fly through `GET /api/story/[id]` (cached 24 hours on the server) as places come into view, and the card shows them without verification labels. `npm run content:network` precomputes stories for demo routes. Evidence hashes invalidate stale story verification. Batch jobs checkpoint locally after each successful place. `content:verify:place` reads and updates only the requested Supabase row after verification succeeds. The full catalog publisher uses one database transaction, including removal of retired records. Keep the original feed and license metadata when redistributing data.

MTA currently supplies no scheduled geometry for Belmont Park, so its track is supplemented from the attributed OSM snapshot in `public/data/belmont-osm.json`. This does not imply operating service. Google photo metadata and image URLs are fetched on demand, attributed, and excluded from persistent caches. When Google is unconfigured, limited, or cannot match the place, the photo endpoint can use its OSM Wikipedia link to retrieve a Commons thumbnail and its actual license/author metadata. Images without a Commons credit page are rejected. Wikimedia metadata fetches use a one-day upstream revalidation cache; displayed external images are never saved offline. The branch diagram uses MTA geometry. During a ride, the full-screen map uses an OpenFreeMap basemap with the branch line, rider, and the same pointing cone used for detection. Map attribution is available through its expandable control.

## Supabase

Four migrations in `supabase/migrations` are applied to the provisioned project. PostGIS is installed in `extensions`. Public clients have read-only access to catalog rows, plus an invoker-rights nearby query. Catalog publication and photo-budget consumption require the server role. The private photo-budget table has RLS with no public policies by design.

Google photo access is bounded in Postgres to 30 lookups per hashed client per UTC hour and 300 globally per UTC day. Every authorized Google lookup can issue a paid Places text-search and photo request. Bounds are conservative safeguards, not a replacement for provider quotas or hosting-layer abuse protection. Wikimedia fallback does not require Google billing and is subject to Wikimedia availability, license terms, and service usage policies. Raw IP addresses are not stored in the application database.

## Sensors and persistence

For the current demo, the selector defaults to the official Jamaica station coordinate (40.69960817, -73.80852987). The list labels this **Demo · Jamaica**. Selecting a branch and pressing Start ride launches an explicitly simulated replay beginning at the nearest point on that branch to Jamaica. **Find routes near me** switches to real GPS; **Use Jamaica demo** switches back. No location permission is required for the demo.

Location stays on the device: the app downloads a branch package and computes distances, route proximity, bearing, and pointing locally. The rear-camera axis is derived from absolute orientation, with iOS compass support. Relative alpha alone is never treated as a north bearing. A nearly horizontal phone, inaccurate/stale GPS, unreliable/stale heading, hidden page, or off-route location pauses detection. Pointing lists up to four places in that direction, ranked by alignment with the phone heading and then by distance. Alignment is not proof the rider can see the place. Choosing a place keeps it in the ride queue until the rider discards it. Saving a discovery also keeps that place on the device after the ride ends, including a Gemini-checked story already on the card. The saved library is separate from the ride queue. Discarding a queued card does not remove the saved copy. Ending a ride clears the queue and leaves the library.

The queue and the saved library are stored locally, separately from online content and photo requests. A saved place keeps its name, coordinates, category, source, tags, evidence, and checked story. It does not include photo bytes, Google photo URLs, audio URLs, or location history. Ending a nonempty ride explicitly confirms clearing the queue. Reloading restores the ride, the queue, and saved discoveries. Live sensors require a fresh user gesture. Local storage failures are surfaced; private browsing and cleared site data can remove them. There is no passenger account.

### Audio tour

Press **Start audio tour** once after starting a ride. The guide reacts to selected discoveries, station encounters, and nearby places within 1.1 km of a fresh, on-route location. On the live catalog (LIRR), unprompted narration picks the nearby place that is closest and most interesting: closeness and interest weigh equally, a verified story is worth about 550 m over a source excerpt, and each extra checked detail about 110 m. Automatic narration there needs a verified story, or an attributed source excerpt within 300 m of the rider (not for streets and other infrastructure). When nearby stories run out, it can add a low-frequency area aside from a verified place within 5 km, and when the rider is getting closer to a verified story it can open with a brief “Oh, and we’re getting closer…” lead-in and a separately checked fun fact. Static networks such as the California Zephyr keep their corridor radius and editorial ranking. A station triggers within 250 m, or when two fresh GPS fixes show that you passed within 180 m; stale GPS and large replay jumps do not announce every intervening station. This is geographic discovery, not an announcement of your train's scheduled stops. Choosing a place schedules its story without interrupting the one already playing. Selected stories play before automatic nearby narration. A timely selection opens with “You just pointed at [name].” If it starts later, it opens with “That [building, landmark, station, or place] you pointed at earlier, [name],” using the noun from the place category. Nearby narration and explicit replay do not use the pointing line. **Play now** interrupts. Station announcements stay exactly “Station approaching: [name].” and are dropped when they are no longer timely. Narrations do not overlap. The guide stays quiet when nothing worthwhile is queued.

The server accepts known catalog place IDs or station/branch IDs, never arbitrary speech text or GPS coordinates. Places without a published story go through the same agreement check before narration (shared cache with `/api/story`). A failed check falls back to a Wikipedia excerpt read plainly; POI narration always requires a sourced fact or story; without one, the place stays queued and a notice explains that a sourced story is not yet available. Station audio is the concise announcement “Station approaching: [name].” An invalidated published story never yields historical narration.

ElevenLabs voices the approved transcript; MP3s and transcripts are cached in private Supabase storage and service-only tables. Apply `supabase/migrations/20261024174514_journey_audio.sql` to a fresh project; it is applied to the configured project. Shared generation leases prevent duplicate provider calls across server instances and a durable character ledger bounds spending. Provider or network failures use the device voice with an explicit notice. First-time story generation may take several seconds; subsequent listens reuse the clip. Browser speech fallback requires `speechSynthesis`. Cached cloud clips currently require connectivity to obtain their signed playback URL.

Play now, pause/resume, skip, stop, explicit replay, save, and transcript/source links are available in the player. The current story and the next one are shown in the player. Places and stations are narrated once per mounted ride unless explicitly replayed; pause or toggling audio off/on does not reset that history. Discarding a place cancels it immediately, late provider responses cannot restart a skipped clip, and ending/changing the ride cancels playback. Supported browsers expose play/pause/skip through the Media Session API. Mobile lock-screen playback and background GPS still need physical iOS/Android checks; a PWA cannot guarantee continuous location updates with its screen locked. No microphone permission is requested.

The PWA precaches its app shell, fonts, and JS/CSS, and saves a branch package after it is loaded. Reopening a downloaded branch works offline; Google and Wikimedia photos require connectivity. Service workers are registered only in production. Updates use a versioned cache and normal service-worker lifecycle; do not force a new worker into an active ride.

## Validation

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
TEST_LIVE_DATABASE=1 npm run test:e2e -- --grep "reopen offline"
```

Unit checks cover geographic geometry, camera-axis heading, direction wrapping, persistent queue behavior, citation rejection, evidence changes, supported narration, and all-branch place coverage. Browser checks cover mobile/desktop selection, mocked phone sensors, denial recovery, persistence across turns/movement/reload, audio controls, dismissal, and overflow. The optional offline check uses the live Supabase catalog. CI runs the provider-independent checks.

## Release requirements

This implementation is not certified release-ready until these checks are complete:

1. Add provider/server keys, execute verification, publish approved content, and validate real Google photos and attribution.
2. Exercise Safari on a physical iPhone and Chrome on a physical Android phone over trusted HTTPS, including portrait/landscape, compass interference on a train, permissions, stale readings, and resume after lock. Browser sensor mocks cannot validate hardware.
3. Validate route/POI quality across branches. Proximity and pointing do not establish line of sight or identify a structure from an image. Source verification does not establish that the original source is correct.
4. Deploy over HTTPS with the environment variables, trustworthy proxy configuration, provider quotas, hosting request limits, and uptime checks on `/api/health`. Monitor verified-content coverage as well as availability.
5. Automate daily GTFS/OSM refreshes and periodic evidence refresh/verification as scheduled jobs using the protected publishing credentials. This repository supplies the commands; no hosted scheduler is provisioned.

Privacy, source licenses, and terms are accessible at `/about`. The adjacent `../sbuhacks-demo` remains untouched and was used only to understand the flow.

## Dev panel

Open the sliders button in the header, press the backtick key, or visit `/?dev`. The panel is local testing UI and does not grant backend access.

- Start the Jamaica demo, then play/pause, adjust 0–240 km/h speed, reverse, scrub the route, step 250 meters, reset to Jamaica, or jump to a station on the selected path. Motion follows distance along the actual rail shape and stops at its ends.
- Heading sources are Auto aim, Joystick, and Phone compass. The joystick supports mouse/touch dragging and arrow keys (5° steps), Home (north), and End (355°). Tilt 0° simulates a flat phone and pauses pointing detection; 90° is upright.
- Choose Phone compass while Location is Simulated train to test real device orientation without physically riding a train. Motion permission and trusted HTTPS are still required. Choose Real GPS for an actual journey.
- Use the compact-controls button to keep a floating joystick visible while watching the app, especially on a phone. Nearby targets show distance, bearing, and angular error. Aim selects a target's bearing and switches to an upright joystick heading. Position and heading sources are always labeled. Controls exercise the same detection and persistent queue as a real ride; scrubbing does not erase the queue.

Dev control values are transient; refreshing starts the simulated position near Jamaica while preserving your discovery queue.

## Places across the California Zephyr

All six segments from Chicago to Emeryville now include discoverable places. The five catalogs outside the Rockies are built from nearby Wikipedia articles with real coordinates, Wikidata identifiers and attributed source excerpts. Records are filtered to the rail corridor and distributed along each segment. The existing Rockies stories, historical photos and recorded audio stay curated separately. Sparse stretches of countryside can still have fewer documented places; proximity is not a guarantee of visibility.

Refresh the additional catalogs without touching the Rockies or downloading GTFS again:

```sh
npm run data:zephyr
npm run data:zephyr -- --segment=cz-sierra
npm run data:zephyr -- --refresh
```

This importer uses cached, serial requests to the public MediaWiki API and needs no API key. Coverage and source availability are recorded in each catalog’s `coverage` metadata. Newly imported source excerpts are not labeled as verified generated stories; translated narration and cloud audio remain separate provider operations.
