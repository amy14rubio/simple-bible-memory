import { Component, type ErrorInfo, type ReactNode } from 'react';
import { currentLanguage, translate } from '../i18n';

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
    // This screen sits outside the language provider, so it reads the saved choice directly.
    const t = (key: Parameters<typeof translate>[1]) => translate(currentLanguage(), key);
    return (
      <main role="alert" className="mx-auto max-w-md space-y-4 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">{t('crash.title')}</h1>
        <p className="text-muted">{t('crash.body')}</p>
        <button type="button" onClick={() => window.location.reload()} className="press min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          {t('crash.reload')}
        </button>
      </main>
    );
  }
}
