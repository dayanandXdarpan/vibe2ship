/**
 * Agent API Service — Prastab
 * Communicates with FastAPI backend + handles FCM token registration.
 */
import { backendUrl } from '../config'
import { auth } from './firebase'

const API = backendUrl

async function getAuthHeaders() {
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    return { 'Authorization': `Bearer ${token}` }
  }
  return {}
}

// ── Community Consensus & Appeals ─────────────────────────────────

export async function communityVerify(issueId, userId, action, note = '', lat = null, lng = null) {
  return apiCall(`${API}/issues/${issueId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, action, note, lat, lng }),
  })
}

export async function appealRejection(issueId, userId, appealReason) {
  return apiCall(`${API}/issues/${issueId}/appeal`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, appeal_reason: appealReason }),
  })
}

// ── Error helper ──────────────────────────────────────────────────
async function apiCall(url, options = {}) {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(url, {
    ...options,
    headers: { 
      'Content-Type': 'application/json', 
      ...authHeaders,
      ...(options.headers || {}) 
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `API error ${res.status}`)
  }
  return res.json()
}

// ── Issue Reporting ───────────────────────────────────────────────

/**
 * Submit a new issue to the LangGraph pipeline.
 * Uses FormData (multipart) since backend expects form fields.
 */
export async function reportIssue({ issueId, imageUrl, lat, lng, userId, userDescription, voiceNoteB64, voiceNoteMime }) {
  const formData = new FormData()
  formData.append('issue_id', issueId)
  formData.append('image_url', imageUrl)
  formData.append('lat', String(lat))
  formData.append('lng', String(lng))
  if (userDescription) formData.append('user_description', userDescription)
  if (voiceNoteB64) {
    formData.append('voice_note_b64', voiceNoteB64)
    formData.append('voice_note_mime', voiceNoteMime || 'audio/webm')
  }

  const authHeaders = await getAuthHeaders()
  const res = await fetch(`${API}/report`, { 
    method: 'POST', 
    body: formData,
    headers: {
      ...authHeaders
    }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to submit issue')
  }
  return res.json()
}

/**
 * Get current pipeline/issue status.
 */
export async function getIssueStatus(issueId) {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(`${API}/issues/${issueId}/status`, {
    headers: {
      ...authHeaders
    }
  })
  if (!res.ok) throw new Error('Status check failed')
  return res.json()
}

/**
 * Poll pipeline status until terminal state or timeout.
 * Terminal states: assigned, duplicate_found, in_review (HITL), complete,
 *                 needs_clarification, escalated, error
 * @param {string} issueId
 * @param {(status: object) => void} onUpdate
 * @param {number} timeoutMs
 */
export async function pollPipelineStatus(issueId, onUpdate, timeoutMs = 90000) {
  const TERMINAL = new Set([
    'assigned', 'duplicate_found', 'duplicate_detected',
    'needs_clarification', 'spam_suspected', 'error',
    'reporter_error', 'validation_failed_geo',
    'in_review',   // HITL — stops here for human action
    'escalated',
    'complete',
  ])

  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(intervalId)
        reject(new Error('Pipeline timeout — please check the issue status later'))
        return
      }

      try {
        const status = await getIssueStatus(issueId)
        onUpdate(status)

        if (TERMINAL.has(status.status)) {
          clearInterval(intervalId)
          resolve(status)
        }
      } catch (e) {
        console.warn('[API] Poll error (retrying):', e.message)
      }
    }, 2500) // Poll every 2.5s
  })
}

// ── AI Insights ───────────────────────────────────────────────────

/**
 * Get Gemini-powered AI predictive insights for a ward.
 */
export async function getWardInsights(wardId, limit = 5) {
  try {
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`${API}/insights/${wardId}?limit=${limit}`, {
      headers: {
        ...authHeaders
      }
    })
    if (!res.ok) throw new Error('Insights unavailable')
    return res.json()
  } catch (e) {
    console.warn('[API] Insights unavailable:', e.message)
    return { insights: [] }
  }
}

// ── Resolution ────────────────────────────────────────────────────

/**
 * Mark an issue as resolved (authority action).
 */
export async function resolveIssue({ issueId, authorityId, resolutionNote, resolutionPhotoUrl }) {
  return apiCall(`${API}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      issue_id: issueId,
      authority_id: authorityId,
      resolution_note: resolutionNote,
      resolution_photo_url: resolutionPhotoUrl,
    }),
  })
}

