"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Info,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import type { Claim, Photo, QueueEntry } from "@/lib/types";
import { cardSummary } from "@/lib/card-face";
import { formatDistance } from "@/lib/geo";
import { audioNarration, narrationText, sourceExcerpt } from "@/lib/narration";

export function PlaceCard({
  entry,
  onDiscard,
  index,
  total,
  onNavigate,
  onNarrate,
  onSave,
  saved = false,
}: {
  entry: QueueEntry;
  onDiscard?: () => void;
  index: number;
  total: number;
  onNavigate: (n: number) => void;
  onNarrate?: () => void;
  onSave: () => void;
  saved?: boolean;
}) {
  const { place } = entry;
  const photoDialog = useRef<HTMLDialogElement>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoState, setPhotoState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/photos/${encodeURIComponent(place.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Photo unavailable");
        const result = await response.json();
        if (!controller.signal.aborted) {
          setPhoto(result);
          setPhotoState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhotoState("unavailable");
      });
    return () => controller.abort();
  }, [place.id, attempt]);
  const story = place.story;
  const summary = cardSummary(place);
  const excerpt = story ? null : sourceExcerpt(place);
  const storyClaims: Claim[] = story
    ? [...story.claims, ...(story.funFact ? [story.funFact] : [])]
    : [];
  const sources = place.evidence.filter(
    (e) => !story || storyClaims.some((claim) => claim.evidenceId === e.id),
  );
  return (
    <article className="place-card">
      <div className="place-photo">
        {photo && photoState === "ready" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={place.name}
              onError={() => setPhotoState("unavailable")}
              referrerPolicy="no-referrer"
            />
            <button
              type="button"
              className="photo-info-button"
              onClick={() => photoDialog.current?.showModal()}
              aria-label={`View photo details for ${place.name}`}
            >
              <Info size={19} aria-hidden="true" />
            </button>
            <dialog
              ref={photoDialog}
              className="photo-viewer"
              aria-label={`Photo of ${place.name}`}
              onClick={(event) => {
                if (event.target === event.currentTarget) event.currentTarget.close();
              }}
            >
              <div className="photo-viewer-content">
                <button
                  type="button"
                  className="icon-button photo-viewer-close"
                  onClick={() => photoDialog.current?.close()}
                  aria-label={`Close photo of ${place.name}`}
                >
                  <X size={19} aria-hidden="true" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="photo-viewer-image"
                  src={photo.url}
                  alt={place.name}
                  referrerPolicy="no-referrer"
                />
                <div className="photo-viewer-attribution">
                  <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
                    {photo.source}
                  </a>
                  {photo.authors.map((author, i) => (
                    <a
                      key={i}
                      className="photo-author"
                      href={author.uri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {author.photoUri && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={author.photoUri} alt="" referrerPolicy="no-referrer" />
                      )}
                      <span>{author.displayName}</span>
                    </a>
                  ))}
                  {photo.license && (
                    <a href={photo.license.url} target="_blank" rel="noreferrer">
                      {photo.license.name}
                    </a>
                  )}
                </div>
              </div>
            </dialog>
          </>
        ) : (
          <div className="photo-placeholder">
            {photoState === "loading" ? (
              <LoaderCircle size={24} className="spin" />
            ) : (
              <ImageOff size={24} />
            )}
            <span>
              {photoState === "loading" ? "Loading photo" : "Photo unavailable"}
            </span>
            {photoState === "unavailable" && (
              <button
                className="text-button"
                onClick={() => {
                  setPhotoState("loading");
                  setAttempt((a) => a + 1);
                }}
              >
                <RefreshCw size={13} />
                Retry
              </button>
            )}
          </div>
        )}
        {onDiscard && (
          <button
            className="icon-button discard-button"
            onClick={onDiscard}
            aria-label={`Discard ${place.name}`}
          >
            <X size={19} />
          </button>
        )}
      </div>
      <div className="place-content">
        <div className="place-meta">
          <span>{place.category}</span>
          {Number.isFinite(entry.distance) && (
            <span>{formatDistance(entry.distance)}</span>
          )}
        </div>
        <h2>{place.name}</h2>
        {story ? (
          <>
            <div className="verified-label">
              <ShieldCheck size={14} />
              Evidence checked
              {onNarrate && narrationText(place) && (
                <button className="story-listen" onClick={onNarrate} aria-label={`Listen to ${place.name}`}>
                  <Volume2 size={16} />
                  Play story
                </button>
              )}
            </div>
            <div className="story-facts">
              <section className="story-block story-summary">
                <h3>Summary</h3>
                {story.claims.length ? (
                  <p>
                    {story.claims.map((claim, i) => (
                      <span key={i}>
                        {claim.text}{" "}
                        <a
                          href={place.evidence.find((e) => e.id === claim.evidenceId)?.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Source for summary claim ${i + 1}`}
                        >
                          <sup>[{i + 1}]</sup>
                        </a>{" "}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p>{summary?.text ?? "No sourced summary yet."}</p>
                )}
              </section>
              {story.funFact && (
                <section className="story-block story-interesting">
                  <h3>Interesting fact</h3>
                  <p>
                    {story.funFact.text}{" "}
                    <a
                      href={place.evidence.find((e) => e.id === story.funFact?.evidenceId)?.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Source for interesting fact"
                    >
                      <sup>[{story.claims.length + 1}]</sup>
                    </a>
                  </p>
                </section>
              )}
            </div>
          </>
        ) : (
          <>
            <section className="story-block story-summary">
              <h3>Summary</h3>
              <p>{summary?.text ?? "No sourced summary yet."}</p>
            </section>
            <div className="unverified-story">
              {summary?.kind === "source" && (
                <p className="source-excerpt-label">Wikipedia excerpt · not verified</p>
              )}
              <div className="story-actions">
                <a
                  href={excerpt?.evidence.url || sources[0]?.url || place.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the source <ArrowUpRight size={14} />
                </a>
                {onNarrate && audioNarration(place)?.kind === "source" && (
                  <button className="story-listen" onClick={onNarrate} aria-label={`Listen to source for ${place.name}`}>
                    <Volume2 size={16} />
                    Listen to source
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {Object.entries(place.tags).filter(([key]) =>
          ["start_date", "architect", "operator"].includes(key),
        ).length > 0 && (
          <dl className="place-details">
            {Object.entries(place.tags)
              .filter(([key]) =>
                ["start_date", "architect", "operator"].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {
                      (
                        {
                          start_date: "Date recorded",
                          architect: "Architect",
                          operator: "Operator",
                        } as Record<string, string>
                      )[key]
                    }
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        )}
        <details className="sources">
          <summary>Sources</summary>
          {sources.map((source) => (
            <div key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
                <ArrowUpRight size={13} />
              </a>
              <small>
                {source.sourceType === "search-snippet"
                  ? "Google search excerpt · source page linked"
                  : `${source.license} · retrieved ${source.retrievedAt.slice(0, 10)}`}
              </small>
              {storyClaims
                .filter((c) => c.evidenceId === source.id)
                .map((claim, i) => (
                  <blockquote key={i}>{claim.quote}</blockquote>
                ))}
            </div>
          ))}
          <a href={place.sourceUrl} target="_blank" rel="noreferrer">
            OpenStreetMap contributors · ODbL <ArrowUpRight size={13} />
          </a>
          {story && (
            <small>
              AI evidence check · {story.verifiedAt.slice(0, 10)}. Source
              support does not guarantee historical accuracy.
            </small>
          )}
        </details>
      </div>
      <div className="card-footer">
        <button
          className="text-button"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
        >
          Previous
        </button>
        <span>
          {index + 1} of {total}
        </span>
        <button
          className="text-button"
          disabled={index === total - 1}
          onClick={() => onNavigate(index + 1)}
        >
          Next
        </button>
        <button
          className="text-button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${place.name} from saved discoveries` : `Save ${place.name}`}
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </article>
  );
}
