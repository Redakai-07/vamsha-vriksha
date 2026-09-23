/**
 * Vamsha-Vriksha service worker (generated into `out/sw.js` by
 * scripts/generate-sw.mjs - do not edit the built file).
 *
 * Strategy:
 *   - the whole emitted app shell is precached at install time, so the app
 *     opens with no network at all;
 *   - navigation requests are served cache-first with a background refresh
 *     (stale-while-revalidate), falling back to the offline page and then to
 *     the dashboard, so an unknown URL still lands somewhere useful;
 *   - hashed build assets are immutable, so they are cache-first;
 *   - nothing else is cached aggressively, and nothing is ever cached for
 *     non-GET requests.
 *
 * IndexedDB (the actual data) is untouched by the service worker - the user's
 * family data never depends on the cache being warm.
 */

const CACHE_VERSION = "__CACHE_VERSION__";
const PRECACHE = __PRECACHE_MANIFEST__;

const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const OFFLINE_URL = "/offline/";
const FALLBACK_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual failures must not abort the install: one missing icon should
      // never cost the user offline support.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "VV_SKIP_WAITING") void self.skipWaiting();
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    void cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  throw new Error("offline");
}

async function handleNavigation(request, event) {
  try {
    return await staleWhileRevalidate(request, event);
  } catch {
    // Never visited online, and the network is gone: serve the cached shell.
    const shell =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(OFFLINE_URL)) ||
      (await caches.match(FALLBACK_URL));
    if (shell) return shell;
    return new Response(
      "<!doctype html><title>Offline</title><p>Vamsha-Vriksha is offline and this page is not cached. Your data is safe in this browser.",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, event));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event).catch(() => fetch(request)));
});
