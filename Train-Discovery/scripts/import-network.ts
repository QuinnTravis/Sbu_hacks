/**
 * Import the California Zephyr from Amtrak's GTFS and cut it into the
 * segments configured in src/networks/california-zephyr.ts. For each
 * full-experience segment, import named places within the corridor from
 * OpenStreetMap, rank them with Wikidata sitelinks, attach Wikipedia intros as
 * evidence, and derive tunnel stretches for the connectivity estimate.
 *
 *   npm run data:network                 # uses caches younger than a day
 *   npm run data:network -- --refresh    # bypass caches
 *   npm run data:network -- --route-only # rail.json only
 *
 * OSM data is ODbL; Wikipedia passages are CC BY-SA 4.0; Wikidata is CC0.
 * Nothing here marks a story verified. Stories come from verify-network.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";
import { californiaZephyr } from "../src/networks/california-zephyr";
import { projectOnRoute, routeIndex, type RouteIndex } from "../src/lib/route-geometry";
import type { BasicFacts, Evidence, Place, RailData, RailRoute } from "../src/lib/types";

const ROOT = process.cwd();
const CACHE = join(ROOT, "scripts/.cache");
const OUT = join(ROOT, "public/data/networks/california-zephyr");
const GTFS_URL = "https://content.amtrak.com/content/gtfs/GTFS.zip";
const ROUTE_ID = "96";
const CANONICAL_SHAPE = "173";
const USER_AGENT = "Gaze/0.1 (SBU Hacks ride companion; https://github.com/QuinnTravis/Sbu_hacks)";
// The GTFS color #CAE4F1 is nearly invisible on the canvas; same hue, darker (DECISIONS D9).
const LINE_COLOR = "#2f6f98";
const refresh = process.argv.includes("--refresh");

type Row = Record<string, string>;
type Stop = { id: string; name: string; lat: number; lon: number };

function cached(name: string, maxAgeMs: number): Buffer | null {
  const file = join(CACHE, name);
  if (refresh || !existsSync(file)) return null;
  if (Date.now() - statSync(file).mtimeMs > maxAgeMs) return null;
  return readFileSync(file);
}
function remember(name: string, body: Buffer | string) {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, name), body);
}
function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, path);
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(300_000),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      last = error;
      await sleep(5000 * (attempt + 1));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// ---------------------------------------------------------------- GTFS ----

async function loadGtfs() {
  let zip = cached("amtrak-gtfs.zip", 7 * 86_400_000);
  if (!zip) {
    const response = await fetchWithRetry(GTFS_URL);
    if (!response.ok) throw new Error(`Amtrak GTFS: HTTP ${response.status}`);
    zip = Buffer.from(await response.arrayBuffer());
    remember("amtrak-gtfs.zip", zip);
  }
  const files = unzipSync(new Uint8Array(zip));
  const rows = (name: string): Row[] =>
    parse(strFromU8(files[name]!), { columns: true, skip_empty_lines: true, bom: true }) as Row[];
  return { rows };
}

function minutes(time: string): number {
  const [h, m, s] = time.split(":").map(Number);
  return h * 60 + m + (s ?? 0) / 60;
}

function cleanStopName(name: string): string {
  return name
    .replace(/\s+Amtrak( Station)?$/i, "")
    .replace(/^Mccook\b/, "McCook")
    .trim();
}

/** Douglas–Peucker in local meters, iterative so 11,000 vertices cannot overflow the stack. */
function simplify(points: [number, number][], toleranceM: number): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const meters = (p: [number, number], o: [number, number]) => [
    ((p[1] - o[1]) * Math.PI) / 180 * Math.cos((o[0] * Math.PI) / 180) * 6371008.8,
    ((p[0] - o[0]) * Math.PI) / 180 * 6371008.8,
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [bx, by] = meters(points[b], points[a]);
    const len2 = bx * bx + by * by;
    let best = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = meters(points[i], points[a]);
      const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
      const d = Math.hypot(px - t * bx, py - t * by);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (index >= 0 && best > toleranceM) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function cut(index: RouteIndex, fromKm: number, toKm: number): [number, number][] {
  const out: [number, number][] = [];
  const at = (km: number): [number, number] => {
    let i = 1;
    while (i < index.km.length - 1 && index.km[i] < km) i++;
    const a = index.path[i - 1];
    const b = index.path[i];
    const span = index.km[i] - index.km[i - 1];
    const t = span > 0 ? Math.max(0, Math.min(1, (km - index.km[i - 1]) / span)) : 0;
    return [+(a[0] + (b[0] - a[0]) * t).toFixed(6), +(a[1] + (b[1] - a[1]) * t).toFixed(6)];
  };
  out.push(at(fromKm));
  for (let i = 0; i < index.path.length; i++) {
    if (index.km[i] > fromKm && index.km[i] < toKm) {
      out.push([+index.path[i][0].toFixed(6), +index.path[i][1].toFixed(6)]);
    }
  }
  out.push(at(toKm));
  return out;
}

async function importRoute() {
  const { rows } = await loadGtfs();
  const feed = rows("feed_info.txt")[0];
  const route = rows("routes.txt").find((r) => r.route_id === ROUTE_ID);
  if (!route || route.route_long_name !== "California Zephyr")
    throw new Error("Route 96 is no longer the California Zephyr in this feed.");
  const trips = rows("trips.txt").filter((t) => t.route_id === ROUTE_ID);
  const westbound = trips.find((t) => t.shape_id === CANONICAL_SHAPE);
  if (!westbound) throw new Error(`No westbound trip uses shape ${CANONICAL_SHAPE}.`);
  const stopsById = new Map<string, Stop>(
    rows("stops.txt").map((s) => [
      s.stop_id,
      { id: s.stop_id, name: cleanStopName(s.stop_name), lat: +s.stop_lat, lon: +s.stop_lon },
    ]),
  );
  const times = rows("stop_times.txt")
    .filter((s) => s.trip_id === westbound.trip_id)
    .sort((a, b) => +a.stop_sequence - +b.stop_sequence);
  const shape = rows("shapes.txt")
    .filter((p) => p.shape_id === CANONICAL_SHAPE)
    .sort((a, b) => +a.shape_pt_sequence - +b.shape_pt_sequence)
    .map((p) => [+p.shape_pt_lat, +p.shape_pt_lon] as [number, number]);
  const line = routeIndex(shape);
  const ordered = times.map((time) => {
    const stop = stopsById.get(time.stop_id);
    if (!stop) throw new Error(`Unknown stop ${time.stop_id}`);
    const projection = projectOnRoute(line, stop);
    if (!projection || projection.lateralM > 1000)
      throw new Error(`${stop.id} is ${Math.round(projection?.lateralM ?? Infinity)} m from the shape.`);
    return { ...stop, km: projection.km, depart: minutes(time.departure_time || time.arrival_time) };
  });
  const routes: (RailRoute & { startKm: number; endKm: number })[] = [];
  for (const segment of californiaZephyr.segments) {
    const from = ordered.findIndex((s) => s.id === segment.fromStopId);
    const to = ordered.findIndex((s) => s.id === segment.toStopId);
    if (from < 0 || to < 0 || to <= from)
      throw new Error(`Segment ${segment.id}: ${segment.fromStopId} → ${segment.toStopId} not in westbound order.`);
    const stops = ordered.slice(from, to + 1);
    const tolerance = segment.experience === "full" ? 6 : 60;
    const path = simplify(cut(line, stops[0].km, stops[stops.length - 1].km), tolerance);
    routes.push({
      id: segment.id,
      name: segment.name,
      color: LINE_COLOR,
      paths: [path],
      stops: stops.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
      experience: segment.experience,
      schedule: stops.map((s) => ({ stopId: s.id, minutes: Math.round(s.depart - stops[0].depart) })),
      startKm: +stops[0].km.toFixed(3),
      endKm: +stops[stops.length - 1].km.toFixed(3),
    });
  }
  const rail: RailData & { routeUrl: string; license: string } = {
    source: GTFS_URL,
    importedAt: new Date().toISOString(),
    version: feed.feed_version,
    routeUrl: route.route_url,
    license: "Amtrak GTFS. Route geometry and timetable as published by Amtrak.",
    routes,
  };
  writeJson(join(OUT, "rail.json"), rail);
  for (const r of routes) {
    console.log(`${r.id.padEnd(11)} ${r.name.padEnd(16)} ${(r.endKm - r.startKm).toFixed(1).padStart(7)} km  ${String(r.paths[0].length).padStart(5)} pts  ${r.stops.map((s) => s.id).join(" ")}`);
  }
  return routes;
}

// ---------------------------------------------------------- Places -------

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

const OVERPASS_SERVERS = [
  { api: "https://overpass-api.de/api", status: true },
  // Mirror used when the main instance refuses connections (it resets TLS under load).
  { api: "https://maps.mail.ru/osm/tools/overpass/api", status: false },
];

/** Wait for a free Overpass slot instead of retrying into a 429. */
async function overpassSlot(api: string) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const status = await fetch(`${api}/status`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) })
      .then((r) => r.text()).catch(() => null);
    if (status === null) return false;
    if (/slots? available now/i.test(status)) return true;
    const wait = [...status.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
    const seconds = wait.length ? Math.min(...wait) + 2 : 15;
    console.log(`Overpass busy; next slot in ${seconds}s`);
    await sleep(seconds * 1000);
  }
  return false;
}

