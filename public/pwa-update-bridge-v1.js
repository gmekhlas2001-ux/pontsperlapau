// One-time migration bridge for installations created before the application
// listened for service-worker activation. Future updates are handled by the
// virtual:pwa-register client in src/pwa/registerServiceWorker.ts.
const BRIDGE_CACHE = 'pxp-pwa-update-bridge-v1';
const BRIDGE_MARKER = new URL(
  '__pxp_pwa_auto_update_v1__',
  self.registration.scope,
).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(BRIDGE_CACHE);
      if (await cache.match(BRIDGE_MARKER)) return;

      // An active worker means this install is upgrading an existing app.
      // First-time installations already contain the permanent page listener.
      await cache.put(
        BRIDGE_MARKER,
        new Response(self.registration.active ? 'pending' : 'done'),
      );
    } catch {
      // Never prevent installation if Cache Storage is unavailable.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(BRIDGE_CACHE);
      const marker = await cache.match(BRIDGE_MARKER);
      if (!marker || await marker.text() !== 'pending') return;

      // Mark completion before navigating so an interrupted activation cannot
      // cause a reload loop.
      await cache.put(BRIDGE_MARKER, new Response('done'));
      await self.clients.claim();

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(clients.map(async (client) => {
        try {
          if (new URL(client.url).origin === self.location.origin) {
            await client.navigate(client.url);
          }
        } catch {
          // A client may close or lack navigate() support while activating.
        }
      }));
    } catch {
      // Never prevent service-worker activation if storage is unavailable.
    }
  })());
});
