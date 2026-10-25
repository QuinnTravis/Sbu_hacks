import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { database } from "./supabase";
import { findRoute, railFor, staticPackageFiles, staticPlace } from "./network-data";
import { localeInfo } from "./i18n-core";
import { englishBody } from "./narration-script";
import { audioEvidence, audioNarration } from "./narration";
import { verifyPlace } from "./verification";
import { journeyOpening, placeAnnouncement, stationAnnouncement } from "./audio-journey";
import { createJourneyIntroduction, getJourneyContext } from "./journey-context";
import type { JourneyContextInput, JourneyIntroduction } from "./journey-context";
import {
  AUDIO_REVISION, DEFAULT_TTS_MODEL, DEFAULT_VOICE_ID, STORY_VOICE_SETTINGS,
} from "./audio-prompts";
import type { AudioRequest, AudioScript, PlaceAudioContext } from "./audio-journey";
import type { PoiContent } from "./package-types";
import type { Place } from "./types";

const BUCKET = "journey-audio";
const ephemeralSecret = randomBytes(32).toString("hex");
const WEATHER_WINDOW_MS = 30 * 60 * 1000;
const WEATHER_TTL_MS = 15 * 60 * 1000;
const WEATHER_FAILURE_TTL_MS = 60 * 1000;
const WEATHER_CACHE_MAX = 64;
const weatherCache = new Map<string, { intro: JourneyIntroduction; expiresAt: number }>();
const weatherPending = new Map<string, Promise<JourneyIntroduction>>();

export class AudioError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

async function placeScript(place: Place, context: PlaceAudioContext): Promise<AudioScript> {
  const base = audioNarration(place);
  let story = base?.kind === "verified" ? place.story : undefined;
  // A stale published story fails closed. Only title-matched Wikipedia passages
  // enter generation; source text is never accepted from the browser.
  const evidence = audioEvidence(place);
  if (!place.story && evidence.length && process.env.GEMINI_API_KEY) {
    try { story = await verifyPlace({ ...place, evidence }, 25000); }
    catch { /* Separate model check rejected it; retain the attributed reading. */ }
  }
  const script = placeAnnouncement(story ? { ...place, story } : place, context);
  if (!script) throw new AudioError("story_unavailable", 422);
  return script;
}

/** The grid is coarse and hashed: no exact coordinate or location history is stored. */
function weatherWindow(input: Extract<AudioRequest, { type: "journey" }>): string | null {
  if (input.simulation || input.lat === undefined || input.lon === undefined) return null;
  const tile = `${Math.round(input.lat * 20)},${Math.round(input.lon * 20)}`;
  const hash = createHash("sha256").update(tile).digest("hex").slice(0, 16);
  return `${input.routeId}:${Math.floor(Date.now() / WEATHER_WINDOW_MS)}:${hash}`;
}

async function cachedIntroduction(
  input: JourneyContextInput,
  windowKey: string | null,
): Promise<JourneyIntroduction> {
  const fallback = () => createJourneyIntroduction(input);
  if (!windowKey) return fallback();
  const now = Date.now();
  const cached = weatherCache.get(windowKey);
  if (cached && cached.expiresAt > now) return cached.intro;
  weatherCache.delete(windowKey);
  const pending = weatherPending.get(windowKey);
  if (pending) return pending;

  const work = (async () => {
    // Weather is optional. Network failures never prevent an opening narration.
    const intro = await getJourneyContext(input).catch(fallback);
    const endsAt = (Math.floor(now / WEATHER_WINDOW_MS) + 1) * WEATHER_WINDOW_MS;
    const forecastEnd = intro.weather?.source.validUntil ? Date.parse(intro.weather.source.validUntil) : NaN;
    const lifetime = intro.weather ? WEATHER_TTL_MS : WEATHER_FAILURE_TTL_MS;
    const expiresAt = Math.min(now + lifetime, endsAt, Number.isFinite(forecastEnd) ? forecastEnd : Infinity);
    weatherCache.set(windowKey, { intro, expiresAt });
    // Bound memory even if many callers request distinct areas.
    if (weatherCache.size > WEATHER_CACHE_MAX) weatherCache.delete(weatherCache.keys().next().value!);
    return intro;
  })();
  weatherPending.set(windowKey, work);
  try { return await work; }
  finally { weatherPending.delete(windowKey); }
}