async function overpass(name: string, query: string): Promise<OsmElement[]> {
  const hit = cached(name, 86_400_000);
  if (hit) return JSON.parse(hit.toString()).elements;
  for (let attempt = 0; attempt < 6; attempt++) {
    const server = OVERPASS_SERVERS[attempt % OVERPASS_SERVERS.length];
    if (server.status && !(await overpassSlot(server.api))) {
      console.log(`${server.api} unreachable; trying the next server`);
      continue;
    }
    const response = await fetch(`${server.api}/interpreter`, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(330_000),
    }).catch((error: unknown) => error as Error);
    if (response instanceof Error) {
      console.log(`${server.api} failed (${response.message}); retrying`);
      await sleep(5000);
      continue;
    }
    const text = await response.text();
    if (response.status === 429 || response.status === 504) {
      console.log(`${server.api} ${response.status}; retrying`);
      await sleep(10_000);
      continue;
    }
    if (!response.ok) throw new Error(`Overpass ${response.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(json.remark);
    remember(name, text);
    console.log(`${name}: ${json.elements.length} elements from ${server.api}`);
    return json.elements;
  }
  throw new Error("Overpass is unavailable; rerun later (completed queries are cached).");
}

type Classified = { category: string; type: string; areaKind?: string; weight: number };

/** Wikidata item near the line, with what the importer needs to rank and describe it. */
type WdItem = {
  qid: string;
  label: string;
  lat: number;
  lon: number;
  sitelinks: number;
  enwiki?: string;
  classes: string[];
  elevationM?: number;
  population?: number;
  heritage: boolean;
  image?: string;
};

/** Category for a window-worthy place from its Wikidata classes, or null. */
function classify(item: WdItem): Classified | null {
  const c = item.classes.join("|").toLowerCase();
  const name = item.label;
  if (/\b(AM|FM|TV)\b|cell tower|heliport|airport|school district|byway|\broad\b|highway/i.test(`${name}|${c}`)) return null;
  const notable = Boolean(item.enwiki) || item.heritage || item.sitelinks >= 3;
  if (/railway tunnel|rail tunnel/.test(c)) return { category: "Railroad heritage", type: "tunnel", weight: 1 };
  if (/tunnel/.test(c)) return notable ? { category: "Landmark", type: "tunnel", weight: 0.6 } : null;
  if (/railway station|train station|railroad station|railway stop|railway halt|\bdepot\b/.test(c)) return { category: "Railroad heritage", type: "station", weight: 0.95 };
  if (/rail yard|roundhouse|railway bridge|railroad bridge|water tower|railway line|railroad|railway|\brail\b/.test(c)) return notable ? { category: "Railroad heritage", type: /bridge/.test(c) ? "bridge" : "railroad", weight: 0.9 } : null;
  if (/canyon|gorge|ravine/.test(c) || (/\bCanyon\b/.test(name) && /valley|landform|geographic/.test(c))) return { category: "Canyon", type: "canyon", areaKind: "canyon", weight: 1 };
  if (/\briver\b/.test(c)) return { category: "River", type: "river", areaKind: "river", weight: 0.7 };
  if (/mountain pass|\bpass\b/.test(c)) return { category: "Mountain", type: "pass", weight: 0.75 };
  if (/mountain|summit|\bpeak\b|\bhill\b|butte|mesa/.test(c)) return { category: "Mountain", type: "peak", weight: 0.65 };
  if (/hot spring|thermal spring|\bspring\b/.test(c)) return { category: "Nature", type: "spring", weight: 0.8 };
  if (/swimming pool|bathhouse|thermal bath|\bspa\b/.test(c)) return notable ? { category: "Heritage", type: "baths", weight: 0.85 } : null;
  if (/reservoir|\blake\b/.test(c)) return { category: "Nature", type: "lake", areaKind: "lake", weight: 0.6 };
  if (/\bdam\b/.test(c)) return notable ? { category: "Landmark", type: "dam", weight: 0.7 } : null;
  if (/census-designated place|\btown\b|\bcity\b|village|municipality|unincorporated community|ghost town|human settlement|statutory|home rule/.test(c))
    return { category: "Town", type: /\bcity\b/.test(c) ? "city" : "town", areaKind: "town", weight: 0.6 };
  if (/museum/.test(c)) return notable ? { category: "Heritage", type: "museum", weight: 0.85 } : null;
  if (/hotel/.test(c)) return notable ? { category: "Heritage", type: "hotel", weight: 0.8 } : null;
  if (/bridge/.test(c)) return notable ? { category: "Landmark", type: "bridge", weight: 0.6 } : null;
  if (item.heritage || /historic|building|house|church|courthouse|mansion|\bmine\b|\bmill\b|\bfort\b|structure|monument|archaeological/.test(c))
    return notable ? { category: "Heritage", type: "historic", weight: 0.8 } : null;
  if (/national forest|wilderness|state park|national park|recreation area|protected area|\bpark\b/.test(c))
    return notable ? { category: "Nature", type: "park", areaKind: "park", weight: 0.55 } : null;
  return null;
}

const CATEGORY_CAPS: Record<string, number> = {
  "Railroad heritage": 14, Canyon: 8, Heritage: 14, Landmark: 6, Mountain: 8, River: 5, Nature: 8, Town: 10,
};

/** Seeds from the spec. Each is evaluated like any other place; listing it is not a fact. */
const SEEDS = [
  "Denver Union Station", "Moffat Tunnel", "Fraser", "Winter Park", "Byers Canyon", "Gore Canyon",
  "Colorado River", "State Bridge", "Dotsero", "Glenwood Canyon", "Hotel Colorado",
  "Glenwood Hot Springs",
];
const isSeed = (name: string) => SEEDS.some((seed) => seed.toLowerCase() === name.toLowerCase() ||
  (name.length > 8 && (name.toLowerCase().includes(seed.toLowerCase()) || seed.toLowerCase().includes(name.toLowerCase()))));

async function sparql(name: string, query: string): Promise<Record<string, { value: string }>[]> {
  const hit = cached(name, 7 * 86_400_000);
  if (hit) return JSON.parse(hit.toString()).results.bindings;
  const response = await fetchWithRetry("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: new URLSearchParams({ query }).toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Wikidata SPARQL ${response.status}: ${text.slice(0, 200)}`);
  remember(name, text);
  return JSON.parse(text).results.bindings;
}

