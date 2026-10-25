"use client";

import Link from "next/link";
import { SlidersHorizontal, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";

export function AppHeader({
  online,
  devOpen,
  onToggleDev,
}: {
  online: boolean;
  devOpen: boolean;
  onToggleDev?: () => void;
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
        {onToggleDev && (
          <button
            className="header-link dev-toggle"
            onClick={onToggleDev}
            aria-label={devOpen ? t("header.closeDev") : t("header.openDev")}
            aria-expanded={devOpen}
            title={t("header.devTitle")}
          >
            <SlidersHorizontal size={19} />
          </button>
        )}
        {!online && (
          <span className="offline-label">
            <WifiOff size={14} aria-hidden="true" />
            {t("header.offline")}
          </span>
        )}
      </div>
    </header>
  );
}
