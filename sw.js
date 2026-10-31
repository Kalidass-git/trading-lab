// Offline shell: the app files are cached; trades live in the browser's storage, so the last synced numbers show without internet.
const CACHE = 'trading-lab-v1';
const FILES = ['./',
  './index.html',
  './css/app.css',
  './manifest.webmanifest',
  './icons/apple-touch-180.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon.svg',
  './icons/mark.svg',
  './js/charts.js',
  './js/main.js',
  './js/merge.js',
  './js/mobilebar.js',
  './js/native.js',
  './js/refresh.js',
  './js/remote.js',
  './js/store.js',
  './js/ui.js',
  './js/version.js',
  './js/lab/book.js',
  './js/lab/market.js',
  './js/lab/model.js',
  './js/lab/options.js',
  './js/lab/time.js',
  './js/lab/xlsxout.js',
  './js/views/accounts.js',
  './js/views/baskets.js',
  './js/views/dashboard.js',
  './js/views/lab-shared.js',
  './js/views/lab-trade.js',
  './js/views/options.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/stocks.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never cache API calls (backend, mfapi)
  // network first so updates arrive, cache as the offline fallback
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
