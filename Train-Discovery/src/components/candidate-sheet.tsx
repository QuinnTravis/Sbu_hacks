"use client";

import { useEffect, useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import type { PointingCandidate } from "@/lib/discovery-targets";
import type { Photo } from "@/lib/types";

const thumbnailCache = new Map<string, string | null>();

function CandidateThumbnail({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(thumbnailCache.get(id) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = thumbnailCache.get(id);
    if (cached !== undefined) {
      return;
    }

    const controller = new AbortController();
    // Commons is free; reserve Google Places photo requests for the full card.
    fetch(`/api/photos/${encodeURIComponent(id)}?commons=1`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const photo = (await response.json()) as Photo;
        return photo.url;
      })
      .then((photoUrl) => {
        if (controller.signal.aborted) return;
        thumbnailCache.set(id, photoUrl);
        setUrl(photoUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) thumbnailCache.set(id, null);
      });

    return () => controller.abort();
  }, [id]);

  return (
    <span className="candidate-thumb" aria-hidden="true">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <MapPin size={19} strokeWidth={1.8} />
      )}
    </span>
  );
}

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
                  <CandidateThumbnail key={candidate.place.id} id={candidate.place.id} />
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
