import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center',
      gap: '1.5rem',
    }}>
      <div style={{ fontSize: '5rem', filter: 'drop-shadow(0 0 24px rgba(108,99,255,0.4))' }}>
        🏙️
      </div>
      <div>
        <h1 className="display-lg gradient-text" style={{ fontSize: '5rem', fontWeight: 800, lineHeight: 1 }}>
          404
        </h1>
        <h2 className="display-md" style={{ marginTop: '0.5rem' }}>Page not found</h2>
        <p className="body-md" style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', maxWidth: '420px' }}>
          This page doesn't exist. Perhaps you were looking for an issue on the feed?
        </p>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/feed" className="btn btn--primary btn--lg">
          Browse Issues
        </Link>
        <Link to="/report" className="btn btn--secondary btn--lg">
          Report an Issue
        </Link>
      </div>
    </div>
  )
}
