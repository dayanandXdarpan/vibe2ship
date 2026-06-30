// Firebase App initialization and service exports
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, isSupported } from 'firebase/messaging'
import { firebaseConfig } from '../config'

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Auth
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('email')
googleProvider.addScope('profile')

// Firestore
export const db = getFirestore(app)

// Enable offline persistence
import { enableMultiTabIndexedDbPersistence } from 'firebase/firestore'
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed-precondition: multiple tabs open')
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence unimplemented: browser not supported')
  }
})

// Storage
export const storage = getStorage(app)

// Messaging (FCM) — only if browser supports it
export const getFirebaseMessaging = async () => {
  const supported = await isSupported()
  if (supported) {
    return getMessaging(app)
  }
  return null
}

export default app
