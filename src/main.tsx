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
import { initializeAppearance } from './lib/appearancePreferences';

// Apply saved visual preferences before React paints the authorised workspace.
initializeAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RuntimeErrorBoundary>
        <AuthProvider><App /></AuthProvider>
      </RuntimeErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);