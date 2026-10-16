/* MPA PWA foundation. Never cache API responses, authenticated pages, or user-specific data. */
const CACHE_PREFIX = "mpa-pwa-";
const CACHE_VERSION = "v2";
const STATIC_CACHE = CACHE_PREFIX + "static-" + CACHE_VERSION;
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/brand/mpa-logo-light.svg",
  "/brand/mpa-logo-dark.svg",
  "/brand/mpa-favicon-light.svg",
  "/brand/mpa-favicon-dark.svg"
];

self.addEventListener("install", (event) => {
  // A failed optional shell URL must not prevent the worker from installing.
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        await Promise.all(PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok && response.type === "basic") await cache.put(url, response);
          } catch { /* offline-first install remains best-effort */ }
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "MPA_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept APIs, authentication, private workspaces, or workflow mutations.
  const privatePrefixes = [
    "/api/", "/auth/", "/account/", "/admin/", "/dashboard/",
    "/notifications", "/membership", "/verification", "/organizations",
    "/applications", "/applications/", "/mentorship/requests", "/services/requests"
  ];
  if (privatePrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      // Public landing page may have been precached. Never replay a private URL.
      const cachedHome = await caches.match("/");
      if (cachedHome && url.pathname === "/") return cachedHome;
      return new Response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#0A3258\"><title>Offline · MPA</title><body style=\"font:16px system-ui;max-width:38rem;margin:12vh auto;padding:1.25rem;color:#0A3258\"><h1>You’re offline</h1><p>Reconnect to continue using MPA. Sign-in, forms, notifications, review decisions and account data require a live connection.</p><button onclick=\"location.reload()\">Try again</button></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, status: 503 }
      );
    }));
    return;
  }

  // Cache-first only for public brand assets and Next's fingerprinted static output.
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/");
  if (!isStaticAsset) return;
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  }));
});