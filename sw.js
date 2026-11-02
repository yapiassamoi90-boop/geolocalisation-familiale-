/* =========================================================
   FAMILLE LOCALIZER - SERVICE WORKER
   Dev.Assamoi
   ========================================================= */

const CACHE_NAME = 'famille-localizer-v1';

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* INSTALLATION */

self.addEventListener('install', (event) => {

  event.waitUntil(

    caches.open(CACHE_NAME)

      .then((cache) => {
        return cache.addAll(APP_FILES);
      })

      .then(() => {
        return self.skipWaiting();
      })

  );

});

/* ACTIVATION */

self.addEventListener('activate', (event) => {

  event.waitUntil(

    caches.keys()

      .then((cacheNames) => {

        return Promise.all(

          cacheNames

            .filter((name) => name !== CACHE_NAME)

            .map((name) => caches.delete(name))

        );

      })

      .then(() => {
        return self.clients.claim();
      })

  );

});

/* GESTION DES REQUÊTES */

self.addEventListener('fetch', (event) => {

  const request = event.request;

  const url = new URL(request.url);

  // Ne pas intercepter les requêtes qui modifient des données.
  if (request.method !== 'GET') return;

  // Ne jamais mettre en cache les données Supabase.
  if (url.hostname.includes('supabase.co')) return;

  // Ne gérer ici que les fichiers du site.
  if (url.origin !== self.location.origin) return;

  event.respondWith(

    caches.match(request)

      .then((cachedResponse) => {

        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)

          .then((networkResponse) => {

            if (
              networkResponse &&
              networkResponse.status === 200
            ) {

              const responseCopy = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseCopy);
                });

            }

            return networkResponse;

          })

          .catch(() => {

            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            return new Response(
              'Contenu indisponible hors connexion.',
              {
                status: 503,
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8'
                }
              }
            );

          });

      })

  );

});
