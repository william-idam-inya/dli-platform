import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import RuntimeErrorBoundary from './components/RuntimeErrorBoundary';
import { AuthProvider } from './auth/AuthProvider';
import './styles.css';
import './design-system.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RuntimeErrorBoundary>
        <AuthProvider><App /></AuthProvider>
      </RuntimeErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);