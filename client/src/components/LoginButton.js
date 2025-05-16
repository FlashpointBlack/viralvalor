import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const LoginButton = ({ className = '' }) => {
  const { loginWithRedirect } = useAuth0();

  const handleLogin = () => {
    // Ensure a completely fresh state before redirecting to Auth0
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LoginButton] Storage clearing failed', e);
    }

    // Remember where the user started the login flow so we can return
    const currentPath = window.location.pathname + window.location.search;
    sessionStorage.setItem('postLoginRedirect', currentPath);

    // Pass the same via appState for redundancy
    loginWithRedirect({ appState: { returnTo: currentPath } });
  };

  // Use the provided className or default to 'btn'
  const buttonClassName = className || 'btn';

  return (
    <button
      className={buttonClassName}
      onClick={handleLogin}
    >
      Log In
    </button>
  );
};

export default LoginButton; 