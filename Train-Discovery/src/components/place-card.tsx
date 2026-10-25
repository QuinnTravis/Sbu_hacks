"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Info,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Volume2,
  X,
} from "lucide-react";
import type { Claim, Photo, QueueEntry } from "@/lib/types";
import type { HistoricImage, PoiContent } from "@/lib/package-types";
import type { Side } from "@/lib/route-geometry";
import { cardSummary } from "@/lib/card-face";
import { useI18n } from "@/lib/i18n";
import { englishBody, lookForLine } from "@/lib/narration-script";
import { audioNarration, narrationText } from "@/lib/narration";
import { ComparisonSlider } from "@/features/history/comparison-slider";
import { features } from "@/lib/features";
import { BookmarkButton } from "./bookmark-button";

export function PlaceCard({
  entry,
  onDiscard,
  index,
  total,
  onNavigate,
  onNarrate,
  bookmarked = false,
  onToggleBookmark,
  content,
  history,
  side = null,
  resolveAsset,
  extra,
}: {
  entry: QueueEntry;
  onDiscard?: () => void;
  index: number;
  total: number;
  onNavigate: (n: number) => void;
  onNarrate?: () => void;
  bookmarked?: boolean;
  onToggleBookmark: () => void;
  /** Checked translation for the rider's language, when one exists. */
  content?: PoiContent;
  history?: HistoricImage;
  side?: Side | null;
  resolveAsset?: (url: string) => string;
  /** More actions, e.g. Explore in 3D. */
  extra?: ReactNode;
}) {
  const { t, code, distance, number } = useI18n();
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
  const storyClaims: Claim[] = story
    ? [...story.claims, ...(story.funFact ? [story.funFact] : []),
      ...[story.narration?.hook, story.narration?.detail, story.narration?.why, story.narration?.lookFor]
        .filter((claim): claim is Claim => Boolean(claim))]
    : [];
  const sources = place.evidence;
  // A checked translation replaces the English text; the sources stay the same.
  const translated = code !== "en" && content?.summary ? content : undefined;
  const englishOnly = code !== "en" && !translated && Boolean(story);
  const lookFor = translated?.lookFor ?? (code === "en" || englishOnly ? englishBody(place)?.lookFor : undefined);
  const basic = place.basic;
  const details = Object.entries(place.tags).filter(([key]) =>
    ["start_date", "architect", "operator"].includes(key),
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
              aria-label={t("card.photoDetails", { name: place.name })}
            >
              <Info size={19} aria-hidden="true" />
            </button>
            <dialog
              ref={photoDialog}
              className="photo-viewer"
              aria-label={t("card.photoOf", { name: place.name })}
              onClick={(event) => {
                if (event.target === event.currentTarget) event.currentTarget.close();
              }}
            >
              <div className="photo-viewer-content">
                <button
                  type="button"
                  className="icon-button photo-viewer-close"
                  onClick={() => photoDialog.current?.close()}
                  aria-label={t("card.closePhoto", { name: place.name })}
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
              {photoState === "loading" ? t("card.loadingPhoto") : t("card.photoUnavailable")}
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
                {t("app.retry")}
              </button>
            )}
          </div>
        )}
        {onDiscard && (
          <button
            className="icon-button discard-button"
            onClick={onDiscard}
            aria-label={t("card.discard", { name: place.name })}
          >
            <X size={19} />
          </button>
        )}
      </div>
      <div className="place-content">
        <div className="place-meta">
          <span>{t(`categories.${place.category}`)}</span>
          {Number.isFinite(entry.distance) && (
            <span>{distance(entry.distance)}</span>
          )}
          {side && <span>{t(`side.${side}`)}</span>}
        </div>
        <h2>{place.name}</h2>
        {story ? (
          <>
            <div className="story-facts">
              <section className="story-block story-summary">
                <h3>{t("card.summary")}</h3>
                {translated ? (
                  <p lang={code}>
                    {translated.summary}{" "}
                    {translated.claims.slice(0, 3).map((claim, i) => claim.evidence[0] ? (
                      <a key={claim.id} href={claim.evidence[0].sourceUrl} target="_blank" rel="noreferrer"
                        aria-label={t("card.claimSource", { index: i + 1 })}>
                        <sup>[{i + 1}]</sup>
                      </a>
                    ) : null)}
                  </p>
                ) : story.claims.length ? (
                  <p lang={englishOnly ? "en" : undefined}>
                    {story.claims.map((claim, i) => (
                      <span key={i}>
                        {claim.text}{" "}
                        <a
                          href={place.evidence.find((e) => e.id === claim.evidenceId)?.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("card.claimSource", { index: i + 1 })}
                        >
                          <sup>[{i + 1}]</sup>
                        </a>{" "}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p>{summary?.text ?? t("card.noSummary")}</p>
                )}
                {englishOnly && <p className="story-language-note">{t("card.englishOnly")}</p>}
              </section>
              {story.funFact && !translated && (
                <section className="story-block story-interesting">
                  <h3>{t("card.interestingFact")}</h3>
                  <p lang={englishOnly ? "en" : undefined}>
                    {story.funFact.text}{" "}
                    <a
                      href={place.evidence.find((e) => e.id === story.funFact?.evidenceId)?.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("card.factSource")}
                    >
                      <sup>[{story.claims.length + 1}]</sup>
                    </a>
                  </p>
                </section>
              )}
              {lookFor && (
                <section className="story-block story-look-for">
                  <h3>{t("card.lookFor")}</h3>
                  <p lang={translated ? code : "en"}>{lookForLine(lookFor, side, translated ? code : "en")}</p>
                </section>
              )}
            </div>
            {onNarrate && narrationText(place) && (
              <div className="story-actions">
                <button className="story-listen" onClick={onNarrate} aria-label={t("card.listenTo", { name: place.name })}>
                  <Volume2 size={16} />
                  {t("card.playStory")}
                </button>
              </div>
            )}
          </>
        ) : summary ? (
          <>
            <section className="story-block story-summary">
              <h3>{t("card.summary")}</h3>
              <p lang="en">{summary.text}</p>
            </section>
            {onNarrate && audioNarration(place) && (
              <div className="story-actions">
                <button className="story-listen" onClick={onNarrate} aria-label={t("card.listenTo", { name: place.name })}>
                  <Volume2 size={16} />
                  {t("card.playStory")}
                </button>
              </div>
            )}
          </>
        ) : basic ? (
          <section className="story-block story-basic">
            <h3>{t("card.basicInfo")}</h3>
            <p>{t(`basicType.${basic.type}`)}</p>
            {(basic.elevationM || basic.population) && (
              <dl className="place-details">
                {basic.elevationM ? (
                  <div>
                    <dt>{t("card.elevation")}</dt>
                    <dd>{number(basic.elevationM)} m</dd>
                  </div>
                ) : null}
                {basic.population && ["town", "city"].includes(basic.type) ? (
                  <div>
                    <dt>{t("card.population")}</dt>
                    <dd>{number(basic.population)}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </section>
        ) : (
          <section className="story-block story-summary">
            <h3>{t("card.summary")}</h3>
            <p>{t("card.noSummary")}</p>
          </section>
        )}
        {features.history && <ComparisonSlider image={history} resolve={resolveAsset} present={
          photo && photoState === "ready" && photo.source === "Wikimedia Commons"
            ? { url: photo.url, credit: photo.authors[0]?.displayName ?? photo.source, license: photo.license?.name ?? photo.source, licenseUrl: photo.license?.url, sourceUrl: photo.sourceUrl }
            : null
        } />}
        {extra}
        {details.length > 0 && (
          <dl className="place-details">
            {details.map(([key, value]) => (
              <div key={key}>
                <dt>{t(`card.detail.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <details className="sources">
          <summary>{t("card.sources")}</summary>
          {sources.map((source) => (
            <div key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
                <ArrowUpRight size={13} />
              </a>
              <small>{t("card.retrieved", { license: source.license, date: source.retrievedAt.slice(0, 10) })}</small>
              {storyClaims
                .filter((c) => c.evidenceId === source.id)
                .map((claim, i) => (
                  <blockquote key={i}>{claim.quote}</blockquote>
                ))}
            </div>
          ))}
          {(basic?.sources ?? []).map((source) => (
            <div key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
                <ArrowUpRight size={13} />
              </a>
              <small>{source.license}</small>
            </div>
          ))}
          {place.sourceUrl.includes("openstreetmap.org") && (
            <a href={place.sourceUrl} target="_blank" rel="noreferrer">
              {t("card.osm")} <ArrowUpRight size={13} />
            </a>
          )}
        </details>
      </div>
      <div className="card-footer">
        <button
          className="text-button"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
        >
          {t("card.previous")}
        </button>
        <span>{t("card.position", { index: index + 1, total })}</span>
        <button
          className="text-button"
          disabled={index === total - 1}
          onClick={() => onNavigate(index + 1)}
        >
          {t("card.next")}
        </button>
        <BookmarkButton name={place.name} bookmarked={bookmarked} onToggle={onToggleBookmark} />
      </div>
    </article>
  );
}
