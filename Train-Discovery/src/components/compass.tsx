"use client";

import dynamic from "next/dynamic";
import { Compass as CompassIcon } from "lucide-react";
import type { Coordinate, Place } from "@/lib/types";
import "./compass.css";

const RideMap = dynamic(
  () => import("./ride-map").then((mod) => mod.RideMap),
  {
    ssr: false,
    loading: () => <div className="ride-map ride-map-waiting" />,
  },
);

export function Compass({
  heading,
  position,
  paths = [],
  places = [],
  color,
  liveHeading = true,
  idleLabel,
  settling = false,
  note,
}: {
  heading: number | null;
  position: Coordinate | null;
  paths?: [number, number][][];
  places?: Place[];
  color?: string;
  liveHeading?: boolean;
  idleLabel?: string;
  settling?: boolean;
  note?: string;
}) {
  const direction =
    heading === null
      ? "—"
      : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
          Math.round(heading / 45) % 8
        ];
  const status =
    heading === null
      ? idleLabel ?? "Compass waiting"
      : liveHeading
        ? "Phone direction"
        : "Simulated heading";
  const label =
    heading === null
      ? idleLabel ?? "Waiting for phone compass"
      : liveHeading
        ? `Phone pointing ${Math.round(heading)} degrees`
        : `Simulated heading ${Math.round(heading)} degrees`;
  return (
    <div
      className={`compass-instrument train-compass ${heading === null ? "compass-idle" : "compass-aimed"}${settling ? " compass-settling" : ""}`}
    >
      <div className="compass-topline">
        <CompassIcon size={17} />
        <span className={heading === null && idleLabel ? "aim-label" : undefined}>
          {status}
          <strong>{heading === null ? "—" : `${Math.round(heading)}°`}</strong>
        </span>
        <span className="direction-letter">{direction}</span>
      </div>
      {note ? (
        <p className="aim-status" role="status">
          {note}
        </p>
      ) : null}
      <div className="compass-stage">
        {position ? (
          <RideMap
            position={position}
            heading={heading}
            paths={paths}
            places={places}
            color={color}
            label={label}
          />
        ) : (
          <div className="ride-map ride-map-waiting" role="group" aria-label={label} />
        )}
      </div>
      {heading === null && !idleLabel ? (
        <p className="pointing-instruction">
          Hold your phone upright
        </p>
      ) : null}
    </div>
  );
}
