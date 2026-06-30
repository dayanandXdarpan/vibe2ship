import { useEffect, useRef, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { Filter, MapPin, ZoomIn, ZoomOut, Layers, List } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import useIssueStore from '../store/issueStore'
import './MapExplorer.css'

// Severity → color
const SEV_COLORS = { 5: '#FF4D6D', 4: '#FF8C42', 3: '#FFB347', 2: '#43D9AD', 1: '#64B5F6' }
const SEV_LABELS = { 5: 'Critical', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Minimal' }
const CAT_EMOJIS = { pothole:'🕳️', water_leak:'💧', streetlight:'💡', garbage:'🗑️', tree_hazard:'🌳', road_damage:'🚧', other:'⚠️' }

// Fix leaflet icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function FlyTo({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo(coords, 16, { duration: 1 })
  }, [coords])
  return null
}

function ZoomControl() {
  const map = useMap()
  return (
    <div className="map-zoom-controls">
      <button className="map-ctrl-btn" onClick={() => map.zoomIn()} title="Zoom in"><ZoomIn size={18} /></button>
      <button className="map-ctrl-btn" onClick={() => map.zoomOut()} title="Zoom out"><ZoomOut size={18} /></button>
    </div>
  )
}

export default function MapExplorer() {
  const { issues, loading, subscribeToIssues, filters, setFilters } = useIssueStore()
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [mapStyle, setMapStyle] = useState('dark')
  const [flyTo, setFlyTo] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const TILE_URLS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }

  useEffect(() => {
    const unsub = subscribeToIssues()
    return () => unsub?.()
  }, [])

  // Only issues with coords
  const mappableIssues = useMemo(() =>
    issues.filter(i => i.lat && i.lng && i.status !== 'rejected'),
    [issues]
  )

  // Stats for legend
  const criticalCount = issues.filter(i => i.severity >= 4).length
  const resolvedCount = issues.filter(i => i.status === 'resolved').length

  return (
    <div className="map-page page">
      {/* Sidebar */}
      <div className={`map-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="map-sidebar__header">
          <h2 className="heading-md">Issue Map</h2>
          <button className="btn btn--ghost btn--icon" onClick={() => setSidebarOpen(false)}>
            ×
          </button>
        </div>

        {/* Stats */}
        <div className="map-stats stagger">
          {[
            { label: 'Total', value: issues.length, color: 'var(--text-primary)' },
            { label: 'Critical', value: criticalCount, color: 'var(--danger)' },
            { label: 'Resolved', value: resolvedCount, color: 'var(--success)' },
          ].map(s => (
            <div key={s.label} className="map-stat-chip">
              <span className="heading-md" style={{ color: s.color }}>{s.value}</span>
              <span className="caption">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Severity Legend */}
        <div className="map-legend">
          <p className="label" style={{ marginBottom: 'var(--space-sm)' }}>Severity Scale</p>
          {Object.entries(SEV_LABELS).reverse().map(([sev, label]) => (
            <div key={sev} className="map-legend__item">
              <div className="map-legend__dot" style={{ background: SEV_COLORS[sev] }} />
              <span className="body-sm">{label}</span>
              <span className="caption" style={{ marginLeft: 'auto' }}>
                {issues.filter(i => String(i.severity) === sev).length}
              </span>
            </div>
          ))}
        </div>

        {/* Tile style switcher */}
        <div className="map-style-switcher">
          <p className="label" style={{ marginBottom: 'var(--space-sm)' }}>Map Style</p>
          {['dark', 'light', 'satellite'].map(style => (
            <button
              key={style}
              className={`map-style-btn ${mapStyle === style ? 'active' : ''}`}
              onClick={() => setMapStyle(style)}
            >
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </button>
          ))}
        </div>

        {/* Issue list */}
        <div className="map-issue-list">
          <p className="label" style={{ marginBottom: 'var(--space-sm)' }}>
            Issues ({mappableIssues.length})
          </p>
          {mappableIssues.slice(0, 30).map(issue => (
            <button
              key={issue.id}
              className={`map-issue-item ${selectedIssue?.id === issue.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedIssue(issue)
                setFlyTo([issue.lat, issue.lng])
              }}
            >
              <div
                className="map-issue-dot"
                style={{ background: SEV_COLORS[issue.severity] || 'var(--primary)' }}
              />
              <div>
                <p className="body-sm" style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                  {CAT_EMOJIS[issue.category] || '⚠️'} {(issue.category || 'Unknown').replace('_', ' ')}
                </p>
                <p className="caption">
                  {issue.geo_address?.split(',')[0] || `${issue.lat?.toFixed(3)}, ${issue.lng?.toFixed(3)}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="map-container">
        {!sidebarOpen && (
          <button className="map-open-sidebar btn btn--secondary btn--sm" onClick={() => setSidebarOpen(true)}>
            <List size={16} /> Issues
          </button>
        )}

        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            url={TILE_URLS[mapStyle]}
            attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors'
          />
          <ZoomControl />
          {flyTo && <FlyTo coords={flyTo} />}

          {mappableIssues.map(issue => (
            <CircleMarker
              key={issue.id}
              center={[issue.lat, issue.lng]}
              radius={issue.severity ? issue.severity * 4 + 4 : 8}
              pathOptions={{
                color: SEV_COLORS[issue.severity] || '#6C63FF',
                fillColor: SEV_COLORS[issue.severity] || '#6C63FF',
                fillOpacity: issue.status === 'resolved' ? 0.3 : 0.75,
                weight: selectedIssue?.id === issue.id ? 3 : 1.5,
                dashArray: issue.status === 'resolved' ? '5, 5' : undefined,
              }}
              eventHandlers={{
                click: () => setSelectedIssue(issue),
              }}
            >
              <Popup className="map-popup">
                <div className="map-popup__content">
                  {issue.image_url && (
                    <img src={issue.image_url} alt="" className="map-popup__img" />
                  )}
                  <p className="heading-sm" style={{ textTransform: 'capitalize' }}>
                    {CAT_EMOJIS[issue.category]} {(issue.category || 'Issue').replace('_', ' ')}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#8B949E', margin: '4px 0' }}>
                    {issue.ai_description?.substring(0, 80)}
                    {issue.ai_description?.length > 80 ? '…' : ''}
                  </p>
                  <div style={{ display: 'flex', gap: '6px', margin: '8px 0', flexWrap: 'wrap' }}>
                    {issue.severity && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: `${SEV_COLORS[issue.severity]}22`,
                        color: SEV_COLORS[issue.severity],
                      }}>
                        {SEV_LABELS[issue.severity]}
                      </span>
                    )}
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#8B949E',
                    }}>
                      {(issue.status || '').replace('_', ' ')}
                    </span>
                  </div>
                  <a
                    href={`/issues/${issue.id}`}
                    style={{
                      display: 'block',
                      padding: '6px 12px',
                      background: '#6C63FF',
                      color: 'white',
                      borderRadius: '6px',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    View Details →
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
