"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

export function PlaceThumb({ id, commonsOnly = false }: { id: string; commonsOnly?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = commonsOnly ? "?commons=1" : "";
    fetch(`/api/photos/${encodeURIComponent(id)}${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Photo unavailable");
        const photo = await response.json();
        if (!controller.signal.aborted && typeof photo?.url === "string") setUrl(photo.url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl(null);
      });
    return () => controller.abort();
  }, [id, commonsOnly]);

  return (
    <span className="place-thumb" aria-hidden="true">
      {url ? (
        // Photo URLs are short-lived provider links with their own attribution on the full card.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <ImageOff size={14} />
      )}
    </span>
  );
}
