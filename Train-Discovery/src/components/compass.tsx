"use client";

import { Compass as CompassIcon } from "lucide-react";
import { angleDelta, bearing, distance, formatDistance } from "@/lib/geo";
import type { Coordinate, Place } from "@/lib/types";

export function Compass({
  heading,
  position,
  places,
}: {
  heading: number | null;
  position: Coordinate | null;
  places: Place[];
}) {
  const near = position
    ? places
        .map((place) => ({
          place,
          distance: distance(position, place),
          angle: angleDelta(bearing(position, place), heading ?? 0),
        }))
        .filter((p) => p.distance < 1200)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12)
    : [];
  const direction =
    heading === null
      ? "—"
      : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
          Math.round(heading / 45) % 8
        ];
  return (
    <div
      className={`compass-instrument ${heading === null ? "compass-idle" : ""}`}
    >
      <div className="compass-topline">
        <CompassIcon size={17} />
        <span>
          {heading === null ? "Compass waiting" : "Phone direction"}
          <strong>{heading === null ? "—" : `${Math.round(heading)}°`}</strong>
        </span>
        <span className="direction-letter">{direction}</span>
      </div>
      <svg
        className="compass-dial"
        viewBox="0 0 360 340"
        role="img"
        aria-label={
          heading === null
            ? "Waiting for phone compass"
            : `Phone pointing ${Math.round(heading)} degrees, ${near.length} places nearby`
        }
      >
        <circle className="dial-ring" cx="180" cy="170" r="132" />
        <circle className="dial-ring inner" cx="180" cy="170" r="88" />
        <circle className="dial-ring inner" cx="180" cy="170" r="44" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * Math.PI) / 30;
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              className="dial-tick"
              x1={180 + Math.sin(a) * (major ? 139 : 143)}
              y1={170 - Math.cos(a) * (major ? 139 : 143)}
              x2={180 + Math.sin(a) * 148}
              y2={170 - Math.cos(a) * 148}
            />
          );
        })}
        <path
          className="view-cone"
          d="M180 170 L130.55 47.6 A132 132 0 0 1 229.45 47.6 Z"
        />
        {["N", "E", "S", "W"].map((letter, i) => {
          const a = ((i * 90 - (heading ?? 0)) * Math.PI) / 180;
          return (
            <text
              className="cardinal"
              key={letter}
              x={180 + Math.sin(a) * 115}
              y={175 - Math.cos(a) * 115}
              textAnchor="middle"
            >
              {letter}
            </text>
          );
        })}
        {near.map(({ place, distance: meters, angle }) => {
          const a = (angle * Math.PI) / 180,
            r = Math.max(24, Math.min(125, (meters / 1200) * 125));
          return (
            <circle
              key={place.id}
              className={
                heading !== null && Math.abs(angle) <= 22
                  ? "poi-dot aligned"
                  : "poi-dot"
              }
              cx={180 + Math.sin(a) * r}
              cy={170 - Math.cos(a) * r}
              r={Math.abs(angle) <= 22 && heading !== null ? 5 : 3.5}
            >
              <title>
                {place.name} · {formatDistance(meters)}
              </title>
            </circle>
          );
        })}
        <circle className="dial-center" cx="180" cy="170" r="9" />
        <path d="m180 145-5 9h10Z" className="dial-arrow" />
        <text className="dial-range" x="180" y="333" textAnchor="middle">
          1.2 km range
        </text>
      </svg>
      <p className="pointing-instruction">
        {heading === null
          ? "Hold your phone upright"
          : "Point. Discover. Keep."}
      </p>
    </div>
  );
}
