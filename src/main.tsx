import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import RuntimeErrorBoundary from './components/RuntimeErrorBoundary';
import { AuthProvider } from './auth/AuthProvider';
import './styles.css';
import './design-system.css';
import './academic-pro.css';
import './reference-shell.css';
import './sidebar-navigation-fix.css';
import './q36-workspace-theme.css';
import './q45-shell.css';
import './mobile-overlay-resilience.css';
import './global-page-header-cleanup.css';
import './components/TopbarUtilityDropdown.css';
import './compact-sidebar-welcome.css';
import { initializeAppearance } from './lib/appearancePreferences';
import {registerDliServiceWorker} from './lib/pushNotifications';
import {initializeCallRingtone} from './lib/callRingtone';

// Apply saved visual preferences before React paints the authorised workspace.
initializeAppearance();
registerDliServiceWorker();
initializeCallRingtone();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RuntimeErrorBoundary>
        <AuthProvider><App /></AuthProvider>
      </RuntimeErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);