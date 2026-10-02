// sw.js — Service Worker for "دوري أبطال العزبة"
// Handles incoming push notifications even when the app/tab is fully closed,
// deduplicates identical notifications, and handles taps to reopen the app.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The reliability layer changes more often than the rest of the UI. Always
// ask the network for it so an installed PWA does not stay stuck on an older
// cached sync implementation. The qualification-tiebreak extension is loaded
// immediately after theme-v2.js on every controlled app launch.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/theme-v2.js")) {
    event.respondWith((async () => {
      const response = await fetch(new Request(event.request, { cache: "no-store" }));
      const source = await response.text();
      const loader = `\n;(() => {\n  if (document.getElementById('ezba-group-tiebreak-loader')) return;\n  const s = document.createElement('script');\n  s.id = 'ezba-group-tiebreak-loader';\n  s.src = 'group-tiebreak-v19.js?v=19';\n  s.defer = false;\n  document.head.appendChild(s);\n})();\n`;
      return new Response(source + loader, {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
      });
    })());
  }
});

function notificationTag(data) {
  const text = `${data.title || ""}|${data.body || ""}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ezba-${(hash >>> 0).toString(16)}`;
}

self.addEventListener("push", (event) => {
  let data = { title: "دوري أبطال العزبة", body: "", url: "./index.html" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: "icon-192.png",
    badge: "icon-192.png",
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "./index.html" },
    vibrate: [100, 50, 100],
    // Same title+body replaces the previous copy instead of stacking twice.
    tag: notificationTag(data),
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "./index.html";
  const appUrl = (targetUrl === "/" || targetUrl === "")
    ? self.registration.scope
    : new URL(targetUrl, self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(appUrl);
    })
  );
});
