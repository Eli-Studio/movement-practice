// Bump this version whenever any precached asset changes. This is the single
// cache-busting mechanism — module URLs no longer carry per-file ?v= query
// strings (which had drifted out of sync and spawned duplicate module fetches).
const CACHE = 'movement-network-first-v15';
const CORE = ['./', './index.html', './styles.css', './manifest.json', './icons/icon.svg',
  './icons/icon-120.png', './icons/icon-152.png', './icons/icon-167.png', './icons/icon-180.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './data/equipment.json', './data/exercises.json', './data/routineTemplates.json',
  './js/adaptation.js', './js/app.js', './js/audio.js', './js/config.js', './js/cycles.js',
  './js/data.js', './js/equipment.js', './js/exports.js', './js/reports.js', './js/rotation.js',
  './js/profiles.js', './js/screens.js', './js/storage.js', './js/timer.js', './js/utils.js', './js/workout.js',
  './js/vendor/chart.umd.min.js'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then(response => {
      const cachedCopy = response.ok ? response.clone() : null;
      if (cachedCopy) caches.open(CACHE).then(cache => cache.put(event.request, cachedCopy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const cachedCopy = (response.ok || response.type === 'opaque') ? response.clone() : null;
    if (cachedCopy) caches.open(CACHE).then(cache => cache.put(event.request, cachedCopy));
    return response;
  })));
});
