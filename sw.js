const CACHE = 'm3u-player-v1';
const PRECACHE = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
];
const CDN_HLS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(PRECACHE);
      try { await cache.add(CDN_HLS); } catch {} // CDN optional
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Never intercept: streaming URLs, CORS proxies, M3U playlists
  if (/corsproxy\.io|allorigins\.win|\.m3u8?(\?|$)|get\.php|\/live\/|\/stream\//i.test(url)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached); // return cached if network fails
    })
  );
});
