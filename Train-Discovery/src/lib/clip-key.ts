/**
 * Key for a pre-generated narrator clip: the exact text in its language. The
 * client composes what it will say and plays a clip only when one was made
 * for those words; anything else uses the device voice. FNV-1a, 2×32 bits.
 */
export function clipKey(text: string, language: string): string {
  const input = `${language}|${text.replace(/\s+/g, " ").trim()}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}
