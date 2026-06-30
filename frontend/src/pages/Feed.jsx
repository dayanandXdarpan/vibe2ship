import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Filter, MapPin, Clock, ThumbsUp, MessageSquare, Plus, Search, Zap, RotateCcw, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import useIssueStore from '../store/issueStore'
import useAuthStore from '../store/authStore'
import { getRankedIssues } from '../services/agentApi'
import IssueCard, { SkeletonCard } from '../components/issue/IssueCard'
import './Feed.css'

const CATEGORIES = ['all', 'pothole', 'water_leak', 'streetlight', 'garbage', 'tree_hazard', 'road_damage', 'other']
const STATUSES = ['all', 'processing', 'assigned', 'in_progress', 'resolved', 'in_review', 'escalated']
const SEVERITIES = ['all', '5', '4', '3', '2', '1']

const SEV_LABELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Minimal' }
const SEV_CLASSES = { 5: 'sev-chip-5', 4: 'sev-chip-4', 3: 'sev-chip-3', 2: 'sev-chip-2', 1: 'sev-chip-1' }
const STATUS_CHIP_CLASSES = {
  processing: 'chip--info', triage: 'chip--info', in_review: 'chip--warning',
  validated: 'chip--primary', assigned: 'chip--primary', in_progress: 'chip--warning',
  resolved: 'chip--success', closed: 'chip--default', escalated: 'chip--danger',
  rejected: 'chip--danger', duplicate_found: 'chip--default',
}
const CAT_EMOJIS = {
  pothole: '🕳️', water_leak: '💧', streetlight: '💡', garbage: '🗑️',
  tree_hazard: '🌳', road_damage: '🚧', other: '🏙️', default: '⚠️',
}



