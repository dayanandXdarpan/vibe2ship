import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { 
  Shield, CheckCircle, X, TrendingUp, Clock, 
  AlertTriangle, BarChart2, RefreshCw, Filter, ChevronRight, Camera, Zap
} from 'lucide-react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { db } from '../services/firebase'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import './AuthorityPortal.css'

const SEV_COLORS = { 5:'#FF4D6D', 4:'#FF8C42', 3:'#FFB347', 2:'#43D9AD', 1:'#64B5F6' }
const SEV_LABELS = { 5:'Critical', 4:'High', 3:'Moderate', 2:'Low', 1:'Minimal' }

function HITLQueueCard({ issue, onApprove, onReject, onEscalate }) {
  const [loading, setLoading] = useState(null)
  const createdAt = issue.created_at?.toDate?.() || issue.created_at

  const handle = async (action) => {
    setLoading(action)
    try {
      if (action === 'approve') await onApprove(issue.id)
      else if (action === 'reject') {
        const reason = prompt('Reason for rejection (visible to citizen):')
        if (!reason) { setLoading(null); return }
        await onReject(issue.id, reason, false)
      } else {
        await onReject(issue.id, 'Escalated to senior authority', true)
      }
    } finally { setLoading(null) }
  }

  return (
    <div className="hitl-card card animate-fade-in">
      <div className="hitl-card__header">
        {issue.image_url && <img src={issue.image_url} alt="" className="hitl-card__thumb" />}
        <div>
          <div className="flex items-center gap-sm">
            <span style={{ fontSize: '1.1rem' }}>
              {issue.category === 'pothole' ? '🕳️' : issue.category === 'water_leak' ? '💧' : '⚠️'}
            </span>
            <h3 className="heading-sm" style={{ textTransform: 'capitalize' }}>
              {(issue.category || 'Unknown').replace('_', ' ')}
            </h3>
            {issue.severity && (
              <span className="chip" style={{
                background: `${SEV_COLORS[issue.severity]}22`,
                color: SEV_COLORS[issue.severity],
                border: `1px solid ${SEV_COLORS[issue.severity]}44`,
                fontSize: '0.7rem'
              }}>
                {SEV_LABELS[issue.severity]}
              </span>
            )}
          </div>
          <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            {issue.ai_description?.substring(0, 100)}{issue.ai_description?.length > 100 ? '…' : ''}
          </p>
          <div className="flex gap-md" style={{ marginTop: '6px' }}>
            <span className="caption">
              <Clock size={11} style={{ display: 'inline' }} /> {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : 'recently'}
            </span>
            {issue.judge_hitl_reason && (
              <span className="caption" style={{ color: 'var(--warning)' }}>
                ⚠️ {issue.judge_hitl_reason}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="hitl-card__ai-summary">
        <div><span className="caption">AI Confidence</span><p className="body-sm" style={{ fontWeight: 600 }}>{issue.ai_confidence ? `${(issue.ai_confidence * 100).toFixed(0)}%` : 'N/A'}</p></div>
        <div><span className="caption">Location</span><p className="body-sm">{issue.geo_address?.split(',')[0] || 'N/A'}</p></div>
        <div><span className="caption">Suggested Dept</span><p className="body-sm">{issue.routing_dept || 'Unrouted'}</p></div>
      </div>

      <div className="hitl-card__actions">
        <button
          className="btn btn--success btn--sm"
          disabled={!!loading}
          onClick={() => handle('approve')}
          id={`hitl-approve-${issue.id}`}
        >
          {loading === 'approve' ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />}
          Approve
        </button>
        <button
          className="btn btn--danger btn--sm"
          disabled={!!loading}
          onClick={() => handle('reject')}
          id={`hitl-reject-${issue.id}`}
        >
          {loading === 'reject' ? <RefreshCw size={14} className="spin" /> : <X size={14} />}
          Reject
        </button>
        <button
          className="btn btn--secondary btn--sm"
          disabled={!!loading}
          onClick={() => handle('escalate')}
        >
          Escalate
        </button>
        <Link to={`/issues/${issue.id}`} className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }}>
          View <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  )
}

