// 咕咕日迹 SW v3：壳可缓存；data/*.json 始终网络优先、不写入缓存（随时同步）
const CACHE = 'gugu-riji-v3';
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
function isDataJson(url) {
  try {
    const u = new URL(url);
    return u.pathname.includes('/data/') && u.pathname.endsWith('.json');
  } catch { return false; }
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (isDataJson(e.request.url)) {
    // 网络优先；失败才碰同路径无 query 的壳外缓存（一般没有）
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
