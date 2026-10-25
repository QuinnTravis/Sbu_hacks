import { formatNumber, translate } from "./i18n-core";
import { sourceExcerpt } from "./narration";
import { normalizeQuote } from "./quote";
import type { PoiContent } from "./package-types";
import type { Side } from "./route-geometry";
import type { Claim, Place } from "./types";

/**
 * Spoken script for a place, in parts. Facts come only from verified claims
 * (or their checked translations), a labeled source excerpt, or map/Wikidata
 * fields. Leads, sides, intros, and callbacks are templates, not claims.
 */

export type PlaceContext = "pointed" | "pointed-earlier" | "nearby" | "replay" | "approaching" | "area";
export type ScriptPart = { text: string; part: "lead" | "callback" | "body" | "lookFor" };
export type PlaceScript = {
  parts: ScriptPart[];
  /** verified story, attributed source excerpt, or basic map facts. */
  kind: "verified" | "source" | "basic";
  /** Language the parts are written in; may differ from the rider's when no translation exists. */
  language: string;
  sources: { title: string; url: string; license: string }[];
};

export const INTRO_COUNT = 5;

function supported(place: Place, claim: Claim | undefined): claim is Claim {
  if (!claim || claim.text.trim().length < 12 || claim.quote.trim().length < 12) return false;
  const evidence = place.evidence.find((item) => item.id === claim.evidenceId);
  return Boolean(evidence?.text && normalizeQuote(evidence.text).includes(normalizeQuote(claim.quote)));
}

/** Verified English body: hook, detail, why; or the older summary claims and fact. */
export function englishBody(place: Place): { text: string; lookFor?: string; claims: Claim[] } | null {
  const story = place.story;
  if (!story) return null;
  const parts = [story.narration?.hook, story.narration?.detail, story.narration?.why].filter((c) => supported(place, c));
  const claims = parts.length ? parts : [...story.claims, ...(story.funFact ? [story.funFact] : [])].filter((c) => supported(place, c));
  if (!claims.length) return null;
  const lookFor = supported(place, story.narration?.lookFor) ? story.narration!.lookFor!.text.trim().replace(/[.!]+$/, "") : undefined;
  return { text: claims.map((c) => c.text.trim()).join(" "), claims, ...(lookFor ? { lookFor } : {}) };
}

/** One factual line from map and Wikidata fields, e.g. "Fraser, a town. Elevation 2,610 m." */
export function basicLine(place: Place, code: string): string | null {
  const basic = place.basic;
  if (!basic) return null;
  const type = translate(code, `basicType.${basic.type}`);
  if (type === `basicType.${basic.type}`) return null;
  const parts = [translate(code, "narration.basic.lead", { name: place.name, type })];
  if (basic.elevationM) {
    parts.push(translate(code, "narration.basic.elevation", {
      value: new Intl.NumberFormat(code, { style: "unit", unit: "meter", unitDisplay: "long" }).format(basic.elevationM),
    }));
  }
  if (basic.population && ["town", "city"].includes(basic.type)) {
    parts.push(translate(code, "narration.basic.population", { value: formatNumber(code, basic.population) }));
  }
  return parts.join(" ");
}

function pointedNoun(category: string): "building" | "landmark" | "station" | "place" {
  switch (category.trim().toLowerCase()) {
    case "heritage":
    case "building":
      return "building";
    case "landmark":
      return "landmark";
    case "station":
    case "railway history":
      return "station";
    default:
      return "place";
  }
}

export function leadLine(
  place: Place,
  context: PlaceContext,
  code: string,
  options: { side?: Side | null; introIndex?: number; sideInLead?: boolean } = {},
): string {
  const name = place.name;
  switch (context) {
    case "pointed":
      return translate(code, "narration.lead.pointed", { name });
    case "pointed-earlier":
      return translate(code, "narration.lead.pointedEarlier", {
        name, noun: translate(code, `narration.noun.${pointedNoun(place.category)}`),
      });
    case "replay":
      return translate(code, "narration.lead.replay", { name });
    default:
      if (options.sideInLead && options.side && options.side !== "ahead")
        return translate(code, `narration.introSide.${options.side}`, { name });
      return translate(code, `narration.intro.${(options.introIndex ?? 0) % INTRO_COUNT}`, { name });
  }
}

