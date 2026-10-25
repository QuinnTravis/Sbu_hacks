import { z } from "zod";
import { AudioError, journeyAudio } from "../../../lib/audio-server";
import { findRoute } from "../../../lib/network-data";
import { placeIdSchema } from "../../../lib/validation";
import { LOCALES } from "../../../locales";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
const routeIdSchema = z.string().max(24).refine((id) => findRoute(id) !== null);
const localeSchema = z.enum(LOCALES.map((locale) => locale.code) as [string, ...string[]]).optional();
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), placeId: placeIdSchema,
    context: z.enum(["pointed", "pointed-earlier", "nearby", "replay"]).default("nearby"), locale: localeSchema }).strict(),
  z.object({ type: z.literal("announcement"), locale: localeSchema,
    cue: z.object({ placeId: placeIdSchema, side: z.enum(["left", "right", "ahead", "both"]).nullable(),
      minutes: z.number().int().min(1).max(120), saved: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("station"), routeId: routeIdSchema, stationId: z.string().regex(/^[A-Za-z0-9]{1,8}$/), locale: localeSchema }).strict(),
  z.object({
    type: z.literal("journey"), routeId: routeIdSchema, simulation: z.boolean(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lon: z.number().finite().min(-180).max(180).optional(),
    locale: localeSchema,
  }).strict().refine(({ lat, lon }) => (lat === undefined) === (lon === undefined)),
]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "origin_not_allowed" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "invalid_request" }, { status: 415, headers });
  try {
    const text = await request.text();
    if (text.length > 512) return Response.json({ error: "invalid_request" }, { status: 413, headers });
    const input = inputSchema.safeParse(JSON.parse(text));
    if (!input.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
    return Response.json(await journeyAudio(input.data, request), { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "invalid_request" }, { status: 400, headers });
    const status = error instanceof AudioError ? error.status : 503;
    return Response.json({ error: error instanceof AudioError ? error.code : "audio_unavailable" },
      { status, headers: { ...headers, ...(status === 202 ? { "Retry-After": "2" } : {}) } });
  }
}
