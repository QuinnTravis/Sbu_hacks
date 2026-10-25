"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Bookmark toggle: icon plus visible text, or icon with an accessible name when compact. */
export function BookmarkButton({
  name,
  bookmarked,
  onToggle,
  compact = false,
  className = "",
}: {
  name: string;
  bookmarked: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const label = bookmarked ? t("bookmarks.remove", { name }) : t("bookmarks.add", { name });
  return (
    <button
      type="button"
      className={`bookmark-button${compact ? " is-compact" : ""}${bookmarked ? " is-on" : ""} ${className}`.trim()}
      aria-pressed={bookmarked}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {bookmarked ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
      {!compact && <span>{bookmarked ? t("bookmarks.bookmarked") : t("bookmarks.bookmark")}</span>}
    </button>
  );
}
