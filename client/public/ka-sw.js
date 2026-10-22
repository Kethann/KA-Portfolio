// Reply notifications. The site keeps this visitor's conversation keys in a small cache entry; when a reply is sent
// from the portal the server sends an EMPTY push (nothing personal goes through the push service), this worker wakes,
// asks the site for these conversations and shows the newest unseen reply. Tapping it opens the conversation on the site.
'use strict';
const STORE = 'ka-threads', KEY = '/__ka/threads';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function keys(){
  try { const r = await (await caches.open(STORE)).match(KEY); const list = r ? await r.json() : []; return Array.isArray(list) ? list.filter(k => typeof k === 'string').slice(-12) : []; }
  catch { return []; }
}
async function latestReply(){
  const list = await keys(); if (!list.length) return null;
  const res = await fetch('/api/messages/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: list }), credentials: 'omit' });
  if (!res.ok) return null;
  let best = null;
  for (const t of (await res.json()).threads || []) for (const r of t.replies || []){
    if (!r.seen && (!best || r.sentAt > best.r.sentAt)) best = { t, r };
  }
  return best;
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let hit = null; try { hit = await latestReply(); } catch {}
    const body = hit ? String(hit.r.body || '').replace(/\s+/g, ' ').slice(0, 160) : 'You have a new reply to your message.';
    await self.registration.showNotification(hit ? 'Kethan replied to your message' : 'New reply from Kethan', {
      body, tag: 'ka-reply', renotify: true, icon: '/images/ka-logo.png', badge: '/images/ka-logo.png',
      data: { url: hit ? '/?thread=' + encodeURIComponent(hit.t.key) : '/?page=contact' }
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (new URL(w.url).origin === self.location.origin && 'navigate' in w){ try { await w.focus(); return void await w.navigate(url); } catch {} }
    await self.clients.openWindow(url);
  })());
});
