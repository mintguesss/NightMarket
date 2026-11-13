/* Service worker：讓手機可以「加入主畫面」。
   網頁檔案一律先連網路取最新版，連不上才用快取（避免更新後還看到舊版）；/api/ 行情資料不快取。 */
const CACHE = 'nightmarket-v9';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'pages.js', 'panels.js', 'indicators.js', 'draw.js', 'mobile.js',
  'features.js', 'i18n.js', 'names-zh.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    // cache: 'no-cache' 讓瀏覽器每次都向伺服器確認檔案有沒有更新（沒更新會很快回 304），不會拿到舊版
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
