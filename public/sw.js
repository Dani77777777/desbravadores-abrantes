// Service Worker for Web Push Notifications
// Desbravadores Abrantes

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  if (!event.data) {
    console.warn('[SW] Push event but no data');
    return;
  }

  const data = event.data.json();
  console.log('[SW] Notification data:', data);
  
  const title = data.title || 'Desbravadores Abrantes';
  const options = {
    body: data.message || data.body || '',
    icon: '/images/icon-192.png',
    badge: '/images/badge-72.png',
    data: {
      url: data.url || '/',
    },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