export default function Feed() {
  const issues = useIssueStore(state => state.issues)
  const loading = useIssueStore(state => state.loading)
  const subscribeToIssues = useIssueStore(state => state.subscribeToIssues)
  const upvoteIssue = useIssueStore(state => state.upvoteIssue)
  const filters = useIssueStore(state => state.filters)
  const setFilters = useIssueStore(state => state.setFilters)
  const { user, profile } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortMode, setSortMode] = useState('recent')  // 'recent' | 'urgency' | 'upvotes'
  const [rankedIssues, setRankedIssues] = useState([])
  const [loadingRanked, setLoadingRanked] = useState(false)

  useEffect(() => {
    const unsub = subscribeToIssues()
    return () => unsub?.()
  }, [])

  // Load ranked issues when urgency sort selected
  useEffect(() => {
    if (sortMode !== 'urgency') return
    setLoadingRanked(true)
    getRankedIssues(profile?.wardId || null, 100)
      .then(data => setRankedIssues(data.issues || []))
      .catch(() => setRankedIssues([]))
      .finally(() => setLoadingRanked(false))
  }, [sortMode, profile?.wardId])

  const handleUpvote = async (issueId) => {
    if (!user) return
    await upvoteIssue(issueId, user.uid)
  }

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    // Use urgency-ranked list or standard Firestore list
    let result = sortMode === 'urgency' && rankedIssues.length > 0
      ? rankedIssues
      : [...issues]

    if (filters.category !== 'all') {
      result = result.filter(i => i.category === filters.category)
    }
    if (filters.severity !== 'all') {
      result = result.filter(i => String(i.severity) === filters.severity)
    }
    if (filters.status !== 'all') {
      result = result.filter(i => i.status === filters.status)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        i.ai_description?.toLowerCase().includes(q) ||
        i.user_description?.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q) ||
        i.geo_address?.toLowerCase().includes(q)
      )
    }

    // Client-side sort fallbacks
    if (sortMode === 'upvotes') {
      result = [...result].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    } else if (sortMode === 'recent' || sortMode !== 'urgency') {
      result = [...result].sort((a, b) => {
        const ta = a.created_at?.seconds || a.created_at || 0
        const tb = b.created_at?.seconds || b.created_at || 0
        return tb - ta
      })
    }

    return result
  }, [issues, rankedIssues, sortMode, filters, search])

  const hasActiveFilters = filters.category !== 'all' || filters.severity !== 'all' || filters.status !== 'all'

  return (
    <div className="feed-page page">
      <div className="container">
        {/* Header */}
        <div className="feed-header page-header">
          <div>
            <h1 className="display-md">Community Feed</h1>
            <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              {issues.length} issues tracked · {issues.filter(i => i.status === 'resolved').length} resolved
            </p>
          </div>
          <Link to="/report" className="btn btn--primary">
            <Plus size={16} /> Report Issue
          </Link>
        </div>

        {/* Search + Filter Bar */}
        <div className="feed-toolbar">
          <div className="feed-search">
            <Search size={16} className="feed-search__icon" />
            <input
              className="input feed-search__input"
              placeholder="Search issues, locations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="feed-search"
            />
          </div>
          <button
            className={`btn ${hasActiveFilters ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filters {hasActiveFilters && `(${[filters.category, filters.severity, filters.status].filter(f => f !== 'all').length})`}
          </button>
          {hasActiveFilters && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setFilters({ category: 'all', severity: 'all', status: 'all' })}
            >
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        {/* Sort Mode Tabs */}
        <div className="feed-sort-tabs">
          {[
            { key: 'recent', label: 'Recent', icon: <Clock size={13} /> },
            { key: 'urgency', label: 'Urgency', icon: <TrendingUp size={13} />, badge: 'AI' },
            { key: 'upvotes', label: 'Most Voted', icon: <ThumbsUp size={13} /> },
          ].map(({ key, label, icon, badge }) => (
            <button
              key={key}
              className={`feed-sort-tab ${sortMode === key ? 'feed-sort-tab--active' : ''}`}
              onClick={() => setSortMode(key)}
            >
              {icon} {label}
              {badge && <span className="feed-sort-badge">{badge}</span>}
              {key === 'urgency' && loadingRanked && (
                <span className="feed-sort-spinner" />
              )}
            </button>
          ))}
          {sortMode === 'urgency' && (
            <span className="feed-sort-formula caption">
              W = 0.4×severity + 0.25×upvotes + 0.2×verify + 0.15×(1/age)
            </span>
          )}
        </div>

        {/* Filter Dropdowns */}
        {showFilters && (
          <div className="feed-filters animate-slide-down">
            <div className="input-group">
              <label className="input-label">Category</label>
              <select className="input" value={filters.category} onChange={e => setFilters({ category: e.target.value })} id="filter-category">
                {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Severity</label>
              <select className="input" value={filters.severity} onChange={e => setFilters({ severity: e.target.value })} id="filter-severity">
                {SEVERITIES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Severities' : `${s} — ${SEV_LABELS[s]}`}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="input" value={filters.status} onChange={e => setFilters({ status: e.target.value })} id="filter-status">
                {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* AI Insights Ticker */}
        <div className="feed-insight-bar">
          <Zap size={14} color="var(--primary-light)" />
          <span className="body-sm">
            <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>AI Insight: </span>
            {issues.filter(i => i.severity >= 4).length} critical issues need attention this week
            {' · '}
            {issues.filter(i => i.status === 'in_review').length} awaiting human verification
          </span>
        </div>

        {/* Issue Grid */}
        {loading ? (
          <div className="feed-grid stagger">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="feed-empty">
            <span style={{ fontSize: '3rem' }}>🔍</span>
            <h3 className="heading-lg">No issues found</h3>
            <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
              {hasActiveFilters || search ? 'Try adjusting your filters' : 'Be the first to report an issue in your area!'}
            </p>
            <Link to="/report" className="btn btn--primary">
              <Plus size={16} /> Report Issue
            </Link>
          </div>
        ) : (
          <div className="feed-grid stagger">
            {filtered.map(issue => (
              <IssueCard key={issue.id} issue={issue} onUpvote={handleUpvote} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
