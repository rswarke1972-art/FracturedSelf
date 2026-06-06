const CACHE_NAME = "fractured-self-cache-v1";
const CORE_ASSETS = [
  "index.html",
  "story.html",
  "outro.html",
  "style.css",
  "script.js",
  "stories.json",
  "manifest.json",
  "assets/icon.svg"
];

// Install Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching core assets...");
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interceptor
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Check if it's an image under assets
  if (requestUrl.pathname.includes("/assets/images/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse; // Cache Hit
          }

          // Cache Miss - Fetch and Cache
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              // Return placeholder or error if offline and not cached
              console.log("[Service Worker] Image offline and uncached:", event.request.url);
            });
        });
      })
    );
  } else {
    // Core assets & standard pages: Cache First, fallback to Network
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          // Cache newly discovered local requests if appropriate
          if (
            event.request.method === "GET" &&
            networkResponse.status === 200 &&
            (requestUrl.origin === location.origin)
          ) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.error("[Service Worker] Fetch failed:", err);
        });
      })
    );
  }
});