export default function AuthorityPortal() {
  const { user, profile } = useAuthStore()
  const [hitlQueue, setHitlQueue] = useState([])
  const [allIssues, setAllIssues] = useState([])
  const [resolveQueue, setResolveQueue] = useState([])
  const [tab, setTab] = useState('hitl')
  const [loading, setLoading] = useState(true)
  const [proofForms, setProofForms] = useState({}) // { [issueId]: { url, note, loading, result } }

  // Real-time HITL queue
  useEffect(() => {
    const q = query(
      collection(db, 'issues'),
      where('status', '==', 'in_review'),
      orderBy('severity', 'desc'),
      limit(30)
    )
    const unsub = onSnapshot(q, (snap) => {
      setHitlQueue(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // All issues for authority view
  useEffect(() => {
    if (tab !== 'all') return
    const q = query(
      collection(db, 'issues'),
      where('status', 'in', ['assigned', 'in_progress', 'escalated']),
      orderBy('severity', 'desc'),
      limit(50)
    )
    const unsub = onSnapshot(q, (snap) => {
      setAllIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [tab])

  // Issues in-progress for proof-of-resolution tab
  useEffect(() => {
    if (tab !== 'resolve') return
    const q = query(
      collection(db, 'issues'),
      where('status', 'in', ['in_progress', 'assigned', 'validated']),
      orderBy('severity', 'desc'),
      limit(30)
    )
    const unsub = onSnapshot(q, (snap) => {
      setResolveQueue(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [tab])

  const callHITL = async (endpoint, body) => {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, reviewer_id: user.uid }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  const handleApprove = useCallback(async (issueId) => {
    try {
      await callHITL('/hitl/approve', { issue_id: issueId, notes: 'Approved by authority' })
      toast.success('Issue approved ✅')
    } catch (e) { toast.error('Approval failed') }
  }, [user])

  const handleReject = useCallback(async (issueId, reason, escalate) => {
    try {
      await callHITL('/hitl/reject', { issue_id: issueId, reason, escalate })
      toast.success(escalate ? 'Issue escalated' : 'Issue rejected')
    } catch (e) { toast.error('Action failed') }
  }, [user])

  const handleProofSubmit = async (issueId) => {
    const form = proofForms[issueId] || {}
    if (!form.url) { toast.error('Please enter the resolution photo URL'); return }
    setProofForms(f => ({ ...f, [issueId]: { ...form, loading: true, result: null } }))
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080'
      const res = await fetch(`${backendUrl}/issues/${issueId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: issueId,
          authority_id: user.uid,
          resolution_note: form.note || 'Issue resolved by municipal worker',
          resolution_photo_url: form.url,
        }),
      })
      const data = await res.json()
      setProofForms(f => ({ ...f, [issueId]: { ...form, loading: false, result: data } }))
      if (data.verdict === 'RESOLVED') {
        toast.success('✅ AI verified resolution! Issue marked as resolved.')
      } else if (data.verdict === 'PARTIAL') {
        toast('⚠️ Partial fix detected. Issue kept open with feedback.', { icon: '⚠️' })
      } else {
        toast.error(`❌ AI: ${data.message}`)
      }
    } catch (e) {
      setProofForms(f => ({ ...f, [issueId]: { ...form, loading: false } }))
      toast.error('Proof submission failed')
    }
  }

  const stats = {
    queued: hitlQueue.length,
    critical: hitlQueue.filter(i => i.severity >= 4).length,
    avgSeverity: hitlQueue.length
      ? (hitlQueue.reduce((s, i) => s + (i.severity || 0), 0) / hitlQueue.length).toFixed(1)
      : 0,
  }

  return (
    <div className="authority-page page">
      <div className="container">
        <div className="page-header">
          <div className="flex items-center gap-md">
            <Shield size={28} color="var(--warning)" />
            <div>
              <h1 className="display-md">Authority Portal</h1>
              <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
                Human-in-the-Loop review queue · {profile?.displayName}
              </p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="authority-stats stagger">
          {[
            { label: 'Awaiting Review', value: stats.queued, color: 'var(--warning)', icon: Clock },
            { label: 'Critical Priority', value: stats.critical, color: 'var(--danger)', icon: AlertTriangle },
            { label: 'Avg Severity', value: `${stats.avgSeverity}/5`, color: 'var(--primary-light)', icon: BarChart2 },
            { label: 'Your Ward', value: profile?.wardId || 'All', color: 'var(--success)', icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="authority-stat card">
              <Icon size={18} color={color} />
              <div>
                <p className="caption">{label}</p>
                <p className="heading-md" style={{ color }}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="authority-tabs">
          <button
            className={`authority-tab ${tab === 'hitl' ? 'active' : ''}`}
            onClick={() => setTab('hitl')}
          >
            <Shield size={15} /> HITL Queue
            {hitlQueue.length > 0 && (
              <span className="chip chip--danger" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                {hitlQueue.length}
              </span>
            )}
          </button>
          <button
            className={`authority-tab ${tab === 'resolve' ? 'active' : ''}`}
            onClick={() => setTab('resolve')}
          >
            <Camera size={15} /> Proof of Resolution
          </button>
          <button
            className={`authority-tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            <BarChart2 size={15} /> All Active Issues
          </button>
        </div>

        {/* HITL Queue */}
        {tab === 'hitl' && (
          <div>
            {loading ? (
              <div className="authority-grid stagger">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card" style={{ height: '200px' }}>
                    <div className="skeleton" style={{ height: '100%' }} />
                  </div>
                ))}
              </div>
            ) : hitlQueue.length === 0 ? (
              <div className="authority-empty">
                <CheckCircle size={48} color="var(--success)" />
                <h3 className="heading-lg">Queue is clear!</h3>
                <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
                  All issues have been reviewed. Check back later.
                </p>
              </div>
            ) : (
              <div className="authority-grid stagger">
                {hitlQueue.map(issue => (
                  <HITLQueueCard
                    key={issue.id}
                    issue={issue}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEscalate={(id) => handleReject(id, 'Escalated to senior authority', true)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Proof of Resolution Tab */}
        {tab === 'resolve' && (
          <div>
            <p className="body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
              Upload an after-photo for each issue. Gemini Vision will compare before vs. after and verify resolution automatically.
            </p>
            {resolveQueue.length === 0 ? (
              <div className="authority-empty">
                <CheckCircle size={48} color="var(--success)" />
                <h3 className="heading-lg">No issues pending resolution</h3>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {resolveQueue.map(issue => {
                  const form = proofForms[issue.id] || {}
                  const result = form.result
                  const verdictColor = result?.verdict === 'RESOLVED' ? 'var(--success)'
                    : result?.verdict === 'PARTIAL' ? 'var(--warning)' : 'var(--danger)'
                  return (
                    <div key={issue.id} className="card" style={{ padding: 'var(--space-lg)' }}>
                      <div className="flex items-center gap-md" style={{ marginBottom: 'var(--space-md)' }}>
                        {issue.image_url && (
                          <img src={issue.image_url} alt="before"
                            style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '2px solid var(--border-subtle)' }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-sm">
                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                              {(issue.category || 'Issue').replace('_', ' ')}
                            </span>
                            <span className="chip chip--warning" style={{ fontSize: '0.7rem' }}>{issue.status}</span>
                          </div>
                          <p className="caption" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                            {issue.geo_address?.split(',').slice(0, 2).join(',') || 'Location unknown'}
                          </p>
                        </div>
                        <Link to={`/issues/${issue.id}`} className="btn btn--ghost btn--sm">View</Link>
                      </div>

                      {/* Proof form */}
                      {!result && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                          <div className="input-group">
                            <label className="input-label">Resolution Photo URL <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                              className="input"
                              placeholder="https://storage.googleapis.com/... (after-photo URL)"
                              value={form.url || ''}
                              onChange={e => setProofForms(f => ({ ...f, [issue.id]: { ...form, url: e.target.value } }))}
                            />
                          </div>

                          {form.url && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                              <span className="caption" style={{ color: 'var(--primary-light)' }}>
                                📸 Alignment Assistant (Ghost Overlay)
                              </span>
                              <div style={{ position: 'relative', width: '240px', height: '160px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#111' }}>
                                {/* After photo preview */}
                                <img src={form.url} alt="After photo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => { e.target.style.display = 'none'; }} />
                                
                                {/* Ghost overlay before photo */}
                                {form.showGhost && issue.image_url && (
                                  <img src={issue.image_url} alt="Before photo ghost" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45, pointerEvents: 'none' }} />
                                )}

                                <button
                                  className="btn btn--secondary btn--xs"
                                  style={{ position: 'absolute', bottom: '6px', right: '6px', fontSize: '0.68rem', padding: '3px 8px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setProofForms(f => ({ ...f, [issue.id]: { ...form, showGhost: !form.showGhost } }))
                                  }}
                                >
                                  {form.showGhost ? 'Hide Ghost Overlay' : 'Show Ghost Overlay'}
                                </button>
                              </div>
                              <span className="caption" style={{ color: 'var(--text-muted)' }}>
                                Use the ghost overlay to match the camera angle of the original report.
                              </span>
                            </div>
                          )}

                          <div className="input-group">
                            <label className="input-label">Resolution Note</label>
                            <input
                              className="input"
                              placeholder="Describe what was done to fix this issue"
                              value={form.note || ''}
                              onChange={e => setProofForms(f => ({ ...f, [issue.id]: { ...form, note: e.target.value } }))}
                            />
                          </div>
                          <button
                            className="btn btn--primary btn--sm"
                            style={{ alignSelf: 'flex-start' }}
                            disabled={form.loading}
                            onClick={() => handleProofSubmit(issue.id)}
                          >
                            {form.loading
                              ? <><RefreshCw size={14} className="spin" /> Verifying with AI…</>
                              : <><Zap size={14} /> Submit Proof (AI Verified)</>}
                          </button>
                        </div>
                      )}

                      {/* AI Verdict */}
                      {result && (
                        <div style={{
                          marginTop: 'var(--space-sm)',
                          padding: 'var(--space-md)',
                          background: `${verdictColor}11`,
                          border: `1px solid ${verdictColor}33`,
                          borderRadius: 'var(--radius-lg)',
                        }}>
                          <div className="flex items-center gap-sm" style={{ marginBottom: '8px' }}>
                            <Zap size={16} color={verdictColor} />
                            <span className="label" style={{ color: verdictColor }}>AI Verdict: {result.verdict}</span>
                            <span className="caption">({(result.proof?.confidence * 100 || 0).toFixed(0)}% confidence)</span>
                          </div>
                          <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
                            {result.proof?.verification_note || result.message}
                          </p>
                          {result.proof?.remaining_issues && (
                            <p className="caption" style={{ color: 'var(--warning)', marginTop: '4px' }}>
                              ⚠️ {result.proof.remaining_issues}
                            </p>
                          )}
                          {/* Quality score */}
                          <div className="flex items-center gap-sm" style={{ marginTop: '8px' }}>
                            <span className="caption">Quality:</span>
                            {[1,2,3,4,5].map(s => (
                              <span key={s} style={{ fontSize: '14px', opacity: s <= (result.proof?.quality_score || 0) ? 1 : 0.2 }}>⭐</span>
                            ))}
                          </div>
                          {result.verdict !== 'RESOLVED' && (
                            <button
                              className="btn btn--ghost btn--sm"
                              style={{ marginTop: '8px' }}
                              onClick={() => setProofForms(f => ({ ...f, [issue.id]: {} }))}
                            >
                              Try Again
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* All Issues */}
        {tab === 'all' && (
          <div className="authority-all-issues">
            {allIssues.length === 0 ? (
              <div className="authority-empty">
                <CheckCircle size={48} color="var(--success)" />
                <h3 className="heading-lg">No active issues</h3>
              </div>
            ) : (
              <div className="authority-issue-table card">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="authority-table-head">
                      <th>Category</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Dept</th>
                      <th>Age</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allIssues.map(issue => {
                      const createdAt = issue.created_at?.toDate?.() || issue.created_at
                      return (
                        <tr key={issue.id} className="authority-table-row">
                          <td className="body-sm" style={{ textTransform: 'capitalize', padding: '12px 16px' }}>
                            {(issue.category || 'Unknown').replace('_', ' ')}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            {issue.severity && (
                              <span style={{ color: SEV_COLORS[issue.severity], fontWeight: 600, fontSize: '0.82rem' }}>
                                {SEV_LABELS[issue.severity]}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span className="chip chip--warning" style={{ fontSize: '0.7rem' }}>
                              {(issue.status || '').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="caption" style={{ padding: '12px 8px' }}>
                            {issue.geo_address?.split(',')[0] || 'N/A'}
                          </td>
                          <td className="body-sm" style={{ padding: '12px 8px' }}>
                            {issue.routing_dept || '—'}
                          </td>
                          <td className="caption" style={{ padding: '12px 8px' }}>
                            {createdAt ? formatDistanceToNow(createdAt) : '—'}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <Link to={`/issues/${issue.id}`} className="btn btn--ghost btn--sm">
                              View
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
