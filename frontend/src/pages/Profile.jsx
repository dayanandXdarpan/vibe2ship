import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { Edit2, LogOut } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../services/firebase'
import useAuthStore from '../store/authStore'
import BadgeGrid from '../components/gamification/BadgeGrid'
import XpBar from '../components/gamification/XpBar'
import MilestoneToast from '../components/gamification/MilestoneToast'
import { BADGES, evaluateBadges, getBadge } from '../utils/badgeEngine'
import './Profile.css'

const RANK_MAP = [
  { name: 'Newcomer', min: 0, icon: '🌱', color: '#8B949E' },
  { name: 'Helper', min: 50, icon: '👋', color: '#43D9AD' },
  { name: 'Advocate', min: 150, icon: '📢', color: '#64B5F6' },
  { name: 'Crusader', min: 400, icon: '⚔️', color: '#6C63FF' },
  { name: 'Champion', min: 1000, icon: '🏆', color: '#FFB347' },
  { name: 'Hero', min: 2500, icon: '🦸', color: '#FF8C42' },
  { name: 'Legend', min: 5000, icon: '⭐', color: '#FF4D6D' },
]

function getRank(pts) {
  return [...RANK_MAP].reverse().find(r => pts >= r.min) || RANK_MAP[0]
}

const SEV_COLORS = { 5:'#FF4D6D', 4:'#FF8C42', 3:'#FFB347', 2:'#43D9AD', 1:'#64B5F6' }
const STATUS_CHIP = { resolved:'chip--success', assigned:'chip--primary', in_progress:'chip--warning', in_review:'chip--warning', processing:'chip--info' }

export default function Profile() {
  const { user, profile, logout } = useAuthStore()
  const navigate = useNavigate()
  const [myIssues, setMyIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [newBadge, setNewBadge] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'issues'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(20)
    )
    const unsub = onSnapshot(q, snap => {
      setMyIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [user])

  // Evaluate badges whenever profile data changes
  useEffect(() => {
    if (profile) {
      const newBadgeIds = evaluateBadges(profile)
      if (newBadgeIds.length > 0) {
        setNewBadge(getBadge(newBadgeIds[0]))
        // TODO: persist newly earned badges to Firestore
      }
    }
  }, [profile])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  if (!profile && !user) return null

  const pts = profile?.points || 0
  const rank = getRank(pts)
  const nextRank = RANK_MAP.find(r => r.min > pts)
  const progress = nextRank
    ? Math.min(((pts - rank.min) / (nextRank.min - rank.min)) * 100, 100)
    : 100

  return (
    <div className="profile-page page">
      <div className="container--narrow">
        {/* Profile card */}
        <div className="profile-card card--glass animate-scale-in">
          <div className="profile-avatar" style={{ background: `${rank.color}22`, color: rank.color }}>
            {rank.icon}
          </div>
          <div className="profile-info">
            <h1 className="display-md">{profile?.displayName || user?.displayName || 'Citizen'}</h1>
            <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
            <div className="flex items-center gap-sm" style={{ marginTop: 'var(--space-sm)' }}>
              <span className="rank-label" style={{ background: `${rank.color}22`, color: rank.color, border: `1px solid ${rank.color}44` }}>
                {rank.icon} {rank.name}
              </span>
              {profile?.role === 'authority' && (
                <span className="chip chip--warning">Authority</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexShrink: 0 }}>
            <button className="btn btn--secondary btn--icon" title="Edit Profile">
              <Edit2 size={16} />
            </button>
            <button className="btn btn--ghost btn--icon" title="Logout" onClick={handleLogout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="profile-stats stagger">
          {[
            { label: 'XP Earned', value: `⚡ ${pts.toLocaleString()}`, color: 'var(--primary-light)' },
            { label: 'Reports', value: profile?.reportCount || myIssues.length, color: 'var(--info)' },
            { label: 'Resolved', value: profile?.resolvedCount || myIssues.filter(i => i.status === 'resolved').length, color: 'var(--success)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card profile-stat">
              <p className="heading-lg" style={{ color }}>{value}</p>
              <p className="caption">{label}</p>
            </div>
          ))}
        </div>

        {/* Rank progress */}
        <div className="card profile-rank-progress">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
            <div>
              <p className="heading-sm">Rank Progress</p>
              <p className="caption" style={{ color: 'var(--text-muted)' }}>
                {nextRank ? `${nextRank.min - pts} XP to ${nextRank.name} ${nextRank.icon}` : 'Max rank achieved! 🌟'}
              </p>
            </div>
            <span className="heading-md" style={{ color: rank.color }}>{rank.icon} {rank.name}</span>
          </div>
          <div className="profile-progress-bar">
            <div className="profile-progress-fill" style={{ width: `${progress}%`, background: rank.color }} />
          </div>
          <div className="flex justify-between" style={{ marginTop: '6px' }}>
            <span className="caption">{pts} XP</span>
            {nextRank && <span className="caption">{nextRank.min} XP</span>}
          </div>
        </div>

        {/* XP Bar */}
        <XpBar currentXp={pts} />

        {/* Badges */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 className="heading-sm">🏅 Civic Badges</h3>
            <span className="caption" style={{ color: 'var(--text-muted)' }}>
              {(profile?.badges || []).length}/{BADGES.length} earned
            </span>
          </div>
          <BadgeGrid profile={profile} />
        </div>

        {/* My Issues */}
        <div>
          <h2 className="heading-lg" style={{ marginBottom: 'var(--space-md)' }}>My Reports</h2>
          {loading ? (
            <div className="flex flex-col gap-sm stagger">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card profile-issue-row">
                  <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)' }} />
                  <div style={{ flex: 1 }}><div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '6px' }} /><div className="skeleton" style={{ height: '12px', width: '40%' }} /></div>
                </div>
              ))}
            </div>
          ) : myIssues.length === 0 ? (
            <div className="profile-empty">
              <span style={{ fontSize: '2.5rem' }}>📝</span>
              <p className="heading-sm">No reports yet</p>
              <Link to="/report" className="btn btn--primary btn--sm">Report an Issue</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-sm stagger">
              {myIssues.map(issue => {
                const createdAt = issue.created_at?.toDate?.() || issue.created_at
                const statusClass = STATUS_CHIP[issue.status] || 'chip--default'
                return (
                  <Link to={`/issues/${issue.id}`} key={issue.id} className="card profile-issue-row">
                    {issue.image_url ? (
                      <img src={issue.image_url} alt="" className="profile-issue-thumb" />
                    ) : (
                      <div className="profile-issue-placeholder">⚠️</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-sm">
                        <p className="body-sm" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {(issue.category || 'Issue').replace('_', ' ')}
                        </p>
                        <span className={`chip ${statusClass}`} style={{ fontSize: '0.68rem' }}>
                          {(issue.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="caption" style={{ color: 'var(--text-muted)', marginTop: '3px' }}>
                        {issue.geo_address?.split(',')[0] || 'Location unavailable'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="caption">{createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : ''}</p>
                      {issue.upvotes > 0 && <p className="caption" style={{ color: 'var(--primary-light)' }}>👍 {issue.upvotes}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Badge unlock toast */}
      {newBadge && (
        <MilestoneToast
          badge={newBadge}
          onDismiss={() => setNewBadge(null)}
        />
      )}
    </div>
  )
}
