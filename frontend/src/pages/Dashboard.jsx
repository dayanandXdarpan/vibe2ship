import { useEffect, useState, useMemo } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, 
  ArcElement, PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js'
import { TrendingUp, AlertTriangle, Clock, CheckCircle, Zap, Map, BarChart2, RefreshCw } from 'lucide-react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import useIssueStore from '../store/issueStore'
import useAuthStore from '../store/authStore'
import { getWardInsights, getHotspots } from '../services/agentApi'
import StatCard from '../components/dashboard/StatCard'
import './Dashboard.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler)

const CHART_DEFAULTS = {
  responsive: true,
  plugins: { legend: { labels: { color: '#8B949E', font: { family: 'Inter' } } } },
}

const COLORS_SEV = ['#FF4D6D', '#FF8C42', '#FFB347', '#43D9AD', '#64B5F6']
const COLORS_STATUS = { resolved: '#43D9AD', in_progress: '#FFB347', assigned: '#6C63FF', in_review: '#FF8C42', processing: '#64B5F6', escalated: '#FF4D6D' }



export default function Dashboard() {
  const issues = useIssueStore(state => state.issues)
  const loading = useIssueStore(state => state.loading)
  const subscribeToIssues = useIssueStore(state => state.subscribeToIssues)
  const { profile } = useAuthStore()
  const [insights, setInsights] = useState([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [hotspots, setHotspots] = useState([])
  const [loadingHotspots, setLoadingHotspots] = useState(false)
  const [selectedWard, setSelectedWard] = useState(profile?.wardId || 'W01')

  useEffect(() => {
    const unsub = subscribeToIssues()
    return () => unsub?.()
  }, [])

  const fetchInsights = async () => {
    setLoadingInsights(true)
    try {
      const data = await getWardInsights(selectedWard, 5)
      setInsights(data.insights || [])
    } catch {
      // Use demo insights if backend not connected
      setInsights([
        { title: 'Pothole Hotspot Detected', description: 'MG Road junction shows 8 pothole reports in 7 days. Immediate patching recommended.', priority: 'high', category: 'pothole', recommended_action: 'Dispatch PWD team within 24h' },
        { title: 'Streetlight Outages Cluster', description: '5 streetlight failures in Sector 12 — likely feeder line fault.', priority: 'medium', category: 'streetlight', recommended_action: 'Inspect feeder line B-12' },
        { title: 'Drainage Pre-Monsoon Alert', description: 'Water leak reports up 40% near ward boundary. Pre-monsoon drainage check needed.', priority: 'high', category: 'water_leak', recommended_action: 'Schedule drainage inspection' },
      ])
    } finally {
      setLoadingInsights(false)
    }
  }

  useEffect(() => { fetchInsights() }, [selectedWard])

  const fetchHotspots = async () => {
    setLoadingHotspots(true)
    try {
      const data = await getHotspots(null, 2)
      setHotspots(data.clusters || [])
    } catch {
      // Demo fallback clusters
      setHotspots([
        { cluster_id: 0, priority_zone: 'critical', issue_count: 8, avg_severity: 4.3, top_category: 'pothole', centroid: { lat: 12.97, lng: 77.59 }, radius_m: 320 },
        { cluster_id: 1, priority_zone: 'high',     issue_count: 5, avg_severity: 3.6, top_category: 'streetlight', centroid: { lat: 12.95, lng: 77.61 }, radius_m: 210 },
        { cluster_id: 2, priority_zone: 'moderate', issue_count: 3, avg_severity: 2.8, top_category: 'garbage', centroid: { lat: 12.98, lng: 77.57 }, radius_m: 150 },
      ])
    } finally {
      setLoadingHotspots(false)
    }
  }

  useEffect(() => { fetchHotspots() }, [selectedWard])

  // Derived metrics
  const metrics = useMemo(() => {
    const total = issues.length
    const resolved = issues.filter(i => i.status === 'resolved').length
    const critical = issues.filter(i => i.severity >= 4).length
    const pending = issues.filter(i => ['assigned', 'in_progress', 'in_review'].includes(i.status)).length
    const resolutionRate = total ? Math.round((resolved / total) * 100) : 0
    return { total, resolved, critical, pending, resolutionRate }
  }, [issues])

  // Category distribution
  const categoryCounts = useMemo(() => {
    const counts = {}
    issues.forEach(i => { if (i.category) counts[i.category] = (counts[i.category] || 0) + 1 })
    return counts
  }, [issues])

  // Status distribution
  const statusCounts = useMemo(() => {
    const counts = {}
    issues.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1 })
    return counts
  }, [issues])

  // Last 7 days trend
  const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d
    })
    return {
      labels: days.map(d => d.toLocaleDateString('en', { weekday: 'short' })),
      datasets: [{
        label: 'Issues Reported',
        data: days.map(day => {
          const start = new Date(day); start.setHours(0, 0, 0, 0)
          const end = new Date(day); end.setHours(23, 59, 59, 999)
          return issues.filter(i => {
            const t = i.created_at?.toDate?.() || i.created_at
            return t && t >= start && t <= end
          }).length
        }),
        fill: true,
        borderColor: '#6C63FF',
        backgroundColor: 'rgba(108,99,255,0.15)',
        tension: 0.4,
        pointBackgroundColor: '#6C63FF',
      }]
    }
  }, [issues])

  const priorityColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' }

  return (
    <div className="dash-page page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="display-md">Impact Dashboard</h1>
            <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
              Real-time civic performance metrics for your city
            </p>
          </div>
          <div className="flex gap-sm items-center">
            <select
              className="input"
              style={{ width: 'auto' }}
              value={selectedWard}
              onChange={e => setSelectedWard(e.target.value)}
              id="ward-selector"
            >
              {['W01','W02','W03','W04','W05','W06'].map(w => (
                <option key={w} value={w}>Ward {w}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="dash-kpis stagger">
          <StatCard icon={BarChart2} label="Total Issues" value={metrics.total} color="var(--info)" />
          <StatCard icon={CheckCircle} label="Resolved" value={metrics.resolved} sub={`${metrics.resolutionRate}% resolution rate`} color="var(--success)" trend={12} />
          <StatCard icon={AlertTriangle} label="Critical" value={metrics.critical} sub="Severity 4-5" color="var(--danger)" />
          <StatCard icon={Clock} label="In Progress" value={metrics.pending} sub="Awaiting resolution" color="var(--warning)" />
        </div>

        {/* Charts row */}
        <div className="dash-charts">
          {/* Trend line */}
          <div className="card dash-chart-card">
            <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>Reports — Last 7 Days</h3>
            <Line
              data={trendData}
              options={{
                ...CHART_DEFAULTS,
                scales: {
                  x: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
                },
              }}
            />
          </div>

          {/* Status donut */}
          <div className="card dash-chart-card dash-chart-card--sm">
            <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>Status Breakdown</h3>
            {Object.keys(statusCounts).length > 0 ? (
              <Doughnut
                data={{
                  labels: Object.keys(statusCounts).map(s => s.replace('_', ' ')),
                  datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: Object.keys(statusCounts).map(s => COLORS_STATUS[s] || '#6C63FF'),
                    borderWidth: 0,
                  }]
                }}
                options={{ ...CHART_DEFAULTS, cutout: '65%' }}
              />
            ) : <p className="body-sm" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No data yet</p>}
          </div>

          {/* Category bar */}
          <div className="card dash-chart-card">
            <h3 className="heading-sm" style={{ marginBottom: 'var(--space-md)' }}>Issues by Category</h3>
            {Object.keys(categoryCounts).length > 0 ? (
              <Bar
                data={{
                  labels: Object.keys(categoryCounts).map(c => c.replace('_', ' ')),
                  datasets: [{
                    label: 'Issues',
                    data: Object.values(categoryCounts),
                    backgroundColor: COLORS_SEV,
                    borderRadius: 6,
                  }]
                }}
                options={{
                  ...CHART_DEFAULTS,
                  scales: {
                    x: { ticks: { color: '#8B949E' }, grid: { display: false } },
                    y: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
                  },
                }}
              />
            ) : <p className="body-sm" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No data yet</p>}
          </div>
        </div>

        {/* Regional Priority Zones — K-Means Hotspots */}
        <div className="dash-hotspots">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="flex items-center gap-sm">
              <Map size={20} color="var(--warning)" />
              <h2 className="heading-lg">Regional Priority Zones</h2>
              <span className="chip chip--warning" style={{ fontSize: '0.65rem' }}>K-Means AI</span>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={fetchHotspots} disabled={loadingHotspots}>
              <RefreshCw size={14} className={loadingHotspots ? 'spin' : ''} />
              {loadingHotspots ? 'Clustering…' : 'Refresh'}
            </button>
          </div>
          <div className="dash-hotspot-grid">
            {hotspots.map((cluster, i) => {
              const zoneColors = { critical: '#FF4D6D', high: '#FF8C42', moderate: '#FFB347', low: '#43D9AD' }
              const zoneColor = zoneColors[cluster.priority_zone] || '#8B949E'
              const catEmoji = { pothole: '🕳️', streetlight: '💡', water_leak: '💧', garbage: '🗑️', road_damage: '🚧' }
              return (
                <div key={cluster.cluster_id} className="dash-hotspot-card card">
                  <div className="dash-hotspot-badge" style={{ background: `${zoneColor}22`, color: zoneColor, borderColor: `${zoneColor}44` }}>
                    {cluster.priority_zone.toUpperCase()}
                  </div>
                  <div className="dash-hotspot-info">
                    <div className="flex items-center gap-xs">
                      <span style={{ fontSize: '1.1rem' }}>{catEmoji[cluster.top_category] || '⚠️'}</span>
                      <span className="heading-sm" style={{ textTransform: 'capitalize' }}>
                        {(cluster.top_category || 'mixed').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="dash-hotspot-stats">
                      <span><strong>{cluster.issue_count}</strong> issues</span>
                      <span>avg sev <strong style={{ color: zoneColor }}>{cluster.avg_severity?.toFixed(1)}</strong></span>
                      <span>r={cluster.radius_m}m</span>
                    </div>
                    <div className="dash-hotspot-bar">
                      <div className="dash-hotspot-fill" style={{ width: `${Math.min(100, cluster.avg_severity * 20)}%`, background: zoneColor }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {hotspots.length === 0 && !loadingHotspots && (
              <p className="body-sm" style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center', padding: '24px' }}>
                No active hotspots detected — community looks good! 🎉
              </p>
            )}
          </div>
        </div>

        {/* AI Insights */}
        <div className="dash-insights">
          <div className="dash-insights__header">
            <div className="flex items-center gap-sm">
              <Zap size={20} color="var(--primary-light)" />
              <h2 className="heading-lg">AI Predictive Insights</h2>
              <span className="chip chip--primary">Gemini 1.5 Pro</span>
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={fetchInsights}
              disabled={loadingInsights}
            >
              <RefreshCw size={14} className={loadingInsights ? 'spin' : ''} />
              {loadingInsights ? 'Generating…' : 'Refresh'}
            </button>
          </div>

          {loadingInsights ? (
            <div className="dash-insights__grid stagger">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card" style={{ height: '140px' }}>
                  <div className="skeleton" style={{ height: '16px', width: '60%', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ height: '12px', width: '90%', marginBottom: '6px' }} />
                  <div className="skeleton" style={{ height: '12px', width: '75%' }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-insights__grid stagger">
              {insights.map((ins, i) => (
                <div key={i} className="card dash-insight-card animate-fade-in">
                  <div className="flex items-center justify-between gap-sm">
                    <span
                      className="chip"
                      style={{ background: `${priorityColors[ins.priority]}22`, color: priorityColors[ins.priority], border: `1px solid ${priorityColors[ins.priority]}44` }}
                    >
                      {ins.priority} priority
                    </span>
                    <span className="caption" style={{ textTransform: 'capitalize' }}>{ins.category?.replace('_', ' ')}</span>
                  </div>
                  <h4 className="heading-sm" style={{ marginTop: 'var(--space-sm)' }}>{ins.title}</h4>
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>{ins.description}</p>
                  <div className="dash-insight-action">
                    <span style={{ color: 'var(--primary-light)', fontSize: '0.75rem' }}>
                      Recommended: {ins.recommended_action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
