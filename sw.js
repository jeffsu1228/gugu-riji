// 咕咕日迹 SW v7：壳可缓存；data/*.json 网络优先（随时同步）；diary.enc.json 网络优先＋离线回退缓存（密文）
const CACHE = 'gugu-riji-v9';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
function dataPath(url) {
  try {
    const u = new URL(url);
    return u.pathname.includes('/data/') && u.pathname.endsWith('.json') ? u : null;
  } catch { return null; }
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = dataPath(e.request.url);
  if (u && u.pathname.endsWith('/diary.enc.json')) {
    // 密文：网络优先；成功后按无 query 的地址存一份，离线时回退
    const clean = u.origin + u.pathname;
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(clean, copy)); }
        return r;
      }).catch(() => caches.match(clean))
    );
    return;
  }
  if (u) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
