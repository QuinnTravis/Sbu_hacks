import { describe, expect, it } from "vitest";
import {
  compileSummary,
  evidenceHash,
  mergeEvidence,
  validateCitations,
} from "../src/lib/verification";
import type { Evidence } from "../src/lib/types";

const evidence: Evidence[] = [
  {
    id: "source-1",
    title: "Station archive",
    url: "https://example.org/archive",
    text: "The station opened in 1873. It serves the village.",
    retrievedAt: "2026-10-24",
    license: "CC BY-SA 4.0",
  },
];
describe("evidence verification gates", () => {
  it("rejects fabricated citations and missing source IDs", () => {
    const claims = [
      {
        text: "The station opened in 1873.",
        evidenceId: "source-1",
        quote: "The station opened in 1873.",
      },
      {
        text: "The station opened in 1900.",
        evidenceId: "source-1",
        quote: "The station opened in 1900.",
      },
      {
        text: "The station opened in 1873.",
        evidenceId: "invented",
        quote: "The station opened in 1873.",
      },
    ];
    expect(validateCitations(claims, evidence)).toEqual([claims[0]]);
  });
  it("invalidates verification when source text changes but not on a retrieval date change", () => {
    expect(evidenceHash(evidence)).not.toBe(
      evidenceHash([{ ...evidence[0], text: "The station opened in 1874." }]),
    );
    expect(evidenceHash(evidence)).toBe(
      evidenceHash([{ ...evidence[0], retrievedAt: "2026-10-25" }]),
    );
  });
  it("accepts a quote that differs only by curly punctuation", () => {
    expect(
      validateCitations(
        [
          {
            text: "The station opened in 1873.",
            evidenceId: "source-1",
            quote: 'The station "opened" in 1873.',
          },
        ],
        [
          {
            ...evidence[0],
            text: "The station “opened” in 1873. It serves the village.",
          },
        ],
      ),
    ).toHaveLength(1);
  });
  it("compiles a summary only from the sentences that survived", () => {
    const claims = [
      {
        text: "The station opened in 1873.",
        evidenceId: "source-1",
        quote: "The station opened in 1873.",
      },
      {
        text: "It serves the village.",
        evidenceId: "source-1",
        quote: "It serves the village.",
      },
    ];
    expect(compileSummary(claims)).toBe(
      "The station opened in 1873. It serves the village.",
    );
    expect(mergeEvidence(evidence, evidence)).toEqual(evidence);
    expect(
      mergeEvidence(evidence, [
        evidence[0],
        { ...evidence[0], id: "source-2", url: "https://example.org/other" },
        { ...evidence[0], id: "source-3", url: "https://example.org/third" },
      ]),
    ).toHaveLength(2);
  });
});
