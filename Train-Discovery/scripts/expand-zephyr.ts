/**
 * Incrementally populate the five non-Rockies Zephyr catalogs from existing rail.json.
 * No GTFS, Overpass, paid services, generated stories, or runtime configuration writes.
 * Run: npm run data:zephyr [-- --refresh] [-- --segment=cz-basin]
 * API: https://www.mediawiki.org/wiki/API:Geosearch
 * Etiquette: https://www.mediawiki.org/wiki/API:Etiquette
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { pointAtKm, projectOnRoute, routeIndex } from "../src/lib/route-geometry";
import { sourceExcerpt } from "../src/lib/narration";
import type { Evidence, Place, RailData, RailRoute } from "../src/lib/types";

const ROOT = process.cwd();
const OUT = join(ROOT, "public/data/networks/california-zephyr");
const CACHE = join(ROOT, "scripts/.cache/zephyr-geosearch");
const SEGMENTS = ["cz-plains", "cz-canyons", "cz-basin", "cz-sierra", "cz-bay"];
const USER_AGENT = "GazeZephyrImporter/1.0 (SBU Hacks; https://github.com/QuinnTravis/Sbu_hacks)";
const STEP_KM = 12;
const CORRIDOR_M = 5000;
const MAX_REQUESTS = 1200; // Includes retries and extract continuation, even on --refresh.
const refresh = process.argv.includes("--refresh");
const segment = process.argv.find((arg) => arg.startsWith("--segment="))?.slice(10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;
let cacheHits = 0;
let nextRequestAt = 0;
class StopImport extends Error {}

type Page = {
  pageid: number;
  title: string;
  coordinates?: { lat: number; lon: number; globe?: string }[];
  pageprops?: { wikibase_item?: string; disambiguation?: string };
  extract?: string;
};
type ApiResult = {
  query?: { pages?: Page[] };
  continue?: Record<string, string | number>;
  error?: { code: string; info: string };
};
type Cached = { retrievedAt: string; data: ApiResult };

function writeJson(file: string, data: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + "\n");
  renameSync(`${file}.tmp`, file);
}

async function query(params: URLSearchParams): Promise<Cached> {
  const key = createHash("sha256").update(params.toString()).digest("hex");
  const file = join(CACHE, `${key}.json`);
  if (!refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as Cached;
    if (Date.now() - Date.parse(cached.retrievedAt) < 30 * 86400_000) {
      cacheHits++;
      return cached;
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (requests >= MAX_REQUESTS) throw new StopImport("Request budget exhausted; rerun with caches.");
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    let waitMs = 2000 * 2 ** attempt;
    try {
      requests++;
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        waitMs = Math.max(waitMs, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now());
      }
      // Respect long Retry-After values by stopping; never retry earlier than requested.
      if (waitMs > 60_000) throw new StopImport(`Server requests a ${Math.ceil(waitMs / 1000)}s pause; rerun later.`);
      if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
      const data = await response.json() as ApiResult;
      if (data.error) {
        if (data.error.code === "maxlag" || data.error.code === "ratelimited") waitMs = Math.max(5000, waitMs);
        throw new Error(`${data.error.code}: ${data.error.info}`);
      }
      const result = { retrievedAt: new Date().toISOString(), data };
      writeJson(file, result);
      return result;
    } catch (error) {
      nextRequestAt = Date.now() + waitMs;
      if (attempt === 2 || waitMs > 60_000) throw error;
    } finally {
      nextRequestAt = Math.max(nextRequestAt, Date.now() + 250);
    }
  }
  throw new Error("Unreachable retry state");
}

/** Conservative article-intro heuristics; they do not assert Wikidata classes. */
function classify(page: Page): { category: string; areaKind?: string; score: number } | null {
  const title = page.title;
  const featureName = title.replace(/\s*\([^)]*\)/g, "");
  const lead = (page.extract ?? "").split(/\n/)[0].slice(0, 600);
  const text = `${title} ${lead}`;
  if (/\b(high school|elementary school|middle school|school district|radio station|television station|interchange|intersection|highway|state route|county route|township|census-designated place)\b/i.test(text)) {
    // Census-designated settlements remain useful geographic anchors.
    if (!/census-designated place/i.test(lead) || /township|school|highway/i.test(title)) return null;
  }
  // Check settlements and built features before names such as Green River, Utah.
  if (/\b(is|was) (an? |the )?((small|former|incorporated|home rule|statutory|historic|rural|suburban|resort|mining|railroad|railway|independent|principal|largest|abandoned) ){0,4}(city|town|village|municipality|unincorporated community|census-designated place|ghost town)\b/i.test(lead)) return { category: "Town", areaKind: "town", score: 3 };
  if (/\b(railway station|railroad station|railroad depot|train station|union station|railway museum|railroad museum)\b/i.test(text)) return { category: "Railroad heritage", score: 5 };
  if (/\b(bridge|dam|tunnel|viaduct|aqueduct)\b/i.test(title)) return { category: "Infrastructure", score: 4 };
  if (/\b(canyon|gorge)$/i.test(featureName)) return { category: "Canyon", areaKind: "canyon", score: 7 };
  if (/\b(river|creek)$/i.test(featureName)) return { category: "River", areaKind: "river", score: 5 };
  if (/\b(mountain|mountains|peak|summit|butte|ridge)$/i.test(featureName)) return { category: "Mountain", score: 6 };
  if (/\b(lake|reservoir|wetland|marsh|forest|wildlife refuge|state park|national park|regional park|nature preserve|valley|desert)\b/i.test(featureName)) {
    const areaKind = /lake|reservoir/i.test(featureName) ? "lake" : /valley/i.test(featureName) ? "valley" : /forest/i.test(featureName) ? "forest" : "park";
    return { category: "Nature", areaKind, score: 6 };
  }
  if (/\b(museum|historic district|historic site|national historic|archaeological|monument|memorial|fort)\b/i.test(text)) return { category: "Heritage", score: 6 };
  if (/\b(skyscraper|sculpture|botanical garden|arboretum|zoo|theater|theatre|cathedral)\b/i.test(text)) return { category: "Landmark", score: 4 };
  return null;
}

