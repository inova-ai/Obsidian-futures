// Obsidian Futures V6.18: service worker intentionally disabled.
// The app unregisters legacy registrations and deletes old caches on load.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));
