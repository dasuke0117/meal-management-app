// Service Worker：ネット優先＋キャッシュフォールバック
// アプリ本体を更新したら CACHE の版数を上げると古いキャッシュが消える
const CACHE = "meal-app-v2";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/app.js",
  "js/store.js",
  "js/util.js",
  "js/calc.js",
  "js/ai.js",
  "js/views/record.js",
  "js/views/charts.js",
  "js/views/plan.js",
  "js/views/settings.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 自サイト以外（Claude API、esm.sh など）は介入しない
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await cache.match("index.html");
        if (shell) return shell;
      }
      return new Response("オフラインです", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