/** Every Wikidata item with coordinates within reach of the line. */
async function wikidataAround(route: RailRoute, index: RouteIndex): Promise<WdItem[]> {
  const centers: [number, number][] = [];
  for (let km = 0; km <= index.totalKm; km += 5) {
    const p = pointAt(index, km);
    centers.push(p);
  }
  const items = new Map<string, WdItem>();
  for (let i = 0; i < centers.length; i += 12) {
    const batch = centers.slice(i, i + 12);
    const values = batch.map(([lat, lon]) => `"Point(${lon.toFixed(5)} ${lat.toFixed(5)})"^^geo:wktLiteral`).join(" ");
    const rows = await sparql(`wd-${route.id}-${i}.json`, `SELECT ?item ?label ?coord ?sitelinks ?article
  (GROUP_CONCAT(DISTINCT ?classLabel; separator="|") AS ?classes)
  (MAX(?elev) AS ?elevation)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?pop), "@", STR(COALESCE(?popTime, ""))); separator="|") AS ?populations)
  (COUNT(DISTINCT ?heritage) AS ?heritageCount)
  (SAMPLE(?image) AS ?img)
WHERE {
  VALUES ?center { ${values} }
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center ?center . bd:serviceParam wikibase:radius "6.5" . }
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P31 ?class . ?class rdfs:label ?classLabel . FILTER(LANG(?classLabel) = "en") }
  OPTIONAL { ?item p:P2044/psn:P2044/wikibase:quantityAmount ?elev . }
  OPTIONAL { ?item p:P1082 ?popStatement . ?popStatement ps:P1082 ?pop . OPTIONAL { ?popStatement pq:P585 ?popTime . } }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  OPTIONAL { ?item wdt:P18 ?image . }
}
GROUP BY ?item ?label ?coord ?sitelinks ?article`);
    for (const row of rows) {
      const qid = row.item.value.split("/").pop()!;
      const match = row.coord?.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
      if (!match) continue;
      const lon = Number(match[1]);
      const lat = Number(match[2]);
      const populations = (row.populations?.value ?? "").split("|").map((entry) => {
        const [amount, when] = entry.split("@");
        return { amount: Number(amount), when: when ?? "" };
      }).filter((p) => Number.isFinite(p.amount) && p.amount > 0).sort((a, b) => b.when.localeCompare(a.when));
      const existing = items.get(qid);
      const candidate: WdItem = {
        qid,
        label: row.label.value,
        lat, lon,
        sitelinks: Number(row.sitelinks?.value ?? 0),
        enwiki: row.article ? decodeURIComponent(row.article.value.split("/wiki/")[1] ?? "").replace(/_/g, " ") || undefined : undefined,
        classes: (row.classes?.value ?? "").split("|").filter(Boolean),
        elevationM: row.elevation ? Math.round(Number(row.elevation.value)) : undefined,
        population: populations[0] ? Math.round(populations[0].amount) : undefined,
        heritage: Number(row.heritageCount?.value ?? 0) > 0,
        image: row.img?.value,
      };
      // An item with several coordinates keeps the one nearest the line.
      if (existing) {
        const a = projectOnRoute(index, existing);
        const b = projectOnRoute(index, candidate);
        if (a && b && b.lateralM < a.lateralM) items.set(qid, { ...existing, lat, lon });
        continue;
      }
      items.set(qid, candidate);
    }
    console.log(`Wikidata ${route.id}: ${Math.min(i + 12, centers.length)}/${centers.length} centers, ${items.size} items`);
  }
  return [...items.values()];
}

