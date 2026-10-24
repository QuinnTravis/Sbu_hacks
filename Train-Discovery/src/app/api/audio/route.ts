import { z } from "zod";
import { AudioError, journeyAudio } from "@/lib/audio-server";
import { placeIdSchema } from "@/lib/validation";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), placeId: placeIdSchema,
    context: z.enum(["pointed", "pointed-earlier", "nearby", "replay"]).default("nearby") }).strict(),
  z.object({ type: z.literal("station"), routeId: z.string().regex(/^(?:[1-9]|1[0-3])$/), stationId: z.string().regex(/^\d{1,8}$/) }).strict(),
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
