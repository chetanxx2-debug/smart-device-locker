// =====================================================================
// Smart Device Locker - Service Worker (PWA)
// Shopkeeper dashboard ko home screen par install karo
// =====================================================================

const CACHE_NAME = "sdl-cache-v6.0";
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS.map(url => new Request(url, { cache: "reload" })))
        .catch(() => cache.addAll(["/", "/index.html", "/manifest.json"]));
    })
  );
});

// ── Activate: Purana cache delete karo ───────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network first, cache fallback strategy (Hamesha Fresh Data) ──
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API calls: Network only (hamesha fresh data chahiye)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return;
  }

  // Network First for everything: try network, fallback to cache if offline
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL));
      })
  );
});
