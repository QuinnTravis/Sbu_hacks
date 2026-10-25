"use client";

import { Binoculars, Bookmark, Route as RouteIcon, Settings2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type Tab = "ride" | "discoveries" | "bookmarks" | "settings";

export function BottomNav({
  tab,
  onTab,
  discoveries,
  bookmarks,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Ride queue size, or null before a ride. */
  discoveries: number | null;
  bookmarks: number;
}) {
  const { t } = useI18n();
  const items: { id: Tab; label: string; icon: React.ReactNode; count?: number | null }[] = [
    { id: "ride", label: t("nav.ride"), icon: <RouteIcon size={25} strokeWidth={1.8} /> },
    { id: "discoveries", label: t("nav.discoveries"), icon: <Binoculars size={25} strokeWidth={1.8} />, count: discoveries },
    { id: "bookmarks", label: t("nav.bookmarks"), icon: <Bookmark size={25} strokeWidth={1.8} />, count: bookmarks || null },
    { id: "settings", label: t("nav.settings"), icon: <Settings2 size={25} strokeWidth={1.8} /> },
  ];
  return (
    <nav className="floating-nav app-nav" aria-label={t("nav.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={tab === item.id ? "page" : undefined}
          onClick={() => onTab(item.id)}
        >
          <span className="nav-icon">
            {item.icon}
            {item.count !== undefined && item.count !== null && (
              <span className="nav-count" aria-hidden="true">{item.count}</span>
            )}
          </span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
