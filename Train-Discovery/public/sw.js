const VERSION = "train-discovery-v4";
const SHELL = `${VERSION}-shell`;
const JOURNEYS = `${VERSION}-journeys`;
const ASSETS = `${VERSION}-assets`;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      const pages = await Promise.all(
        ["/", "/journey"].map(async (path) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error("App shell unavailable");
          await shell.put(path, response.clone());
          return response.text();
        }),
      );
      const html = pages.join("\n");
      const assets = [
        ...new Set(
          [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
            .map(
              (match) =>
                new URL(
                  match[1].replaceAll("&amp;", "&"),
                  self.location.origin,
                ),
            )
            .filter(
              (url) =>
                url.origin === self.location.origin &&
                url.pathname.startsWith("/_next/static/"),
            )
            .map((url) => url.href),
        ),
      ];
      await (
        await caches.open(ASSETS)
      ).addAll([...assets, "/fonts/google-sans.woff2", "/fonts/landing-libre-caslon-regular.ttf", "/fonts/landing-libre-caslon-italic.ttf", "/audio/silence.wav"]);
      await shell.addAll(["/manifest.webmanifest", "/icon-192.png"]);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("train-discovery-") && !key.startsWith(VERSION),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/photos") ||
    request.headers.has("RSC")
  )
    return;
  if (/^\/api\/journeys\/[\w-]+$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(JOURNEYS);
        try {
          const response = await fetch(request);
          if (!response.ok) throw new Error("Journey unavailable");
          await cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) {
            const headers = new Headers(cached.headers);
            headers.set("X-Discovery-Cache", "offline");
            return new Response(await cached.blob(), { headers });
          }
          return Response.json(
            {
              error: "This branch has not been downloaded. Connect and retry.",
            },
            { status: 503 },
          );
        }
      })(),
    );
  } else if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/journey" || url.pathname === "/journey/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const shellPath = url.pathname === "/" ? "/" : "/journey";
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(shellPath, response.clone());
          return response;
        } catch {
          return (await cache.match(shellPath)) || Response.error();
        }
      })(),
    );
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/audio/silence.wav" ||
    /^\/icon[-.]/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const stored = await cache.match(request);
        if (stored) return stored;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
