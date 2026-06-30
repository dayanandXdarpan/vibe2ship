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
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider, db } from '../services/firebase'
import { isMockMode } from '../config'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      loading: true,
      error: null,

      // Initialize auth listener
      initAuth: () => {
        if (isMockMode) {
          const profile = get().profile
          if (profile) {
            set({ user: { uid: profile.uid, displayName: profile.displayName, email: profile.email }, loading: false })
          } else {
            set({ user: null, profile: null, loading: false })
          }
          return () => {}
        }

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
          points: 120,
          monthly_points: 40,           // Resets on 1st of each month for leaderboard
          rank: 'Active Citizen',
          badges: ['First Responder', 'Verifier'],
          reportCount: 3,
          resolvedCount: 2,
          verifyCount: 5,              // Community verify/dispute votes cast
          potholeCount: 2,             // Category-specific for badges
          waterCount: 1,
          trustScore: 0.85,
          lastLat: 12.9716,               // For hyperlocal neighbor notifications
          lastLng: 77.5946,
          fcm_tokens: [],              // Multiple device FCM tokens
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        if (isMockMode) {
          const mockUsers = JSON.parse(localStorage.getItem('mock_users') || '{}')
          mockUsers[uid] = profile
          localStorage.setItem('mock_users', JSON.stringify(mockUsers))
          set({ profile })
          return profile
        }

        const serverProfile = {
          ...profile,
          points: 0,
          monthly_points: 0,
          rank: 'Newcomer',
          badges: [],
          reportCount: 0,
          resolvedCount: 0,
          verifyCount: 0,
          potholeCount: 0,
          waterCount: 0,
          trustScore: 0.5,
          lastLat: null,
          lastLng: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }

        await setDoc(doc(db, 'users', uid), serverProfile)
        set({ profile: serverProfile })
        return serverProfile
      },

      // Sign in with email
      loginWithEmail: async (email, password) => {
        set({ loading: true, error: null })
        if (isMockMode) {
          const mockUsers = JSON.parse(localStorage.getItem('mock_users') || '{}')
          let userProfile = Object.values(mockUsers).find(u => u.email === email)
          if (!userProfile) {
            const uid = 'mock_uid_' + Math.random().toString(36).substr(2, 9)
            const displayName = email.split('@')[0]
            userProfile = await get().createProfile(uid, { displayName, email })
          }
          const user = { uid: userProfile.uid, displayName: userProfile.displayName, email: userProfile.email }
          set({ user, profile: userProfile, loading: false })
          return user
        }

        try {
          const cred = await signInWithEmailAndPassword(auth, email, password)
          set({ loading: false })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Register with email
      registerWithEmail: async (email, password, displayName) => {
        set({ loading: true, error: null })
        if (isMockMode) {
          const uid = 'mock_uid_' + Math.random().toString(36).substr(2, 9)
          const user = { uid, displayName, email }
          const profile = await get().createProfile(uid, { displayName, email })
          set({ user, profile, loading: false })
          return user
        }

        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password)
          await updateProfile(cred.user, { displayName })
          await get().createProfile(cred.user.uid, { displayName, email })
          set({ loading: false })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Sign in with Google
      loginWithGoogle: async () => {
        set({ loading: true, error: null })
        if (isMockMode) {
          const uid = 'mock_google_uid_' + Math.random().toString(36).substr(2, 9)
          const email = 'google.user@example.com'
          const displayName = 'Google User'
          const user = { uid, displayName, email }
          const profile = await get().createProfile(uid, { displayName, email })
          set({ user, profile, loading: false })
          return user
        }

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
          set({ loading: false })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Anonymous sign in (guest mode)
      loginAnonymously: async () => {
        set({ loading: true, error: null })
        if (isMockMode) {
          const uid = 'mock_anon_uid_' + Math.random().toString(36).substr(2, 9)
          const user = { uid, displayName: 'Guest User', email: null, isAnonymous: true }
          const profile = await get().createProfile(uid, { displayName: 'Guest User', email: null, role: 'guest' })
          set({ user, profile, loading: false })
          return user
        }

        try {
          const cred = await signInAnonymously(auth)
          await get().createProfile(cred.user.uid, {
            displayName: 'Guest User',
            email: null,
            role: 'guest',
          })
          set({ loading: false })
          return cred.user
        } catch (e) {
          set({ error: e.message, loading: false })
          throw e
        }
      },

      // Sign out
      logout: async () => {
        if (isMockMode) {
          set({ user: null, profile: null })
          return
        }
        await signOut(auth)
        set({ user: null, profile: null })
      },

      // Update user profile
      updateUserProfile: async (displayName) => {
        const { user, profile } = get()
        if (!user) return

        const updatedProfile = { 
          ...profile, 
          displayName, 
          updatedAt: isMockMode ? new Date().toISOString() : serverTimestamp() 
        }

        if (isMockMode) {
          const mockUsers = JSON.parse(localStorage.getItem('mock_users') || '{}')
          mockUsers[user.uid] = { ...updatedProfile, updatedAt: new Date().toISOString() }
          localStorage.setItem('mock_users', JSON.stringify(mockUsers))
          set({ profile: { ...updatedProfile, updatedAt: new Date().toISOString() }, user: { ...user, displayName } })
          return
        }

        try {
          await updateDoc(doc(db, 'users', user.uid), { 
            displayName, 
            updatedAt: serverTimestamp() 
          })
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName })
          }
          set({ profile: updatedProfile, user: { ...user, displayName } })
        } catch (e) {
          set({ error: e.message })
          throw e
        }
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

