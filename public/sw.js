const CACHE_NAME = "festival-planner-v10";
const BASE_PATH = "/festival-planner/";
const APP_SHELL = [
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`,
  `${BASE_PATH}icons/icon-maskable-512.png`,
  `${BASE_PATH}icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const pageResponse = await fetch(BASE_PATH, { cache: "reload" });
      if (!pageResponse.ok) throw new Error("Unable to cache the app shell");

      const pageHtml = await pageResponse.clone().text();
      const assetUrls = [...pageHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], self.location.origin))
        .filter(
          (url) =>
            url.origin === self.location.origin &&
            url.pathname.startsWith(BASE_PATH),
        )
        .map((url) => url.href);
      const shellUrls = APP_SHELL.map(
        (path) => new URL(path, self.location.origin).href,
      );

      await cache.put(BASE_PATH, pageResponse);
      await cache.addAll([...new Set([...shellUrls, ...assetUrls])]);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match(BASE_PATH);
          return Response.error();
        }),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || BASE_PATH, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const existing = windows.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (!existing) return clients.openWindow(targetUrl);
        await existing.navigate(targetUrl);
        return existing.focus();
      }),
  );
});
