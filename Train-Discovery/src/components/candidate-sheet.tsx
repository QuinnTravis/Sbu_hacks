"use client";

import { ChevronRight } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import type { PointingCandidate } from "@/lib/discovery-targets";
import { PlaceThumb } from "./place-thumb";

export function CandidateSheet({
  candidates,
  empty,
  onEngage,
  onRelease,
  onSelect,
}: {
  candidates: PointingCandidate[];
  empty: boolean;
  onEngage: () => void;
  onRelease: () => void;
  onSelect: (candidate: PointingCandidate) => void;
}) {
  return (
    <section
      className="candidate-sheet"
      aria-label="Places in this direction"
      onPointerDown={onEngage}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onFocusCapture={onEngage}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onRelease();
      }}
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
                  <PlaceThumb id={candidate.place.id} commonsOnly />
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
