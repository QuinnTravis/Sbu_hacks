"use client";

import type { Coordinate, RailRoute } from "@/lib/types";
import type { NetworkConfig } from "@/networks";
import { useI18n } from "@/lib/i18n";
import "./network.css";

const WIDTH = 830;

/**
 * The network's own route geometry, drawn directly: no tile key, external map
 * SDK, or tracking. The projection comes from the network's bounds, stretched
 * north-south so a long east-west line stays readable.
 */
export function Network({
  network,
  routes,
  selected,
  position,
  onSelectRoute,
  onLocate,
}: {
  network: NetworkConfig;
  routes: RailRoute[];
  selected: string | null;
  position: Coordinate | null;
  onSelectRoute?: (id: string) => void;
  onLocate?: () => void;
}) {
  const { t } = useI18n();
  const { bounds, verticalScale, regionLabels, stationLabels } = network.map;
  const kx = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180);
  const scale = WIDTH / ((bounds.maxLon - bounds.minLon) * kx);
  const height = (bounds.maxLat - bounds.minLat) * verticalScale * scale;
  const project = (lat: number, lon: number) => [
    (lon - bounds.minLon) * kx * scale,
    (bounds.maxLat - lat) * verticalScale * scale,
  ];
  const stations = [
    ...new Map(
      routes
        .flatMap((route) => route.stops)
        .filter((stop) => stationLabels.includes(stop.id))
        .map((stop) => [stop.id, stop]),
    ).values(),
  ].sort((a, b) => a.lon - b.lon);
  const full = new Set(routes.filter((route) => route.experience === "full").map((route) => route.id));
  return (
    <div className="network-wrap train-network-wrap">
      <svg
        className="network train-network-map"
        viewBox={`0 0 ${WIDTH} ${Math.round(height)}`}
        role="group"
        aria-label={t("home.mapLabel", { network: network.name })}
      >
        {regionLabels.map((label) => {
          const [x, y] = project(label.lat, label.lon);
          return (
            <text key={label.text} className="water-label train-network-waterLabel" x={x} y={y} textAnchor="middle">
              {label.text}
            </text>
          );
        })}
        {routes.map((route) => (
          <g
            key={route.id}
            className={`network-route train-network-route${full.has(route.id) && network.segments.length ? " is-full" : ""}`}
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
                .map(([lat, lon]) => project(lat, lon).map((n) => n.toFixed(1)).join(","))
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
        {stations.map((stop, index) => {
          const [x, y] = project(stop.lat, stop.lon);
          const last = index === stations.length - 1;
          // Alternate above and below the line so neighbors on a long line do not collide.
          const below = network.segments.length > 0 && index % 2 === 1;
          return (
            <g key={stop.id} className="station-label train-network-station">
              <circle cx={x} cy={y} r="3.3" />
              <text
                x={x + (last ? -7 : 7)}
                y={below ? y + 20 : y - 9}
                textAnchor={last ? "end" : "start"}
              >
                {stop.name.replace(" Station", "")}
              </text>
            </g>
          );
        })}
        {position &&
          (() => {
            const [x, y] = project(position.lat, position.lon);
            return x >= 0 && x <= WIDTH && y >= 0 && y <= height ? (
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
        <span>{network.name}</span>
        <span>{network.map.caption}</span>
      </div>
    </div>
  );
}
