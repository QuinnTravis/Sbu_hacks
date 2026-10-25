"use client";

import { useState } from "react";
import { ArrowLeft, Bookmark, Copy, Download, MapPin, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { etaSeconds, kmAhead, type Direction } from "@/lib/route-geometry";
import { NETWORKS, isNetworkId } from "@/networks";
import type { Thumbnail } from "@/lib/package-types";
import type { RailRoute, SavedEntry } from "@/lib/types";

export type BookmarkStatus = "upcoming" | "passed" | "discovered" | null;

/** Upcoming or passed on the current ride, or discovered (pointed at or heard). */
export function bookmarkStatus(
  entry: SavedEntry,
  ride: { routeId: string; km: number | null; direction: Direction | null; discoveredIds: ReadonlySet<string> } | null,
): BookmarkStatus {
  if (entry.discoveredAt || ride?.discoveredIds.has(entry.place.id)) return "discovered";
  if (!ride || ride.km === null || !ride.direction || typeof entry.place.routeKm !== "number") return null;
  if (!entry.place.routeIds.includes(ride.routeId)) return null;
  return kmAhead(entry.place.routeKm, ride.km, ride.direction) > 0 ? "upcoming" : "passed";
}

export function exportBookmarksText(entries: SavedEntry[], routeName: (id?: string) => string): string {
  return entries
    .map((entry) => [
      entry.place.name,
      entry.place.category,
      routeName(entry.routeId),
      typeof entry.place.routeKm === "number" ? `km ${entry.place.routeKm.toFixed(1)}` : null,
      entry.place.sourceUrl,
    ].filter(Boolean).join(" — "))
    .join("\n");
}

export function exportBookmarksJson(entries: SavedEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      poiId: entry.place.id,
      routeId: entry.routeId ?? entry.place.routeIds[0] ?? null,
      networkId: entry.networkId ?? null,
      createdAt: new Date(entry.savedAt).toISOString(),
      ...(entry.note ? { note: entry.note } : {}),
      name: entry.place.name,
      category: entry.place.category,
      lat: entry.place.lat,
      lon: entry.place.lon,
      source: entry.place.sourceUrl,
    })),
    null,
    2,
  );
}

export function BookmarksScreen({
  entries,
  routes,
  ride,
  thumbnails,
  onOpen,
  onRemove,
  renderCard,
}: {
  entries: SavedEntry[];
  routes: RailRoute[];
  ride: { routeId: string; km: number | null; direction: Direction | null; speedKmh: number | null; discoveredIds: ReadonlySet<string> } | null;
  thumbnails: Record<string, Thumbnail>;
  onOpen?: (entry: SavedEntry) => void;
  onRemove: (entry: SavedEntry) => void;
  /** Renders the full discovery card for an opened bookmark. */
  renderCard: (entry: SavedEntry, index: number, close: () => void) => React.ReactNode;
}) {
  const { t, plural, duration } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const routeName = (id?: string) => routes.find((route) => route.id === id)?.name ?? "";
  const groups = new Map<string, SavedEntry[]>();
  for (const entry of entries) {
    const network = isNetworkId(entry.networkId) ? NETWORKS[entry.networkId] : null;
    const name = routeName(entry.routeId);
    const key = network ? (name ? `${network.name} · ${name}` : network.name) : t("bookmarks.otherNetwork");
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const opened = openId ? entries.findIndex((entry) => entry.place.id === openId) : -1;
  if (opened >= 0) {
    return (
      <section className="bookmarks-screen" aria-label={t("bookmarks.title")}>
        <button type="button" className="text-button back-button" onClick={() => setOpenId(null)}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("bookmarks.title")}
        </button>
        {renderCard(entries[opened], opened, () => setOpenId(null))}
      </section>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportBookmarksText(entries, routeName));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportBookmarksJson(entries)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "gaze-bookmarks.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="bookmarks-screen" aria-labelledby="bookmarks-title">
      <div className="screen-heading">
        <h1 id="bookmarks-title">{t("bookmarks.title")}</h1>
      </div>
      {entries.length === 0 ? (
        <div className="home-discoveries-card">
          <span className="empty-window" aria-hidden="true">
            <Bookmark size={31} strokeWidth={1.5} />
          </span>
          <h2>{t("bookmarks.empty")}</h2>
        </div>
      ) : (
        <>
          {[...groups].map(([group, items]) => (
            <section key={group} className="bookmark-group" aria-label={group}>
              <h2>{group}</h2>
              <ul className="bookmark-list">
                {items.map((entry) => {
                  const status = bookmarkStatus(entry, ride);
                  const eta = status === "upcoming" && ride?.km !== null && ride?.direction && typeof entry.place.routeKm === "number"
                    ? etaSeconds(entry.place.routeKm, ride.km!, ride.direction, ride.speedKmh)
                    : null;
                  const thumb = thumbnails[entry.place.id];
                  return (
                    <li key={entry.place.id} className="bookmark-row">
                      <button
                        type="button"
                        className="bookmark-open"
                        onClick={() => {
                          setOpenId(entry.place.id);
                          onOpen?.(entry);
                        }}
                        aria-label={t("bookmarks.open", { name: entry.place.name })}
                      >
                        {thumb ? (
                          // Commons thumbnail; credited on the opened card.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb.url} alt="" className="bookmark-thumb" referrerPolicy="no-referrer" loading="lazy" />
                        ) : (
                          <span className="bookmark-thumb is-empty" aria-hidden="true">
                            <MapPin size={18} />
                          </span>
                        )}
                        <span className="bookmark-copy">
                          <span className="bookmark-name">{entry.place.name}</span>
                          <span className="bookmark-meta">
                            {t(`categories.${entry.place.category}`)}
                            {typeof entry.place.routeKm === "number" && ` · ${t("bookmarks.kmMark", { km: Math.round(entry.place.routeKm) })}`}
                            {eta !== null && eta > 0 && ` · ${t("bookmarks.in", { eta: duration(eta) })}`}
                          </span>
                        </span>
                        {status && <span className={`status-pill is-${status}`}>{t(`bookmarks.status.${status}`)}</span>}
                      </button>
                      <button
                        type="button"
                        className="icon-button bookmark-remove"
                        onClick={() => onRemove(entry)}
                        aria-label={t("bookmarks.remove", { name: entry.place.name })}
                      >
                        <X size={17} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="bookmark-export" role="group" aria-label={t("bookmarks.export")}>
            <span>{plural("bookmarks.count", entries.length)}</span>
            <button type="button" className="secondary-button" onClick={copy}>
              <Copy size={15} aria-hidden="true" />
              {copyState === "copied" ? t("bookmarks.copied") : t("bookmarks.copy")}
            </button>
            <button type="button" className="secondary-button" onClick={download}>
              <Download size={15} aria-hidden="true" />
              {t("bookmarks.download")}
            </button>
          </div>
          {copyState === "failed" && <p className="inline-notice" role="status">{t("bookmarks.copyFailed")}</p>}
        </>
      )}
    </section>
  );
}
