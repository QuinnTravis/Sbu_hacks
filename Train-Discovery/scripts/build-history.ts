/**
 * Curated historic photographs (F3) and place thumbnails for the Rockies.
 * Every image is fetched from Wikimedia Commons with its license metadata;
 * anything without a clear public-domain or Creative Commons license is
 * rejected. Past and present images are saved next to the app so the
 * comparison works offline; dates come only from the image records.
 *
 *   npm run data:history
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { HistoricImage, Thumbnail } from "../src/lib/package-types";
import type { Place } from "../src/lib/types";

const UA = { "User-Agent": "Gaze/0.1 (SBU Hacks ride companion; https://github.com/QuinnTravis/Sbu_hacks)" };
const PLACES = "public/data/networks/california-zephyr/places/cz-rockies.json";
const OUT = "public/data/networks/california-zephyr/history/cz-rockies.json";
const IMAGES = "public/history/cz-rockies";

type Dating = NonNullable<HistoricImage["dating"]>;
type Curated = {
  poi: string;
  past: { file: string; year: number; yearTo?: number; dating: Dating; caption: string; source: string };
  present?: { file: string; focal?: HistoricImage["focal"] };
  focal?: HistoricImage["focal"];
};

// Years, ranges, and captions are taken from each file's Commons record (date and description fields).
const CURATED: Curated[] = [
  {
    poi: "Denver Union Station",
    past: { file: "File:Welcome Arch and Union Depot, Denver, Colo..jpg", year: 1908, dating: "circa", caption: "Welcome Arch and Union Depot, Denver.", source: "Library of Congress (det.4a23004)" },
    present: { file: "File:Denver Union Station - June 2022 - Sarah Stierch 01.jpg" },
  },
  {
    poi: "Moffat Tunnel",
    past: { file: "File:Denver and Salt Lake train entering Moffat Tunnel.JPG", year: 1927, yearTo: 1947, dating: "range", caption: "A Denver and Salt Lake train entering the east portal of the Moffat Tunnel.", source: "Photo postcard" },
    // The portal sits left in the postcard and right in the modern photo; frame both on it.
    focal: { x: 0.3, y: 0.42, scale: 1.35 },
    present: { file: "File:Moffat Tunnel East Portal.jpg", focal: { x: 0.86, y: 0.45, scale: 1.7 } },
  },
  {
    poi: "Rollins Pass",
    past: { file: "File:Snow Cuts in Rollins Pass, Continental Divide, Colorado (NYPL b12647398-75528).tiff", year: 1898, dating: "after", caption: "Snow cuts in Rollins Pass, on the Continental Divide.", source: "Detroit Publishing Company · New York Public Library" },
    present: { file: "File:Needle's Eye Tunnel on Rollins Pass - June 2018.jpg" },
  },
  {
    poi: "Hot Sulphur Springs",
    past: { file: "File:CO Hot Sulphur Springs 1910.jpg", year: 1910, dating: "circa", caption: "The town of Hot Sulphur Springs, Colorado.", source: "Library of Congress (pan.6a02707)" },
    present: { file: "File:Approaching Hot Sulphur Springs Colorado on the California Zephyr - panoramio.jpg" },
  },
  {
    poi: "Gore Canyon",
    past: { file: "File:Entrance to Gore Canyon of the Colorado. Grand County, Colorado. - NARA - 517051.jpg", year: 1874, dating: "exact", caption: "Entrance to Gore Canyon of the Colorado, Grand County. Photograph by William Henry Jackson.", source: "U.S. National Archives" },
    present: { file: "File:GoreCanyon ColoradoRiver4760cfs.jpg" },
  },
  {
    poi: "Glenwood Canyon",
    past: { file: "File:William Henry Jackson - Echo Cliffs, Canyon of the Grand River, Glenwood Extension, Colorado - 2010.418 - Cleveland Museum of Art.jpg", year: 1885, dating: "exact", caption: "Echo Cliffs, Canyon of the Grand River, Glenwood Extension. Photograph by William Henry Jackson.", source: "Cleveland Museum of Art" },
    present: { file: "File:Zephyr eastbound in Glenwood Canyon (4491661818).jpg" },
  },
  {
    poi: "Glenwood Hot Springs Pool",
    past: { file: "File:Bathing in Pool, Glenwood Spgs., Colo (NYPL b12647398-62963).tiff", year: 1902, yearTo: 1903, dating: "range", caption: "Bathing in the pool, Glenwood Springs.", source: "Detroit Publishing Company · New York Public Library" },
    present: { file: "File:Glenwood Hot Springs Pool 2020.JPG" },
  },
  {
    poi: "Hotel Colorado",
    past: { file: "File:Hotel Colorado,Glenwood Springs, Colo (NYPL b12647398-62076).tiff", year: 1901, yearTo: 1902, dating: "range", caption: "Hotel Colorado, Glenwood Springs.", source: "Detroit Publishing Company · New York Public Library" },
    present: { file: "File:Hotel Colorado @ Glenwood Springs - panoramio.jpg" },
  },
];

const strip = (html: string | undefined) =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/\s+/g, " ").trim();
const CLEAR = /^(public domain|pd\b|cc0|cc by(-sa)? [0-9.]+)/i;

type Info = { thumb: string; page: string; license: string; licenseUrl?: string; artist: string };
type MetaValue = { value?: string };
type CommonsPage = {
  title: string;
  imageinfo?: {
    thumburl: string;
    descriptionurl: string;
    extmetadata?: { LicenseShortName?: MetaValue; LicenseUrl?: MetaValue; Artist?: MetaValue };
  }[];
};
type CommonsResponse = {
  query?: { normalized?: { from: string; to: string }[]; pages?: Record<string, CommonsPage> };
};

async function imageInfo(files: string[], width: number): Promise<Map<string, Info>> {
  const out = new Map<string, Info>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      action: "query", titles: batch.join("|"), prop: "imageinfo", iiprop: "extmetadata|url",
      iiurlwidth: String(width), format: "json", redirects: "1",
    })}`, { headers: UA });
    const json = (await response.json()) as CommonsResponse;
    const normalized = new Map<string, string>();
    for (const n of json.query?.normalized ?? []) normalized.set(n.to, n.from);
    for (const page of Object.values(json.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const meta = ii.extmetadata ?? {};
      const license = strip(meta.LicenseShortName?.value);
      if (!CLEAR.test(license)) {
        console.log(`Rejected ${page.title}: license "${license || "unknown"}"`);
        continue;
      }
      const key = normalized.get(page.title) ?? page.title;
      out.set(key, {
        thumb: ii.thumburl,
        page: ii.descriptionurl,
        license: /^pd\b/i.test(license) ? "Public domain" : license,
        licenseUrl: meta.LicenseUrl?.value || undefined,
        artist: strip(meta.Artist?.value).replace(/\bUnknown author\b/gi, "").trim().slice(0, 120),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return out;
}

async function download(url: string, path: string) {
  const response = await fetch(url, { headers: UA });
  if (!response.ok || !/^image\//.test(response.headers.get("content-type") ?? ""))
    throw new Error(`Download failed (${response.status}) for ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

const slug = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const yearLabel = (past: Curated["past"]) =>
  past.dating === "circa" ? `c. ${past.year}` : past.dating === "after" ? `after ${past.year}`
    : past.dating === "range" ? `${past.year}–${past.yearTo}` : String(past.year);

async function main() {
  const { places }: { places: Place[] } = JSON.parse(await readFile(PLACES, "utf8"));
  await mkdir(IMAGES, { recursive: true });
  const files = CURATED.flatMap((entry) => [entry.past.file, ...(entry.present ? [entry.present.file] : [])]);
  const info = await imageInfo(files, 960);
  const images: HistoricImage[] = [];
  for (const entry of CURATED) {
    const place = places.find((candidate) => candidate.name === entry.poi);
    const past = info.get(entry.past.file);
    if (!place || !past) {
      console.log(`Skipped ${entry.poi}: ${place ? "historic image unavailable" : "place not in the package"}`);
      continue;
    }
    const base = slug(entry.poi);
    await download(past.thumb, `${IMAGES}/${base}-past.jpg`);
    const present = entry.present ? info.get(entry.present.file) : undefined;
    if (present) await download(present.thumb, `${IMAGES}/${base}-present.jpg`);
    // Recompress for phones; Commons thumbnails can be several hundred kilobytes.
    for (const file of [`${base}-past.jpg`, ...(present ? [`${base}-present.jpg`] : [])]) {
      await new Promise<void>((resolve) => execFile("sips", ["-s", "formatOptions", "72", `${IMAGES}/${file}`], () => resolve()));
    }
    images.push({
      id: `history-${base}`,
      poiId: place.id,
      url: `/history/cz-rockies/${base}-past.jpg`,
      year: entry.past.year,
      ...(entry.past.yearTo ? { yearTo: entry.past.yearTo } : {}),
      dating: entry.past.dating,
      yearLabel: yearLabel(entry.past),
      caption: entry.past.caption,
      credit: [past.artist, entry.past.source].filter(Boolean).join(" · "),
      license: past.license,
      ...(past.licenseUrl ? { licenseUrl: past.licenseUrl } : {}),
      sourceUrl: past.page,
      ...(entry.focal ? { focal: entry.focal } : {}),
      ...(present ? {
        present: {
          url: `/history/cz-rockies/${base}-present.jpg`,
          credit: present.artist || "Wikimedia Commons",
          license: present.license,
          ...(present.licenseUrl ? { licenseUrl: present.licenseUrl } : {}),
          sourceUrl: present.page,
          ...(entry.present?.focal ? { focal: entry.present.focal } : {}),
        },
      } : {}),
    });
    console.log(`✓ ${entry.poi}: ${yearLabel(entry.past)}${present ? " with a present-day photo" : ""}`);
  }

  // Small thumbnails for banners and bookmarks, from each place's Wikidata image.
  const curated = places.filter((place) => place.kind === "poi" && place.tags.image);
  const thumbInfo = await imageInfo(curated.map((place) => `File:${place.tags.image}`), 160);
  const thumbnails: Record<string, Thumbnail> = {};
  for (const place of curated) {
    const found = thumbInfo.get(`File:${place.tags.image}`);
    if (!found) continue;
    thumbnails[place.id] = { url: found.thumb, credit: found.artist || "Wikimedia Commons", license: found.license, sourceUrl: found.page };
  }
  const temp = `${OUT}.tmp`;
  await writeFile(temp, JSON.stringify({ source: "Wikimedia Commons (license-checked)", images, thumbnails }, null, 1));
  await rename(temp, OUT);
  console.log(`${images.length} historic images, ${Object.keys(thumbnails).length} thumbnails`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
