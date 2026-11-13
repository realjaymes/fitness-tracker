// Service worker for the fitness tracker's Home Screen app: shows the daily
// notifications sent by the fitness-push Cloudflare Worker (push/worker.js).
const WORKER = "https://fitness-push.realjaymes.workers.dev";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let msg = null;
  try { msg = e.data ? e.data.json() : null; } catch {}
  const get = msg ? Promise.resolve(msg) : fetch(`${WORKER}/latest`).then(r => r.json()).catch(() => null);
  e.waitUntil(get.then(m => self.registration.showNotification((m && m.title) || "Fitness", {
    body: (m && m.body) || "Open the tracker for today's plan.",
    tag: (m && m.tag) || "fitness",
    data: { url: (m && m.url) || "./" },
  })));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) return c.navigate(url).then(w => (w || c).focus());
    return self.clients.openWindow(url);
  }));
});
