"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  LocateFixed,
  MapPin,
  Play,
  Search,
  TrainFront,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { routeDistance } from "@/lib/geo";
import type { NetworkConfig } from "@/networks";
import type { Coordinate, RailRoute } from "@/lib/types";
import { Network } from "./network";

type GpsStatus = "idle" | "requesting" | "active" | "denied" | "unavailable" | "flat" | "inaccurate";

export function HomeScreen({
  network,
  routes,
  railLoading,
  hydrated,
  selected,
  onSelect,
  search,
  onSearch,
  allRoutes,
  onAllRoutes,
  sheetOpen,
  onSheetOpen,
  demoLocation,
  onUseDemo,
  onLocate,
  position,
  gpsStatus,
  gpsMessage,
  onStart,
}: {
  network: NetworkConfig;
  routes: RailRoute[];
  railLoading: boolean;
  hydrated: boolean;
  selected: string | null;
  onSelect: (id: string, fromMap?: boolean) => void;
  search: string;
  onSearch: (value: string) => void;
  allRoutes: boolean;
  onAllRoutes: (value: boolean) => void;
  sheetOpen: boolean;
  onSheetOpen: (open: boolean) => void;
  demoLocation: boolean;
  onUseDemo: () => void;
  onLocate: () => void;
  position: Coordinate | null;
  gpsStatus: GpsStatus;
  gpsMessage: string | null;
  onStart: (replay: boolean) => void;
}) {
  const { t, distance } = useI18n();
  const selectionPosition = demoLocation ? network.demo.location : position;
  const ranked = useMemo(
    () =>
      routes
        .map((r) => ({
          route: r,
          distance: selectionPosition ? routeDistance(selectionPosition, r) : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance || a.route.name.localeCompare(b.route.name)),
    [routes, selectionPosition],
  );
  const nearby = ranked.filter((r) => r.distance <= 3000);
  const visibleRoutes = (
    selectionPosition && nearby.length && !allRoutes && !search ? nearby : ranked
  ).filter((r) => r.route.name.toLowerCase().includes(search.toLowerCase()));
  const route = routes.find((r) => r.id === selected);
  const selectedDistance = ranked.find((r) => r.route.id === selected)?.distance;
  const stopsLabel = (item: RailRoute) =>
    network.segments.length && item.stops.length > 1
      ? t("home.stops", { from: item.stops[0].name, to: item.stops[item.stops.length - 1].name })
      : null;
  const shortName = (name: string) => name.replace(" Branch", "");

  return (
    <section className="selection-map-screen" aria-label={t("home.chooseRoute")}>
      <div className="map-topline">
        <h1>{network.name}</h1>
        <button
          className="map-action"
          onClick={() => onStart(true)}
          disabled={!hydrated || railLoading}
          aria-label={t("home.demoStart", { place: network.demo.place })}
          title={t("home.demoLabel", { place: network.demo.place })}
        >
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <div className="selection-map">
        {railLoading ? (
          <div className="network-loading" role="status">{t("app.loading")}</div>
        ) : (
          <Network
            network={network}
            routes={routes}
            selected={selected}
            position={position}
            onSelectRoute={(id) => onSelect(id, true)}
            onLocate={onLocate}
          />
        )}
        <button
          className="map-location-button"
          aria-label={t("home.findNearMe")}
          onClick={onLocate}
          disabled={gpsStatus === "requesting"}
        >
          <LocateFixed size={21} className={gpsStatus === "requesting" ? "spin" : ""} />
        </button>
        {demoLocation && (
          <button className="map-demo-label" onClick={() => onSheetOpen(true)}>
            <MapPin size={14} /> {t("home.demoLabel", { place: network.demo.place })}
          </button>
        )}
      </div>
      <section
        className={`route-sheet ${sheetOpen ? "is-open" : "is-collapsed"}`}
        aria-labelledby="route-sheet-title"
      >
        <button
          className="sheet-handle"
          aria-label={sheetOpen ? t("home.collapse") : t("home.expand")}
          aria-expanded={sheetOpen}
          onClick={() => onSheetOpen(!sheetOpen)}
        >
          <span />
        </button>
        <div className="sheet-heading">
          <h2 id="route-sheet-title">
            {selected && route
              ? shortName(route.name)
              : selectionPosition && nearby.length && !allRoutes
                ? demoLocation
                  ? t("home.routesNear", { place: network.demo.place })
                  : t("home.routesNearYou")
                : t("home.chooseRoute")}
          </h2>
          {selectionPosition && nearby.length > 0 && (
            <button className="text-button" onClick={() => onAllRoutes(!allRoutes)}>
              {allRoutes ? t("home.nearby") : t("home.allRoutes")}
            </button>
          )}
        </div>
        {sheetOpen && (
          <>
            <label className="route-search sheet-search">
              <Search size={20} />
              <input
                type="search"
                aria-label={t("home.searchLabel", { network: network.name })}
                placeholder={t("home.search")}
                value={search}
                onChange={(event) => onSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label={t("home.clearSearch")}
                  onClick={() => onSearch("")}
                >
                  <X size={17} />
                </button>
              )}
            </label>
            {["denied", "unavailable", "inaccurate"].includes(gpsStatus) && gpsMessage && (
              <p className="inline-notice" role="status">{gpsMessage}</p>
            )}
            {route?.serviceNote && <p className="inline-notice">{route.serviceNote}</p>}
            <div className="route-list" role="group" aria-label={t("home.routesGroup", { network: network.name })}>
              {visibleRoutes.map(({ route: item, distance: meters }) => (
                <button
                  key={item.id}
                  className={`route-row ${selected === item.id ? "is-selected" : ""}`}
                  onClick={() => onSelect(item.id)}
                  aria-pressed={selected === item.id}
                >
                  <span className="route-icon">
                    <TrainFront size={22} strokeWidth={1.8} />
                  </span>
                  <span className="route-name">
                    {shortName(item.name)}
                    {stopsLabel(item) && <small>{stopsLabel(item)}</small>}
                    {Number.isFinite(meters) && !network.segments.length && (
                      <small>{t("home.away", { distance: distance(meters) })}</small>
                    )}
                    {item.experience === "full" && network.segments.length > 0 && (
                      <span className="experience-badge">{t("home.fullExperience")}</span>
                    )}
                    {item.experience === "basic" && <small className="experience-basic">{t("home.basicExperience")}</small>}
                  </span>
                  {selected === item.id ? (
                    <span className="route-check">
                      <Check size={17} />
                    </span>
                  ) : (
                    <ChevronRight className="route-chevron" size={19} />
                  )}
                </button>
              ))}
              {!visibleRoutes.length && (
                <p className="no-results">{t("home.noMatch", { query: search })}</p>
              )}
            </div>
            {selected && route && (
              <div className="sheet-selected-route">
                <span className="route-color" style={{ background: route.color }} />
                <span>{shortName(route.name)}</span>
                {selectedDistance !== undefined && selectedDistance > 3000 && Number.isFinite(selectedDistance) && (
                  <small>{t("home.notNearby")}</small>
                )}
              </div>
            )}
            <button
              className="primary-button start-button sheet-start"
              disabled={!selected || !hydrated}
              onClick={() => onStart(false)}
            >
              <span>{t("home.start")}</span>
              <ArrowRight size={19} />
            </button>
            {!demoLocation && (
              <button className="demo-switch" onClick={onUseDemo}>
                {t("home.useDemo", { place: network.demo.place })}
              </button>
            )}
          </>
        )}
      </section>
    </section>
  );
}
