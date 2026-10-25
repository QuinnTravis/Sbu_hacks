"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Direction, Facing } from "@/lib/route-geometry";
import type { Place } from "@/lib/types";
import { sideAdvice, sideBalance, type SideTally, type Timetable } from "./advisor";
import { SideBalanceStrip } from "./progress-track";
import { SideIcon } from "./look-ahead-banner";

/** "Best side to sit": highlights per side for the leg from here to the end of the segment. */
export function AdvisorSheet({
  places,
  fromKm,
  totalKm,
  direction,
  facing,
  bookmarked,
  timetable,
  ends,
  loading,
  preRide,
  onDirection,
  onFacing,
  onStart,
  onClose,
}: {
  places: Place[];
  fromKm: number;
  totalKm: number;
  direction: Direction | null;
  facing: Facing;
  bookmarked: ReadonlySet<string>;
  timetable: Timetable;
  /** Stop names at km 0 and at the far end. */
  ends: { start: string; end: string };
  loading: boolean;
  /** Shown before the ride starts: offers Start ride. */
  preRide: boolean;
  onDirection?: (direction: Direction) => void;
  onFacing: (facing: Facing) => void;
  onStart?: () => void;
  onClose: () => void;
}) {
  const { t, plural, duration } = useI18n();
  const sheet = useRef<HTMLDivElement>(null);
  const toKm = direction === -1 ? 0 : totalKm;
  const advice = useMemo(
    () => (direction ? sideAdvice(places, { fromKm, toKm, direction, facing }, bookmarked, timetable) : null),
    [places, fromKm, toKm, direction, facing, bookmarked, timetable],
  );
  const bins = useMemo(
    () => (direction ? sideBalance(places, { fromKm: 0, toKm: totalKm, facing, direction }, 14, bookmarked) : []),
    [places, totalKm, facing, direction, bookmarked],
  );

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const column = (side: "left" | "right", tally: SideTally) => (
    <section className="advisor-side" aria-label={t(`advisor.better.${side}`)}>
      <h3>
        <SideIcon side={side} size={17} />
        {t(`advisor.better.${side}`)}
        <span className="advisor-count">{plural("advisor.highlights", tally.count)}</span>
      </h3>
      {tally.top.length ? (
        <ol>
          {tally.top.map((pick) => (
            <li key={pick.place.id}>
              <span>{pick.place.name}</span>
              <small>
                {pick.minutesIn === null
                  ? ""
                  : pick.minutesIn < 3
                    ? t("advisor.atStart")
                    : t("advisor.timeIn", { time: duration(pick.minutesIn * 60) })}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="advisor-none">{t("advisor.none")}</p>
      )}
    </section>
  );

  return (
    <div className="sheet-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={sheet} className="advisor-sheet" role="dialog" aria-modal="true" aria-labelledby="advisor-title">
        <div className="advisor-head">
          <h2 id="advisor-title">{t("advisor.title")}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("app.close")}>
            <X size={18} />
          </button>
        </div>
        {onDirection && (
          <div className="segmented" role="group" aria-label={t("advisor.direction")}>
            {([1, -1] as Direction[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => onDirection(value)}
              >
                {t("advisor.toward", { stop: value === 1 ? ends.end : ends.start })}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <p className="advisor-loading" role="status">{t("ride.loadingPlaces")}</p>
        ) : !direction || !advice ? (
          <p className="advisor-loading" role="status">{t("advisor.unknownDirection")}</p>
        ) : (
          <>
            <div className="advisor-verdict" role="status">
              <span className="advisor-verdict-icon" aria-hidden="true">
                <SideIcon side={advice.better === "even" ? "both" : advice.better} size={26} />
              </span>
              <div>
                <strong>{t(`advisor.better.${advice.better}`)}</strong>
                <span>
                  {advice.better === "even"
                    ? t("advisor.evenHint")
                    : `${plural("advisor.highlights", advice[advice.better].count)} · ${t("advisor.versus", {
                        side: t(`advisor.better.${advice.better === "left" ? "right" : "left"}`),
                        count: advice[advice.better === "left" ? "right" : "left"].count,
                      })}`}
                </span>
              </div>
            </div>
            <SideBalanceStrip bins={bins} totalKm={totalKm} label={t("advisor.balance")} />
            <div className="advisor-columns">
              {column("left", advice.left)}
              {column("right", advice.right)}
            </div>
            {timetable.length > 1 && <p className="advisor-note">{t("advisor.byTimetable")}</p>}
          </>
        )}
        <p className="advisor-note">{t("advisor.facingNote")}</p>
        <div className="segmented" role="group" aria-label={t("advisor.facing")}>
          {(["forward", "backward"] as Facing[]).map((value) => (
            <button key={value} type="button" aria-pressed={facing === value} onClick={() => onFacing(value)}>
              {t(`settings.${value}`)}
            </button>
          ))}
        </div>
        {preRide && onStart ? (
          <button type="button" className="primary-button advisor-start" onClick={onStart} data-autofocus>
            <span>{t("advisor.start")}</span>
            <ArrowRight size={19} />
          </button>
        ) : (
          <button type="button" className="secondary-button advisor-start" onClick={onClose} data-autofocus>
            {t("app.close")}
          </button>
        )}
      </div>
    </div>
  );
}
