/**
 * Precompute everything the Rockies demo needs so it runs without live calls:
 *   1. estimated no-signal zones from tunnels, canyons, and remote stretches;
 *   2. an air-quality snapshot (Open-Meteo, no key) for every 25 km zone;
 *   3. narrator clips (ElevenLabs) for the ride opening, the stations, and the
 *      key demo stories, within a character budget, keyed by their exact text.
 * Idempotent: clips already generated are reused.
 *
 *   npm run demo:precompute -- --budget=4000
 *   npm run demo:precompute -- --skip-audio
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { journeyOpening } from "../src/lib/audio-journey";
import { buildZones, type TunnelStretch } from "../src/lib/connectivity";
import { fetchAirQuality, zoneSpans } from "../src/lib/air-quality";
import { clipKey } from "../src/lib/clip-key";
import { translate } from "../src/lib/i18n-core";
import { INTRO_COUNT, composePlaceScript, englishBody, type PlaceContext } from "../src/lib/narration-script";
import { routeIndex, type Side } from "../src/lib/route-geometry";
import { DEFAULT_TTS_MODEL, DEFAULT_VOICE_ID, STORY_VOICE_SETTINGS } from "../src/lib/audio-prompts";
import { LOCALES } from "../src/locales";
import { californiaZephyr } from "../src/networks/california-zephyr";
import type { NarratorClip, PoiContent } from "../src/lib/package-types";
import type { Place, RailData } from "../src/lib/types";

const DIR = "public/data/networks/california-zephyr";
const ROUTE = "cz-rockies";
const AUDIO_DIR = "public/audio/demo";
const flag = (name: string) => process.argv.includes(`--${name}`);
const argument = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

async function writeJson(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 1));
  await rename(`${path}.tmp`, path);
}

/** Story clips in demo order; the budget runs out at the end of this list, not the start. */
const DEMO_STORIES = [
  "Moffat Tunnel", "Denver Union Station", "Gore Canyon", "Glenwood Canyon", "Hotel Colorado", "Rollins Pass",
  "Byers Canyon", "Hot Sulphur Springs", "Fraser–Winter Park station", "Granby station", "Colorado River",
  "Glenwood Springs station", "Hanging Lake", "Kremmling", "State Bridge", "Dotsero",
];
/**
 * Demo-path places voiced end to end: every lead, body and look-for line the
 * ride can compose for them, so the device voice never cuts in mid-story.
 */
const FULL_VOICE = [
  "South Platte River", "Denver Union Station", "Moffat Tunnel", "Rollins Pass", "Gore Canyon",
  "Glenwood Canyon", "Hotel Colorado", "Glenwood Hot Springs Pool",
];
const CONTEXTS: PlaceContext[] = ["nearby", "pointed", "pointed-earlier", "replay"];
const SIDES: (Side | null)[] = [null, "left", "right", "ahead", "both"];
/** Stories voiced in Spanish and Chinese for the multilingual moment of the demo. */
const LOCALIZED_STORIES = ["Moffat Tunnel", "Denver Union Station", "Gore Canyon"];

