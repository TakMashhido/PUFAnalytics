// Offline support: cache-first for the app shell, network-first fallback for everything else.
const CACHE = 'pufanalytics-v2.0.0';
const SHELL = ['./', 'index.html', 'css/clay.css', 'js/app.js', 'js/ui.js', 'js/charts.js', 'js/report.js', 'js/store.js', 'js/views.js', 'js/docs.js', 'js/docs-helpers.js', 'js/worker.js',
  'js/core/rng.js', 'js/core/stats.js', 'js/core/dataset.js', 'js/core/quality.js', 'js/core/nist.js', 'js/core/estimators.js',
  'js/core/simulators.js', 'js/core/attacks.js', 'js/core/ecc.js', 'js/core/analyze.js', 'js/core/npy.js', 'assets/icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
