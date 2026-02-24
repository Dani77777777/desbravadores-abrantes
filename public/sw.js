// Service Worker for Web Push Notifications
// Desbravadores Abrantes

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.warn('[SW] Error parsing push data as JSON:', err);
    data = { title: 'Nova Mensagem', message: event.data ? event.data.text() : '' };
  }

  console.log('[SW] Notification data:', data);
  
  const title = data.title || 'Desbravadores Abrantes';
  const options = {
    body: data.message || data.body || '',
    icon: '/images/desbravadores.png', // This one exists
    badge: '/images/desbravadores.png',
    tag: 'announcement-' + (data.id || Date.now()),
    data: {
      url: data.url || '/',
    },
    vibrate: [200, 100, 200],
  };

  const promiseChain = self.registration.showNotification(title, options)
    .then(() => console.log('[SW] Notification shown successfully'))
    .catch(err => console.error('[SW] Error showing notification:', err));

  event.waitUntil(promiseChain);
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
