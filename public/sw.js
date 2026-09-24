const CACHE = "robotik-offline-v1";
const OFFLINE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "Robotik Atölyeleri";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 180) : "Yeni bir duyurunuz var.";
  const url = typeof payload.url === "string" && /^\/panel(?:\/|$)/.test(payload.url) ? payload.url : "/panel";
  const tag = typeof payload.tag === "string" && /^[a-f0-9-]{36}$/.test(payload.tag) ? payload.tag : undefined;
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url }, tag }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/panel", self.location.origin);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/panel")) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
