import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { installBackButton } from './platform/backButton';
import { installDeepLinks } from './platform/deepLinks';

installBackButton();
installDeepLinks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
