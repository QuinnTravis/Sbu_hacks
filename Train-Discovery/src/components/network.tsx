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