/** Pronunciation guides and native-name glosses garble a narrator; units and dates stay. */
export function speakable(text: string): string {
  return text
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*\(([^()]*)\)/g, (group, inner: string) =>
      /[^\u0000-\u024F‘’“”–—]|\b(?:lit\.|pronounced|listen)|^[A-Z][\w-]*:/u.test(inner) ? "" : group)
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spoken look-ahead cue, e.g. "Coming up on your left in about 2 minutes: Gore Canyon." */
export function cueLine(code: string, input: { name: string; side: Side | null; minutes: number; saved?: boolean }): string {
  const eta = new Intl.NumberFormat(code, { style: "unit", unit: "minute", unitDisplay: "long" })
    .format(Math.max(1, Math.round(input.minutes)));
  const line = translate(code, `narration.cue.${input.side ?? "unknown"}`, { eta, name: input.name });
  return input.saved ? `${line} ${translate(code, "narration.cueSaved")}` : line;
}

export function lookForLine(thing: string, side: Side | null, code: string): string {
  return translate(code, `narration.lookFor.${side ?? "unknown"}`, { thing });
}

export function composePlaceScript(input: {
  place: Place;
  code: string;
  context: PlaceContext;
  side?: Side | null;
  /** Localized, checked content for `code`, when it exists. */
  content?: PoiContent;
  introIndex?: number;
  /** Ride-state callback or route context, already templated. */
  callback?: string | null;
}): PlaceScript | null {
  const { place, code, context } = input;
  const side = input.side ?? null;
  const localized = code !== "en" && input.content?.transcript ? input.content : undefined;
  const english = englishBody(place);
  const body = localized
    ? { text: localized.transcript, lookFor: localized.lookFor, language: code }
    : english ? { text: english.text, lookFor: english.lookFor, language: "en" } : null;
  const storySources = place.evidence
    .filter((source) => !place.story || [...place.story.claims, ...(place.story.funFact ? [place.story.funFact] : []),
      ...Object.values(place.story.narration ?? {})].some((claim) => claim?.evidenceId === source.id))
    .map(({ title, url, license }) => ({ title, url, license }));
  if (body) {
    const language = body.language;
    const lookFor = body.lookFor ? lookForLine(body.lookFor, side, language) : null;
    const parts: ScriptPart[] = [
      { part: "lead", text: leadLine(place, context, language, { side, introIndex: input.introIndex, sideInLead: !lookFor }) },
      ...(input.callback && language === code ? [{ part: "callback" as const, text: input.callback }] : []),
      { part: "body", text: body.text },
      ...(lookFor ? [{ part: "lookFor" as const, text: lookFor }] : []),
    ];
    return { parts, kind: "verified", language, sources: storySources };
  }
  // A source excerpt is read verbatim and only in its own language.
  const excerpt = !place.story && code === "en" ? sourceExcerpt(place, Infinity) : null;
  if (excerpt) {
    return {
      parts: [
        { part: "lead", text: leadLine(place, context, "en", { side, introIndex: input.introIndex, sideInLead: true }) },
        { part: "body", text: speakable(excerpt.text) },
      ],
      kind: "source",
      language: "en",
      sources: [{ title: excerpt.evidence.title, url: excerpt.evidence.url, license: excerpt.evidence.license }],
    };
  }
  const basic = basicLine(place, code);
  if (basic) {
    return {
      parts: [{ part: "body", text: basic }],
      kind: "basic",
      language: code,
      sources: place.basic?.sources ?? [],
    };
  }
  return null;
}

export function scriptText(script: PlaceScript): string {
  return script.parts.map((part) => part.text.trim()).join(" ");
}
