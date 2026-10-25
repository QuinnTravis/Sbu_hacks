import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Turbopack serves MapLibre from a chunk whose URL is not next to
// maplibre-gl-worker.mjs, so the library's relative worker request 404s.
export async function GET() {
  const body = await readFile(
    join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
