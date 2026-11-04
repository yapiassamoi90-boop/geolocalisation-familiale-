
/* =========================================================
   FAMILLE GPS - SERVICE WORKER
   PWA + CACHE + NOTIFICATIONS FIREBASE
   ========================================================= */

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

const CACHE_NAME = "famille-gps-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

const firebaseConfig = {
  apiKey: "AIzaSyBsIPIeReKjRaDsSMUWc4E1deGMfq6e5ZI",
  authDomain: "relais-celebrations-bot.firebaseapp.com",
  projectId: "relais-celebrations-bot",
  storageBucket: "relais-celebrations-bot.firebasestorage.app",
  messagingSenderId: "773823361651",
  appId: "1:773823361651:web:9bbb40ae3daa8d82397006"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// INSTALLATION
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const file of APP_FILES) {
        try {
          const response = await fetch(file);

          if (response.ok) {
            await cache.put(file, response);
          }
        } catch (error) {
          console.warn("Fichier non mis en cache :", file);
        }
      }

      await self.skipWaiting();
    })()
  );
});

// ACTIVATION
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(name =>
            name.startsWith("famille-gps-") &&
            name !== CACHE_NAME
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// NOTIFICATIONS EN ARRIÈRE-PLAN
messaging.onBackgroundMessage(payload => {
  const title = payload.data?.title || "Famille GPS";

  const options = {
    body:
      payload.data?.body ||
      "Un membre de ta famille souhaite te contacter.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    vibrate: [300, 100, 300],
    tag: "famille-gps-alert",
    data: {
      url: payload.data?.url || "./"
    }
  };

  return self.registration.showNotification(title, options);
});

// CLIC SUR UNE NOTIFICATION
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});

// REQUÊTES ET MODE HORS CONNEXION
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ne pas intercepter les services externes.
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

        if (cachedResponse) {
          return cachedResponse;
        }

        if (request.mode === "navigate") {
          return (
            await caches.match("./index.html")
          ) || new Response(
            "Application indisponible hors connexion.",
            { status: 503 }
          );
        }

        return new Response(
          "Contenu indisponible hors connexion.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      }
    })()
  );
});
