import { describe, expect, it } from "vitest";
import {
  agreeingSites,
  compileSummary,
  evidenceHash,
  selectClaims,
  sourceAgrees,
} from "../src/lib/verification";
import type { Evidence } from "../src/lib/types";

const source = (id: string, url: string, text: string): Evidence => ({
  id, url, text, title: id, retrievedAt: "2026-10-25", license: "test",
});
const sources = [
  source("wiki", "https://en.wikipedia.org/wiki/Moffat_Station", "Moffat Station was built in 1906 as the Denver terminus of the Denver, Northwestern and Pacific Railway."),
  source("loc", "https://www.loc.gov/item/moffat", "Built in 1906, Moffat Station served the Denver, Northwestern and Pacific Railway."),
  source("loc-2", "https://loc.gov/item/other", "The station was built in 1906 for the Denver, Northwestern and Pacific Railway."),
  source("blog", "https://example.org/moffat", "Moffat Station is one of only two original railroad stations left in Denver."),
];

describe("agreement check", () => {
  it("requires a source to state the sentence's numbers and names", () => {
    expect(sourceAgrees("Moffat Station was built in 1906.", sources[0].text, "Moffat Station")).toBe(true);
    expect(sourceAgrees("Moffat Station was built in 1907.", sources[0].text, "Moffat Station")).toBe(false);
    expect(sourceAgrees("Moffat Station served the Union Pacific.", sources[1].text, "Moffat Station")).toBe(false);
  });

  it("counts each site once", () => {
    const support = agreeingSites("Moffat Station was built in 1906 for the Denver, Northwestern and Pacific Railway.", sources, "Moffat Station");
    expect(support.map((item) => item.id)).toEqual(["wiki", "loc"]);
  });

  it("keeps sentences two sites agree on and drops the rest", () => {
    const selected = selectClaims({
      summary: [
        "Moffat Station was built in 1906 for the Denver, Northwestern and Pacific Railway.",
        "Moffat Station is one of only two original railroad stations left in Denver.",
      ],
      funFact: "Moffat Station was designed by Frank Edbrooke in 1907.",
    }, sources, "Moffat Station");
    expect(selected?.sites).toBe(2);
    expect(selected?.claims.map((claim) => claim.evidenceId)).toEqual(["wiki"]);
    expect(selected?.funFact).toBeUndefined();
    expect(selected?.evidence.map((item) => item.id)).toEqual(["wiki", "loc"]);
  });

  it("falls back to single-site sentences when nothing has two", () => {
    const selected = selectClaims({
      summary: ["It is one of only two original railroad stations left in Denver."],
    }, sources, "Moffat Station");
    expect(selected?.sites).toBe(1);
    expect(selected?.claims[0].text).toBe("Moffat Station is one of only two original railroad stations left in Denver.");
    expect(selected?.claims[0].quote).toBe(sources[3].text);
  });

  it("rejects a draft no source supports", () => {
    expect(selectClaims({ summary: ["Moffat Station opened in 1950 as an airport."] }, sources, "Moffat Station")).toBeNull();
  });

  it("compiles the summary and hashes only source identity and text", () => {
    expect(compileSummary([
      { text: "One.", evidenceId: "a", quote: "One." },
      { text: "Two.", evidenceId: "a", quote: "Two." },
    ])).toBe("One. Two.");
    expect(evidenceHash(sources)).toBe(evidenceHash(sources.map((item) => ({ ...item, retrievedAt: "2026-10-26" }))));
    expect(evidenceHash(sources)).not.toBe(evidenceHash([{ ...sources[0], text: "Changed." }, ...sources.slice(1)]));
  });
});
