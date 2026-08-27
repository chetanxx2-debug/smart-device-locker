// =====================================================================
// Smart Device Locker - Service Worker (PWA)
// Shopkeeper dashboard ko home screen par install karo
// =====================================================================

const CACHE_NAME = "sdl-cache-v5.0";
const OFFLINE_URL = "/offline.html";

// Cache karne wali files (Shell - app ka dhanccha)
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.jpg",
  "/icons/icon-512.jpg"
];

// ── Install: Shell cache karo ──────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS.map(url => new Request(url, { cache: "reload" })))
        .catch(() => cache.addAll(["/", "/index.html", "/manifest.json"]));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Purana cache delete karo ───────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network first, cache fallback strategy ─────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API calls: Network only (hamesha fresh data chahiye)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return; // Default browser handling (no cache)
  }

  // Navigation (pages): Network first, cache fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/index.html").then((r) => r || caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // Static assets: Cache first, network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
