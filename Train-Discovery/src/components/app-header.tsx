"use client";

import Link from "next/link";
import { Info, SlidersHorizontal, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";

export function AppHeader({
  badge,
  online,
  devOpen,
  onToggleDev,
}: {
  badge: string;
  online: boolean;
  devOpen: boolean;
  onToggleDev: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="app-header">
      <Link className="brand" href="/" aria-label={t("app.home")}>
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span className="brand-word">Gaze</span>
      </Link>
      <div className="header-right">
        <button
          className="header-link dev-toggle"
          onClick={onToggleDev}
          aria-label={devOpen ? t("header.closeDev") : t("header.openDev")}
          aria-expanded={devOpen}
          title={t("header.devTitle")}
        >
          <SlidersHorizontal size={19} />
        </button>
        <span className="rail-badge">{badge}</span>
        {!online && (
          <span className="offline-label">
            <WifiOff size={14} aria-hidden="true" />
            {t("header.offline")}
          </span>
        )}
        <Link className="header-link" href="/about">
          <Info size={22} aria-hidden="true" />
          <span className="sr-only">{t("header.about")}</span>
        </Link>
      </div>
    </header>
  );
}
