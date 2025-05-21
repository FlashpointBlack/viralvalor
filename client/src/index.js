import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Auth0Provider } from '@auth0/auth0-react';
import './index.css';
import './theme.css';
import './styles/buttons.css';
import './styles/reports.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { initNavigationHistory } from './utils/navigationInit';
import './utils/axiosSetup';

// Initialize navigation history
initNavigationHistory();

// For testing dark mode - remove after confirming it works
document.addEventListener('DOMContentLoaded', () => {
  console.log('Current theme:', document.body.dataset.theme);
  // Uncomment to force dark mode for testing
  // document.body.dataset.theme = 'dark';
  console.log('Theme set to:', document.body.dataset.theme);
  
  // Add global function to toggle theme for testing in console
  window.toggleTheme = () => {
    const currentTheme = document.body.dataset.theme;
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = newTheme;
    console.log('🔄 Theme toggled to:', newTheme);
    return `Theme is now ${newTheme}`;
  };
  
  // Log instructions
  console.log('👉 To manually toggle theme, run this in console: toggleTheme()');
});

// Auth0 configuration
const domain = 'dev-sygugfcjg34k0wee.us.auth0.com';
const clientId = '6MakL0x2tNBn7RzjETREKxyQu4aj4408';
const redirectUri = window.location.origin;

// Make sure the root element exists before creating the root
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: redirectUri,
          scope: 'openid profile email offline_access'
        }}
        cacheLocation="localstorage"
        useRefreshTokens
      >
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </Auth0Provider>
    </React.StrictMode>
  );
} else {
  console.error('Root element not found. Make sure there is a div with id "root" in the HTML.');
} 