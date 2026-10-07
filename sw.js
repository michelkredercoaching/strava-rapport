// /sw.js
// Service worker van de MKC-app (07-10-2026). Doet alleen pushberichten:
// het ochtendbericht tonen en bij een tik de app openen. Geen offline-cache,
// zodat je altijd de nieuwste versie van de app ziet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'MKC', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'MKC', {
    body: d.body || '',
    icon: '/icoon-192.png',
    badge: '/icoon-192.png',
    tag: 'mkc-ochtend',
    data: { url: d.url || '/app' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lijst) { if (c.url.includes('/app') && 'focus' in c) { c.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
