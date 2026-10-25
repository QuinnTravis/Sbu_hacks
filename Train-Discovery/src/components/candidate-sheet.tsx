"use client";

import { ChevronRight } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import type { PointingCandidate } from "@/lib/discovery-targets";

export function CandidateSheet({
  candidates,
  empty,
  onSelect,
}: {
  candidates: PointingCandidate[];
  empty: boolean;
  onSelect: (candidate: PointingCandidate) => void;
}) {
  return (
    <section
      className="candidate-sheet"
      aria-label="Places in this direction"
    >
      {candidates.length > 0 ? (
        <ul>
          {candidates.map((candidate) => {
            const distanceLabel = formatDistance(candidate.meters);
            return (
              <li key={candidate.place.id}>
                <button
                  type="button"
                  className="candidate-row"
                  aria-label={`${candidate.place.name}, ${distanceLabel}`}
                  onClick={() => onSelect(candidate)}
                >
                  <span className="candidate-name">{candidate.place.name}</span>
                  <span className="candidate-distance">{distanceLabel}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : empty ? (
        <p className="candidate-empty" role="status">Nothing in this direction.</p>
      ) : null}
    </section>
  );
}
