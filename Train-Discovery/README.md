# Train Discovery

A Next.js 16 PWA for all LIRR branches. Choose a branch, start a ride, and point the back of your phone toward a nearby place. Discoveries enter a persistent queue and remain until discarded. There is no left/right window selector and no camera recognition in this scope.

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
- `GOOGLE_PLACES_API_KEY`: server-restricted key with Places API (New) enabled. A key alone does not ensure photo requests are free. Set billing/quota restrictions in Google Cloud. The application does not scrape Google Images.
- `RATE_LIMIT_SECRET`: random secret of at least 32 characters. Already generated locally.
- `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`. Otherwise all photo users share one conservative hourly bucket.

Without provider keys the route selector, sensors, database lookups, queue, and replay work. Photographs show an unavailable state; historical copy stays unpublished. No placeholder text is labeled verified.

## Data and verification

```sh
npm run data:routes
npm run data:places
npm run content:verify -- --limit=20
npm run content:publish
```

Run these commands in order to refresh the catalog. Route imports download official MTA GTFS. OSM imports keep places within 1.2 km of a branch that a rider might look up from the window: heritage buildings, museums, ruins and former railroad uses, named bridges, lighthouses, and natural places that already have a Wikipedia page or a recorded name (beaches, preserves, parks). Plaques, artwork, radio masts, ordinary stations, and street bridges are left out. Each route keeps its strongest 40 places. A short-lived local OSM cache avoids repeating large queries; pass `--refresh` directly to the Python importer to bypass it. `python3 scripts/import-places.py --select-only` reapplies the filter without a new Overpass query. Wikimedia throttling leaves completed batches saved for a later enrichment run.

The catalog includes metadata-only places. Only places with retrieved source passages enter verification. Coverage is incomplete; missing historical narratives are not invented. Wikipedia and archive expansion can add evidence later. Imported OSM tags are displayed as source metadata, separate from generated history.

Verification searches Wikipedia for up to two passages, asks the writer for a short extractive summary whose quotes must appear in those passages, stitches the surviving sentences into one paragraph, and checks each sentence with `gemini-2.5-flash-lite`. A sentence with a missing or rejected citation is dropped. The place fails closed when nothing remains. Evidence hashes invalidate stale story verification. Jobs checkpoint locally after each successful place. Publishing uses one database transaction, including removal of retired records. Keep the original feed and license metadata when redistributing data.

MTA currently supplies no scheduled geometry for Belmont Park, so its track is supplemented from the attributed OSM snapshot in `public/data/belmont-osm.json`. This does not imply operating service. Google photo metadata and image URLs are fetched on demand, attributed, and excluded from persistent caches. The diagram uses MTA geometry; the ride screen uses a directional instrument, without third-party basemap tiles.

## Supabase

Five migrations in `supabase/migrations` are applied to the provisioned project. PostGIS is installed in `extensions`. Public clients have read-only access to catalog rows, plus an invoker-rights nearby query. Catalog publication and photo-budget consumption require the server role. The private photo-budget table has RLS with no public policies by design.

Photo access is bounded in Postgres to 30 lookups per hashed client per UTC hour and 300 globally per UTC day. Every lookup can issue a paid Places text-search and photo request. Bounds are conservative safeguards, not a replacement for provider quotas or hosting-layer abuse protection. Raw IP addresses are not stored in the application database.

## Sensors and persistence

For the current demo, the selector defaults to the official Jamaica station coordinate (40.69960817, -73.80852987). The list labels this **Demo · Jamaica**. Selecting a branch and pressing Start ride launches an explicitly simulated replay beginning at the nearest point on that branch to Jamaica. **Find routes near me** switches to real GPS; **Use Jamaica demo** switches back. No location permission is required for the demo.

Location stays on the device: the app downloads a branch package and computes distances, route proximity, bearing, and pointing locally. The rear-camera axis is derived from absolute orientation, with iOS compass support. Relative alpha alone is never treated as a north bearing. A nearly horizontal phone, inaccurate/stale GPS, unreliable/stale heading, hidden page, or off-route location pauses detection. The user must point steadily for at least 900 ms; at most one discovery is added every 2.5 seconds. Existing cards are never automatically removed.

The queue is stored locally, separately from online content and photo requests. Ending a nonempty ride explicitly confirms clearing the queue. Reloading restores the ride and queue, but live sensors require a fresh user gesture. Local storage failures are surfaced; private browsing and cleared site storage can remove saved data. There is no passenger account or location-history collection.

The PWA precaches its app shell, fonts, and JS/CSS, and saves a branch package after it is loaded. Reopening a downloaded branch works offline; Google photos require connectivity. Service workers are registered only in production. Updates use a versioned cache and normal service-worker lifecycle; do not force a new worker into an active ride.

## Validation

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
TEST_LIVE_DATABASE=1 npm run test:e2e -- --grep "reopen offline"
```

Unit checks cover geographic geometry, camera-axis heading, direction wrapping, persistent queue behavior, citation rejection, evidence changes, and all-branch place coverage. Browser checks cover mobile/desktop selection, mocked phone sensors, denial recovery, persistence across turns/movement/reload, dismissal, and overflow. The optional offline check uses the live Supabase catalog. CI runs the provider-independent checks.

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
