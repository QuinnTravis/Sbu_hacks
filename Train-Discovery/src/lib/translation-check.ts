/**
 * Preservation check for translated narration (spec F5): every number, date,
 * and proper noun in the checked English text must survive translation. The
 * translator may not add facts; this catches the commonest drift (changed
 * years and figures, dropped or swapped names). Chinese may render a name in
 * Chinese characters only through a glossary entry the translator returned.
 */

const fold = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Digits as written, with thousands separators removed: "1,200" and "1.200" both give "1200". */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\d[\d,.   ]*\d|\d/g)) {
    let value = match[0].replace(/[   ]/g, "");
    // A separator followed by exactly three digits is a thousands separator.
    value = value.replace(/[,.](?=\d{3}(?!\d))/g, "");
    out.push(value.replace(/,/g, "."));
  }
  return out;
}

const STOP = new Set([
  "The", "A", "An", "In", "On", "At", "It", "Its", "This", "That", "These", "Those", "From", "By",
  "For", "With", "As", "After", "Before", "When", "While", "Today", "Look", "Here", "There", "Now",
  "Once", "Its", "His", "Her", "Their", "Built", "Since", "During", "Over", "Under", "Above", "Near",
]);

/**
 * Generic parts of names that a translation renders in its own language
 * ("Moffat Tunnel" → "túnel Moffat"); only the distinctive part must survive.
 */
const GENERIC = new Set([
  "Tunnel", "River", "Canyon", "Mountain", "Mountains", "Peak", "Pass", "Station", "Hotel", "Lake", "Creek",
  "Springs", "Spring", "Hot", "Union", "Park", "Railroad", "Railway", "Depot", "Bridge", "Range", "Valley",
  "Divide", "National", "State", "Forest", "Gorge", "Reservoir", "County", "City", "Street", "Avenue",
  "Church", "Museum", "Building", "House", "Opera", "Theme", "Gardens", "Garden", "Tower", "Square", "Rocky",
  "Great", "North", "South", "East", "West", "Upper", "Lower", "Old", "New", "Fort", "Pool", "Caverns",
  "Cathedral", "Basilica", "Mill", "Ranch", "Mine", "Dam", "Lodge", "Inn", "Hall", "Subdivision", "Line",
  "Company", "Western", "Pacific", "Grande", "Plains",
]);

/** Capitalized words that are not just the first word of a sentence. */
export function properNouns(text: string): string[] {
  const names = new Set<string>();
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) ?? [];
    words.forEach((word, index) => {
      if (!/^[A-ZÀ-Þ]/.test(word) || word.length < 3) return;
      if (index === 0 && STOP.has(word)) return;
      if (STOP.has(word) || GENERIC.has(word)) return;
      names.add(word.replace(/['’]s$/, ""));
    });
  }
  return [...names];
}

export type PreservationResult = {
  ok: boolean;
  missingNumbers: string[];
  missingNames: string[];
};

export function checkPreservation(
  english: string,
  translated: string,
  locale: string,
  glossary: Record<string, string> = {},
): PreservationResult {
  const target = numbersIn(translated);
  const missingNumbers = numbersIn(english).filter((value) => !target.includes(value));
  const folded = fold(translated);
  const missingNames = properNouns(english).filter((name) => {
    if (folded.includes(fold(name))) return false;
    // Chinese may transliterate a name; it must come from the glossary and appear in the text.
    if (locale.startsWith("zh")) {
      return !Object.entries(glossary).some(([source, rendered]) =>
        source.split(/\s+/).some((part) => fold(part) === fold(name)) && rendered.trim() && translated.includes(rendered.trim()));
    }
    return true;
  });
  return { ok: !missingNumbers.length && !missingNames.length, missingNumbers, missingNames };
}