/** Sitelinks and English article for items whose coordinates sit far from the line (long rivers). */
async function wikidataByIds(ids: string[]): Promise<Map<string, { sitelinks: number; enwiki?: string; label?: string }>> {
  const out = new Map<string, { sitelinks: number; enwiki?: string; label?: string }>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const name = `wdids-${batch.join("-").slice(0, 60)}.json`;
    let body = cached(name, 7 * 86_400_000)?.toString();
    if (!body) {
      const response = await fetchWithRetry(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: "wbgetentities", ids: batch.join("|"), props: "sitelinks|labels", languages: "en", format: "json",
      })}`);
      body = await response.text();
      if (!response.ok) throw new Error(`Wikidata ${response.status}`);
      remember(name, body);
    }
    type Entity = { sitelinks?: Record<string, { title: string }>; labels?: { en?: { value: string } } };
    for (const [id, entity] of Object.entries<Entity>(JSON.parse(body).entities ?? {})) {
      out.set(id, {
        sitelinks: Object.keys(entity.sitelinks ?? {}).filter((key) => key.endsWith("wiki")).length,
        enwiki: entity.sitelinks?.enwiki?.title,
        label: entity.labels?.en?.value,
      });
    }
  }
  return out;
}

function pointAt(index: RouteIndex, km: number): [number, number] {
  let i = 1;
  while (i < index.km.length - 1 && index.km[i] < km) i++;
  const a = index.path[i - 1];
  const b = index.path[i];
  const span = index.km[i] - index.km[i - 1];
  const t = span > 0 ? Math.max(0, Math.min(1, (km - index.km[i - 1]) / span)) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

async function wikipediaIntros(titles: string[]): Promise<Map<string, Evidence>> {
  const found = new Map<string, Evidence>();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const name = `wikipedia-${createHash("sha1").update(batch.join("|")).digest("hex")}.json`;
    let body = cached(name, 7 * 86_400_000)?.toString();
    if (!body) {
      await sleep(1500);
      const response = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({
        action: "query", titles: batch.join("|"), prop: "extracts|info", explaintext: "1", exintro: "1",
        inprop: "url", redirects: "1", format: "json",
      })}`);
      body = await response.text();
      if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
      remember(name, body);
    }
    const json = JSON.parse(body);
    const redirects = new Map<string, string>();
    for (const r of json.query?.normalized ?? []) redirects.set(r.from, r.to);
    for (const r of json.query?.redirects ?? []) redirects.set(r.from, r.to);
    type Page = { pageid: number; title: string; extract?: string; fullurl?: string };
    const pages = Object.values<Page>(json.query?.pages ?? {});
    for (const title of batch) {
      let resolved = title;
      for (let hop = 0; hop < 3 && redirects.has(resolved); hop++) resolved = redirects.get(resolved)!;
      const page = pages.find((p) => p.title === resolved);
      if (!page?.extract || !page.fullurl || page.extract.length < 80) continue;
      found.set(title, {
        id: `wikipedia-${page.pageid}`,
        title: page.title,
        url: page.fullurl,
        // The verifier reads the first 3,500 characters; keep a margin for quotes.
        text: page.extract.replace(/\n{2,}/g, "\n").slice(0, 6000),
        retrievedAt: new Date().toISOString(),
        license: "CC BY-SA 4.0",
      });
    }
  }
  return found;
}

