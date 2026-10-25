"use client";

import type { Coordinate, RailRoute } from "@/lib/types";
import "./network.css";

export function Network({
  routes,
  selected,
  position,
  onSelectRoute,
  onLocate,
}: {
  routes: RailRoute[];
  selected: string | null;
  position: Coordinate | null;
  onSelectRoute?: (id: string) => void;
  onLocate?: () => void;
}) {
  // Draw the MTA route geometry directly: no tile key, external map SDK, or tracking.
  const project = (lat: number, lon: number) => [
    (lon + 74.06) * 350,
    (41.04 - lat) * 490,
  ];
  const names = [
    "Penn Station",
    "Jamaica",
    "Hicksville",
    "Stony Brook",
    "Montauk",
    "Greenport",
    "Port Washington",
    "Long Beach",
  ];
  const stations = [
    ...new Map(
      routes
        .flatMap((route) => route.stops)
        .filter((stop) => names.includes(stop.name))
        .map((stop) => [stop.name, stop]),
    ).values(),
  ];
  return (
    <div className="network-wrap train-network-wrap">
      <svg
        className="network train-network-map"
        viewBox="0 -55 830 385"
        role="group"
        aria-label="Interactive LIRR route map"
      >
        <g className="train-network-geography" aria-hidden="true">
          <path
            className="train-network-land"
            d="M-150 28 C-89 31 -34 45 20 62 C48 70 69 82 95 84 C127 87 151 78 181 68 C207 58 231 49 257 55 C282 61 301 65 327 53 C356 40 381 31 409 37 C441 43 458 42 485 34 C516 25 541 29 566 22 C606 11 635 3 668 -6 C706 -17 735 -33 755 -40 C768 -17 760 10 746 31 C729 57 699 77 665 90 C626 106 590 117 551 128 C514 139 480 145 443 151 C399 158 363 169 322 178 C283 187 247 191 209 198 C170 205 133 213 99 224 C62 235 28 244 -9 248 C-42 251 -87 244 -150 238 Z"
          />
          <path
            className="train-network-coast"
            d="M-150 28 C-89 31 -34 45 20 62 C48 70 69 82 95 84 C127 87 151 78 181 68 C207 58 231 49 257 55 C282 61 301 65 327 53 C356 40 381 31 409 37 C441 43 458 42 485 34 C516 25 541 29 566 22 C606 11 635 3 668 -6 C706 -17 735 -33 755 -40 C768 -17 760 10 746 31 C729 57 699 77 665 90 C626 106 590 117 551 128 C514 139 480 145 443 151 C399 158 363 169 322 178 C283 187 247 191 209 198 C170 205 133 213 99 224 C62 235 28 244 -9 248 C-42 251 -87 244 -150 238"
          />
        </g>
        <text className="water-label train-network-waterLabel" x="450" y="26">
          LONG ISLAND SOUND
        </text>
        <text className="water-label train-network-waterLabel" x="375" y="303">
          ATLANTIC OCEAN
        </text>
        {routes.map((route) => (
          <g
            key={route.id}
            className="network-route train-network-route"
            role={onSelectRoute ? "button" : undefined}
            tabIndex={onSelectRoute ? 0 : undefined}
            aria-label={onSelectRoute ? `Select ${route.name}` : undefined}
            aria-pressed={onSelectRoute ? selected === route.id : undefined}
            onClick={() => onSelectRoute?.(route.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectRoute?.(route.id);
              }
            }}
            opacity={
              selected && selected !== route.id
                ? 0.32
                : selected === route.id
                  ? 1
                  : 0.72
            }
          >
            {route.paths.map((path, index) => {
              const points = path
                .map(([lat, lon]) => project(lat, lon).join(","))
                .join(" ");
              return (
                <g key={index}>
                  {onSelectRoute && (
                    <polyline
                      className="network-route-hit train-network-routeHit"
                      points={points}
                    />
                  )}
                  <polyline
                    className="train-network-routeOutline"
                    points={points}
                    aria-hidden="true"
                  />
                  <polyline
                    className="network-route-line train-network-routeLine"
                    points={points}
                    fill="none"
                    stroke={route.color}
                    strokeWidth={selected === route.id ? 4.2 : 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </g>
        ))}
        {stations.map((stop) => {
          const [x, y] = project(stop.lat, stop.lon);
          return (
            <g key={stop.id} className="station-label train-network-station">
              <circle cx={x} cy={y} r="3.3" />
              <text
                x={x + (stop.name === "Montauk" ? -7 : 7)}
                y={y - (stop.name === "Port Washington" ? 18 : 9)}
                textAnchor={stop.name === "Montauk" ? "end" : "start"}
              >
                {stop.name.replace(" Station", "")}
              </text>
            </g>
          );
        })}
        {position &&
          (() => {
            const [x, y] = project(position.lat, position.lon);
            return x >= 0 && x <= 830 && y >= -55 && y <= 330 ? (
              <g
                className={`${onLocate ? "network-user" : ""} train-network-user`}
                role={onLocate ? "button" : undefined}
                tabIndex={onLocate ? 0 : undefined}
                aria-label={onLocate ? "Show routes near me" : undefined}
                onClick={() => onLocate?.()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onLocate?.();
                  }
                }}
              >
                {onLocate && (
                  <circle
                    className="train-network-locationHit"
                    cx={x}
                    cy={y}
                    r="22"
                  />
                )}
                <circle
                  className="train-network-locationFocus"
                  cx={x}
                  cy={y}
                  r="12"
                />
                <circle
                  className="location-halo train-network-locationHalo"
                  cx={x}
                  cy={y}
                  r="15"
                />
                <circle className="location-dot" cx={x} cy={y} r="6" />
              </g>
            ) : null;
          })()}
      </svg>
      <div className="network-caption">
        <span>LIRR</span>
        <span>New York · Long Island</span>
      </div>
    </div>
  );
}
