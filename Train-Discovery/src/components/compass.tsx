"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Compass as CompassIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Coordinate, Place } from "@/lib/types";
import "./compass.css";

const RideMap = dynamic(
  () => import("./ride-map").then((mod) => mod.RideMap),
  {
    ssr: false,
    loading: () => <div className="ride-map ride-map-waiting" />,
  },
);

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function Compass({
  heading,
  position,
  paths = [],
  places = [],
  color,
  liveHeading = true,
  idleLabel,
  settling = false,
  radius,
  overlay,
}: {
  heading: number | null;
  position: Coordinate | null;
  paths?: [number, number][][];
  places?: Place[];
  color?: string;
  liveHeading?: boolean;
  idleLabel?: string;
  settling?: boolean;
  radius?: number;
  /** Floats over the top of the map, e.g. the look-ahead pill. */
  overlay?: ReactNode;
}) {
  const { t } = useI18n();
  const direction =
    heading === null
      ? "—"
      : t(`compass.cardinal.${CARDINALS[Math.round(heading / 45) % 8]}`);
  const degrees = heading === null ? 0 : Math.round(heading);
  const status =
    heading === null
      ? idleLabel ?? t("compass.waiting")
      : liveHeading
        ? t("compass.phone")
        : t("compass.simulated");
  const label =
    heading === null
      ? idleLabel ?? t("compass.waitingPhone")
      : liveHeading
        ? t("compass.phoneLabel", { degrees })
        : t("compass.simulatedLabel", { degrees });
  return (
    <div
      className={`compass-instrument train-compass ${heading === null ? "compass-idle" : "compass-aimed"}${settling ? " compass-settling" : ""}`}
    >
      <div className="compass-topline">
        <CompassIcon size={17} />
        <span className={heading === null && idleLabel ? "aim-label" : undefined}>
          {status}
          <strong>{heading === null ? "—" : `${degrees}°`}</strong>
        </span>
        <span className="direction-letter">{direction}</span>
      </div>
      <div className="compass-stage">
        {overlay ? <div className="compass-overlay">{overlay}</div> : null}
        {position ? (
          <RideMap
            position={position}
            heading={heading}
            paths={paths}
            places={places}
            color={color}
            label={label}
            radius={radius}
          />
        ) : (
          <div className="ride-map ride-map-waiting" role="group" aria-label={label} />
        )}
      </div>
      {heading === null && !idleLabel ? (
        <p className="pointing-instruction">
          {t("compass.holdUpright")}
        </p>
      ) : null}
    </div>
  );
}