function normalizedName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type Linear = { tunnels: { id: string; name?: string; startKm: number; endKm: number }[]; features: { id: string; name: string; type: "river" | "canyon"; wikidata?: string; entry: { km: number; lateralM: number; signedLateralM: number; lat: number; lon: number }; extentKm?: [number, number] }[] };

/** Rail tunnels, rivers, and canyons from OpenStreetMap, as stretches of the ride. Best effort. */
async function osmLinear(route: RailRoute, index: RouteIndex): Promise<Linear> {
  const out: Linear = { tunnels: [], features: [] };
  const CHUNK_KM = 40;
  const pad = 1600 / 111_195;
  const seen = new Set<number>();
  const elements: OsmElement[] = [];
  let failed = 0;
  for (let fromKm = 0, chunk = 0; fromKm < index.totalKm; fromKm += CHUNK_KM, chunk++) {
    const vertices = index.path.filter((_, i) => index.km[i] >= fromKm - 0.5 && index.km[i] <= fromKm + CHUNK_KM + 0.5);
    if (!vertices.length) continue;
    const lats = vertices.map((p) => p[0]);
    const lons = vertices.map((p) => p[1]);
    const padLon = pad / Math.cos((lats[0] * Math.PI) / 180);
    const bbox = [Math.min(...lats) - pad, Math.min(...lons) - padLon, Math.max(...lats) + pad, Math.max(...lons) + padLon]
      .map((v) => v.toFixed(4)).join(",");
    try {
      const found = await overpass(`osm-linear-${route.id}-${chunk}.json`, `[out:json][timeout:120][bbox:${bbox}];
(way["railway"]["tunnel"="yes"];way["waterway"="river"]["name"];way["natural"~"^(valley|gorge|canyon)$"]["name"];);
out geom tags qt;`);
      for (const element of found) {
        if (seen.has(element.id)) continue;
        seen.add(element.id);
        elements.push(element);
      }
    } catch (error) {
      failed++;
      console.log(`OSM chunk ${chunk} skipped: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failed) console.log(`${failed} OSM chunks unavailable; tunnels and river meeting points there are missing. Rerun later.`);
  const byName = new Map<string, { type: "river" | "canyon"; ids: string[]; wikidata?: string; projections: { km: number; lateralM: number; signedLateralM: number; lat: number; lon: number }[] }>();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const geometry = element.geometry ?? [];
    const projected = geometry.map((g) => {
      const p = projectOnRoute(index, g);
      return p ? { ...p, lat: g.lat, lon: g.lon } : null;
    }).filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (tags.railway && tags.tunnel === "yes") {
      const close = projected.filter((p) => p.lateralM <= 60);
      if (close.length) {
        const kms = close.map((p) => p.km);
        out.tunnels.push({ id: `osm-way-${element.id}`, name: tags.name, startKm: Math.min(...kms), endKm: Math.max(...kms) });
      }
      continue;
    }
    if (!tags.name) continue;
    const type = tags.waterway === "river" ? "river" : "canyon";
    const reach = type === "river" ? 400 : 1500;
    const close = projected.filter((p) => p.lateralM <= reach);
    if (!close.length) continue;
    const key = `${type}:${normalizedName(tags.name)}`;
    const entry = byName.get(key) ?? { type, ids: [], projections: [] };
    entry.ids.push(`osm-way-${element.id}`);
    if (/^Q\d+$/.test(tags.wikidata ?? "")) entry.wikidata = entry.wikidata ?? tags.wikidata;
    entry.projections.push(...close);
    byName.set(key, entry);
  }
  for (const [key, entry] of byName) {
    const name = elements.find((e) => entry.ids.includes(`osm-way-${e.id}`))?.tags?.name ?? key.split(":")[1];
    const kms = entry.projections.map((p) => p.km);
    // A river is mentioned where the train first meets it; a canyon where it begins.
    const first = entry.projections.reduce((a, b) => (b.km < a.km ? b : a));
    out.features.push({
      id: entry.ids[0], name, type: entry.type, entry: first, ...(entry.wikidata ? { wikidata: entry.wikidata } : {}),
      extentKm: Math.max(...kms) - Math.min(...kms) > 0.4 ? [Math.min(...kms), Math.max(...kms)] : undefined,
    });
  }
  const stretches = out.tunnels.sort((a, b) => a.startKm - b.startKm).reduce<Linear["tunnels"]>((acc, t) => {
    const last = acc[acc.length - 1];
    if (last && t.startKm - last.endKm < 0.25) {
      last.endKm = Math.max(last.endKm, t.endKm);
      last.name = last.name ?? t.name;
    } else acc.push({ ...t });
    return acc;
  }, []);
  out.tunnels = stretches;
  return out;
}

async function importPlaces(route: RailRoute & { startKm: number; endKm: number }) {
  const index = routeIndex(route.paths[0]);
  const items = await wikidataAround(route, index);
  const linear = await osmLinear(route, index);
  console.log(`${route.id}: ${items.length} Wikidata items, ${linear.tunnels.length} tunnel stretches, ${linear.features.length} OSM rivers/canyons`);

  type Candidate = WdItem & { classified: Classified; km: number; lateralM: number; signedLateralM: number; extentKm?: [number, number]; id: string; score: number };
  const candidates: Candidate[] = [];
  for (const item of items) {
    const classified = classify(item);
    if (!classified) continue;
    const projection = projectOnRoute(index, item);
    if (!projection || projection.lateralM > californiaZephyr.corridorM) continue;
    if (projection.atEnd && projection.lateralM > 1500) continue;
    candidates.push({ ...item, classified, id: `wd-${item.qid}`, km: projection.km, lateralM: projection.lateralM, signedLateralM: projection.signedLateralM, score: 0 });
  }
  // OSM geometry gives rivers their meeting point and canyons their extent.
  const linked = await wikidataByIds([...new Set(linear.features.map((f) => f.wikidata).filter((id): id is string => Boolean(id)))]);
  for (const feature of linear.features) {
    const twin = candidates.find((c) => c.classified.type === feature.type && normalizedName(c.label) === normalizedName(feature.name));
    if (twin) {
      Object.assign(twin, { km: feature.entry.km, lateralM: feature.entry.lateralM, signedLateralM: feature.entry.signedLateralM, lat: feature.entry.lat, lon: feature.entry.lon });
      if (feature.extentKm) twin.extentKm = feature.extentKm;
      continue;
    }
    if (feature.type === "river" || /canyon|gorge/i.test(feature.name)) {
      const info = feature.wikidata ? linked.get(feature.wikidata) : undefined;
      if (feature.wikidata && candidates.some((c) => c.qid === feature.wikidata)) continue;
      candidates.push({
        qid: feature.wikidata ?? "", label: feature.name, lat: feature.entry.lat, lon: feature.entry.lon,
        sitelinks: info?.sitelinks ?? 0, ...(info?.enwiki ? { enwiki: info.enwiki } : {}), classes: [], heritage: false,
        classified: feature.type === "river" ? { category: "River", type: "river", areaKind: "river", weight: 0.7 } : { category: "Canyon", type: "canyon", areaKind: "canyon", weight: 1 },
        id: feature.id, km: feature.entry.km, lateralM: feature.entry.lateralM, signedLateralM: feature.entry.signedLateralM,
        extentKm: feature.extentKm, score: 0,
      });
    }
  }
  // Tunnels: the named stretch gives the Moffat Tunnel its length along the ride.
  for (const tunnel of linear.tunnels) {
    if (tunnel.endKm - tunnel.startKm <= 0.4) continue;
    const railTunnels = candidates.filter((c) => c.classified.type === "tunnel" && c.classified.category === "Railroad heritage" &&
      c.km >= tunnel.startKm - 0.5 && c.km <= tunnel.endKm + 0.5);
    // A named railway tunnel item (with an article) wins over a nearby loop or bridge record.
    const twin = railTunnels.sort((a, b) => Number(Boolean(b.enwiki)) - Number(Boolean(a.enwiki)) ||
      Math.abs(a.km - tunnel.startKm) - Math.abs(b.km - tunnel.startKm))[0];
    if (twin) twin.extentKm = [tunnel.startKm, tunnel.endKm];
  }

  for (const c of candidates) {
    const proximity = Math.max(0, 1 - c.lateralM / californiaZephyr.corridorM);
    const fame = Math.log2(1 + c.sitelinks) / 6 + (c.enwiki ? 0.6 : 0) + (c.qid ? 0.15 : 0);
    c.score = c.classified.weight * (0.6 + proximity) + fame + (c.heritage ? 0.3 : 0) + (isSeed(c.label) ? 2 : 0);
  }
  candidates.sort((a, b) => b.score - a.score);
  const intros = await wikipediaIntros([...new Set(candidates.map((c) => c.enwiki).filter((t): t is string => Boolean(t)))]);
  // Modern transit stops are not railroad heritage; their articles say so.
  // A Zephyr stop or a station with pre-1950 history stays, whatever else serves it.
  const zephyrStop = (c: Candidate) => route.stops.some((stop) =>
    Math.hypot((stop.lat - c.lat) * 111_195, (stop.lon - c.lon) * 111_195 * Math.cos((c.lat * Math.PI) / 180)) < 400);
  const transit = (c: Candidate) => {
    const text = c.enwiki ? intros.get(c.enwiki)?.text ?? "" : "";
    return c.classified.type === "station" && /\b(RTD|light rail|commuter rail|Regional Transportation District)\b/i.test(text) &&
      !/\b(Amtrak|California Zephyr)\b/.test(text) && !zephyrStop(c) && !/\b1[89]\d\d\b|\b19[0-4]\d\b/.test(text);
  };
  // "Union Station" reads better as its article title, "Denver Union Station".
  for (const c of candidates) {
    c.label = c.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const title = c.enwiki?.replace(/\s*\([^)]*\)\s*$/, "").trim();
    // "Granby station" over "Granby"; never "Granby, Colorado".
    if (title && !title.includes(",") && title.length > c.label.length && title.toLowerCase().includes(c.label.toLowerCase())) c.label = title;
  }
  const taken = new Map<string, number>();
  const pois: Candidate[] = [];
  const crowded = (km: number) => pois.filter((p) => Math.abs(p.km - km) < 1.5).length >= 3;
  for (const candidate of candidates) {
    if (pois.length >= californiaZephyr.poiBudget) break;
    if (!candidate.enwiki && !isSeed(candidate.label) && !candidate.heritage) continue;
    if (transit(candidate)) continue;
    // A building a kilometer and more from the track is not the view, unless it is famous.
    if (["Heritage", "Landmark"].includes(candidate.classified.category) && candidate.lateralM > 1200 && candidate.sitelinks < 25) continue;
    if (crowded(candidate.km) && !isSeed(candidate.label)) continue;
    const cap = CATEGORY_CAPS[candidate.classified.category] ?? 6;
    const used = taken.get(candidate.classified.category) ?? 0;
    if (used >= cap && !isSeed(candidate.label)) continue;
    taken.set(candidate.classified.category, used + 1);
    pois.push(candidate);
  }
  const poiIds = new Set(pois.map((p) => p.id));
  // Named places mentioned in passing: towns, rivers, passes, canyons, and tall or well-known peaks.
  const ambient = candidates.filter((c) => !poiIds.has(c.id) && !transit(c) && (
    ["town", "city", "river", "pass", "canyon", "lake", "tunnel", "station"].includes(c.classified.type) ||
    (c.classified.type === "peak" && (c.enwiki || (c.elevationM ?? 0) >= 3300) && c.lateralM < 4500)
  )).slice(0, 90);

  const previousFile = join(OUT, `places/${route.id}.json`);
  const previous = new Map<string, Place>(
    existsSync(previousFile)
      ? (JSON.parse(readFileSync(previousFile, "utf8")).places as Place[]).map((p) => [p.id, p])
      : [],
  );

  const toPlace = (c: Candidate, kind: "poi" | "place"): Place => {
    const evidence = c.enwiki && intros.has(c.enwiki) ? [intros.get(c.enwiki)!] : [];
    const sources: BasicFacts["sources"] = c.qid
      ? [{ title: `Wikidata ${c.qid}`, url: `https://www.wikidata.org/wiki/${c.qid}`, license: "CC0" }]
      : [{ title: "OpenStreetMap", url: `https://www.openstreetmap.org/way/${c.id.split("-").pop()}`, license: "ODbL 1.0" }];
    const place: Place = {
      id: c.id,
      name: c.label,
      lat: +c.lat.toFixed(6),
      lon: +c.lon.toFixed(6),
      category: c.classified.category,
      routeIds: [route.id],
      ...(c.enwiki ? { wikipedia: c.enwiki } : {}),
      ...(c.qid ? { wikidata: c.qid } : {}),
      sourceUrl: sources[0].url,
      tags: {
        ...(c.classes.length ? { classes: c.classes.slice(0, 4).join(", ") } : {}),
        ...(c.heritage ? { heritage: "yes" } : {}),
        ...(c.image ? { image: decodeURIComponent(c.image.split("/").pop() ?? "") } : {}),
      },
      evidence,
      kind,
      routeKm: +c.km.toFixed(3),
      lateralM: Math.round(c.lateralM),
      signedLateralM: Math.round(c.signedLateralM),
      ...(c.extentKm ? { extentKm: [+c.extentKm[0].toFixed(3), +c.extentKm[1].toFixed(3)] as [number, number] } : {}),
      ...(c.classified.areaKind ? { areaKind: c.classified.areaKind } : {}),
      fame: c.sitelinks,
      basic: {
        type: c.classified.type,
        ...(c.elevationM !== undefined && c.elevationM > 0 && c.elevationM < 9000 ? { elevationM: c.elevationM } : {}),
        ...(c.population !== undefined && c.population > 0 ? { population: c.population } : {}),
        sources,
      },
    };
    // Keep a verified story only while its evidence is unchanged.
    const old = previous.get(place.id);
    if (old?.story && JSON.stringify(old.evidence.map((e) => e.text)) === JSON.stringify(evidence.map((e) => e.text))) {
      place.story = old.story;
      place.evidence = old.evidence;
    }
    return place;
  };
  const places = [...pois.map((c) => toPlace(c, "poi")), ...ambient.map((c) => toPlace(c, "place"))]
    .sort((a, b) => (a.routeKm ?? 0) - (b.routeKm ?? 0));
  writeJson(previousFile, {
    importedAt: new Date().toISOString(),
    source: "Wikidata (places), OpenStreetMap (tunnels, rivers, canyons), Wikipedia (evidence)",
    license: "Wikidata: CC0. OpenStreetMap geometry: ODbL 1.0 © OpenStreetMap contributors. Wikipedia passages: CC BY-SA 4.0.",
    corridorM: californiaZephyr.corridorM,
    places,
  });
  writeJson(join(OUT, `tunnels/${route.id}.json`), {
    source: "OpenStreetMap railway tunnels (ODbL 1.0)",
    tunnels: linear.tunnels.map((t) => ({ ...t, startKm: +t.startKm.toFixed(3), endKm: +t.endKm.toFixed(3) })),
  });
  const counts = new Map<string, number>();
  for (const p of pois) counts.set(p.classified.category, (counts.get(p.classified.category) ?? 0) + 1);
  console.log(`${route.id}: ${pois.length} curated places (${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")}), ${ambient.length} named places, ${places.filter((p) => p.evidence.length).length} with Wikipedia evidence`);
  const missing = SEEDS.filter((seed) => !places.some((p) => normalizedName(p.name).includes(normalizedName(seed))));
  if (missing.length) console.log(`Seeds not found in the corridor: ${missing.join(", ")}`);
}

async function main() {
  const routes = await importRoute();
  if (process.argv.includes("--route-only")) return;
  for (const route of routes.filter((r) => r.experience === "full")) await importPlaces(route);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
