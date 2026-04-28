import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Wafytnde view failed', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-shell">
          <section className="window-panel">
            <div className="window-titlebar">
              <span>Wafytnde</span>
            </div>
            <div className="panel-body">
              <h1>Something stalled.</h1>
              <p>
                The app shell is still loaded. Reload the page, then export a backup
                from Settings if the problem continues.
              </p>
              <button type="button" onClick={() => location.reload()}>
                Reload
              </button>
            </div>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
