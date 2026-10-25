"use client";

import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, MapPin } from "lucide-react";
import { BookmarkButton } from "@/components/bookmark-button";
import { useI18n } from "@/lib/i18n";
import type { Side } from "@/lib/route-geometry";
import type { Thumbnail } from "@/lib/package-types";
import type { Place } from "@/lib/types";
import type { LookAheadCue } from "./cues";

export function SideIcon({ side, size = 20 }: { side: Side | null; size?: number }) {
  if (side === "left") return <ArrowLeft size={size} aria-hidden="true" />;
  if (side === "right") return <ArrowRight size={size} aria-hidden="true" />;
  if (side === "ahead") return <ArrowUp size={size} aria-hidden="true" />;
  if (side === "both") return <ArrowLeftRight size={size} aria-hidden="true" />;
  return <MapPin size={size} aria-hidden="true" />;
}

/** The floating pill for the next highlight. Tapping it opens the place. */
export function LookAheadBanner({
  cue,
  place,
  thumbnail,
  bookmarked,
  hasHistory,
  onOpen,
  onToggleBookmark,
}: {
  cue: LookAheadCue;
  place: Place;
  thumbnail?: Thumbnail;
  bookmarked: boolean;
  hasHistory?: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
}) {
  const { t, duration } = useI18n();
  const when = cue.phase === "now"
    ? t("lookAhead.now")
    : cue.etaSeconds === null
      ? t("lookAhead.whenMoving")
      : t("lookAhead.eta", { eta: duration(cue.etaSeconds) });
  const side = t(`side.${cue.side ?? "unknown"}`);
  return (
    <section className={`look-ahead${cue.phase === "now" ? " is-now" : ""}`} aria-label={t("lookAhead.region")}>
      <button type="button" className="look-ahead-open" onClick={onOpen} aria-label={`${t("lookAhead.open", { name: place.name })}. ${when}, ${side}.`}>
        <span className="look-ahead-side" data-side={cue.side ?? "unknown"}>
          <SideIcon side={cue.side} />
        </span>
        <span className="look-ahead-copy">
          <span className="look-ahead-when">
            {when} · <strong>{side}</strong>
          </span>
          <span className="look-ahead-name">{place.name}</span>
          {bookmarked && <span className="look-ahead-saved">{t("lookAhead.saved")}</span>}
          {hasHistory && <span className="look-ahead-saved">{t("history.title")}</span>}
        </span>
        {thumbnail && (
          // Commons thumbnails are credited on the card this banner opens.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="look-ahead-thumb" src={thumbnail.url} alt="" referrerPolicy="no-referrer" loading="lazy" />
        )}
      </button>
      <BookmarkButton compact name={place.name} bookmarked={bookmarked} onToggle={onToggleBookmark} />
    </section>
  );
}
