// ============================================================================
// SERVICE WORKER (sw.js)
// Provides complete offline caching for the Kioku diary application shell,
// stylesheets, fonts, and module dependencies.
// ============================================================================

const CACHE_NAME = "kioku-app-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./auth.js",
  "./firestore.js",
  "./speech.js",
  "./firebaseConfig.js",
  "./manifest.json",
  "./favicon.png"
];

// Pre-cache core application shell on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Clean up previous cache versions on activation
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch strategy: Cache-first with background network refresh for app assets,
// allowing seamless offline operation while updating caches when online.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle standard GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Allow Firebase backend API requests (Auth tokens, Firestore websocket/REST)
  // to pass directly through; the Firebase SDK handles its own offline queue/IndexedDB.
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("identitytoolkit")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === "opaque")
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network request fails and this was a document navigation,
          // fallback to the cached root index.html
          if (request.mode === "navigate") {
            return caches.match("./index.html") || caches.match("./");
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
