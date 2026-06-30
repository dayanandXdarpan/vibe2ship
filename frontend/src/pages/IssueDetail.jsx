import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  MapPin, Clock, ThumbsUp, MessageSquare, Share2, 
  ChevronLeft, Shield, CheckCircle, AlertTriangle, 
  Zap, User, Send, ExternalLink, CheckSquare, XSquare, RefreshCw
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import useIssueStore from '../store/issueStore'
import useAuthStore from '../store/authStore'
import { resolveIssue, communityVerify, appealRejection, getShareCard, notifyNeighbors } from '../services/agentApi'
import toast from 'react-hot-toast'
import './IssueDetail.css'

const STATUS_TIMELINE = [
  { key: 'draft',       label: 'Submitted',     icon: '📝' },
  { key: 'triage',      label: 'AI Analysis',    icon: '🤖' },
  { key: 'in_review',   label: 'Human Review',   icon: '🛡️' },
  { key: 'validated',   label: 'Verified',       icon: '✅' },
  { key: 'assigned',    label: 'Assigned',       icon: '🗂️' },
  { key: 'in_progress', label: 'In Progress',    icon: '🔧' },
  { key: 'resolved',    label: 'Resolved',       icon: '🎉' },
]

const STATUS_ORDER = STATUS_TIMELINE.map(s => s.key)

const SEV_LABELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Minimal' }
const SEV_COLORS = { 5: '#FF4D6D', 4: '#FF8C42', 3: '#FFB347', 2: '#43D9AD', 1: '#64B5F6' }

function getStatusIndex(status) {
  const idx = STATUS_ORDER.indexOf(status)
  return idx >= 0 ? idx : 1
}

