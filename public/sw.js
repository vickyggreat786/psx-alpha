// PSX Alpha Service Worker — handles Web Push notifications
// Works on Chrome Android like WhatsApp notifications (even when browser closed)

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push events
self.addEventListener("push", (event) => {
  let data = { title: "PSX Alpha Alert", body: "New alert", icon: "/icon.png" };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon.png",
    badge: data.icon || "/icon.png",
    vibrate: [200, 100, 200, 100, 200, 400],
    tag: "psx-alpha-alert",
    renotify: true,
    requireInteraction: true,
    data: { url: "/" },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
