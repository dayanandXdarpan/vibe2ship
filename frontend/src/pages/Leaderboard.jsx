import { useState, useEffect } from 'react'
import { collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore'
import { Trophy, Zap, Shield, Star, TrendingUp, Medal } from 'lucide-react'
import { db } from '../services/firebase'
import useAuthStore from '../store/authStore'
import './Leaderboard.css'

const RANKS = [
  { name: 'Newcomer',      min: 0,    icon: '🌱', color: '#8B949E' },
  { name: 'Helper',        min: 50,   icon: '👋', color: '#43D9AD' },
  { name: 'Advocate',      min: 150,  icon: '📢', color: '#64B5F6' },
  { name: 'Crusader',      min: 400,  icon: '⚔️', color: '#6C63FF' },
  { name: 'Champion',      min: 1000, icon: '🏆', color: '#FFB347' },
  { name: 'Hero',          min: 2500, icon: '🦸', color: '#FF8C42' },
  { name: 'Legend',        min: 5000, icon: '⭐', color: '#FF4D6D' },
]

function getRank(points) {
  return [...RANKS].reverse().find(r => points >= r.min) || RANKS[0]
}

function getNextRank(points) {
  return RANKS.find(r => r.min > points)
}

function RankBadge({ points }) {
  const rank = getRank(points)
  return (
    <span className="rank-badge" style={{ background: `${rank.color}22`, color: rank.color, border: `1px solid ${rank.color}44` }}>
      {rank.icon} {rank.name}
    </span>
  )
}

function LeaderRow({ user, position, isCurrentUser }) {
  const rank = getRank(user.points || 0)
  const medals = ['🥇', '🥈', '🥉']
  const medal = medals[position - 1]

  return (
    <div className={`leader-row ${isCurrentUser ? 'leader-row--me' : ''} ${position <= 3 ? 'leader-row--top' : ''}`}>
      <div className="leader-row__pos">
        {medal || <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>#{position}</span>}
      </div>
      <div className="leader-row__avatar" style={{ background: `${rank.color}22`, color: rank.color }}>
        {(user.displayName || 'U')[0].toUpperCase()}
      </div>
      <div className="leader-row__info">
        <p className="body-sm" style={{ fontWeight: 600 }}>
          {user.displayName || 'Citizen'} {isCurrentUser && <span className="chip chip--primary" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>You</span>}
        </p>
        <div className="flex items-center gap-sm">
          <RankBadge points={user.points || 0} />
        </div>
      </div>
      <div className="leader-row__stats">
        <div className="leader-row__stat">
          <span className="heading-sm" style={{ color: 'var(--primary-light)' }}>⚡ {(user.points || 0).toLocaleString()}</span>
          <span className="caption">XP</span>
        </div>
        <div className="leader-row__stat hide-mobile">
          <span className="heading-sm">{user.reportCount || 0}</span>
          <span className="caption">Reports</span>
        </div>
        <div className="leader-row__stat hide-mobile">
          <span className="heading-sm" style={{ color: 'var(--success)' }}>{user.resolvedCount || 0}</span>
          <span className="caption">Resolved</span>
        </div>
      </div>
    </div>
  )
}

const DEMO_USERS = [
  { uid:'1', displayName:'Priya Sharma',    points:4820, reportCount:48, resolvedCount:31, badges:['first_report','speed_hero'] },
  { uid:'2', displayName:'Arjun Mehta',     points:3210, reportCount:35, resolvedCount:22, badges:['first_report'] },
  { uid:'3', displayName:'Sneha Reddy',     points:2940, reportCount:31, resolvedCount:19, badges:[] },
  { uid:'4', displayName:'Vikram Nair',     points:1875, reportCount:24, resolvedCount:15, badges:[] },
  { uid:'5', displayName:'Ananya Gupta',    points:1240, reportCount:18, resolvedCount:10, badges:[] },
  { uid:'6', displayName:'Rajan Kumar',     points: 850, reportCount:14, resolvedCount:8,  badges:[] },
  { uid:'7', displayName:'Deepika Joshi',   points: 540, reportCount: 9, resolvedCount:5,  badges:[] },
  { uid:'8', displayName:'Siddharth Patel', points: 310, reportCount: 6, resolvedCount:3,  badges:[] },
]

export default function Leaderboard() {
  const { user, profile } = useAuthStore()
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')   // 'all' | 'monthly'
  const [period, setPeriod] = useState('all')  // 'all' | 'monthly'

  useEffect(() => {
    const orderField = period === 'monthly' ? 'monthly_points' : 'points'
    const q = query(collection(db, 'users'), orderBy(orderField, 'desc'), limit(50))
    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        // Inject display field based on period
        .map(u => ({
          ...u,
          displayPoints: period === 'monthly' ? (u.monthly_points || 0) : (u.points || 0)
        }))
      setLeaders(users.length > 0 ? users : DEMO_USERS.map(u => ({ ...u, displayPoints: u.points })))
      setLoading(false)
    }, () => {
      setLeaders(DEMO_USERS.map(u => ({ ...u, displayPoints: u.points })))
      setLoading(false)
    })
    return () => unsub()
  }, [period])

  const currentUserRank = leaders.findIndex(l => l.uid === user?.uid) + 1
  const currentUserPoints = period === 'monthly' ? (profile?.monthly_points || 0) : (profile?.points || 0)
  const nextRank = getNextRank(profile?.points || 0)
  const currentRank = getRank(profile?.points || 0)
  const progressToNext = nextRank
    ? Math.min(((currentUserPoints - currentRank.min) / (nextRank.min - currentRank.min)) * 100, 100)
    : 100

  const monthName = new Date().toLocaleString('default', { month: 'long' })

  return (
    <div className="lb-page page">
      <div className="container--narrow">
        <div className="page-header">
          <div>
            <h1 className="display-md flex items-center gap-sm">
              <Trophy size={32} color="var(--warning)" /> Leaderboard
            </h1>
            <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Top citizens making their communities better
            </p>
          </div>
          {/* Period toggle */}
          <div className="lb-period-toggle">
            <button
              className={`lb-period-btn ${period === 'all' ? 'active' : ''}`}
              onClick={() => setPeriod('all')}
            >
              All Time
            </button>
            <button
              className={`lb-period-btn ${period === 'monthly' ? 'active' : ''}`}
              onClick={() => setPeriod('monthly')}
            >
              {monthName}
            </button>
          </div>
        </div>

        {/* Your rank card */}
        {user && profile && (
          <div className="card--primary lb-my-rank animate-fade-in">
            <div className="flex items-center gap-md">
              <div className="lb-my-avatar">{currentRank.icon}</div>
              <div style={{ flex: 1 }}>
                <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>Your Rank</p>
                <p className="heading-lg">
                  #{currentUserRank || '—'} · {currentRank.name}
                </p>
                <p className="caption" style={{ color: 'var(--text-muted)' }}>
                  ⚡ {currentUserPoints.toLocaleString()} {period === 'monthly' ? 'XP this month' : 'XP total'}
                </p>
              </div>
              {nextRank && (
                <div style={{ textAlign: 'right' }}>
                  <p className="caption" style={{ marginBottom: '6px' }}>
                    {(profile?.points || 0) >= nextRank.min ? '🌟 Max rank!' : `${nextRank.min - (profile?.points || 0)} XP to ${nextRank.name}`}
                  </p>
                  <div className="lb-progress-bar">
                    <div className="lb-progress-fill" style={{ width: `${progressToNext}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top 3 Podium */}
        {leaders.length >= 3 && (
          <div className="lb-podium stagger">
            {[leaders[1], leaders[0], leaders[2]].map((leader, idx) => {
              const pos = [2, 1, 3][idx]
              const heights = ['120px', '160px', '100px']
              const rank = getRank(leader?.points || 0)
              return (
                <div key={leader?.uid} className={`lb-podium__place lb-podium__place--${pos}`}>
                  <div className="lb-podium__avatar" style={{ background: `${rank.color}22`, color: rank.color }}>
                    {(leader?.displayName || 'U')[0].toUpperCase()}
                  </div>
                  <p className="body-sm" style={{ fontWeight: 600 }}>{leader?.displayName?.split(' ')[0]}</p>
                  <p className="caption" style={{ color: 'var(--primary-light)' }}>⚡ {(leader?.points || 0).toLocaleString()}</p>
                  <div className="lb-podium__bar" style={{ height: heights[idx], background: `${rank.color}33`, borderTop: `3px solid ${rank.color}` }}>
                    <span style={{ fontSize: '1.5rem' }}>{['🥈','🥇','🥉'][idx]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Full list */}
        <div className="lb-list card">
          {period === 'monthly' && (
            <div className="lb-monthly-banner">
              <span>📅</span>
              <span className="body-sm">Monthly reset — points reset on 1st of each month. Race to the top!</span>
            </div>
          )}
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="leader-row">
                <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                <div style={{ flex: 1 }}><div className="skeleton" style={{ height: '14px', width: '60%' }} /></div>
                <div className="skeleton" style={{ height: '14px', width: '80px' }} />
              </div>
            ))
          ) : (
            leaders.map((leader, i) => (
              <LeaderRow
                key={leader.uid}
                user={{ ...leader, points: leader.displayPoints ?? leader.points }}
                position={i + 1}
                isCurrentUser={leader.uid === user?.uid}
              />
            ))
          )}
        </div>

        {/* XP Guide */}
        <div className="card lb-xp-guide">
          <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>⚡ How to Earn XP</h3>
          <div className="lb-xp-grid">
            {[
              { action: 'Report a new issue', xp: '+10 XP', icon: '📝' },
              { action: 'Issue gets resolved', xp: '+25 XP', icon: '🎉' },
              { action: 'Upvote an issue', xp: '+2 XP', icon: '👍' },
              { action: 'Community verifies your report', xp: '+15 XP', icon: '✅' },
              { action: 'Comment on an issue', xp: '+3 XP', icon: '💬' },
              { action: 'First report of the day', xp: '+5 XP', icon: '🌅' },
            ].map(({ action, xp, icon }) => (
              <div key={action} className="lb-xp-item">
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                <span className="body-sm">{action}</span>
                <span className="chip chip--primary" style={{ marginLeft: 'auto' }}>{xp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
