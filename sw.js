
/* =========================================================
   FAMILLE GPS - SERVICE WORKER
   Dev.Assamoi
   ========================================================= */

const CACHE_NAME = "famille-gps-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALLATION
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Un fichier manquant ne bloque pas toute l'installation.
      for (const file of APP_FILES) {
        try {
          const response = await fetch(file);

          if (response.ok) {
            await cache.put(file, response);
          } else {
            console.warn("Fichier non disponible :", file);
          }
        } catch (error) {
          console.warn("Impossible de mettre en cache :", file);
        }
      }

      await self.skipWaiting();
    })()
  );
});

// ACTIVATION
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("famille-gps-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// GESTION DES REQUÊTES
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ne jamais intercepter les données Supabase ou les ressources externes.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) return cachedResponse;

        if (request.mode === "navigate") {
          return (
            await caches.match("./index.html")
          ) || new Response("Application indisponible hors connexion.", {
            status: 503
          });
        }

        return new Response("Contenu indisponible hors connexion.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      }
    })()
  );
});
