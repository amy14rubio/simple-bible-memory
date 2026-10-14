import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defense: an unexpected rendering error shows a calm message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md space-y-4 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted">Your decks and cards are stored on this device and were not changed. Reloading usually fixes this.</p>
        <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Reload
        </button>
      </main>
    );
  }
}
