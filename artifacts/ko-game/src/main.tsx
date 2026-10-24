// Load the base cascade before lazily loaded battle component styles.
import './index.css';
import './battle-presentation.css';
import './game-experience.css';

import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { startAppInstallation } from '@/lib/install-app';

startAppInstallation();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