// ── HITL ─────────────────────────────────────────────────────────

export async function hitlApprove(issueId, reviewerId, notes = '') {
  return apiCall(`${API}/hitl/approve`, {
    method: 'POST',
    body: JSON.stringify({ issue_id: issueId, reviewer_id: reviewerId, notes }),
  })
}

export async function hitlReject(issueId, reviewerId, reason, escalate = false) {
  return apiCall(`${API}/hitl/reject`, {
    method: 'POST',
    body: JSON.stringify({ issue_id: issueId, reviewer_id: reviewerId, reason, escalate }),
  })
}

export async function getHitlQueue(wardId = null, limit = 20) {
  const url = wardId
    ? `${API}/hitl/queue?ward_id=${wardId}&limit=${limit}`
    : `${API}/hitl/queue?limit=${limit}`
  return apiCall(url)
}

// ── FCM Push Notifications ────────────────────────────────────────

/**
 * Register FCM token with backend so server can send push notifications.
 */
export async function registerFCMToken(userId, fcmToken) {
  try {
    return await apiCall(`${API}/fcm/register`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, fcm_token: fcmToken }),
    })
  } catch (e) {
    console.warn('[FCM] Token registration failed:', e.message)
    return null
  }
}

// ── Urgency Ranked Issues ─────────────────────────────────────────

/**
 * Fetch issues sorted by urgency weight W = α·sev + β·upvotes + γ·verify + δ·(1/age).
 */
export async function getRankedIssues(wardId = null, limit = 50) {
  try {
    const params = new URLSearchParams({ limit })
    if (wardId) params.set('ward_id', wardId)
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`${API}/issues/ranked?${params}`, {
      headers: {
        ...authHeaders
      }
    })
    if (!res.ok) throw new Error('Ranked issues unavailable')
    return res.json()
  } catch (e) {
    console.warn('[API] Ranked issues unavailable:', e.message)
    return { issues: [], count: 0 }
  }
}

/**
 * Fetch K-Means hotspot clusters (Regional Priority Zones).
 */
export async function getHotspots(wardId = null, minSeverity = 1) {
  try {
    const params = new URLSearchParams({ min_severity: minSeverity })
    if (wardId) params.set('ward_id', wardId)
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`${API}/hotspots?${params}`, {
      headers: {
        ...authHeaders
      }
    })
    if (!res.ok) throw new Error('Hotspots unavailable')
    return res.json()
  } catch (e) {
    console.warn('[API] Hotspots unavailable:', e.message)
    return { clusters: [], cluster_count: 0 }
  }
}


export async function healthCheck() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

// ── Hyperlocal Neighbor Notifications ────────────────────────────

/**
 * Trigger neighbor notifications for a high-severity issue.
 * Backend queries Firestore for users within 500m and sends FCM multicast.
 */
export async function notifyNeighbors(issueId) {
  try {
    return await apiCall(`${API}/issues/${issueId}/notify-neighbors`, { method: 'POST' })
  } catch (e) {
    console.warn('[API] Neighbor notify failed:', e.message)
    return { sent: 0 }
  }
}

// ── AI Share Card ─────────────────────────────────────────────────

/**
 * Get AI-generated share card data for a resolved issue.
 * Returns before/after URLs, AI-crafted caption, and share text.
 */
export async function getShareCard(issueId) {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(`${API}/issues/${issueId}/share-card`, {
    headers: {
      ...authHeaders
    }
  })
  if (!res.ok) throw new Error('Share card unavailable')
  return res.json()
}