function journeyScript(
  routeName: string,
  simulation: boolean,
  intro: JourneyIntroduction,
  railSource: { title: string; url: string; license: string },
  locale: string,
): AudioScript {
  return {
    name: `Welcome to ${routeName}`,
    // Weather comes from an English forecast, so other languages use the plain opening.
    text: locale === "en"
      ? `The tracks set the rhythm. The world outside supplies the stories. ${simulation ? "This is a simulated ride. " : ""}${intro.text}`
      : journeyOpening(routeName, simulation, locale),
    kind: "announcement",
    sources: [
      railSource,
      ...(locale === "en" ? intro.sources.map(({ title, url }) => ({ title, url, license: "U.S. government forecast" })) : []),
    ],
    language: locale,
  };
}

/** Static networks: the verified story body alone, in the requested language. */
function storyBodyScript(place: Place, locale: string, content: PoiContent | undefined): AudioScript {
  const english = englishBody(place);
  const text = locale !== "en" && content?.transcript ? content.transcript : english?.text;
  if (!text) throw new AudioError("story_unavailable", 422);
  return {
    name: place.name,
    text,
    kind: "verified",
    sources: place.evidence.map(({ title, url, license }) => ({ title, url, license })),
    language: locale !== "en" && content?.transcript ? locale : "en",
  };
}

async function resolve(input: AudioRequest) {
  if (input.type === "announcement") throw new AudioError("invalid_request", 400);
  const locale = localeInfo(input.locale ?? "en").code;
  if (input.type === "place") {
    const fromPackage = staticPlace(input.placeId);
    if (fromPackage) {
      const content = staticPackageFiles(fromPackage.routeId)?.content[locale]?.[input.placeId];
      return {
        revision: [fromPackage.place, "story-body", locale, content?.transcript ?? null],
        script: async () => storyBodyScript(fromPackage.place, locale, content),
      };
    }
    const { data, error } = await database().from("places").select("data").eq("id", input.placeId).single();
    if (error || !data) throw new AudioError("place_not_found", 404);
    const place = data.data as Place;
    const context = input.context ?? "nearby";
    return { revision: [place, context], script: () => placeScript(place, context) };
  }
  if (input.type === "journey") {
    const found = findRoute(input.routeId);
    if (!found) throw new AudioError("route_not_found", 404);
    const { route, networkId } = found;
    const rail = railFor(networkId);
    // This defense also applies to direct server calls which bypass the route schema.
    if (typeof input.simulation !== "boolean" ||
      (input.lat === undefined) !== (input.lon === undefined) ||
      (input.lat !== undefined && (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)) ||
      (input.lon !== undefined && (!Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180)))
      throw new AudioError("invalid_request", 400);
    const windowKey = locale === "en" ? weatherWindow(input) : null;
    const context: JourneyContextInput = {
      routeName: route.name,
      includeWeather: Boolean(windowKey),
      coordinates: windowKey ? { lat: input.lat!, lon: input.lon! } : null,
    };
    const railSource = networkId === "lirr"
      ? { title: "MTA Long Island Rail Road GTFS", url: rail.source, license: "MTA published transit data" }
      : { title: "Amtrak GTFS", url: rail.source, license: "Published by Amtrak" };
    return {
      revision: [rail.version, route.id, input.simulation, windowKey, locale],
      script: async () => journeyScript(route.name, input.simulation, await cachedIntroduction(context, windowKey), railSource, locale),
    };
  }
  const found = findRoute(input.routeId);
  const stop = found?.route.stops.find((stop) => stop.id === input.stationId);
  if (!found || !stop) throw new AudioError("station_not_found", 404);
  return {
    revision: [railFor(found.networkId).version, stop, locale],
    script: async (): Promise<AudioScript> => stationAnnouncement(stop, locale),
  };
}

