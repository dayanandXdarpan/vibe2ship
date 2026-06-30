import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--bg-base)',
          gap: '1.5rem',
        }}>
          <div style={{ fontSize: '4rem' }}>⚠️</div>
          <h1 className="display-md">Something went wrong</h1>
          <p className="body-md" style={{ color: 'var(--text-secondary)', maxWidth: '480px' }}>
            An unexpected error occurred. Please refresh the page or go back to the feed.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.75rem',
              color: 'var(--danger)',
              maxWidth: '600px',
              overflow: 'auto',
              textAlign: 'left',
            }}>
              {this.state.error.stack}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn--secondary"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
            <button
              className="btn btn--primary"
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/feed' }}
            >
              Go to Feed
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
