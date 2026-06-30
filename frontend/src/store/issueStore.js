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
import { isMockMode } from '../config'

// Seed mock issues
const MOCK_SEED_ISSUES = [
  {
    id: "mock_issue_1",
    user_id: "mock_anon_uid_1",
    image_url: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=800",
    media_type: "image",
    lat: 12.9716,
    lng: 77.5946,
    user_description: "Large pothole right in the middle of the main junction on MG Road. High risk for two-wheelers.",
    ward_id: "ward-1",
    status: "validated",
    upvotes: 42,
    verified_count: 8,
    comment_count: 3,
    category: "Road Infrastructure",
    severity: 4,
    ai_confidence: 0.94,
    ai_description: "Deep pothole detected on asphalt road. High severity due to location.",
    tags: ["pothole", "main-road", "hazard"],
    assigned_dept: "BBMP Ward 111",
    ticket_id: "TKT-9910",
    sla_deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "mock_issue_2",
    user_id: "mock_anon_uid_2",
    image_url: "https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?w=800",
    media_type: "image",
    lat: 12.9784,
    lng: 77.6408,
    user_description: "Broken streetlight. It has been dark for the last 3 nights. Safety concern for women walking home.",
    ward_id: "ward-2",
    status: "processing",
    upvotes: 18,
    verified_count: 3,
    comment_count: 1,
    category: "Electricity",
    severity: 3,
    ai_confidence: 0.88,
    ai_description: "Unlit or damaged street pole observed. Medium severity.",
    tags: ["street-light", "safety", "night"],
    assigned_dept: "BESCOM",
    ticket_id: "TKT-9911",
    sla_deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  }
]

const getMockIssues = () => {
  const data = localStorage.getItem('mock_issues')
  if (!data) {
    localStorage.setItem('mock_issues', JSON.stringify(MOCK_SEED_ISSUES))
    return MOCK_SEED_ISSUES
  }
  return JSON.parse(data)
}

const saveMockIssues = (issues) => {
  localStorage.setItem('mock_issues', JSON.stringify(issues))
}

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

    if (isMockMode) {
      const loadLocalIssues = () => {
        let list = getMockIssues()
        if (wardId) {
          list = list.filter(i => i.ward_id === wardId)
        }
        set({ issues: list, loading: false })
      }
      loadLocalIssues()

      // Set up a simple interval to check for changes
      const interval = setInterval(loadLocalIssues, 2000)
      return () => clearInterval(interval)
    }

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
    if (isMockMode) {
      const loadIssue = () => {
        const list = getMockIssues()
        const issue = list.find(i => i.id === issueId)
        if (issue) {
          set({ selectedIssue: issue })
        }
      }
      loadIssue()
      const interval = setInterval(loadIssue, 2000)
      return () => clearInterval(interval)
    }

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

  // Upload media to Firebase Storage (or Base64 local in Mock Mode)
  uploadMedia: async (file, issueId) => {
    set({ uploading: true, uploadProgress: 0 })

    if (isMockMode) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          set({ uploading: false, uploadProgress: 100 })
          resolve({
            url: reader.result,
            path: `mock-issues/${issueId}/${file.name}`,
            type: file.type.startsWith('video') ? 'video' : 'image'
          })
        }
        reader.onerror = (e) => {
          set({ uploading: false, error: 'Failed to read file locally' })
          reject(e)
        }
        reader.readAsDataURL(file)
      })
    }

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
      category: 'Road Infrastructure', // Default mock values
      severity: 3,
      ai_confidence: 0.85,
      ai_description: "Citizen reported issue.",
      tags: ["reported"],
      assigned_dept: "BBMP",
      ticket_id: "TKT-" + Math.floor(1000 + Math.random() * 9000),
      sla_deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    }

    if (isMockMode) {
      const list = getMockIssues()
      const newIssue = { 
        ...issueData, 
        id: issueId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      list.unshift(newIssue)
      saveMockIssues(list)
      return issueId
    }

    const serverData = {
      ...issueData,
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

    await addDoc(collection(db, 'issues'), { ...serverData, id: issueId })
    return issueId
  },

  // Upvote an issue
  upvoteIssue: async (issueId, userId) => {
    if (isMockMode) {
      const list = getMockIssues()
      const idx = list.findIndex(i => i.id === issueId)
      if (idx !== -1) {
        const upvoteKey = `mock_vote_${issueId}_${userId}`
        if (localStorage.getItem(upvoteKey)) return // Already voted

        localStorage.setItem(upvoteKey, 'true')
        list[idx].upvotes = (list[idx].upvotes || 0) + 1
        list[idx].updated_at = new Date().toISOString()
        saveMockIssues(list)

        // Award points in authStore
        const mockUsers = JSON.parse(localStorage.getItem('mock_users') || '{}')
        if (mockUsers[userId]) {
          mockUsers[userId].points = (mockUsers[userId].points || 0) + 2
          localStorage.setItem('mock_users', JSON.stringify(mockUsers))
        }
      }
      return
    }

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
    if (isMockMode) {
      const commentsKey = `mock_comments_${issueId}`
      const comments = JSON.parse(localStorage.getItem(commentsKey) || '[]')
      comments.push({
        id: 'mock_comment_' + uuidv4(),
        user_id: userId,
        body,
        created_at: new Date().toISOString()
      })
      localStorage.setItem(commentsKey, JSON.stringify(comments))

      const list = getMockIssues()
      const idx = list.findIndex(i => i.id === issueId)
      if (idx !== -1) {
        list[idx].comment_count = (list[idx].comment_count || 0) + 1
        saveMockIssues(list)
      }
      return
    }

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
    if (isMockMode) {
      const commentsKey = `mock_comments_${issueId}`
      return JSON.parse(localStorage.getItem(commentsKey) || '[]')
    }

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
