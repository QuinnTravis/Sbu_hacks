import type { Photo, Place } from "./types";

const USER_AGENT = "TrainDiscovery/0.1 (https://github.com/QuinnTravis/Sbu_hacks)";

type Summary = {
  type?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

type MetadataValue = { value?: string };
type ImageInfo = {
  descriptionurl?: string;
  extmetadata?: {
    Artist?: MetadataValue;
    Attribution?: MetadataValue;
    LicenseShortName?: MetadataValue;
    LicenseUrl?: MetadataValue;
  };
};

function wikipediaTitle(place: Place): string | null {
  const raw = place.wikipedia?.trim();
  if (!raw || raw.length > 160) return null;
  const title = raw.startsWith("en:") ? raw.slice(3) : raw;
  if (/^[a-z]{2,3}:/.test(title) || /[\x00-\x1f/?#]/.test(title)) return null;
  return title;
}

function verifiedUrl(value: string | undefined, host: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host ? url.toString() : null;
  } catch {
    return null;
  }
}

function creditText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function jsonFrom<T>(url: string, fetcher: typeof fetch): Promise<T | null> {
  const response = await fetcher(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  } as RequestInit);
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/** Free fallback. Show only images with a resolvable Commons credit page. */
export async function wikimediaPhoto(
  place: Place,
  fetcher: typeof fetch = fetch,
): Promise<Photo | null> {
  const title = wikipediaTitle(place);
  if (!title) return null;
  try {
    const summary = await jsonFrom<Summary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      fetcher,
    );
    if (!summary || summary.type === "disambiguation") return null;
    const image = summary.thumbnail?.source;
    if (!image) return null;
    const url = new URL(image);
    if (
      url.protocol !== "https:" ||
      !["thumb.wikimedia.org", "upload.wikimedia.org"].includes(url.hostname) ||
      !url.pathname.startsWith("/wikipedia/commons/")
    ) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const filename = decodeURIComponent(
      segments.includes("thumb") ? segments[segments.length - 2] : segments[segments.length - 1],
    );
    if (!filename || filename.length > 250) return null;

    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "extmetadata|url",
      titles: `File:${filename}`,
    });
    const commons = await jsonFrom<{
      query?: { pages?: Record<string, { imageinfo?: ImageInfo[] }> };
    }>(`https://commons.wikimedia.org/w/api.php?${params}`, fetcher);
    const info = Object.values(commons?.query?.pages ?? {})[0]?.imageinfo?.[0];
    const creditUrl = verifiedUrl(info?.descriptionurl, "commons.wikimedia.org");
    if (!creditUrl) return null;
    const meta = info?.extmetadata;
    const author = creditText(meta?.Artist?.value || meta?.Attribution?.value);
    const licenseName = creditText(meta?.LicenseShortName?.value);
    const licenseUrl =
      verifiedUrl(meta?.LicenseUrl?.value, "creativecommons.org") || creditUrl;
    return {
      url: image,
      source: "Wikimedia Commons",
      sourceUrl: creditUrl,
      authors: author ? [{ displayName: author, uri: creditUrl }] : [],
      ...(licenseName ? { license: { name: licenseName, url: licenseUrl } } : {}),
    };
  } catch {
    return null;
  }
}
