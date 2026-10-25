# Time Portal

Time Portal creates an experimental historical scene for a discovered or saved place. It uses the place's coordinates, name, tags, sourced story, archival excerpts and curated historical image metadata, then asks Gemini Nano Banana 2.1 to use Google Web and Image Search as visual context. Users do not need to photograph or scan the location.

## Pipeline

1. POST a catalog place ID and year to `/api/time-portal`.
2. Resolve the place with `staticPlace` first and read its matching history from `staticPackageFiles`. California Zephyr places are bundled locally, not stored in Supabase. For other catalog places (including LIRR), fall back to the Supabase `places` table. Hash the scene specification, model, prompt revision and any inline image digests.
3. Serve a cached scene, wait for an existing request, or claim one generation attempt.
4. Generate one 1K, 21:9 JPEG with Gemini's Interactions API and the existing Google web/image search tool. Supply up to three actual curated historic images as inline image inputs, alongside their dates, dating uncertainty, captions, credits, licenses and source URLs. Rank references by distance from the requested year with a stable ID tie-break; include metadata for up to six matching records. References from other years are explicitly contextual, not proof of the requested era.
5. Save the image and Google's search suggestions in a private Supabase bucket and scene record. Return a signed image URL and stable scene ID.
6. Render the panorama on the inside of a Three.js cylinder. Dragging or arrow keys changes the view; a small camera translation creates parallax.
7. A browser worker runs the Apache-2.0 Depth Anything V2 Small model locally, preferring WebGPU and falling back to WASM. Its quantized weights download on first use (about 27 MB, plus runtime assets). Depth loads progressively and requires no API token.
8. Cache up to 12 depth maps on the device by scene ID. If depth or WebGL is unavailable, retain the panorama or still image.

## Configuration and budget

Use the app's existing `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keys remain on the server. No additional search, Hugging Face or 3D provider key is required.

`supabase/migrations/20261025110609_time_portal_scene_cache.sql` is the exact reviewed migration source aligned with the already-applied live version `20261025110609` (`time_portal_scene_cache`). Do not reapply it to that project. For a fresh database, apply it after the existing migrations. It creates the private scene bucket, cache rows, request leases and a global limit of **50 provider attempts**. Failures count toward the limit, so retries and crashed requests cannot silently reset the counter. Cached images remain available after the limit and can be served without a Gemini key. The limit bounds attempts, not an exact dollar charge: output, input and search usage are billed by Google. Set the provider's billing controls separately for a strict spending limit.

The route uses the default Node.js runtime required by this app’s Cache Components configuration. Run Next.js from `Train-Discovery`. The `/api/time-portal` output trace includes `public/history` so curated images remain available in deployed server functions. Retain the public assets when deploying standalone. Only paths from trusted static historical records are considered: no remote image fetches, client-provided paths or modern comparison images. Paths must resolve within the real `public` directory, including after symlink resolution. Each file read is bounded to 2 MiB plus one overflow-detection byte; accepted inline images are capped at 2 MiB each (6 MiB total); only JPEG, PNG and WebP signatures are accepted. Missing, oversized or invalid images are skipped while historical metadata and search grounding remain available. Changing an attached image changes its digest and scene ID.

The endpoint waits up to 90 seconds for Gemini; the route permits 120 seconds. Duplicate requests receive a pending response and the client polls for the existing scene. Closing the viewer stops client work, but an already accepted server generation may finish and be cached.

An upload is retained when cache completion fails or its response is ambiguous: a committed row must never point to a deleted image. Lease cleanup cannot reset the lifetime attempt counter or clear a completed scene.

## API contract

`POST /api/time-portal` accepts a strict JSON object `{ "placeId": "wd-Q3550021", "year": 1908 }`. Existing OSM catalog IDs are also accepted. The year must be an integer from 1 through the current UTC year. Requests have a 512-character body limit and reject a conflicting Origin. Responses use `Cache-Control: private, no-store`.

Success returns `imageUrl` (signed for one hour), `mimeType`, `searchSuggestions`, `cacheHit`, stable `sceneId`, `year`, `model`, and `disclosure`. Search suggestion HTML is retained verbatim and must be rendered in a sandbox by the client. A concurrent generation returns HTTP 202 with `time_portal_preparing` and `Retry-After: 3`; an exhausted global budget returns HTTP 429 with `time_portal_generation_limit_reached`. Configuration/cache errors return 503, provider generation failures 502, and provider quota failures 429.

## Limits

This is a playful AI interpretation, not a documented reconstruction. Search references and explicit historical evidence help landmark recognition but do not prove the missing surroundings. Camera coordinates, north-facing orientation and eye height are fixed in the prompt; separate generations may still drift across years. The 21:9 strip is wrapped for 360-degree viewing, with vertical movement limited to its coverage. Monocular relative depth adds shallow parallax, not walkable geometry. Google's returned search suggestions appear in a sandboxed frame; the scene carries an accuracy disclosure.

No live Gemini generation is needed to build the app. A paid Gemini image request is needed to evaluate actual image quality, seam continuity and grounding for a particular place.

## Official references

- [Gemini image generation and Google Image Search grounding](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini Interactions API](https://ai.google.dev/api/interactions-api)
- [Depth Anything V2 Small for Transformers.js](https://huggingface.co/onnx-community/depth-anything-v2-small)
