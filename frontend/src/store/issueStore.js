// Issues store — manages issue data and Firestore queries
import { create } from 'zustand'
import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, updateDoc, doc,
  serverTimestamp, increment, getDoc, getDocs
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../services/firebase'
import { v4 as uuidv4 } from 'uuid'

const useIssueStore = create((set, get) => ({
  issues: [],
  selectedIssue: null,
  loading: false,
  uploading: false,
  uploadProgress: 0,
  error: null,
  filters: {
    category: 'all',
    severity: 'all',
    status: 'all',
    ward: 'all',
  },

  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),

  // Subscribe to real-time issues feed
  subscribeToIssues: (wardId = null) => {
    set({ loading: true })
    let q = query(
      collection(db, 'issues'),
      orderBy('created_at', 'desc'),
      limit(100)
    )
    if (wardId) {
      q = query(q, where('ward_id', '==', wardId))
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const issues = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      set({ issues, loading: false })
    }, (err) => {
      set({ error: err.message, loading: false })
    })

    return unsubscribe
  },

  // Subscribe to a single issue for detail page
  subscribeToIssue: (issueId) => {
    const unsubscribe = onSnapshot(
      doc(db, 'issues', issueId),
      (snapshot) => {
        if (snapshot.exists()) {
          set({ selectedIssue: { id: snapshot.id, ...snapshot.data() } })
        }
      }
    )
    return unsubscribe
  },

  // Upload media to Firebase Storage
  uploadMedia: async (file, issueId) => {
    set({ uploading: true, uploadProgress: 0 })
    try {
      const ext = file.name.split('.').pop()
      const path = `issues/${issueId}/${uuidv4()}.${ext}`
      const storageRef = ref(storage, path)
      
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)
      
      set({ uploading: false, uploadProgress: 100 })
      return { url: downloadUrl, path, type: file.type.startsWith('video') ? 'video' : 'image' }
    } catch (e) {
      set({ uploading: false, error: e.message })
      throw e
    }
  },

  // Create issue document in Firestore
  createIssue: async ({ userId, imageUrl, mediaType, lat, lng, userDescription, wardId }) => {
    const issueId = uuidv4()
    const issueData = {
      user_id: userId,
      image_url: imageUrl,
      media_type: mediaType,
      lat,
      lng,
      user_description: userDescription || '',
      ward_id: wardId || null,
      status: 'processing',
      upvotes: 0,
      verified_count: 0,
      comment_count: 0,
      category: null,
      severity: null,
      ai_confidence: null,
      ai_description: null,
      tags: [],
      assigned_dept: null,
      ticket_id: null,
      sla_deadline: null,
      auto_escalated: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    }

    await addDoc(collection(db, 'issues'), { ...issueData, id: issueId })
    return issueId
  },

  // Upvote an issue
  upvoteIssue: async (issueId, userId) => {
    // Check if already upvoted
    const voteRef = doc(db, 'issues', issueId, 'votes', userId)
    const voteDoc = await getDoc(voteRef)
    
    if (voteDoc.exists()) return // Already voted

    await updateDoc(doc(db, 'issues', issueId), {
      upvotes: increment(1),
      updated_at: serverTimestamp(),
    })

    // Record vote
    await addDoc(collection(db, 'issues', issueId, 'votes'), {
      user_id: userId,
      created_at: serverTimestamp(),
    })

    // Award XP to voter
    await updateDoc(doc(db, 'users', userId), { points: increment(2) })
  },

  // Add a comment
  addComment: async (issueId, userId, body) => {
    await addDoc(collection(db, 'issues', issueId, 'comments'), {
      user_id: userId,
      body,
      created_at: serverTimestamp(),
    })
    await updateDoc(doc(db, 'issues', issueId), {
      comment_count: increment(1)
    })
  },

  // Get comments for an issue
  getComments: async (issueId) => {
    const q = query(
      collection(db, 'issues', issueId, 'comments'),
      orderBy('created_at', 'asc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  clearError: () => set({ error: null }),
}))

export default useIssueStore
