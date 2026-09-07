// DOORUP shell — service worker.
//
// Objetivo: que el shell (index.html, sw.js, manifest.json) llegue SIEMPRE
// fresco cuando hay red (network-first). Asi un deploy nuevo no queda atascado
// por el cache del WebView de la TV. Solo cae al cache si NO hay red.
//
// Reglas:
//  - version.txt        -> network-only (nunca cachear: un valor viejo aca
//                          reintroduce el bug que estamos arreglando).
//  - resto same-origin  -> network-first, cache como respaldo offline.
//  - cross-origin        -> NO se toca (el iframe de script.google.com, CDNs).
//                          Pasa de largo: si lo interceptaramos podriamos
//                          cachear la version vieja del sitio.
//
// Ver CACHE_BUSTING.md en el repo del pipeline.

const CACHE = 'doorup-shell-v2'; // subir el numero purga los caches viejos
const SHELL = ['./', './index.html', './manifest.json', './r/', './r/index.html'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Solo GET same-origin. El iframe de Apps Script, fuentes/CDN y POSTs pasan
  // sin tocar (return sin respondWith => el navegador lo maneja normal).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // version.txt: network-only. Un valor cacheado viejo rompe el rompe-cache.
  if (url.pathname.endsWith('/version.txt')) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 200 })));
    return;
  }

  // Todo lo demas del shell: network-first, cache como respaldo.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
