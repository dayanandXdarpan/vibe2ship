// Firebase configuration for Prastab
// Replace these values with your actual Firebase project config

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
export const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080'
export const vapidKey = import.meta.env.VITE_VAPID_KEY
