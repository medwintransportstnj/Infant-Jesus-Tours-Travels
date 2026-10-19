import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defence: a rendering bug shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ijt] unhandled render error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center" role="alert">
        <div className="max-w-sm">
          <h1 className="text-2xl">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">Please reload the page. If the problem continues, call our office.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