function toPlace(page: Page, retrievedAt: string, route: RailRoute, index: ReturnType<typeof routeIndex>) {
  const qid = page.pageprops?.wikibase_item;
  const coord = page.coordinates?.find((p) => !p.globe || p.globe === "earth");
  if (!qid || !/^Q\d+$/.test(qid) || !coord || !page.extract || page.extract.length < 50 || page.pageprops?.disambiguation !== undefined) return null;
  const classification = classify(page);
  if (!classification) return null;
  const projection = projectOnRoute(index, coord);
  if (!projection || projection.lateralM > CORRIDOR_M) return null;
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  const evidence: Evidence = {
    id: `wikipedia-${page.pageid}`, title: page.title, url,
    text: page.extract, retrievedAt, license: "CC BY-SA 4.0",
  };
  const place: Place = {
    id: `wd-${qid}`, name: page.title, lat: coord.lat, lon: coord.lon,
    category: classification.category, routeIds: [route.id], wikipedia: page.title,
    wikidata: qid, sourceUrl: url, tags: { importer: "mediawiki-geosearch" },
    evidence: [evidence], kind: "poi", routeKm: projection.km,
    lateralM: projection.lateralM, signedLateralM: projection.signedLateralM,
    ...(classification.areaKind ? { areaKind: classification.areaKind } : {}),
  };
  if (!sourceExcerpt(place)) {
    // Preserve verbatim complete sentences; never paraphrase or clip to a word limit.
    const short = page.extract.split(/(?<=[.!?])\s+(?=[A-Z“"0-9])/).map((s) => s.trim()).find((s) =>
      s.length >= 50 && s.length <= 420 && s.split(/\s+/).length <= 35 && /[.!?]$/.test(s) && !s.includes("..."),
    );
    if (short) place.evidence.unshift({ ...evidence, id: `${evidence.id}-excerpt`, text: short });
  }
  if (!sourceExcerpt(place)) return null;
  return { place, score: classification.score - projection.lateralM / 10_000 };
}

async function importSegment(route: RailRoute) {
  if (route.paths.length !== 1) throw new Error(`${route.id}: expected one contiguous path`);
  const index = routeIndex(route.paths[0]);
  const steps = Math.ceil(index.totalKm / STEP_KM);
  const candidates = new Map<string, { place: Place; score: number }>();
  const failedSamples: { km: number; error: string }[] = [];
  for (let i = 0; i <= steps; i++) {
    const km = index.totalKm * i / steps;
    const center = pointAtKm(index, km)!;
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", generator: "geosearch",
      ggscoord: `${center.lat.toFixed(6)}|${center.lon.toFixed(6)}`,
      ggsradius: "10000", ggslimit: "20", ggsnamespace: "0",
      prop: "coordinates|extracts|pageprops", coprimary: "primary",
      exintro: "1", explaintext: "1", exchars: "1600", exlimit: "20", maxlag: "5",
    });
    try {
      const pages = new Map<number, { page: Page; retrievedAt: string }>();
      // Extracts can continue independently of geosearch; bound continuation to 3 pages.
      for (let batch = 0; batch < 3; batch++) {
        const result = await query(params);
        for (const page of result.data.query?.pages ?? []) {
          const previous = pages.get(page.pageid);
          pages.set(page.pageid, {
            page: { ...previous?.page, ...page },
            retrievedAt: page.extract ? result.retrievedAt : previous?.retrievedAt ?? result.retrievedAt,
          });
        }
        if (!result.data.continue) break;
        for (const [key, value] of Object.entries(result.data.continue)) params.set(key, String(value));
      }
      for (const { page, retrievedAt } of pages.values()) {
        const candidate = toPlace(page, retrievedAt, route, index);
        if (candidate && !candidates.has(candidate.place.id)) candidates.set(candidate.place.id, candidate);
      }
    } catch (error) {
      if (error instanceof StopImport) throw error;
      failedSamples.push({ km, error: String(error) });
      console.warn(`${route.id} sample ${i}: ${String(error)}`);
      if (failedSamples.length >= 5) throw new Error(`${route.id}: five failed samples; stopping, existing catalog preserved`);
    }
    if (i % 10 === 0 || i === steps) console.log(`${route.id}: ${i + 1}/${steps + 1} samples, ${candidates.size} narratable candidates; ${requests} requests, ${cacheHits} cached`);
  }
  // Keep three distinct sites per 12km bin, ranking only within that bin.
  // A town anchor gets one slot when present; other slots favor landscape and heritage.
  const bins = new Map<number, { place: Place; score: number }[]>();
  for (const candidate of candidates.values()) {
    const key = Math.floor(candidate.place.routeKm! / STEP_KM);
    const bin = bins.get(key) ?? [];
    bin.push(candidate);
    bins.set(key, bin);
  }
  const places: Place[] = [];
  for (const bin of bins.values()) {
    bin.sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id));
    const town = bin.find((p) => p.place.category === "Town");
    const selected = town ? [town, ...bin.filter((p) => p !== town).slice(0, 2)] : bin.slice(0, 3);
    places.push(...selected.map((p) => p.place));
  }
  places.sort((a, b) => a.routeKm! - b.routeKm!);
  if (!places.length) throw new Error(`${route.id}: no usable places; refusing empty catalog`);
  const positions = [0, ...places.map((p) => p.routeKm!), index.totalKm];
  const gaps = positions.slice(1).map((end, i) => ({ startKm: positions[i], endKm: end, lengthKm: end - positions[i] })).sort((a, b) => b.lengthKm - a.lengthKm);
  const coverage = {
    routeLengthKm: index.totalKm, firstPoiKm: places[0].routeKm,
    lastPoiKm: places[places.length - 1].routeKm,
    narratableCount: places.filter((p) => sourceExcerpt(p)).length,
    sampleCount: steps + 1, failedSamples, gapsOver30Km: gaps.filter((g) => g.lengthKm > 30),
    largestGapKm: gaps[0]?.lengthKm ?? index.totalKm,
  };
  writeJson(join(OUT, "places", `${route.id}.json`), {
    importedAt: new Date().toISOString(), source: "English Wikipedia via MediaWiki geosearch (coordinates, Wikidata IDs, exact article excerpts)",
    license: "Wikipedia excerpts: CC BY-SA 4.0; Wikidata identifiers: CC0.",
    corridorM: CORRIDOR_M, samplingKm: STEP_KM, searchRadiusM: 10000, coverage, places,
  });
  console.log(JSON.stringify({ segment: route.id, count: places.length, ...coverage }));
}

async function main() {
  if (segment && !SEGMENTS.includes(segment)) throw new Error(`Choose one of ${SEGMENTS.join(", ")}; Rockies is protected.`);
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(join(OUT, "places"), { recursive: true });
  const rail = JSON.parse(readFileSync(join(OUT, "rail.json"), "utf8")) as RailData;
  for (const id of segment ? [segment] : SEGMENTS) {
    const route = rail.routes.find((r) => r.id === id);
    if (!route) throw new Error(`Missing saved route ${id}`);
    await importSegment(route);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
