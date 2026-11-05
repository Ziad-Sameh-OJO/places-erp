/*
 * M-14 (51): the service worker behind push notifications. A push carries { title, body, link } (PushService);
 * it shows as a phone / desktop notification and a tap opens the page it points to (or focuses the open tab).
 */
self.addEventListener("push", (event) => {
  let data = { title: "Places ERP", body: "", link: "/" };
  try { data = { ...data, ...event.data.json() }; } catch { /* a push without a payload still shows */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, dir: "rtl", lang: "ar", tag: data.link, data: { link: data.link } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((t) => t.url.startsWith(self.location.origin));
    if (open) { await open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  })());
});
