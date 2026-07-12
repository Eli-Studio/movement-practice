const CACHE = 'morning-circuit-v1';
const CORE = ['./', './index.html', './styles.css', './manifest.json', './icons/icon.svg',
  './data/equipment.json', './data/exercises.json', './data/routineTemplates.json',
  './js/adaptation.js', './js/app.js', './js/audio.js', './js/config.js', './js/cycles.js',
  './js/data.js', './js/equipment.js', './js/exports.js', './js/reports.js', './js/rotation.js',
  './js/screens.js', './js/storage.js', './js/timer.js', './js/utils.js', './js/workout.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok || response.type === 'opaque') caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
