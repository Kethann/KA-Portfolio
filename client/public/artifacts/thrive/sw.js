/* Thrive service worker: offline app shell, cached emoji art + notification clicks. */
const CACHE = 'thrive-v5';
const EMOJI_CACHE = 'thrive-emoji-v1';
const SHELL = ['./', './index.html', './css/styles.css', './js/foods.js', './js/app.js', './icon.svg', './icons/icon-any-192.png', './manifest.webmanifest'];
const isEmoji = (url) => url.startsWith('https://fonts.gstatic.com/s/e/notoemoji/') || url.startsWith('https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== EMOJI_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Emoji art never changes: cache first, so it's instant and works offline.
  if (isEmoji(url)) {
    e.respondWith(
      caches.open(EMOJI_CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
        return res;
      })))
    );
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;
  // App files: network first (so updates show up), falling back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html#/today';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
