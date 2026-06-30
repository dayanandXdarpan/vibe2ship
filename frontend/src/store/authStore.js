// Auth store — manages Firebase authentication state
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider, db } from '../services/firebase'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      loading: true,
      error: null,

      // Initialize auth listener
      initAuth: () => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            set({ user: firebaseUser, loading: false })
            // Fetch profile
            try {
              const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
              if (profileDoc.exists()) {
                set({ profile: profileDoc.data() })
              }
            } catch (e) {
              console.error('Profile fetch error:', e)
            }
          } else {
            set({ user: null, profile: null, loading: false })
          }
        })
        return unsubscribe
      },

      // Create Firestore user profile
      createProfile: async (uid, { displayName, email, role = 'citizen', wardId = null }) => {
        const profile = {
          uid,
          displayName,
          email,
          role,
          wardId,
          points: 0,
          monthly_points: 0,           // Resets on 1st of each month for leaderboard
          rank: 'Newcomer',
          badges: [],
          reportCount: 0,
          resolvedCount: 0,
          verifyCount: 0,              // Community verify/dispute votes cast
          potholeCount: 0,             // Category-specific for badges
          waterCount: 0,
          trustScore: 0.5,
          lastLat: null,               // For hyperlocal neighbor notifications
          lastLng: null,
          fcm_tokens: [],              // Multiple device FCM tokens
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        await setDoc(doc(db, 'users', uid), profile)
        set({ profile })
        return profile
      },

      // Sign in with email
      loginWithEmail: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password)
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Register with email
      registerWithEmail: async (email, password, displayName) => {
        set({ loading: true, error: null })
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password)
          await updateProfile(cred.user, { displayName })
          await get().createProfile(cred.user.uid, { displayName, email })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Sign in with Google
      loginWithGoogle: async () => {
        set({ loading: true, error: null })
        try {
          const cred = await signInWithPopup(auth, googleProvider)
          // Create profile if first login
          const profileDoc = await getDoc(doc(db, 'users', cred.user.uid))
          if (!profileDoc.exists()) {
            await get().createProfile(cred.user.uid, {
              displayName: cred.user.displayName,
              email: cred.user.email,
            })
          }
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Anonymous sign in (guest mode)
      loginAnonymously: async () => {
        set({ loading: true, error: null })
        try {
          const cred = await signInAnonymously(auth)
          await get().createProfile(cred.user.uid, {
            displayName: 'Guest User',
            email: null,
            role: 'guest',
          })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Sign out
      logout: async () => {
        await signOut(auth)
        set({ user: null, profile: null })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'community-hero-auth',
      partialize: (state) => ({ profile: state.profile }),
    }
  )
)

export default useAuthStore
