"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/lib/i18n";
import type { HistoricImage } from "@/lib/package-types";
import "./comparison-slider.css";

type Frame = { url: string; credit: string; license: string; licenseUrl?: string; sourceUrl: string; focal?: { x: number; y: number; scale: number } };

function frameStyle(focal?: Frame["focal"]): CSSProperties {
  if (!focal) return {};
  return {
    objectPosition: `${focal.x * 100}% ${focal.y * 100}%`,
    transform: focal.scale && focal.scale !== 1 ? `scale(${focal.scale})` : undefined,
    transformOrigin: `${focal.x * 100}% ${focal.y * 100}%`,
  };
}

/**
 * Past and present over the same frame. Drag the handle, use the arrow keys,
 * or the Show past / Show present toggle. Hidden entirely without a historic image.
 */
export function ComparisonSlider({
  image,
  present,
  resolve = (url) => url,
}: {
  image: HistoricImage | undefined;
  /** A modern photo when the historic record has no curated one. */
  present?: Frame | null;
  /** Maps an image URL to a cached copy when offline. */
  resolve?: (url: string) => string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  if (!image) return null;
  const today: Frame | null = image.present ?? present ?? null;
  const pastLabel = image.yearLabel;
  const set = (next: number) => setValue(Math.max(0, Math.min(100, Math.round(next))));
  const fromPointer = (clientX: number) => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    set(((clientX - rect.left) / rect.width) * 100);
  };
  const credit = (frame: Frame, label: string) => (
    <li>
      <span className="history-credit-label">{label}</span>{" "}
      <a href={frame.sourceUrl} target="_blank" rel="noreferrer">{frame.credit}</a>
      {" · "}
      {frame.licenseUrl ? (
        <a href={frame.licenseUrl} target="_blank" rel="noreferrer">{frame.license}</a>
      ) : (
        frame.license
      )}
    </li>
  );

  return (
    <figure className="history-figure">
      <figcaption className="history-heading">{t("history.title")}</figcaption>
      {today ? (
        <>
          <div
            ref={stage}
            className="history-stage"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              fromPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event.clientX);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          >
            {/* Both images are attributed below; archival scans are served as-is. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="history-present" src={resolve(today.url)} alt={`${image.caption} — ${t("history.present")}`} style={frameStyle(today.focal)} draggable={false} referrerPolicy="no-referrer" />
            <div className="history-past" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolve(image.url)} alt={`${image.caption} — ${pastLabel}`} style={frameStyle(image.focal)} draggable={false} referrerPolicy="no-referrer" />
            </div>
            <span className="history-tag is-past" aria-hidden="true">{pastLabel}</span>
            <span className="history-tag is-present" aria-hidden="true">{t("history.present")}</span>
            <div
              className="history-handle"
              style={{ left: `${value}%` }}
              role="slider"
              tabIndex={0}
              aria-label={t("history.slider", { year: pastLabel })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
              aria-valuetext={`${value}% ${pastLabel}, ${100 - value}% ${t("history.present")}`}
              onKeyDown={(event) => {
                const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[event.key];
                if (step !== undefined) {
                  event.preventDefault();
                  set(value + step);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  set(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  set(100);
                }
              }}
            >
              <span className="history-knob" aria-hidden="true" />
            </div>
          </div>
          <div className="segmented history-toggle" role="group" aria-label={t("history.title")}>
            <button type="button" aria-pressed={value === 100} onClick={() => set(100)}>
              {t("history.showPast")}
            </button>
            <button type="button" aria-pressed={value === 0} onClick={() => set(0)}>
              {t("history.showPresent")}
            </button>
          </div>
        </>
      ) : (
        <div className="history-stage is-single">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolve(image.url)} alt={`${image.caption} — ${pastLabel}`} style={frameStyle(image.focal)} referrerPolicy="no-referrer" />
          <span className="history-tag is-past">{pastLabel}</span>
        </div>
      )}
      <p className="history-caption">{image.caption}</p>
      <ul className="history-credits">
        {credit(image, pastLabel)}
        {today && credit(today, t("history.present"))}
      </ul>
    </figure>
  );
}
