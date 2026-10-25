/** Longest caption shown at once, so a line stays readable at a glance. */
const MAX_CHARS = 110;

function pack(pieces: string[], max: number): string[] {
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks.at(-1);
    if (last && last.length + 1 + piece.length <= max) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}

/** Spoken text as caption-sized chunks: sentences, with long ones split at clause breaks. */
export function captionChunks(text: string, max = MAX_CHARS): string[] {
  const sentences = text.replace(/\s+/g, " ").trim()
    .split(/(?<=[.!?…])\s+(?=\S)|(?<=[。！？])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.flatMap((sentence) => sentence.length <= max ? [sentence]
    : pack(sentence.split(/(?<=[,;:—])\s+|(?<=[，；：])/u).map((piece) => piece.trim()).filter(Boolean), max));
}

/** The chunk being spoken at `fraction` of the clip, assuming an even speaking rate. */
export function chunkAtFraction(chunks: string[], fraction: number): string | null {
  if (!chunks.length) return null;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const target = (Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0) * total;
  let seen = 0;
  for (const chunk of chunks) {
    seen += chunk.length;
    if (target < seen) return chunk;
  }
  return chunks.at(-1)!;
}

/** The chunk containing character `index` of the joined text. */
export function chunkAtChar(chunks: string[], index: number): string | null {
  if (!chunks.length) return null;
  let end = 0;
  for (const chunk of chunks) {
    end += chunk.length + 1;
    if (index < end) return chunk;
  }
  return chunks.at(-1)!;
}
