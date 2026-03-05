const SW_VERSION = 'fm-v4';
const PRECACHE = `field-mapper-precache-${SW_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('field-mapper-precache-') && key !== PRECACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';
  const isAppShellAsset = isSameOrigin && (
    url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/app.js')
    || url.pathname.endsWith('/styles.css')
    || url.pathname.endsWith('/manifest.webmanifest')
  );

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(PRECACHE).then((cache) => cache.put('./index.html', responseClone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (!isSameOrigin) return;

  if (isAppShellAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(PRECACHE).then((cache) => cache.put(request, responseClone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const responseClone = response.clone();
        caches.open(PRECACHE).then((cache) => cache.put(request, responseClone)).catch(() => {});
        return response;
      });
    })
  );
});
