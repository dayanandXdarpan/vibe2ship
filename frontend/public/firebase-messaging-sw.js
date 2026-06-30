// firebase-messaging-sw.js — Service Worker for Firebase Cloud Messaging
// Must be at the root of the public directory

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Firebase config is injected via the main app — we use a minimal config here
// Replace these with your actual Firebase project values
firebase.initializeApp({
  apiKey: self.__FIREBASE_API_KEY__ || 'your-api-key',
  authDomain: self.__FIREBASE_AUTH_DOMAIN__ || 'your-project.firebaseapp.com',
  projectId: self.__FIREBASE_PROJECT_ID__ || 'your-project-id',
  storageBucket: self.__FIREBASE_STORAGE_BUCKET__ || 'your-project.appspot.com',
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || '123456789',
  appId: self.__FIREBASE_APP_ID__ || '1:123456789:web:abcdef',
})

const messaging = firebase.messaging()

// Handle background push notifications
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM] Background message:', payload)

  const { title, body, icon } = payload.notification || {}
  const data = payload.data || {}

  self.registration.showNotification(title || 'Prastab', {
    body: body || 'You have a new update',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.issue_id || 'prastab',
    data: { url: data.issue_id ? `/issues/${data.issue_id}` : '/' },
    actions: [
      { action: 'view', title: 'View Issue' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  })
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
