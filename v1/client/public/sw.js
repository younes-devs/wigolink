// Service worker minimal (PRD UI/UX U8) — cache l'app-shell statique pour un démarrage
// rapide et une tolérance hors-ligne de base. On ne met JAMAIS en cache /api/* : les
// données (transactions, escrow, KYC) doivent toujours venir du serveur, jamais d'un
// cache potentiellement périmé.
const CACHE = 'wigofly-shell-v1';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/assets/logo-mark-192.png',
  '/assets/logo-wordmark.png',
  '/assets/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Jamais de cache pour l'API ni les requêtes non-GET.
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Navigation : réseau d'abord, repli sur l'app-shell en cache si hors-ligne (SPA).
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  // Statique : cache d'abord, complété au fil de l'eau (stale-while-revalidate léger).
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
