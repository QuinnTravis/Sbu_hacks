import { z } from "zod";
import { generateTimePortalScene, TIME_PORTAL_DISCLOSURE, TimePortalError } from "../../../lib/time-portal-server";
import { placeIdSchema } from "../../../lib/validation";

export const maxDuration = 120;

const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.object({
  placeId: placeIdSchema,
  year: z.number().int().min(1).max(new Date().getUTCFullYear()),
}).strict();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "origin_not_allowed" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "invalid_request" }, { status: 415, headers });

  try {
    const body = await request.text();
    if (body.length > 512)
      return Response.json({ error: "invalid_request" }, { status: 413, headers });
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return Response.json({ error: "invalid_request" }, { status: 400, headers });
    }
    const input = inputSchema.safeParse(parsed);
    if (!input.success)
      return Response.json({ error: "invalid_request" }, { status: 400, headers });

    const scene = await generateTimePortalScene(input.data);
    return Response.json({ ...scene, disclosure: TIME_PORTAL_DISCLOSURE }, { headers });
  } catch (error) {
    const status = error instanceof TimePortalError ? error.status : 503;
    const code = error instanceof TimePortalError ? error.code : "time_portal_unavailable";
    return Response.json({ error: code }, {
      status,
      headers: { ...headers, ...(status === 202 ? { "Retry-After": "3" } : {}) },
    });
  }
}
