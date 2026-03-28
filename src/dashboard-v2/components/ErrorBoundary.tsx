import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? 'unknown'}]`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
            {this.props.label ?? 'This section'} crashed
          </div>
          <div style={{
            fontSize: 12, color: '#4b5563', maxWidth: 400, textAlign: 'center',
            fontFamily: 'monospace', background: 'rgba(248,113,113,0.05)',
            border: '1px solid rgba(248,113,113,0.15)', borderRadius: 8,
            padding: '8px 12px',
          }}>
            {error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8, padding: '7px 18px', borderRadius: 8,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: 13, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
