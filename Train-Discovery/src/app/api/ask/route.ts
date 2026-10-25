import { z } from "zod";
import { askPlace, limitAskRequests } from "../../../lib/ask-server";
import { AudioError } from "../../../lib/audio-server";
import { placeIdSchema } from "../../../lib/validation";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 4096;
const inputSchema = z.object({
  placeId: placeIdSchema,
  question: z.string().trim().min(1).max(500).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)),
  language: z.enum(["en", "es", "zh-CN"]).optional(),
}).strict();

/** Read a bounded stream rather than buffering an arbitrary request before validation. */
async function readBody(request: Request): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    throw new AudioError("invalid_request", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AudioError("invalid_request", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw new AudioError("invalid_request", 413);
      }
      text += decoder.decode(part.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "origin_not_allowed" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "invalid_request" }, { status: 415, headers });
  try {
    let body: unknown;
    try { body = JSON.parse(await readBody(request)); }
    catch (error) {
      if (error instanceof AudioError) throw error;
      throw new AudioError("invalid_request", 400);
    }
    const input = inputSchema.safeParse(body);
    if (!input.success) throw new AudioError("invalid_request", 400);
    limitAskRequests();
    return Response.json(await askPlace(input.data, request), { headers });
  } catch (error) {
    const status = error instanceof AudioError ? error.status : 503;
    return Response.json({ error: error instanceof AudioError ? error.code : "ask_unavailable" }, {
      status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) },
    });
  }
}