async function main() {
  const rail: RailData = JSON.parse(await readFile(`${DIR}/rail.json`, "utf8"));
  const route = rail.routes.find((r) => r.id === ROUTE)!;
  const index = routeIndex(route.paths[0]);
  const { places }: { places: Place[] } = JSON.parse(await readFile(`${DIR}/places/${ROUTE}.json`, "utf8"));

  // 1. Connectivity
  const { tunnels }: { tunnels: TunnelStretch[] } = JSON.parse(await readFile(`${DIR}/tunnels/${ROUTE}.json`, "utf8"));
  const zones = buildZones(tunnels, places, index.totalKm);
  await writeJson(`${DIR}/connectivity/${ROUTE}.json`, {
    note: "Estimated from OpenStreetMap tunnels, canyon locations, and distance from towns. Not measured coverage.",
    zones,
  });
  console.log(`Connectivity: ${zones.length} estimated zones (${zones.filter((z) => z.reason === "tunnel").length} tunnel)`);

  // 2. Air quality snapshot
  if (!flag("skip-air")) {
    try {
      const snapshot = await fetchAirQuality(zoneSpans(index));
      await writeJson(`${DIR}/air/${ROUTE}.json`, { snapshot });
      console.log(`Air quality: ${snapshot.zones.length} zones, max AQI ${Math.max(...snapshot.zones.map((z) => z.aqi))}`);
    } catch (error) {
      console.log(`Air quality snapshot skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 3. Narrator clips
  if (flag("skip-audio")) return;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.log("ELEVENLABS_API_KEY is not set; the demo will use the device voice.");
    return;
  }
  const budget = Number(argument("budget") ?? 4000);
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_TTS_MODEL;
  const manifestPath = `${DIR}/audio/${ROUTE}.json`;
  const manifest: { clips: Record<string, NarratorClip> } = JSON.parse(await readFile(manifestPath, "utf8").catch(() => '{"clips":{}}'));
  const content: Record<string, Record<string, PoiContent>> = JSON.parse(await readFile(`${DIR}/content/${ROUTE}.json`, "utf8").catch(() => "{}"));
  await mkdir(AUDIO_DIR, { recursive: true });

  const jobs: { text: string; language: string; label: string }[] = [];
  const segment = { network: californiaZephyr.name, segment: route.name };
  for (const locale of LOCALES) jobs.push({ text: journeyOpening(route.name, true, locale.code, segment), language: locale.code, label: `opening (${locale.code})` });
  for (const stop of route.stops) jobs.push({ text: translate("en", "narration.station", { name: stop.name }), language: "en", label: `station ${stop.id}` });
  for (const name of DEMO_STORIES) {
    const place = places.find((p) => p.name === name);
    const body = place ? englishBody(place) : null;
    if (body) jobs.push({ text: body.text, language: "en", label: name });
  }
  for (const name of FULL_VOICE) {
    const place = places.find((p) => p.name === name);
    if (!place) continue;
    const texts = new Set<string>();
    for (const context of CONTEXTS)
      for (const side of SIDES)
        for (let introIndex = 0; introIndex < INTRO_COUNT; introIndex++)
          for (const part of composePlaceScript({ place, code: "en", context, side, introIndex })?.parts ?? [])
            texts.add(part.text);
    for (const text of texts) jobs.push({ text, language: "en", label: `${name}: ${text.slice(0, 40)}` });
  }
  for (const locale of LOCALES.filter((l) => l.code !== "en")) {
    for (const stop of route.stops) jobs.push({ text: translate(locale.code, "narration.station", { name: stop.name }), language: locale.code, label: `station ${stop.id} (${locale.code})` });
    for (const name of LOCALIZED_STORIES) {
      const place = places.find((p) => p.name === name);
      const transcript = place ? content[locale.code]?.[place.id]?.transcript : undefined;
      if (transcript) jobs.push({ text: transcript, language: locale.code, label: `${name} (${locale.code})` });
    }
  }

  let spent = 0;
  for (const job of jobs) {
    const id = clipKey(job.text, job.language);
    const existing = manifest.clips[id];
    if (existing && existsSync(`public${existing.url}`)) continue;
    if (spent + job.text.length > budget) {
      console.log(`Budget reached; ${job.label} and later clips use the device voice.`);
      break;
    }
    const voice = LOCALES.find((l) => l.code === job.language)?.ttsVoiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: job.text, model_id: model, voice_settings: STORY_VOICE_SETTINGS }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      // Log only the status, never the key or the provider's body.
      console.log(`ElevenLabs ${response.status} on ${job.label}; stopping (device voice covers the rest).`);
      break;
    }
    spent += job.text.length;
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = `${createHash("sha1").update(`${id}|${voice}|${model}`).digest("hex").slice(0, 16)}.mp3`;
    await writeFile(`${AUDIO_DIR}/${file}`, bytes);
    manifest.clips[id] = {
      url: `/audio/demo/${file}`,
      voiceId: voice,
      // 128 kb/s constant bit rate.
      durationS: Math.round((bytes.length * 8) / 128_000),
      text: job.text,
      language: job.language,
    };
    await writeJson(manifestPath, manifest);
    console.log(`✓ ${job.label} (${job.text.length} characters)`);
  }
  console.log(`Narrator clips: ${Object.keys(manifest.clips).length} in the manifest; ${spent} characters used this run (budget ${budget}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