export async function journeyAudio(input: AudioRequest, request: Request) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.SUPABASE_SECRET_KEY)
    throw new AudioError("audio_not_configured", 503);
  const voice = (input.type !== "announcement" && localeInfo(input.locale ?? "en").ttsVoiceId) ||
    process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_TTS_MODEL;
  const content = await resolve(input);
  const key = createHash("sha256").update(JSON.stringify([
    AUDIO_REVISION, voice, model, STORY_VOICE_SETTINGS, content.revision,
    process.env.GEMINI_MODEL || "gemini-2.5-flash", process.env.GEMINI_VERIFIER_MODEL || "gemini-2.5-flash-lite",
  ])).digest("hex");
  const db = database(true);
  const read = async () => {
    const { data, error } = await db.from("audio_jobs").select("script,storage_path,lease_until").eq("id", key).maybeSingle();
    if (error) throw new AudioError("audio_cache_unavailable", 503);
    if (!data?.storage_path || !data.script) return null;
    const signed = await db.storage.from(BUCKET).createSignedUrl(data.storage_path, 3600);
    if (signed.error) throw new AudioError("audio_cache_unavailable", 503);
    return { script: data.script as AudioScript, audioUrl: signed.data.signedUrl, provider: "elevenlabs" as const };
  };
  const cached = await read();
  if (cached) return cached;
  const client = process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "shared" : "shared";
  const clientHash = createHmac("sha256", process.env.RATE_LIMIT_SECRET || ephemeralSecret).update(client).digest("hex");
  // This is an application character ceiling, not an assertion about the user's plan.
  const configuredLimit = Number(process.env.ELEVENLABS_MONTHLY_CHARACTER_LIMIT ?? 9000);
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 9000;
  const lease = await db.rpc("claim_audio_job", { p_key: key, p_client_hash: clientHash, p_limit: limit });
  if (lease.error) throw new AudioError("audio_cache_unavailable", 503);
  if (!lease.data) {
    const ready = await read();
    if (ready) return ready;
    const { data } = await db.from("audio_jobs").select("token,lease_until").eq("id", key).single();
    if (data?.token && new Date(data.lease_until).getTime() > Date.now()) throw new AudioError("audio_preparing", 202);
    throw new AudioError("audio_allowance_reached", 429);
  }
  let used = 0; // No speech credit is reserved as spent until synthesis begins.
  try {
    const script = await content.script();
    if (!script.text.trim() || script.text.length > 1200) throw new AudioError("narration_too_long", 422);
    used = script.text.length; // A lost provider response may still have consumed credit.
    const speech = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script.text, model_id: model, voice_settings: STORY_VOICE_SETTINGS }),
        signal: AbortSignal.timeout(30000), cache: "no-store" },
    );
    if (!speech.ok) {
      used = 0;
      // Log only status, never the key, upstream body, or passenger data.
      console.warn("ElevenLabs synthesis unavailable", { status: speech.status });
      throw new AudioError("voice_unavailable", 503);
    }
    used = script.text.length;
    const bytes = await speech.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5242880) throw new AudioError("invalid_audio", 502);
    const path = `${key}/${lease.data}.mp3`;
    const upload = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: false });
    if (upload.error) throw new AudioError("audio_cache_unavailable", 503);
    const finished = await db.rpc("finish_audio_job", {
      p_key: key, p_token: lease.data, p_script: script, p_path: path, p_used: used,
    });
    if (finished.error || finished.data !== true) throw new AudioError("audio_cache_unavailable", 503);
    const result = await read();
    if (!result) throw new AudioError("audio_cache_unavailable", 503);
    return result;
  } catch (error) {
    await db.rpc("finish_audio_job", { p_key: key, p_token: lease.data, p_script: null, p_path: null, p_used: used });
    throw error;
  }
}
