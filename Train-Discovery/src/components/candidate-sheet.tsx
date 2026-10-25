"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PointingCandidate } from "@/lib/discovery-targets";
import type { Place } from "@/lib/types";
import { BookmarkButton } from "./bookmark-button";

export function CandidateSheet({
  candidates,
  empty,
  onSelect,
  isBookmarked,
  onToggleBookmark,
}: {
  candidates: PointingCandidate[];
  empty: boolean;
  onSelect: (candidate: PointingCandidate) => void;
  isBookmarked?: (place: Place) => boolean;
  onToggleBookmark?: (place: Place) => void;
}) {
  const { t, distance } = useI18n();
  return (
    <section
      className="candidate-sheet"
      aria-label={t("chooser.label")}
    >
      {candidates.length > 0 ? (
        <ul>
          {candidates.map((candidate) => {
            const distanceLabel = distance(candidate.meters);
            return (
              <li key={candidate.place.id} className="candidate-item">
                <button
                  type="button"
                  className="candidate-row"
                  aria-label={t("chooser.row", { name: candidate.place.name, distance: distanceLabel })}
                  onClick={() => onSelect(candidate)}
                >
                  <span className="candidate-name">{candidate.place.name}</span>
                  <span className="candidate-distance">{distanceLabel}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
                {onToggleBookmark && isBookmarked && (
                  <BookmarkButton
                    compact
                    name={candidate.place.name}
                    bookmarked={isBookmarked(candidate.place)}
                    onToggle={() => onToggleBookmark(candidate.place)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : empty ? (
        <p className="candidate-empty" role="status">{t("chooser.empty")}</p>
      ) : null}
    </section>
  );
}
