import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import rail from "../../public/data/lirr.json";
import { database } from "./supabase";
import { audioEvidence, audioNarration } from "./narration";
import { verifyPlace } from "./verification";
import { placeAnnouncement, stationAnnouncement } from "./audio-journey";
import {
  AUDIO_REVISION, DEFAULT_TTS_MODEL, DEFAULT_VOICE_ID, STORY_VOICE_SETTINGS,
} from "./audio-prompts";
import type { AudioRequest, AudioScript, PlaceAudioContext } from "./audio-journey";
import type { Place } from "./types";

const BUCKET = "journey-audio";
const ephemeralSecret = randomBytes(32).toString("hex");

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

async function resolve(input: AudioRequest) {
  if (input.type === "place") {
    const { data, error } = await database().from("places").select("data").eq("id", input.placeId).single();
    if (error || !data) throw new AudioError("place_not_found", 404);
    const place = data.data as Place;
    const context = input.context ?? "nearby";
    return { revision: [place, context], script: () => placeScript(place, context) };
  }
  const route = rail.routes.find((route) => route.id === input.routeId);
  const stop = route?.stops.find((stop) => stop.id === input.stationId);
  if (!stop) throw new AudioError("station_not_found", 404);
  return {
    revision: [rail.version, stop],
    script: async (): Promise<AudioScript> => stationAnnouncement(stop),
  };
}

export async function journeyAudio(input: AudioRequest, request: Request) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.SUPABASE_SECRET_KEY)
    throw new AudioError("audio_not_configured", 503);
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
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