export default function IssueDetail() {
  const { id: issueId } = useParams()
  const { selectedIssue, subscribeToIssue, upvoteIssue } = useIssueStore()
  const { user, profile } = useAuthStore()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [auditTrail, setAuditTrail] = useState([])

  // Real-time issue subscription
  useEffect(() => {
    const unsub = subscribeToIssue(issueId)
    return () => unsub?.()
  }, [issueId])

  // Real-time comments
  useEffect(() => {
    const q = query(
      collection(db, 'issues', issueId, 'comments'),
      orderBy('created_at', 'asc')
    )
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [issueId])

  // Audit trail
  useEffect(() => {
    const q = query(
      collection(db, 'issues', issueId, 'audit_trail'),
      orderBy('timestamp', 'asc')
    )
    const unsub = onSnapshot(q, snap => {
      setAuditTrail(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [issueId])

  const handleComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return
    setSubmittingComment(true)
    try {
      await addDoc(collection(db, 'issues', issueId, 'comments'), {
        user_id: user.uid,
        display_name: profile?.displayName || 'Citizen',
        body: newComment.trim(),
        created_at: serverTimestamp(),
      })
      setNewComment('')
    } catch (err) {
      toast.error('Failed to post comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleShare = async () => {
    try {
      const card = await getShareCard(issueId)
      if (navigator.share) {
        await navigator.share({
          title: card.share_title,
          text: card.share_text,
          url: card.share_url,
        })
      } else {
        await navigator.clipboard.writeText(card.share_text)
        toast.success('Share text copied to clipboard!')
      }
    } catch (e) {
      // Fallback: copy URL
      try {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Link copied!')
      } catch { /* ignore */ }
    }
  }

  if (!selectedIssue) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" />
          <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading issue…</p>
        </div>
      </div>
    )
  }

  const issue = selectedIssue
  const statusIdx = getStatusIndex(issue.status)
  const isAuthority = profile?.role === 'authority' || profile?.role === 'admin'
  const isHITL = issue.status === 'in_review'
  const createdAt = issue.created_at?.toDate?.() || issue.created_at

  return (
    <div className="detail-page page">
      <div className="container">
        <Link to="/feed" className="btn btn--ghost btn--sm detail-back">
          <ChevronLeft size={16} /> Back to Feed
        </Link>

        <div className="detail-layout">
          {/* ── Left Column ──────────────────────────── */}
          <div className="detail-main">
            {/* Media */}
            {issue.image_url && (
              <div className="detail-media" style={{ position: 'relative' }}>
                <img 
                  src={issue.image_url} 
                  alt={issue.category} 
                  style={issue.pii_detected ? { filter: 'blur(4px)' } : {}}
                />
                {issue.pii_detected && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255, 140, 66, 0.95)',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 2,
                  }}>
                    <Shield size={14} />
                    <span>🛡️ Privacy Masked (Faces/License Plates Blurred)</span>
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="card detail-info">
              <div className="flex items-center justify-between flex-wrap gap-sm">
                <div className="flex items-center gap-sm">
                  <span style={{ fontSize: '1.3rem' }}>
                    {issue.category === 'pothole' ? '🕳️' : issue.category === 'water_leak' ? '💧' : '⚠️'}
                  </span>
                  <h1 className="heading-lg" style={{ textTransform: 'capitalize' }}>
                    {(issue.category || 'Unknown Issue').replace('_', ' ')}
                  </h1>
                </div>
                {issue.severity && (
                  <span
                    className="chip"
                    style={{
                      background: `${SEV_COLORS[issue.severity]}22`,
                      color: SEV_COLORS[issue.severity],
                      border: `1px solid ${SEV_COLORS[issue.severity]}44`
                    }}
                  >
                    {SEV_LABELS[issue.severity]} Severity
                  </span>
                )}
              </div>

              {issue.ai_description && (
                <p className="body-md" style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-md)' }}>
                  {issue.ai_description}
                </p>
              )}

              {issue.user_description && (
                <div className="detail-user-desc">
                  <User size={14} />
                  <p className="body-sm">{issue.user_description}</p>
                </div>
              )}

              {/* Meta row */}
              <div className="detail-meta">
                {issue.geo_address && (
                  <span className="detail-meta__item">
                    <MapPin size={14} />
                    {issue.geo_address.split(',').slice(0, 3).join(',')}
                  </span>
                )}
                {createdAt && (
                  <span className="detail-meta__item">
                    <Clock size={14} />
                    {formatDistanceToNow(createdAt, { addSuffix: true })}
                  </span>
                )}
              </div>

              {/* Tags */}
              {issue.tags?.length > 0 && (
                <div className="flex flex-wrap gap-xs" style={{ marginTop: 'var(--space-sm)' }}>
                  {issue.tags.map(t => (
                    <span key={t} className="chip chip--default" style={{ fontSize: '0.72rem' }}>#{t}</span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="detail-actions">
                <button className="btn btn--secondary btn--sm" onClick={() => upvoteIssue(issue.id, user?.uid)}>
                  <ThumbsUp size={15} /> Upvote · {issue.upvotes || 0}
                </button>
                {['resolved', 'closed'].includes(issue.status) ? (
                  <button className="btn btn--success btn--sm share-victory-btn" onClick={handleShare}>
                    <span>🏆</span> Share Victory
                  </button>
                ) : (
                  <button className="btn btn--secondary btn--sm" onClick={() => navigator.share?.({ title: 'Community Issue', url: window.location.href }) || navigator.clipboard?.writeText(window.location.href).then(() => toast.success('Link copied!'))}>
                    <Share2 size={15} /> Share
                  </button>
                )}
              </div>

              {/* ── Community Consensus Panel ─────────────────── */}
              {user && !['resolved', 'closed', 'rejected'].includes(issue.status) && (() => {
                const getBrowserLocation = () => {
                  return new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                      reject(new Error('Geolocation is not supported by your browser.'))
                      return
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                      (err) => {
                        let msg = 'Failed to retrieve location.'
                        if (err.code === err.PERMISSION_DENIED) {
                          msg = 'Location permission denied. Location access is required to verify or dispute issues.'
                        }
                        reject(new Error(msg))
                      },
                      { enableHighAccuracy: true, timeout: 5000 }
                    )
                  })
                }

                return (
                  <div className="detail-consensus">
                    <p className="label" style={{ marginBottom: '10px', color: 'var(--text-secondary)' }}>
                      🗳️ Community Verification · {issue.verified_count || 0} confirmed · {issue.dispute_count || 0} disputed
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn--success btn--sm"
                        onClick={async () => {
                          const loadingToast = toast.loading('Acquiring GPS location...')
                          try {
                            const loc = await getBrowserLocation()
                            toast.dismiss(loadingToast)
                            await communityVerify(issue.id, user.uid, 'confirm', '', loc.lat, loc.lng)
                            toast.success('✅ Issue confirmed — your civic trust score increased!')
                          } catch (e) {
                            toast.dismiss(loadingToast)
                            toast.error(e.message || 'Already voted')
                          }
                        }}
                      >
                        <CheckSquare size={14} /> Confirm Issue
                      </button>
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={async () => {
                          const note = prompt('Why do you dispute this report? (optional)')
                          if (note === null) return
                          const loadingToast = toast.loading('Acquiring GPS location...')
                          try {
                            const loc = await getBrowserLocation()
                            toast.dismiss(loadingToast)
                            await communityVerify(issue.id, user.uid, 'dispute', note || '', loc.lat, loc.lng)
                            toast.success('Dispute recorded. If enough citizens agree, this will be reviewed.')
                          } catch (e) {
                            toast.dismiss(loadingToast)
                            toast.error(e.message || 'Already voted')
                          }
                        }}
                      >
                        <XSquare size={14} /> Dispute
                      </button>
                    </div>
                    {/* Trust bar */}
                    {((issue.verified_count || 0) + (issue.dispute_count || 0)) > 0 && (() => {
                      const total = (issue.verified_count || 0) + (issue.dispute_count || 0)
                      const pct = Math.round(((issue.verified_count || 0) / total) * 100)
                      return (
                        <div className="detail-consensus-bar" title={`${pct}% community confidence`}>
                          <div className="detail-consensus-fill" style={{ width: `${pct}%` }} />
                          <span>{pct}% community confidence</span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* ── Appeal Panel — for rejected issues ─────────── */}
              {user && issue.user_id === user.uid && 
               ['rejected', 'spam_suspected', 'needs_clarification'].includes(issue.status) && (
                <div className="detail-appeal">
                  <div className="flex items-center gap-sm" style={{ marginBottom: '8px' }}>
                    <RefreshCw size={16} color="var(--warning)" />
                    <span className="label" style={{ color: 'var(--warning)' }}>
                      AI Rejected — You Can Appeal
                    </span>
                  </div>
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    If you believe this was incorrectly rejected, appeal to trigger human review.
                  </p>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={async () => {
                      const reason = prompt('Describe why this report is valid (min 10 characters):')
                      if (!reason || reason.length < 10) { toast.error('Please provide a detailed reason'); return }
                      try {
                        await appealRejection(issue.id, user.uid, reason)
                        toast.success('🔄 Appeal submitted! A human reviewer will evaluate your report.')
                      } catch (e) {
                        toast.error(e.message || 'Appeal failed')
                      }
                    }}
                  >
                    <RefreshCw size={14} /> Submit Appeal
                  </button>
                </div>
              )}
            </div>

            {/* AI Analysis Card */}
            {(issue.routing_dept || issue.ticket_id || issue.ai_confidence) && (
              <div className="card--primary detail-ai">
                <p className="label" style={{ marginBottom: 'var(--space-md)', color: 'var(--primary-light)' }}>
                  🤖 AI Agent Report
                </p>
                <div className="detail-ai-grid">
                  {issue.routing_dept && (
                    <div><span className="caption">Assigned To</span><p className="heading-sm">{issue.routing_dept}</p></div>
                  )}
                  {issue.ticket_id && (
                    <div><span className="caption">Ticket ID</span><p className="heading-sm" style={{ fontFamily: 'monospace' }}>{issue.ticket_id}</p></div>
                  )}
                  {issue.ai_confidence && (
                    <div><span className="caption">AI Confidence</span><p className="heading-sm">{(issue.ai_confidence * 100).toFixed(0)}%</p></div>
                  )}
                  {issue.sla_deadline && (
                    <div><span className="caption">SLA Deadline</span><p className="heading-sm">{format(issue.sla_deadline.toDate?.() || issue.sla_deadline, 'MMM d, h:mm a')}</p></div>
                  )}
                  {issue.govt_submission_url && (
                    <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
                      <span className="caption">Govt Portal Auto-Submission</span>
                      <p className="body-sm" style={{ marginTop: '2px' }}>
                        <a 
                          href={issue.govt_submission_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline', fontWeight: 600 }}
                        >
                          View Official Record <ExternalLink size={14} />
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Proof-of-Resolution Display ─────────────────── */}
            {issue.proof_verdict && (
              <div className={`detail-proof card animate-fade-in proof--${issue.proof_verdict.toLowerCase()}`}>
                <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-md)' }}>
                  {issue.proof_verdict === 'RESOLVED'
                    ? <CheckCircle size={18} color="var(--success)" />
                    : issue.proof_verdict === 'PARTIAL'
                    ? <AlertTriangle size={18} color="var(--warning)" />
                    : <AlertTriangle size={18} color="var(--danger)" />
                  }
                  <h3 className="heading-sm">
                    AI-Verified Resolution
                    <span className={`chip chip--${issue.proof_verdict === 'RESOLVED' ? 'success' : 'warning'}`}
                      style={{ marginLeft: '8px', fontSize: '0.68rem' }}>
                      {issue.proof_verdict}
                    </span>
                  </h3>
                  {issue.proof_confidence && (
                    <span className="caption" style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {(issue.proof_confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>

                {/* Before / After images */}
                {issue.resolution_photo_url && (
                  <div className="detail-proof-images">
                    <div className="detail-proof-img-wrap">
                      <span className="detail-proof-label">BEFORE</span>
                      <img src={issue.image_url} alt="Before" />
                    </div>
                    <div className="detail-proof-arrow">→</div>
                    <div className="detail-proof-img-wrap detail-proof-img-wrap--after">
                      <span className="detail-proof-label detail-proof-label--after">AFTER</span>
                      <img src={issue.resolution_photo_url} alt="After" />
                    </div>
                  </div>
                )}

                {/* Verdict note */}
                {issue.proof_verification_note && (
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
                    🤖 {issue.proof_verification_note}
                  </p>
                )}
                {issue.proof_remaining_issues && (
                  <p className="caption" style={{ color: 'var(--warning)', marginTop: '4px' }}>
                    ⚠️ {issue.proof_remaining_issues}
                  </p>
                )}

                {/* Quality stars */}
                {issue.proof_quality_score > 0 && (
                  <div className="flex items-center gap-xs" style={{ marginTop: 'var(--space-sm)' }}>
                    <span className="caption">Fix quality:</span>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ fontSize: '13px', opacity: s <= issue.proof_quality_score ? 1 : 0.2 }}>⭐</span>
                    ))}
                    <span className="caption">{issue.proof_quality_score}/5</span>
                  </div>
                )}
              </div>
            )}

            {/* HITL Panel — Authority Only */}
            {isHITL && isAuthority && (
              <div className="detail-hitl-panel card animate-fade-in">
                <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-md)' }}>
                  <Shield size={20} color="var(--warning)" />
                  <h3 className="heading-sm">Human-in-the-Loop Review Required</h3>
                </div>
                <p className="body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
                  {issue.judge_hitl_reason || 'This issue requires manual verification before routing.'}
                </p>
                <div className="flex gap-md">
                  <button
                    className="btn btn--success btn--lg flex-1"
                    onClick={async () => {
                      try {
                        await fetch('/api/hitl/approve', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ issue_id: issueId, reviewer_id: user.uid, notes: '' })
                        })
                        toast.success('Issue approved and validated ✅')
                      } catch { toast.error('Approval failed') }
                    }}
                  >
                    <CheckCircle size={18} /> Approve
                  </button>
                  <button
                    className="btn btn--danger btn--lg flex-1"
                    onClick={async () => {
                      const reason = prompt('Reason for rejection:')
                      if (!reason) return
                      try {
                        await fetch('/api/hitl/reject', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ issue_id: issueId, reviewer_id: user.uid, reason, escalate: false })
                        })
                        toast.success('Issue rejected')
                      } catch { toast.error('Rejection failed') }
                    }}
                  >
                    <AlertTriangle size={18} /> Reject
                  </button>
                  <button
                    className="btn btn--secondary"
                    title="Escalate to senior authority"
                    onClick={async () => {
                      try {
                        await fetch('/api/hitl/reject', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ issue_id: issueId, reviewer_id: user.uid, reason: 'Escalated for higher authority', escalate: true })
                        })
                        toast.success('Issue escalated')
                      } catch { toast.error('Escalation failed') }
                    }}
                  >
                    Escalate
                  </button>
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="card detail-comments">
              <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>
                <MessageSquare size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Community Comments ({comments.length})
              </h3>

              {comments.length === 0 ? (
                <p className="body-sm" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>
                  Be the first to comment
                </p>
              ) : (
                <div className="detail-comments__list">
                  {comments.map(c => {
                    const t = c.created_at?.toDate?.() || new Date()
                    return (
                      <div key={c.id} className="detail-comment">
                        <div className="detail-comment__avatar">{(c.display_name || 'U')[0].toUpperCase()}</div>
                        <div className="detail-comment__content">
                          <div className="flex items-center gap-sm">
                            <span className="detail-comment__name">{c.display_name || 'Citizen'}</span>
                            <span className="caption">{formatDistanceToNow(t, { addSuffix: true })}</span>
                          </div>
                          <p className="body-sm" style={{ marginTop: '4px' }}>{c.body}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {user && (
                <form onSubmit={handleComment} className="detail-comments__form">
                  <input
                    className="input"
                    placeholder="Add a comment…"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    id="comment-input"
                  />
                  <button type="submit" className="btn btn--primary btn--sm" disabled={submittingComment || !newComment.trim()} id="comment-submit">
                    <Send size={14} />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* ── Right Sidebar ─────────────────────────── */}
          <div className="detail-sidebar">
            {/* Status Timeline */}
            <div className="card detail-timeline">
              <h3 className="heading-sm" style={{ marginBottom: 'var(--space-lg)' }}>Status Timeline</h3>
              <div className="timeline">
                {STATUS_TIMELINE.map((s, i) => {
                  const done = i <= statusIdx
                  const current = i === statusIdx
                  return (
                    <div key={s.key} className={`timeline-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                      <div className="timeline-step__line" />
                      <div className="timeline-step__dot">
                        {done ? <span>{s.icon}</span> : <span className="timeline-step__num">{i + 1}</span>}
                      </div>
                      <div className="timeline-step__content">
                        <p className="timeline-step__label">{s.label}</p>
                        {current && issue.updated_at && (
                          <p className="caption" style={{ marginTop: '2px' }}>
                            {formatDistanceToNow(issue.updated_at.toDate?.() || issue.updated_at, { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Audit Trail */}
            {auditTrail.length > 0 && (
              <div className="card detail-audit">
                <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>
                  <Zap size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  Audit Trail
                </h3>
                <div className="audit-list">
                  {auditTrail.map((entry, i) => (
                    <div key={i} className="audit-entry">
                      <div className="audit-entry__dot" />
                      <div>
                        <p className="body-sm" style={{ fontWeight: 500 }}>
                          {entry.from_status} → {entry.to_status}
                        </p>
                        <p className="caption">{entry.actor} · {entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, HH:mm') : ''}</p>
                        {entry.reason && <p className="caption" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{entry.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community Verification */}
            <div className="card detail-verify">
              <h3 className="heading-sm" style={{ marginBottom: 'var(--space-sm)' }}>Community Verification</h3>
              <div className="flex items-center gap-md">
                <div className="verify-ring">
                  <span className="heading-lg" style={{ color: 'var(--success)' }}>{issue.upvotes || 0}</span>
                </div>
                <div>
                  <p className="body-sm" style={{ fontWeight: 600 }}>Citizens confirmed</p>
                  <p className="caption">this issue exists in their area</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
